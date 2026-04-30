const { pool } = require('../db');

const connectedTablets = {};

module.exports = (io) => {

  io.on('connection', (socket) => {
    console.log('Tablet connected: ' + socket.id);

    // -------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------

    socket.on('register_cell', async (data) => {
      try {
        const { cell_id } = data;
        const { rows } = await pool.query('SELECT * FROM cells WHERE id = $1', [cell_id]);
        const cell = rows[0];
        if (!cell) { socket.emit('error', { message: 'Cell not found' }); return; }

        // Block duplicate login (fix #2)
        const alreadyConnected = Object.values(connectedTablets).find(
          t => t.mode === 'cell' && t.cell_id === cell_id && t.socket_id !== socket.id
        );
        if (alreadyConnected) {
          socket.emit('error', { message: 'This cell is already active on another tablet' });
          return;
        }

        connectedTablets[socket.id] = { mode: 'cell', cell_id, cell_number: cell.cell_number, socket_id: socket.id };
        socket.join('cells');
        socket.join('cell_' + cell_id);

        socket.emit('registered', { mode: 'cell', cell });
        broadcastSystemStatus(io);
      } catch (err) {
        console.error('register_cell error:', err);
      }
    });

    socket.on('register_forklift', async (data) => {
      try {
        const { forklift_id } = data;
        const { rows } = await pool.query(`
          SELECT f.*, ft.name as type_name
          FROM forklifts f
          JOIN forklift_types ft ON f.type_id = ft.id
          WHERE f.id = $1
        `, [forklift_id]);
        const forklift = rows[0];
        if (!forklift) { socket.emit('error', { message: 'Forklift not found' }); return; }

        // Block duplicate login (fix #2)
        const alreadyConnected = Object.values(connectedTablets).find(
          t => t.mode === 'forklift' && t.forklift_id === forklift_id && t.socket_id !== socket.id
        );
        if (alreadyConnected) {
          socket.emit('error', { message: 'This forklift is already active on another tablet' });
          return;
        }

        connectedTablets[socket.id] = {
          mode: 'forklift', forklift_id,
          type_id: forklift.type_id, type_name: forklift.type_name, socket_id: socket.id
        };
        socket.join('forklifts');
        socket.join('forklift_' + forklift_id);
        socket.join('type_' + forklift.type_id);

        await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [forklift_id]);

        socket.emit('registered', { mode: 'forklift', forklift });
        broadcastSystemStatus(io);
      } catch (err) {
        console.error('register_forklift error:', err);
      }
    });

    socket.on('register_supervisor', async () => {
      connectedTablets[socket.id] = { mode: 'supervisor' };
      socket.join('supervisors');
      socket.emit('system_status', await getSystemStatus());
    });

    // -------------------------------------------------------
    // REQUEST FLOW
    // -------------------------------------------------------

    socket.on('send_request', async (data) => {
      try {
        const { cell_id, forklift_type_id } = data;

        const { rows: cellRows } = await pool.query('SELECT * FROM cells WHERE id = $1', [cell_id]);
        const { rows: typeRows } = await pool.query('SELECT * FROM forklift_types WHERE id = $1', [forklift_type_id]);
        const cell = cellRows[0]; const type = typeRows[0];

        if (!cell || !type) { socket.emit('error', { message: 'Invalid cell or forklift type' }); return; }

        const { rows: existing } = await pool.query(
          "SELECT * FROM requests WHERE cell_id = $1 AND status IN ('pending', 'accepted')",
          [cell_id]
        );
        if (existing[0]) { socket.emit('error', { message: 'You already have an active request' }); return; }

        const id = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
        const now = new Date().toISOString();

        await pool.query(
          "INSERT INTO requests (id, cell_id, forklift_type_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)",
          [id, cell_id, forklift_type_id, now]
        );
        await pool.query(
          "INSERT INTO kpi_logs (request_id, event, recorded_at) VALUES ($1, 'request_created', $2)",
          [id, now]
        );

        const { rows: reqRows } = await pool.query(`
          SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name
          FROM requests r
          JOIN cells c ON r.cell_id = c.id
          JOIN forklift_types ft ON r.forklift_type_id = ft.id
          WHERE r.id = $1
        `, [id]);

        socket.emit('request_sent', reqRows[0]);
        await broadcastToAvailableForklifts(io, forklift_type_id, reqRows[0]);
        io.to('supervisors').emit('system_status', await getSystemStatus());
      } catch (err) {
        console.error('send_request error:', err);
      }
    });

    socket.on('accept_request', async (data) => {
      try {
        const { request_id, forklift_id } = data;

        const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [request_id]);
        const request = reqRows[0];
        if (!request) { socket.emit('error', { message: 'Request not found' }); return; }
        if (request.status !== 'pending') { socket.emit('error', { message: 'Request already taken' }); return; }

        const { rows: fRows } = await pool.query('SELECT * FROM forklifts WHERE id = $1', [forklift_id]);
        if (!fRows[0]) { socket.emit('error', { message: 'Forklift not found' }); return; }

        const now = new Date().toISOString();
        const { rows: cfg } = await pool.query("SELECT value FROM config WHERE key = 'task_timeout_seconds'");
        const timeoutSeconds = parseInt(cfg[0].value);
        const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

        await pool.query(
          "UPDATE requests SET status = 'accepted', forklift_id = $1, accepted_at = $2, timeout_at = $3 WHERE id = $4",
          [forklift_id, now, timeoutAt, request_id]
        );
        await pool.query("UPDATE forklifts SET status = 'busy' WHERE id = $1", [forklift_id]);

        const responseSeconds = Math.floor((new Date(now) - new Date(request.created_at)) / 1000);
        await pool.query(
          "INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at) VALUES ($1, 'request_accepted', $2, $3)",
          [request_id, responseSeconds, now]
        );

        const { rows: updated } = await pool.query(`
          SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
          FROM requests r
          JOIN cells c ON r.cell_id = c.id
          JOIN forklift_types ft ON r.forklift_type_id = ft.id
          LEFT JOIN forklifts f ON r.forklift_id = f.id
          WHERE r.id = $1
        `, [request_id]);

        io.to('cell_' + request.cell_id).emit('request_accepted', updated[0]);
        socket.emit('accept_confirmed', updated[0]);
        socket.to('type_' + request.forklift_type_id).emit('request_taken', { request_id });
        io.to('supervisors').emit('system_status', await getSystemStatus());

        scheduleTimeout(io, request_id, timeoutSeconds);
      } catch (err) {
        console.error('accept_request error:', err);
      }
    });

    socket.on('decline_request', async (data) => {
      try {
        const { request_id, forklift_id, reason } = data;

        const { rows } = await pool.query('SELECT * FROM requests WHERE id = $1', [request_id]);
        const request = rows[0];
        if (!request || request.status !== 'pending') { socket.emit('error', { message: 'Request not available' }); return; }

        const now = new Date().toISOString();
        await pool.query(
          "INSERT INTO kpi_logs (request_id, event, recorded_at) VALUES ($1, 'request_declined', $2)",
          [request_id, now]
        );

        if (reason) {
          await pool.query(
            'INSERT INTO leave_log (forklift_id, reason, started_at) VALUES ($1, $2, $3)',
            [forklift_id, reason, now]
          );
          await pool.query("UPDATE forklifts SET status = 'on_leave' WHERE id = $1", [forklift_id]);
          socket.leave('type_' + connectedTablets[socket.id]?.type_id);
        }

        await broadcastToAvailableForklifts(io, request.forklift_type_id, request, forklift_id);
        io.to('supervisors').emit('system_status', await getSystemStatus());
      } catch (err) {
        console.error('decline_request error:', err);
      }
    });

    socket.on('complete_request', async (data) => {
      try {
        const { request_id, forklift_id } = data;

        const { rows } = await pool.query('SELECT * FROM requests WHERE id = $1', [request_id]);
        const request = rows[0];
        if (!request || request.status !== 'accepted') { socket.emit('error', { message: 'Request not active' }); return; }

        const now = new Date().toISOString();
        await pool.query("UPDATE requests SET status = 'completed', completed_at = $1 WHERE id = $2", [now, request_id]);
        await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [forklift_id]);

        const taskSeconds = Math.floor((new Date(now) - new Date(request.accepted_at)) / 1000);
        await pool.query(
          "INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at) VALUES ($1, 'request_completed', $2, $3)",
          [request_id, taskSeconds, now]
        );

        socket.join('type_' + connectedTablets[socket.id]?.type_id);

        const { rows: updated } = await pool.query(`
          SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
          FROM requests r
          JOIN cells c ON r.cell_id = c.id
          JOIN forklift_types ft ON r.forklift_type_id = ft.id
          LEFT JOIN forklifts f ON r.forklift_id = f.id
          WHERE r.id = $1
        `, [request_id]);

        io.to('cell_' + request.cell_id).emit('request_completed', updated[0]);
        socket.emit('complete_confirmed', updated[0]);
        io.to('supervisors').emit('system_status', await getSystemStatus());
      } catch (err) {
        console.error('complete_request error:', err);
      }
    });

    socket.on('return_from_leave', async (data) => {
      try {
        const { forklift_id } = data;
        await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [forklift_id]);
        await pool.query(
          'UPDATE leave_log SET ended_at = $1 WHERE forklift_id = $2 AND ended_at IS NULL',
          [new Date().toISOString(), forklift_id]
        );

        const tablet = connectedTablets[socket.id];
        if (tablet) socket.join('type_' + tablet.type_id);

        socket.emit('leave_ended', { forklift_id });
        io.to('supervisors').emit('system_status', await getSystemStatus());
      } catch (err) {
        console.error('return_from_leave error:', err);
      }
    });

    socket.on('cancel_request', async (data) => {
      try {
        const { request_id } = data;

        const { rows } = await pool.query('SELECT * FROM requests WHERE id = $1', [request_id]);
        const request = rows[0];
        if (!request || !['pending', 'accepted'].includes(request.status)) {
          socket.emit('error', { message: 'Request cannot be cancelled' }); return;
        }

        const now = new Date().toISOString();
        await pool.query("UPDATE requests SET status = 'cancelled', completed_at = $1 WHERE id = $2", [now, request_id]);

        if (request.forklift_id) {
          await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [request.forklift_id]);
          io.to('forklift_' + request.forklift_id).emit('request_cancelled', { request_id });
        }

        socket.emit('cancel_confirmed', { request_id });
        io.to('supervisors').emit('system_status', await getSystemStatus());
      } catch (err) {
        console.error('cancel_request error:', err);
      }
    });

    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', async () => {
      try {
        const tablet = connectedTablets[socket.id];
        if (tablet) {
          if (tablet.mode === 'forklift' && tablet.forklift_id) {
            const { rows } = await pool.query(
              "SELECT * FROM requests WHERE forklift_id = $1 AND status = 'accepted'",
              [tablet.forklift_id]
            );
            if (rows[0]) {
              io.to('supervisors').emit('forklift_connection_lost', {
                forklift_id: tablet.forklift_id,
                request_id: rows[0].id,
              });
            }
          }
          delete connectedTablets[socket.id];
          broadcastSystemStatus(io);
        }
      } catch (err) {
        console.error('disconnect error:', err);
      }
    });

  });
};

// -------------------------------------------------------
// HELPERS
// -------------------------------------------------------

async function broadcastToAvailableForklifts(io, forklift_type_id, request, excludeForkliftId = null) {
  const { rows } = await pool.query(
    "SELECT * FROM forklifts WHERE type_id = $1 AND status = 'available'",
    [forklift_type_id]
  );

  const eligible = excludeForkliftId ? rows.filter(f => f.id !== excludeForkliftId) : rows;

  if (eligible.length === 0) {
    io.to('cell_' + request.cell_id).emit('no_forklifts_available', {
      request_id: request.id,
      message: 'No forklifts of this type are currently available',
    });
    return;
  }

  io.to('type_' + forklift_type_id).emit('incoming_request', request);
}

async function getSystemStatus() {
  const { rows: forklifts } = await pool.query(`
    SELECT f.*, ft.name as type_name
    FROM forklifts f
    JOIN forklift_types ft ON f.type_id = ft.id
    ORDER BY ft.name, f.name
  `);

  const { rows: cells } = await pool.query('SELECT * FROM cells ORDER BY cell_number');

  const { rows: activeRequests } = await pool.query(`
    SELECT r.*, c.cell_number, ft.name as forklift_type_name, f.name as forklift_name
    FROM requests r
    JOIN cells c ON r.cell_id = c.id
    JOIN forklift_types ft ON r.forklift_type_id = ft.id
    LEFT JOIN forklifts f ON r.forklift_id = f.id
    WHERE r.status IN ('pending', 'accepted')
    ORDER BY r.created_at ASC
  `);

  return { forklifts, cells, activeRequests };
}

async function broadcastSystemStatus(io) {
  io.to('supervisors').emit('system_status', await getSystemStatus());
}

function scheduleTimeout(io, request_id, timeoutSeconds) {
  setTimeout(async () => {
    try {
      const { rows } = await pool.query('SELECT * FROM requests WHERE id = $1', [request_id]);
      const request = rows[0];
      if (!request || request.status !== 'accepted') return;

      const now = new Date().toISOString();
      await pool.query("UPDATE requests SET status = 'completed', completed_at = $1 WHERE id = $2", [now, request_id]);

      if (request.forklift_id) {
        await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [request.forklift_id]);
      }

      await pool.query(
        "INSERT INTO kpi_logs (request_id, event, recorded_at) VALUES ($1, 'request_timeout_completed', $2)",
        [request_id, now]
      );

      io.to('cell_' + request.cell_id).emit('request_timeout_completed', { request_id });
      if (request.forklift_id) {
        io.to('forklift_' + request.forklift_id).emit('task_timeout', { request_id });
      }
      io.to('supervisors').emit('system_status', await getSystemStatus());
    } catch (err) {
      console.error('scheduleTimeout error:', err);
    }
  }, timeoutSeconds * 1000);
}