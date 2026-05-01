const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// KPI summary
router.get('/kpi/summary', async (req, res) => {
  try {
    const { rows: total } = await pool.query('SELECT COUNT(*) as count FROM requests');
    const { rows: completed } = await pool.query("SELECT COUNT(*) as count FROM requests WHERE status = 'completed'");
    const { rows: pending } = await pool.query("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'");
    const { rows: cancelled } = await pool.query("SELECT COUNT(*) as count FROM requests WHERE status = 'cancelled'");
    const { rows: avgResponse } = await pool.query("SELECT AVG(value_seconds) as avg_seconds FROM kpi_logs WHERE event = 'request_accepted'");
    const { rows: avgTask } = await pool.query("SELECT AVG(value_seconds) as avg_seconds FROM kpi_logs WHERE event = 'request_completed'");
    const { rows: timeouts } = await pool.query("SELECT COUNT(*) as count FROM kpi_logs WHERE event = 'not_responded'");
    const { rows: notResponded } = await pool.query("SELECT COUNT(DISTINCT request_id) as count FROM kpi_logs WHERE event = 'not_responded'");

    return res.json({
      success: true,
      data: {
        total_requests: parseInt(total[0].count),
        completed_requests: parseInt(completed[0].count),
        pending_requests: parseInt(pending[0].count),
        cancelled_requests: parseInt(cancelled[0].count),
        avg_response_time_seconds: Math.round(parseFloat(avgResponse[0].avg_seconds) || 0),
        avg_task_time_seconds: Math.round(parseFloat(avgTask[0].avg_seconds) || 0),
        total_not_responded: parseInt(notResponded[0].count),
        total_timeouts: parseInt(timeouts[0].count),
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Request history with full lifecycle + filters
router.get('/history', async (req, res) => {
  try {
    const { period, date_from, date_to, cell_id, type_id, status } = req.query;

    let fromDate, toDate;
    const now = new Date();

    if (date_from && date_to) {
      fromDate = new Date(date_from);
      toDate = new Date(date_to);
      toDate.setHours(23, 59, 59, 999);
      // Max 90 days
      const diffDays = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 90) {
        return res.status(400).json({ success: false, message: 'Date range cannot exceed 90 days' });
      }
    } else if (period === 'week') {
      fromDate = new Date(now); fromDate.setDate(now.getDate() - 7); fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(now); toDate.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      fromDate = new Date(now); fromDate.setDate(now.getDate() - 30); fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(now); toDate.setHours(23, 59, 59, 999);
    } else {
      // Default: today
      fromDate = new Date(now); fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(now); toDate.setHours(23, 59, 59, 999);
    }

    let query = `
      SELECT r.*, c.cell_number, c.operator_name,
             ft.name as forklift_type_name,
             f.name as forklift_name
      FROM requests r
      JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id
      WHERE r.created_at >= $1 AND r.created_at <= $2
    `;
    const params = [fromDate.toISOString(), toDate.toISOString()];
    let idx = 3;

    if (cell_id) { query += ` AND r.cell_id = $${idx++}`; params.push(cell_id); }
    if (type_id) { query += ` AND r.forklift_type_id = $${idx++}`; params.push(type_id); }
    if (status) { query += ` AND r.status = $${idx++}`; params.push(status); }

    query += ' ORDER BY r.created_at DESC';

    const { rows: requests } = await pool.query(query, params);

    // Fetch all kpi_logs for these requests with forklift names
    const requestIds = requests.map(r => r.id);
    let logs = [];
    if (requestIds.length > 0) {
      const { rows } = await pool.query(`
        SELECT k.*, f.name as forklift_name
        FROM kpi_logs k
        LEFT JOIN forklifts f ON k.forklift_id = f.id
        WHERE k.request_id = ANY($1)
        ORDER BY k.recorded_at ASC
      `, [requestIds]);
      logs = rows;
    }

    // Attach logs to each request
    const requestsWithLogs = requests.map(r => ({
      ...r,
      logs: logs.filter(l => l.request_id === r.id),
    }));

    // Summary counts
    const total = requests.length;
    const completedCount = requests.filter(r => r.status === 'completed').length;
    const cancelledCount = requests.filter(r => r.status === 'cancelled').length;
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    const acceptedCount = requests.filter(r => r.status === 'accepted').length;

    const responseTimes = logs.filter(l => l.event === 'request_accepted' && l.value_seconds).map(l => l.value_seconds);
    const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;

    const taskTimes = logs.filter(l => l.event === 'request_completed' && l.value_seconds).map(l => l.value_seconds);
    const avgTaskTime = taskTimes.length > 0 ? Math.round(taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length) : 0;

    const notRespondedCount = logs.filter(l => l.event === 'not_responded').length;
    const noForkliftsCount = requests.filter(r => r.cancel_reason === 'no_forklifts_available' || r.cancel_reason === 'no_forklifts_responded').length;

    return res.json({
      success: true,
      summary: {
        total, completed: completedCount, cancelled: cancelledCount,
        pending: pendingCount, accepted: acceptedCount,
        avg_response_time_seconds: avgResponseTime,
        avg_task_time_seconds: avgTaskTime,
        not_responded_count: notRespondedCount,
        no_forklifts_count: noForkliftsCount,
      },
      data: requestsWithLogs,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get all requests
router.get('/', async (req, res) => {
  try {
    const { status, cell_id, forklift_id, limit } = req.query;
    let query = `
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id WHERE 1=1
    `;
    const params = []; let idx = 1;
    if (status) { query += ` AND r.status = $${idx++}`; params.push(status); }
    if (cell_id) { query += ` AND r.cell_id = $${idx++}`; params.push(cell_id); }
    if (forklift_id) { query += ` AND r.forklift_id = $${idx++}`; params.push(forklift_id); }
    query += ' ORDER BY r.created_at DESC';
    if (limit) { query += ` LIMIT $${idx++}`; params.push(parseInt(limit)); }
    const { rows } = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Get single request
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id WHERE r.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Create request
router.post('/', async (req, res) => {
  try {
    const { cell_id, forklift_type_id } = req.body;
    if (!cell_id || !forklift_type_id) return res.status(400).json({ success: false, message: 'cell_id and forklift_type_id are required' });

    const { rows: cellRows } = await pool.query('SELECT * FROM cells WHERE id = $1', [cell_id]);
    if (!cellRows[0]) return res.status(404).json({ success: false, message: 'Cell not found' });

    const { rows: typeRows } = await pool.query('SELECT * FROM forklift_types WHERE id = $1', [forklift_type_id]);
    if (!typeRows[0]) return res.status(404).json({ success: false, message: 'Forklift type not found' });

    const { rows: existing } = await pool.query(
      "SELECT * FROM requests WHERE cell_id = $1 AND status IN ('pending', 'accepted')", [cell_id]
    );
    if (existing[0]) return res.status(400).json({ success: false, message: 'Cell already has an active request', data: existing[0] });

    const id = generateId();
    const now = new Date().toISOString();
    await pool.query(
      "INSERT INTO requests (id, cell_id, forklift_type_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)",
      [id, cell_id, forklift_type_id, now]
    );
    await pool.query("INSERT INTO kpi_logs (request_id, event, recorded_at) VALUES ($1, 'request_created', $2)", [id, now]);

    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id WHERE r.id = $1
    `, [id]);

    req.app.get('io').emit('new_request', rows[0]);
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Accept
router.put('/:id/accept', async (req, res) => {
  try {
    const { forklift_id } = req.body;
    if (!forklift_id) return res.status(400).json({ success: false, message: 'forklift_id is required' });
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (reqRows[0].status !== 'pending') return res.status(400).json({ success: false, message: 'Request is no longer pending' });

    const now = new Date().toISOString();
    const { rows: cfg } = await pool.query("SELECT value FROM config WHERE key = 'task_timeout_seconds'");
    const timeoutAt = new Date(Date.now() + parseInt(cfg[0].value) * 1000).toISOString();

    await pool.query(
      "UPDATE requests SET status = 'accepted', forklift_id = $1, accepted_at = $2, timeout_at = $3 WHERE id = $4",
      [forklift_id, now, timeoutAt, req.params.id]
    );
    await pool.query("UPDATE forklifts SET status = 'busy' WHERE id = $1", [forklift_id]);

    const responseSeconds = Math.floor((new Date(now) - new Date(reqRows[0].created_at)) / 1000);
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, forklift_id, value_seconds, recorded_at) VALUES ($1, 'request_accepted', $2, $3, $4)",
      [req.params.id, forklift_id, responseSeconds, now]
    );

    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id WHERE r.id = $1
    `, [req.params.id]);

    req.app.get('io').emit('request_accepted', rows[0]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Complete
router.put('/:id/complete', async (req, res) => {
  try {
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (reqRows[0].status !== 'accepted') return res.status(400).json({ success: false, message: 'Request is not active' });

    const now = new Date().toISOString();
    await pool.query("UPDATE requests SET status = 'completed', completed_at = $1 WHERE id = $2", [now, req.params.id]);
    if (reqRows[0].forklift_id) await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [reqRows[0].forklift_id]);

    const taskSeconds = Math.floor((new Date(now) - new Date(reqRows[0].accepted_at)) / 1000);
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, forklift_id, value_seconds, recorded_at) VALUES ($1, 'request_completed', $2, $3, $4)",
      [req.params.id, reqRows[0].forklift_id, taskSeconds, now]
    );

    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id WHERE r.id = $1
    `, [req.params.id]);

    req.app.get('io').emit('request_completed', rows[0]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Decline
router.put('/:id/decline', async (req, res) => {
  try {
    const { forklift_id, reason } = req.body;
    if (!forklift_id) return res.status(400).json({ success: false, message: 'forklift_id is required' });
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (reqRows[0].status !== 'pending') return res.status(400).json({ success: false, message: 'Request is no longer pending' });

    const now = new Date().toISOString();
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, forklift_id, reason, recorded_at) VALUES ($1, 'request_declined', $2, $3, $4)",
      [req.params.id, forklift_id, reason || null, now]
    );
    if (reason) {
      await pool.query('INSERT INTO leave_log (forklift_id, reason, started_at) VALUES ($1, $2, $3)', [forklift_id, reason, now]);
      await pool.query("UPDATE forklifts SET status = 'on_leave' WHERE id = $1", [forklift_id]);
    }
    req.app.get('io').emit('request_rerouted', { request_id: req.params.id, declined_by: forklift_id, reason: reason || null });
    return res.json({ success: true, message: 'Request declined' });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!['pending', 'accepted'].includes(reqRows[0].status)) return res.status(400).json({ success: false, message: 'Request cannot be cancelled' });

    const now = new Date().toISOString();
    await pool.query(
      "UPDATE requests SET status = 'cancelled', cancel_reason = 'cell_cancelled', completed_at = $1 WHERE id = $2",
      [now, req.params.id]
    );
    if (reqRows[0].forklift_id) await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [reqRows[0].forklift_id]);
    req.app.get('io').emit('request_cancelled', { request_id: req.params.id });
    return res.json({ success: true, message: 'Request cancelled' });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;