const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// Get all requests with full info
router.get('/', (req, res) => {
  const { status, cell_id, forklift_id, limit } = req.query;

  let query = `
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
    WHERE 1=1
  `;

  const params = [];

  if (status) {
    query += ' AND r.status = ?';
    params.push(status);
  }

  if (cell_id) {
    query += ' AND r.cell_id = ?';
    params.push(cell_id);
  }

  if (forklift_id) {
    query += ' AND r.forklift_id = ?';
    params.push(forklift_id);
  }

  query += ' ORDER BY r.created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  }

  const requests = db.prepare(query).all(...params);
  return res.json({ success: true, data: requests });
});

// Get single request
router.get('/:id', (req, res) => {
  const request = db.prepare(`
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
  `).get(req.params.id);

  if (!request) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }

  return res.json({ success: true, data: request });
});

// Create new request from cell
router.post('/', (req, res) => {
  const { cell_id, forklift_type_id } = req.body;

  if (!cell_id || !forklift_type_id) {
    return res.status(400).json({ 
      success: false, 
      message: 'cell_id and forklift_type_id are required' 
    });
  }

  // Check cell exists
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cell_id);
  if (!cell) {
    return res.status(404).json({ success: false, message: 'Cell not found' });
  }

  // Check forklift type exists
  const type = db.prepare('SELECT * FROM forklift_types WHERE id = ?').get(forklift_type_id);
  if (!type) {
    return res.status(404).json({ success: false, message: 'Forklift type not found' });
  }

  // Check if cell already has a pending or active request
  const existing = db.prepare(`
    SELECT * FROM requests 
    WHERE cell_id = ? AND status IN ('pending', 'accepted')
  `).get(cell_id);

  if (existing) {
    return res.status(400).json({ 
      success: false, 
      message: 'Cell already has an active request',
      data: existing
    });
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO requests (id, cell_id, forklift_type_id, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(id, cell_id, forklift_type_id, now);

  // Log KPI
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

  // Emit to socket handler to broadcast to matching forklifts
  const io = req.app.get('io');
  io.emit('new_request', request);

  return res.status(201).json({ success: true, data: request });
});

// Accept request (forklift driver accepts)
router.put('/:id/accept', (req, res) => {
  const { forklift_id } = req.body;

  if (!forklift_id) {
    return res.status(400).json({ success: false, message: 'forklift_id is required' });
  }

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ 
      success: false, 
      message: 'Request is no longer pending' 
    });
  }

  const forklift = db.prepare('SELECT * FROM forklifts WHERE id = ?').get(forklift_id);
  if (!forklift) {
    return res.status(404).json({ success: false, message: 'Forklift not found' });
  }

  const now = new Date().toISOString();

  // Get task timeout from config
  const timeoutConfig = db.prepare(
    'SELECT value FROM config WHERE key = ?'
  ).get('task_timeout_seconds');
  const timeoutSeconds = parseInt(timeoutConfig.value);
  const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

  // Update request
  db.prepare(`
    UPDATE requests 
    SET status = 'accepted', forklift_id = ?, accepted_at = ?, timeout_at = ?
    WHERE id = ?
  `).run(forklift_id, now, timeoutAt, req.params.id);

  // Update forklift status to busy
  db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run('busy', forklift_id);

  // Log KPI - response time in seconds
  const responseSeconds = Math.floor(
    (new Date(now) - new Date(request.created_at)) / 1000
  );
  db.prepare(`
    INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at)
    VALUES (?, 'request_accepted', ?, ?)
  `).run(req.params.id, responseSeconds, now);

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
  `).get(req.params.id);

  const io = req.app.get('io');
  io.emit('request_accepted', updated);

  return res.json({ success: true, data: updated });
});

// Complete request (task done)
router.put('/:id/complete', (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }

  if (request.status !== 'accepted') {
    return res.status(400).json({ success: false, message: 'Request is not active' });
  }

  const now = new Date().toISOString();

  // Update request
  db.prepare(`
    UPDATE requests SET status = 'completed', completed_at = ? WHERE id = ?
  `).run(now, req.params.id);

  // Free the forklift
  if (request.forklift_id) {
    db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
      'available', 
      request.forklift_id
    );
  }

  // Log KPI - task duration in seconds
  const taskSeconds = Math.floor(
    (new Date(now) - new Date(request.accepted_at)) / 1000
  );
  db.prepare(`
    INSERT INTO kpi_logs (request_id, event, value_seconds, recorded_at)
    VALUES (?, 'request_completed', ?, ?)
  `).run(req.params.id, taskSeconds, now);

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
  `).get(req.params.id);

  const io = req.app.get('io');
  io.emit('request_completed', updated);

  return res.json({ success: true, data: updated });
});

// Decline request (forklift driver declines)
router.put('/:id/decline', (req, res) => {
  const { forklift_id, reason } = req.body;

  if (!forklift_id) {
    return res.status(400).json({ success: false, message: 'forklift_id is required' });
  }

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'Request is no longer pending' });
  }

  const now = new Date().toISOString();

  // Log the decline
  db.prepare(`
    INSERT INTO kpi_logs (request_id, event, recorded_at)
    VALUES (?, 'request_declined', ?)
  `).run(req.params.id, now);

  // Log leave if reason provided
  if (reason) {
    db.prepare(`
      INSERT INTO leave_log (forklift_id, reason, started_at)
      VALUES (?, ?, ?)
    `).run(forklift_id, reason, now);

    db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run('on_leave', forklift_id);
  }

  // Re-broadcast to next available forklift of same type
  const io = req.app.get('io');
  io.emit('request_rerouted', {
    request_id: req.params.id,
    declined_by: forklift_id,
    reason: reason || null
  });

  return res.json({ success: true, message: 'Request declined and rerouted' });
});

// Cancel request (cell cancels)
router.put('/:id/cancel', (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Request not found' });
  }

  if (!['pending', 'accepted'].includes(request.status)) {
    return res.status(400).json({ success: false, message: 'Request cannot be cancelled' });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE requests SET status = 'cancelled', completed_at = ? WHERE id = ?
  `).run(now, req.params.id);

  // Free forklift if it was accepted
  if (request.forklift_id) {
    db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(
      'available',
      request.forklift_id
    );
  }

  const io = req.app.get('io');
  io.emit('request_cancelled', { request_id: req.params.id });

  return res.json({ success: true, message: 'Request cancelled' });
});

// Get KPI summary
router.get('/kpi/summary', (req, res) => {
  const totalRequests = db.prepare(
    'SELECT COUNT(*) as count FROM requests'
  ).get();

  const completedRequests = db.prepare(
    'SELECT COUNT(*) as count FROM requests WHERE status = ?'
  ).get('completed');

  const avgResponseTime = db.prepare(`
    SELECT AVG(value_seconds) as avg_seconds 
    FROM kpi_logs 
    WHERE event = 'request_accepted'
  `).get();

  const avgTaskTime = db.prepare(`
    SELECT AVG(value_seconds) as avg_seconds 
    FROM kpi_logs 
    WHERE event = 'request_completed'
  `).get();

  const pendingRequests = db.prepare(
    'SELECT COUNT(*) as count FROM requests WHERE status = ?'
  ).get('pending');

  return res.json({
    success: true,
    data: {
      total_requests: totalRequests.count,
      completed_requests: completedRequests.count,
      pending_requests: pendingRequests.count,
      avg_response_time_seconds: Math.round(avgResponseTime.avg_seconds || 0),
      avg_task_time_seconds: Math.round(avgTaskTime.avg_seconds || 0)
    }
  });
});

module.exports = router;