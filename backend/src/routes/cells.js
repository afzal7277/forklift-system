const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// Get all cells
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cells ORDER BY cell_number ASC');
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get single cell
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cells WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Cell not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Register new cell
router.post('/', async (req, res) => {
  try {
    const { cell_number, operator_name } = req.body;
    if (!cell_number) return res.status(400).json({ success: false, message: 'Cell number is required' });

    const existing = await pool.query('SELECT * FROM cells WHERE cell_number = $1', [cell_number]);
    if (existing.rows[0]) return res.status(400).json({ success: false, message: 'Cell number already exists' });

    const id = generateId();
    await pool.query(
      'INSERT INTO cells (id, cell_number, operator_name) VALUES ($1, $2, $3)',
      [id, cell_number, operator_name || null]
    );

    const { rows } = await pool.query('SELECT * FROM cells WHERE id = $1', [id]);
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update cell
router.put('/:id', async (req, res) => {
  try {
    const { operator_name, cell_number } = req.body;
    const { rows: existing } = await pool.query('SELECT * FROM cells WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ success: false, message: 'Cell not found' });

    await pool.query(
      'UPDATE cells SET operator_name = $1, cell_number = $2 WHERE id = $3',
      [operator_name || existing[0].operator_name, cell_number || existing[0].cell_number, req.params.id]
    );

    const { rows } = await pool.query('SELECT * FROM cells WHERE id = $1', [req.params.id]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete cell - notifies registered tablets to reset
router.delete('/:id', async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM cells WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ success: false, message: 'Cell not found' });

    // Find devices registered to this cell and notify them to reset
    const { rows: devices } = await pool.query(
      'SELECT device_id FROM devices WHERE cell_id = $1',
      [req.params.id]
    );

    await pool.query('DELETE FROM cells WHERE id = $1', [req.params.id]);

    // Emit force_reset to all tablets registered to this cell
    const io = req.app.get('io');
    devices.forEach(device => {
      io.emit('force_reset_' + device.device_id);
    });

    return res.json({ success: true, message: 'Cell deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;