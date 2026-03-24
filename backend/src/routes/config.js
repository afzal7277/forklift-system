const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all config
router.get('/', (req, res) => {
  const configs = db.prepare('SELECT * FROM config').all();
  const result = {};
  configs.forEach(c => {
    if (c.key !== 'admin_pin') {
      result[c.key] = c.value;
    }
  });
  return res.json({ success: true, data: result });
});

// Update a config value
router.put('/:key', (req, res) => {
  const { value } = req.body;
  const { key } = req.params;

  if (key === 'admin_pin') {
    return res.status(403).json({ success: false, message: 'Use /auth/change-pin to update PIN' });
  }

  if (!value) {
    return res.status(400).json({ success: false, message: 'Value is required' });
  }

  const existing = db.prepare('SELECT * FROM config WHERE key = ?').get(key);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Config key not found' });
  }

  db.prepare('UPDATE config SET value = ? WHERE key = ?').run(value, key);
  return res.json({ success: true, message: 'Config updated' });
});

// Get leave comments
router.get('/leave-comments', (req, res) => {
  const comments = db.prepare('SELECT * FROM leave_comments').all();
  return res.json({ success: true, data: comments });
});

// Add leave comment
router.post('/leave-comments', (req, res) => {
  const { comment } = req.body;
  if (!comment) {
    return res.status(400).json({ success: false, message: 'Comment is required' });
  }

  const existing = db.prepare('SELECT * FROM leave_comments WHERE comment = ?').get(comment);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Comment already exists' });
  }

  db.prepare('INSERT INTO leave_comments (comment) VALUES (?)').run(comment);
  return res.json({ success: true, message: 'Comment added' });
});

// Delete leave comment
router.delete('/leave-comments/:id', (req, res) => {
  db.prepare('DELETE FROM leave_comments WHERE id = ?').run(req.params.id);
  return res.json({ success: true, message: 'Comment deleted' });
});

module.exports = router;