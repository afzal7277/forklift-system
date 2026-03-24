const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// Get all forklifts with type info
router.get('/', (req, res) => {
  const forklifts = db.prepare(`
    SELECT f.*, ft.name as type_name
    FROM forklifts f
    JOIN forklift_types ft ON f.type_id = ft.id
    ORDER BY f.created_at DESC
  `).all();

  return res.json({ success: true, data: forklifts });
});

// Get all forklift types
router.get('/types', (req, res) => {
  const types = db.prepare('SELECT * FROM forklift_types').all();
  return res.json({ success: true, data: types });
});

// Get single forklift
router.get('/:id', (req, res) => {
  const forklift = db.prepare(`
    SELECT f.*, ft.name as type_name
    FROM forklifts f
    JOIN forklift_types ft ON f.type_id = ft.id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!forklift) {
    return res.status(404).json({ success: false, message: 'Forklift not found' });
  }

  return res.json({ success: true, data: forklift });
});

// Register new forklift
router.post('/', (req, res) => {
  const { name, type_id } = req.body;

  if (!name || !type_id) {
    return res.status(400).json({ success: false, message: 'Name and type are required' });
  }

  const type = db.prepare('SELECT * FROM forklift_types WHERE id = ?').get(type_id);
  if (!type) {
    return res.status(400).json({ success: false, message: 'Invalid forklift type' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO forklifts (id, name, type_id, status)
    VALUES (?, ?, ?, 'available')
  `).run(id, name, type_id);

  const forklift = db.prepare(`
    SELECT f.*, ft.name as type_name
    FROM forklifts f
    JOIN forklift_types ft ON f.type_id = ft.id
    WHERE f.id = ?
  `).get(id);

  return res.status(201).json({ success: true, data: forklift });
});

// Update forklift status
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['available', 'busy', 'on_leave'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const forklift = db.prepare('SELECT * FROM forklifts WHERE id = ?').get(req.params.id);
  if (!forklift) {
    return res.status(404).json({ success: false, message: 'Forklift not found' });
  }

  db.prepare('UPDATE forklifts SET status = ? WHERE id = ?').run(status, req.params.id);

  const io = req.app.get('io');
  io.emit('forklift_status_changed', {
    forklift_id: req.params.id,
    status
  });

  return res.json({ success: true, message: 'Status updated' });
});

// Delete forklift
router.delete('/:id', (req, res) => {
  const forklift = db.prepare('SELECT * FROM forklifts WHERE id = ?').get(req.params.id);
  if (!forklift) {
    return res.status(404).json({ success: false, message: 'Forklift not found' });
  }

  db.prepare('DELETE FROM forklifts WHERE id = ?').run(req.params.id);
  return res.json({ success: true, message: 'Forklift deleted' });
});

module.exports = router;