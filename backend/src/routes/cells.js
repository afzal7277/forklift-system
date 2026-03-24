const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// Get all cells
router.get('/', (req, res) => {
  const cells = db.prepare('SELECT * FROM cells ORDER BY cell_number ASC').all();
  return res.json({ success: true, data: cells });
});

// Get single cell
router.get('/:id', (req, res) => {
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(req.params.id);
  if (!cell) {
    return res.status(404).json({ success: false, message: 'Cell not found' });
  }
  return res.json({ success: true, data: cell });
});

// Register new cell
router.post('/', (req, res) => {
  const { cell_number, operator_name } = req.body;

  if (!cell_number) {
    return res.status(400).json({ success: false, message: 'Cell number is required' });
  }

  const existing = db.prepare('SELECT * FROM cells WHERE cell_number = ?').get(cell_number);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Cell number already exists' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO cells (id, cell_number, operator_name)
    VALUES (?, ?, ?)
  `).run(id, cell_number, operator_name || null);

  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(id);
  return res.status(201).json({ success: true, data: cell });
});

// Update cell operator name
router.put('/:id', (req, res) => {
  const { operator_name, cell_number } = req.body;

  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(req.params.id);
  if (!cell) {
    return res.status(404).json({ success: false, message: 'Cell not found' });
  }

  db.prepare(`
    UPDATE cells SET operator_name = ?, cell_number = ? WHERE id = ?
  `).run(
    operator_name || cell.operator_name,
    cell_number || cell.cell_number,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM cells WHERE id = ?').get(req.params.id);
  return res.json({ success: true, data: updated });
});

// Delete cell
router.delete('/:id', (req, res) => {
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(req.params.id);
  if (!cell) {
    return res.status(404).json({ success: false, message: 'Cell not found' });
  }

  db.prepare('DELETE FROM cells WHERE id = ?').run(req.params.id);
  return res.json({ success: true, message: 'Cell deleted' });
});

module.exports = router;