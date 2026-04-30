const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// Get all forklifts
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.*, ft.name as type_name
      FROM forklifts f
      JOIN forklift_types ft ON f.type_id = ft.id
      ORDER BY f.created_at DESC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get all forklift types
router.get('/types', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM forklift_types ORDER BY name ASC');
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Add new forklift type (dynamic - fix #3)
router.post('/types', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Type name is required' });

    const existing = await pool.query('SELECT * FROM forklift_types WHERE name = $1', [name.trim().toUpperCase()]);
    if (existing.rows[0]) return res.status(400).json({ success: false, message: 'Type already exists' });

    const { rows } = await pool.query(
      'INSERT INTO forklift_types (name) VALUES ($1) RETURNING *',
      [name.trim().toUpperCase()]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete forklift type (dynamic - fix #3)
router.delete('/types/:id', async (req, res) => {
  try {
    // Check if any forklifts use this type
    const { rows: inUse } = await pool.query('SELECT * FROM forklifts WHERE type_id = $1', [req.params.id]);
    if (inUse.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete type with existing forklifts' });
    }
    await pool.query('DELETE FROM forklift_types WHERE id = $1', [req.params.id]);
    return res.json({ success: true, message: 'Type deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get single forklift
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.*, ft.name as type_name
      FROM forklifts f
      JOIN forklift_types ft ON f.type_id = ft.id
      WHERE f.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Forklift not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Register new forklift
router.post('/', async (req, res) => {
  try {
    const { name, type_id } = req.body;
    if (!name || !type_id) return res.status(400).json({ success: false, message: 'Name and type are required' });

    const { rows: type } = await pool.query('SELECT * FROM forklift_types WHERE id = $1', [type_id]);
    if (!type[0]) return res.status(400).json({ success: false, message: 'Invalid forklift type' });

    // Block duplicate name + type combination
    const { rows: duplicate } = await pool.query(
      'SELECT * FROM forklifts WHERE LOWER(name) = LOWER($1) AND type_id = $2',
      [name, type_id]
    );
    if (duplicate[0]) return res.status(400).json({ success: false, message: 'A forklift with this name and type already exists' });

    const id = generateId();
    await pool.query(
      "INSERT INTO forklifts (id, name, type_id, status) VALUES ($1, $2, $3, 'available')",
      [id, name, type_id]
    );

    const { rows } = await pool.query(`
      SELECT f.*, ft.name as type_name
      FROM forklifts f
      JOIN forklift_types ft ON f.type_id = ft.id
      WHERE f.id = $1
    `, [id]);
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update forklift status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['available', 'busy', 'on_leave'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const { rows } = await pool.query('SELECT * FROM forklifts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Forklift not found' });

    await pool.query('UPDATE forklifts SET status = $1 WHERE id = $2', [status, req.params.id]);

    const io = req.app.get('io');
    io.emit('forklift_status_changed', { forklift_id: req.params.id, status });

    return res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete forklift - notifies registered tablet to reset
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM forklifts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Forklift not found' });

    // Find devices registered to this forklift
    const { rows: devices } = await pool.query(
      'SELECT device_id FROM devices WHERE forklift_id = $1',
      [req.params.id]
    );

    await pool.query('DELETE FROM forklifts WHERE id = $1', [req.params.id]);

    // Notify tablets to reset
    const io = req.app.get('io');
    devices.forEach(device => {
      io.emit('force_reset_' + device.device_id);
    });

    return res.json({ success: true, message: 'Forklift deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;