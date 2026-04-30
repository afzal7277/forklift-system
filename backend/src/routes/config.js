const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Get all config
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM config');
    const result = {};
    rows.forEach(c => { if (c.key !== 'admin_pin') result[c.key] = c.value; });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update config value
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const { key } = req.params;

    if (key === 'admin_pin') return res.status(403).json({ success: false, message: 'Use /auth/change-pin to update PIN' });
    if (!value) return res.status(400).json({ success: false, message: 'Value is required' });

    const { rows } = await pool.query('SELECT * FROM config WHERE key = $1', [key]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Config key not found' });

    await pool.query('UPDATE config SET value = $1 WHERE key = $2', [value, key]);
    return res.json({ success: true, message: 'Config updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get leave comments
router.get('/leave-comments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leave_comments ORDER BY id ASC');
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Add leave comment
router.post('/leave-comments', async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ success: false, message: 'Comment is required' });

    const { rows: existing } = await pool.query('SELECT * FROM leave_comments WHERE comment = $1', [comment]);
    if (existing[0]) return res.status(400).json({ success: false, message: 'Comment already exists' });

    await pool.query('INSERT INTO leave_comments (comment) VALUES ($1)', [comment]);
    return res.json({ success: true, message: 'Comment added' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete leave comment
router.delete('/leave-comments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leave_comments WHERE id = $1', [req.params.id]);
    return res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;