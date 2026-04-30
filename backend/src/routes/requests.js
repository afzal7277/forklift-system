const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// KPI summary must be before /:id to avoid route conflict
router.get('/kpi/summary', async (req, res) => {
  try {
    const { rows: total } = await pool.query('SELECT COUNT(*) as count FROM requests');
    const { rows: completed } = await pool.query("SELECT COUNT(*) as count FROM requests WHERE status = 'completed'");
    const { rows: pending } = await pool.query("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'");
    const { rows: avgResponse } = await pool.query("SELECT AVG(value_seconds) as avg_seconds FROM kpi_logs WHERE event = 'request_accepted'");
    const { rows: avgTask } = await pool.query("SELECT AVG(value_seconds) as avg_seconds FROM kpi_logs WHERE event = 'request_completed'");

    return res.json({
      success: true,
      data: {
        total_requests: parseInt(total[0].count),
        completed_requests: parseInt(completed[0].count),
        pending_requests: parseInt(pending[0].count),
        avg_response_time_seconds: Math.round(parseFloat(avgResponse[0].avg_seconds) || 0),
        avg_task_time_seconds: Math.round(parseFloat(avgTask[0].avg_seconds) || 0),
      }
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
      FROM requests r
      JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status) { query += ` AND r.status = $${idx++}`; params.push(status); }
    if (cell_id) { query += ` AND r.cell_id = $${idx++}`; params.push(cell_id); }
    if (forklift_id) { query += ` AND r.forklift_id = $${idx++}`; params.push(forklift_id); }

    query += ' ORDER BY r.created_at DESC';
    if (limit) { query += ` LIMIT $${idx++}`; params.push(parseInt(limit)); }

    const { rows } = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get single request
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r
      JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
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
      "SELECT * FROM requests WHERE cell_id = $1 AND status IN ('pending', 'accepted')",
      [cell_id]
    );
    if (existing[0]) return res.status(400).json({ success: false, message: 'Cell already has an active request', data: existing[0] });

    const id = generateId();
    const now = new Date().toISOString();

    await pool.query(
      "INSERT INTO requests (id, cell_id, forklift_type_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)",
      [id, cell_id, forklift_type_id, now]
    );
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, recorded_at) VALUES ($1, 'request_created', $2)",
      [id, now]
    );

    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name
      FROM requests r
      JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      WHERE r.id = $1
    `, [id]);

    const io = req.app.get('io');
    io.emit('new_request', rows[0]);

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Accept request
router.put('/:id/accept', async (req, res) => {
  try {
    const { forklift_id } = req.body;
    if (!forklift_id) return res.status(400).json({ success: false, message: 'forklift_id is required' });

    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (reqRows[0].status !== 'pending') return res.status(400).json({ success: false, message: 'Request is no longer pending' });

    const { rows: fRows } = await pool.query('SELECT * FROM forklifts WHERE id = $1', [forklift_id]);
    if (!fRows[0]) return res.status(404).json({ success: false, message: 'Forklift not found' });

    const now = new Date().toISOString();
    const { rows: cfg } = await pool.query("SELECT value FROM config WHERE key = 'task_timeout_seconds'");
    const timeoutSeconds = parseInt(cfg[0].value);
    const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

    await pool.query(
      "UPDATE requests SET status = 'accepted', forklift_id = $1, accepted_at = $2, timeout_at = $3 WHERE id = $4",
      [forklift_id, now, timeoutAt, req.params.id]
    );
    await pool.query("UPDATE forklifts SET status = 'busy' WHERE id = $1", [forklift_id]);

    const responseSeconds = Math.floor((new Date(now) - new Date(reqRows[0].created_at)) / 1000);
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at) VALUES ($1, 'request_accepted', $2, $3)",
      [req.params.id, responseSeconds, now]
    );

    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id
      WHERE r.id = $1
    `, [req.params.id]);

    req.app.get('io').emit('request_accepted', rows[0]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Complete request
router.put('/:id/complete', async (req, res) => {
  try {
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (reqRows[0].status !== 'accepted') return res.status(400).json({ success: false, message: 'Request is not active' });

    const now = new Date().toISOString();
    await pool.query("UPDATE requests SET status = 'completed', completed_at = $1 WHERE id = $2", [now, req.params.id]);

    if (reqRows[0].forklift_id) {
      await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [reqRows[0].forklift_id]);
    }

    const taskSeconds = Math.floor((new Date(now) - new Date(reqRows[0].accepted_at)) / 1000);
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at) VALUES ($1, 'request_completed', $2, $3)",
      [req.params.id, taskSeconds, now]
    );

    const { rows } = await pool.query(`
      SELECT r.*, c.cell_number, c.operator_name, ft.name as forklift_type_name, f.name as forklift_name
      FROM requests r JOIN cells c ON r.cell_id = c.id
      JOIN forklift_types ft ON r.forklift_type_id = ft.id
      LEFT JOIN forklifts f ON r.forklift_id = f.id
      WHERE r.id = $1
    `, [req.params.id]);

    req.app.get('io').emit('request_completed', rows[0]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Decline request
router.put('/:id/decline', async (req, res) => {
  try {
    const { forklift_id, reason } = req.body;
    if (!forklift_id) return res.status(400).json({ success: false, message: 'forklift_id is required' });

    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (reqRows[0].status !== 'pending') return res.status(400).json({ success: false, message: 'Request is no longer pending' });

    const now = new Date().toISOString();
    await pool.query(
      "INSERT INTO kpi_logs (request_id, event, recorded_at) VALUES ($1, 'request_declined', $2)",
      [req.params.id, now]
    );

    if (reason) {
      await pool.query('INSERT INTO leave_log (forklift_id, reason, started_at) VALUES ($1, $2, $3)', [forklift_id, reason, now]);
      await pool.query("UPDATE forklifts SET status = 'on_leave' WHERE id = $1", [forklift_id]);
    }

    req.app.get('io').emit('request_rerouted', { request_id: req.params.id, declined_by: forklift_id, reason: reason || null });
    return res.json({ success: true, message: 'Request declined and rerouted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Cancel request
router.put('/:id/cancel', async (req, res) => {
  try {
    const { rows: reqRows } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (!reqRows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!['pending', 'accepted'].includes(reqRows[0].status)) return res.status(400).json({ success: false, message: 'Request cannot be cancelled' });

    const now = new Date().toISOString();
    await pool.query("UPDATE requests SET status = 'cancelled', completed_at = $1 WHERE id = $2", [now, req.params.id]);

    if (reqRows[0].forklift_id) {
      await pool.query("UPDATE forklifts SET status = 'available' WHERE id = $1", [reqRows[0].forklift_id]);
    }

    req.app.get('io').emit('request_cancelled', { request_id: req.params.id });
    return res.json({ success: true, message: 'Request cancelled' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;