const express = require('express');
const router = express.Router();
const db = require('../db');

// Verify admin PIN
router.post('/verify-pin', (req, res) => {

  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ success: false, message: 'PIN is required' });
  }

  const config = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_pin');

  if (!config) {
    return res.status(500).json({ success: false, message: 'PIN not configured' });
  }

  if (pin !== config.value) {
    return res.status(401).json({ success: false, message: 'Invalid PIN' });
  }

  return res.json({ success: true, message: 'PIN verified' });
});

// Change admin PIN
router.post('/change-pin', (req, res) => {
  const { current_pin, new_pin } = req.body;

  if (!current_pin || !new_pin) {
    return res.status(400).json({ success: false, message: 'Both PINs are required' });
  }

  const config = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_pin');

  if (current_pin !== config.value) {
    return res.status(401).json({ success: false, message: 'Current PIN is incorrect' });
  }

  if (new_pin.length < 4) {
    return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits' });
  }

  db.prepare('UPDATE config SET value = ? WHERE key = ?').run(new_pin, 'admin_pin');

  return res.json({ success: true, message: 'PIN changed successfully' });
});

module.exports = router;