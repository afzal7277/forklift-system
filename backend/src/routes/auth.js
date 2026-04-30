const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.post('/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ success: false, message: 'PIN is required' });

    const { rows } = await pool.query("SELECT value FROM config WHERE key = 'admin_pin'");
    if (!rows[0]) return res.status(500).json({ success: false, message: 'PIN not configured' });
    if (pin !== rows[0].value) return res.status(401).json({ success: false, message: 'Invalid PIN' });

    return res.json({ success: true, message: 'PIN verified' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/change-pin', async (req, res) => {
  try {
    const { current_pin, new_pin } = req.body;
    if (!current_pin || !new_pin) return res.status(400).json({ success: false, message: 'Both PINs are required' });

    const { rows } = await pool.query("SELECT value FROM config WHERE key = 'admin_pin'");
    if (current_pin !== rows[0].value) return res.status(401).json({ success: false, message: 'Current PIN is incorrect' });
    if (new_pin.length < 4) return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits' });

    await pool.query("UPDATE config SET value = $1 WHERE key = 'admin_pin'", [new_pin]);
    return res.json({ success: true, message: 'PIN changed successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;