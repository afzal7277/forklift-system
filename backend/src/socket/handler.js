const db = require('../db');

// Track connected tablets
// key = socket.id, value = { mode, forklift_id or cell_id, type_id }
const connectedTablets = {};

module.exports = (io) => {

  io.on('connection', (socket) => {
    console.log('Tablet connected: ' + socket.id);

    // -------------------------------------------------------
    // REGISTRATION
    // Each tablet registers itself on connect
    // -------------------------------------------------------

    // Cell tablet registers
    socket.on('register_cell', (data) => {
      const { cell_id } = data;

      const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cell_id);
      if (!cell) {
        socket.emit('error', { message: 'Cell not found' });
        return;
      }

      connectedTablets[socket.id] = {
        mode: 'cell',
        cell_id,
        cell_number: cell.cell_number
      };

      socket.join('cells');
      socket.join('cell_' + cell_id);

      console.log('Cell registered: ' + cell.cell_number);

      socket.emit('registered', {
        mode: 'cell',
        cell
      });

      // Broadcast updated status to supervisors
      broadcastSystemStatus(io);
    });

    // Forklift tablet registers
    socket.on('register_forklift', (data) => {
      const { forklift_id } = data;

      const forklift = db.prepare(`
        SELECT f.*, ft.name as type_name
        FROM forklifts f
        JOIN forklift_types ft ON f.type_id = ft.id
        WHERE f.id = ?
      `).get(forklift_id);

      if (!forklift) {
        socket.emit('error', { message: 'Forklift not found' });
        return;
      }

      connectedTablets[socket.id] = {
        mode: 'forklift',
        forklift_id,
        type_id: forklift.type_id,
        type_name: forklift.type_name
      };

      socket.join('forklifts');
      socket.join('forklift_' + forklift_id);
      socket.join('type_' + forklift.type_id);

      console.log('Forklift registered: ' + forklift.name + ' type: ' + forklift.type_name);

      socket.emit('registered', {
        mode: 'forklift',
        forklift
      });

      // Mark forklift as available on connect
      db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
        'available',
        forklift_id
      );

      broadcastSystemStatus(io);
    });

    // Supervisor registers (mobile app monitoring)
    socket.on('register_supervisor', () => {
      connectedTablets[socket.id] = { mode: 'supervisor' };
      socket.join('supervisors');

      console.log('Supervisor connected');

      // Send current full status immediately
      socket.emit('system_status', getSystemStatus());
    });

    // -------------------------------------------------------
    // REQUEST FLOW
    // -------------------------------------------------------

    // Cell broadcasts a new forklift request
    socket.on('send_request', (data) => {
      const { cell_id, forklift_type_id } = data;

      const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cell_id);
      const type = db.prepare(
        'SELECT * FROM forklift_types WHERE id = ?'
      ).get(forklift_type_id);

      if (!cell || !type) {
        socket.emit('error', { message: 'Invalid cell or forklift type' });
        return;
      }

      // Check for existing active request from this cell
      const existing = db.prepare(`
        SELECT * FROM requests
        WHERE cell_id = ? AND status IN ('pending', 'accepted')
      `).get(cell_id);

      if (existing) {
        socket.emit('error', { message: 'You already have an active request' });
        return;
      }

      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO requests (id, cell_id, forklift_type_id, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(id, cell_id, forklift_type_id, now);

      db.prepare(`
        INSERT INTO kpi_logs (request_id, event, recorded_at)
        VALUES (?, 'request_created', ?)
      `).run(id, now);

      const request = db.prepare(`
        SELECT 
          r.*,
          c.cell_number,
          c.operator_name,
          ft.name as forklift_type_name
        FROM requests r
        JOIN cells c ON r.cell_id = c.id
        JOIN forklift_types ft ON r.forklift_type_id = ft.id
        WHERE r.id = ?
      `).get(id);

      // Confirm to the cell that request was sent
      socket.emit('request_sent', request);

      // Broadcast to all forklifts of matching type that are available
      broadcastToAvailableForklifts(io, forklift_type_id, request);

      // Notify supervisors
      io.to('supervisors').emit('system_status', getSystemStatus());

      console.log(
        'New request from cell ' + cell.cell_number + 
        ' for type ' + type.name
      );
    });

    // Forklift driver accepts a request
    socket.on('accept_request', (data) => {
      const { request_id, forklift_id } = data;

      const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(request_id);
      if (!request) {
        socket.emit('error', { message: 'Request not found' });
        return;
      }

      if (request.status !== 'pending') {
        socket.emit('error', { message: 'Request already taken' });
        return;
      }

      const forklift = db.prepare('SELECT * FROM forklifts WHERE id = ?').get(forklift_id);
      if (!forklift) {
        socket.emit('error', { message: 'Forklift not found' });
        return;
      }

      const now = new Date().toISOString();

      const timeoutConfig = db.prepare(
        'SELECT value FROM config WHERE key = ?'
      ).get('task_timeout_seconds');
      const timeoutSeconds = parseInt(timeoutConfig.value);
      const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

      db.prepare(`
        UPDATE requests
        SET status = 'accepted', forklift_id = ?, accepted_at = ?, timeout_at = ?
        WHERE id = ?
      `).run(forklift_id, now, timeoutAt, request_id);

      db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run('busy', forklift_id);

      const responseSeconds = Math.floor(
        (new Date(now) - new Date(request.created_at)) / 1000
      );

      db.prepare(`
        INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at)
        VALUES (?, 'request_accepted', ?, ?)
      `).run(request_id, responseSeconds, now);

      const updated = db.prepare(`
        SELECT 
          r.*,
          c.cell_number,
          c.operator_name,
          ft.name as forklift_type_name,
          f.name as forklift_name
        FROM requests r
        JOIN cells c ON r.cell_id = c.id
        JOIN forklift_types ft ON r.forklift_type_id = ft.id
        LEFT JOIN forklifts f ON r.forklift_id = f.id
        WHERE r.id = ?
      `).get(request_id);

      // Tell the cell their request was accepted
      io.to('cell_' + request.cell_id).emit('request_accepted', updated);

      // Tell the forklift confirmation
      socket.emit('accept_confirmed', updated);

      // Tell other forklifts of same type to dismiss this request
      socket.to('type_' + request.forklift_type_id).emit(
        'request_taken', 
        { request_id }
      );

      // Notify supervisors
      io.to('supervisors').emit('system_status', getSystemStatus());

      console.log('Request ' + request_id + ' accepted by forklift ' + forklift_id);

      // Start timeout job
      scheduleTimeout(io, request_id, timeoutSeconds);
    });

    // Forklift driver declines a request
    socket.on('decline_request', (data) => {
      const { request_id, forklift_id, reason } = data;

      const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(request_id);
      if (!request || request.status !== 'pending') {
        socket.emit('error', { message: 'Request not available' });
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO kpi_logs (request_id, event, recorded_at)
        VALUES (?, 'request_declined', ?)
      `).run(request_id, now);

      if (reason) {
        db.prepare(`
          INSERT INTO leave_log (forklift_id, reason, started_at)
          VALUES (?, ?, ?)
        `).run(forklift_id, reason, now);

        db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
          'on_leave',
          forklift_id
        );

        // Remove from type room so no more requests come in
        socket.leave('type_' + connectedTablets[socket.id]?.type_id);
      }

      // Re-broadcast to remaining available forklifts of same type
      broadcastToAvailableForklifts(
        io,
        request.forklift_type_id,
        request,
        forklift_id
      );

      io.to('supervisors').emit('system_status', getSystemStatus());

      console.log('Request ' + request_id + ' declined by ' + forklift_id);
    });

    // Forklift driver completes a task
    socket.on('complete_request', (data) => {
      const { request_id, forklift_id } = data;

      const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(request_id);
      if (!request || request.status !== 'accepted') {
        socket.emit('error', { message: 'Request not active' });
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE requests SET status = 'completed', completed_at = ? WHERE id = ?
      `).run(now, request_id);

      db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
        'available',
        forklift_id
      );

      const taskSeconds = Math.floor(
        (new Date(now) - new Date(request.accepted_at)) / 1000
      );

      db.prepare(`
        INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at)
        VALUES (?, 'request_completed', ?, ?)
      `).run(request_id, taskSeconds, now);

      // Rejoin type room now that forklift is available again
      socket.join('type_' + connectedTablets[socket.id]?.type_id);

      const updated = db.prepare(`
        SELECT 
          r.*,
          c.cell_number,
          c.operator_name,
          ft.name as forklift_type_name,
          f.name as forklift_name
        FROM requests r
        JOIN cells c ON r.cell_id = c.id
        JOIN forklift_types ft ON r.forklift_type_id = ft.id
        LEFT JOIN forklifts f ON r.forklift_id = f.id
        WHERE r.id = ?
      `).get(request_id);

      io.to('cell_' + request.cell_id).emit('request_completed', updated);
      socket.emit('complete_confirmed', updated);
      io.to('supervisors').emit('system_status', getSystemStatus());

      console.log('Request ' + request_id + ' completed by forklift ' + forklift_id);
    });

    // Driver marks themselves back from leave
    socket.on('return_from_leave', (data) => {
      const { forklift_id } = data;

      db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
        'available',
        forklift_id
      );

      // Update leave log end time
      db.prepare(`
        UPDATE leave_log SET ended_at = ?
        WHERE forklift_id = ? AND ended_at IS NULL
      `).run(new Date().toISOString(), forklift_id);

      // Rejoin type room
      const tablet = connectedTablets[socket.id];
      if (tablet) {
        socket.join('type_' + tablet.type_id);
      }

      socket.emit('leave_ended', { forklift_id });
      io.to('supervisors').emit('system_status', getSystemStatus());

      console.log('Forklift ' + forklift_id + ' returned from leave');
    });

    // Cell cancels their request
    socket.on('cancel_request', (data) => {
      const { request_id } = data;

      const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(request_id);
      if (!request || !['pending', 'accepted'].includes(request.status)) {
        socket.emit('error', { message: 'Request cannot be cancelled' });
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE requests SET status = 'cancelled', completed_at = ? WHERE id = ?
      `).run(now, request_id);

      if (request.forklift_id) {
        db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
          'available',
          request.forklift_id
        );

        io.to('forklift_' + request.forklift_id).emit('request_cancelled', {
          request_id
        });
      }

      socket.emit('cancel_confirmed', { request_id });
      io.to('supervisors').emit('system_status', getSystemStatus());

      console.log('Request ' + request_id + ' cancelled');
    });

    // -------------------------------------------------------
    // HEARTBEAT - detect dead tablets
    // -------------------------------------------------------

    socket.on('heartbeat', (data) => {
      socket.emit('heartbeat_ack', { timestamp: new Date().toISOString() });
    });

    // -------------------------------------------------------
    // DISCONNECT
    // -------------------------------------------------------

    socket.on('disconnect', () => {
      const tablet = connectedTablets[socket.id];

      if (tablet) {
        if (tablet.mode === 'forklift' && tablet.forklift_id) {
          console.log('Forklift tablet disconnected: ' + tablet.forklift_id);

          // Check if forklift had an active request
          const activeRequest = db.prepare(`
            SELECT * FROM requests 
            WHERE forklift_id = ? AND status = 'accepted'
          `).get(tablet.forklift_id);

          if (activeRequest) {
            // Notify supervisor of connection loss during active task
            io.to('supervisors').emit('forklift_connection_lost', {
              forklift_id: tablet.forklift_id,
              request_id: activeRequest.id,
              message: 'Forklift tablet disconnected during active task'
            });
          }
        }

        if (tablet.mode === 'cell' && tablet.cell_id) {
          console.log('Cell tablet disconnected: ' + tablet.cell_id);
        }

        delete connectedTablets[socket.id];
        broadcastSystemStatus(io);
      }

      console.log('Tablet disconnected: ' + socket.id);
    });

  });

};

// -------------------------------------------------------
// HELPERS
// -------------------------------------------------------

function broadcastToAvailableForklifts(io, forklift_type_id, request, excludeForkliftId = null) {
  const availableForklifts = db.prepare(`
    SELECT * FROM forklifts 
    WHERE type_id = ? AND status = 'available'
  `).all(forklift_type_id);

  if (availableForklifts.length === 0) {
    // No forklifts available - notify the cell
    io.to('cell_' + request.cell_id).emit('no_forklifts_available', {
      request_id: request.id,
      message: 'No forklifts of this type are currently available'
    });
    return;
  }

  const eligible = excludeForkliftId
    ? availableForklifts.filter(f => f.id !== excludeForkliftId)
    : availableForklifts;

  if (eligible.length === 0) {
    io.to('cell_' + request.cell_id).emit('no_forklifts_available', {
      request_id: request.id,
      message: 'No other forklifts available'
    });
    return;
  }

  // Broadcast to the socket room for this forklift type
  io.to('type_' + forklift_type_id).emit('incoming_request', request);
}

function getSystemStatus() {
  const forklifts = db.prepare(`
    SELECT f.*, ft.name as type_name
    FROM forklifts f
    JOIN forklift_types ft ON f.type_id = ft.id
    ORDER BY ft.name, f.name
  `).all();

  const cells = db.prepare('SELECT * FROM cells ORDER BY cell_number').all();

  const activeRequests = db.prepare(`
    SELECT 
      r.*,
      c.cell_number,
      ft.name as forklift_type_name,
      f.name as forklift_name
    FROM requests r
    JOIN cells c ON r.cell_id = c.id
    JOIN forklift_types ft ON r.forklift_type_id = ft.id
    LEFT JOIN forklifts f ON r.forklift_id = f.id
    WHERE r.status IN ('pending', 'accepted')
    ORDER BY r.created_at ASC
  `).all();

  return { forklifts, cells, activeRequests };
}

function broadcastSystemStatus(io) {
  io.to('supervisors').emit('system_status', getSystemStatus());
}

function scheduleTimeout(io, request_id, timeoutSeconds) {
  setTimeout(() => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(request_id);

    if (!request || request.status !== 'accepted') return;

    const now = new Date().toISOString();

    // Auto complete the request
    db.prepare(`
      UPDATE requests SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(now, request_id);

    if (request.forklift_id) {
      db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
        'available',
        request.forklift_id
      );
    }

    db.prepare(`
      INSERT INTO kpi_logs (request_id, event, recorded_at)
      VALUES (?, 'request_timeout_completed', ?)
    `).run(request_id, now);

    io.to('cell_' + request.cell_id).emit('request_timeout_completed', {
      request_id
    });

    if (request.forklift_id) {
      io.to('forklift_' + request.forklift_id).emit('task_timeout', {
        request_id,
        message: 'Task timed out and marked complete'
      });
    }

    io.to('supervisors').emit('system_status', getSystemStatus());

    console.log('Request ' + request_id + ' auto completed due to timeout');

  }, timeoutSeconds * 1000);
}