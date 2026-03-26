const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// Get all devices
router.get('/', (req, res) => {
  const devices = db.prepare(`
    SELECT 
      d.*,
      c.cell_number,
      f.name as forklift_name,
      ft.name as forklift_type_name
    FROM devices d
    LEFT JOIN cells c ON d.cell_id = c.id
    LEFT JOIN forklifts f ON d.forklift_id = f.id
    LEFT JOIN forklift_types ft ON f.type_id = ft.id
    ORDER BY d.last_seen DESC
  `).all();

  return res.json({ success: true, data: devices });
});

// Register or update device
router.post('/register', (req, res) => {
  const { device_id, mode, cell_id, forklift_id } = req.body;

  if (!device_id) {
    return res.status(400).json({ success: false, message: 'device_id is required' });
  }

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(device_id);

  if (existing) {
    db.prepare(`
      UPDATE devices 
      SET mode = ?, cell_id = ?, forklift_id = ?, last_seen = ?
      WHERE device_id = ?
    `).run(mode || existing.mode, cell_id || existing.cell_id, forklift_id || existing.forklift_id, now, device_id);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO devices (id, device_id, mode, cell_id, forklift_id, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, device_id, mode || null, cell_id || null, forklift_id || null, now);
  }

  const device = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(device_id);
  return res.json({ success: true, data: device });
});

// Update device last seen
router.put('/:device_id/ping', (req, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE devices SET last_seen = ? WHERE device_id = ?').run(
    now,
    req.params.device_id
  );
  return res.json({ success: true });
});

// Delete device
router.delete('/:device_id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE device_id = ?').run(req.params.device_id);
  return res.json({ success: true, message: 'Device removed' });
});

module.exports = router;