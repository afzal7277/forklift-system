const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

// Get all devices
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
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
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Register or update device - blocks duplicate cell/forklift login (fix #2)
router.post('/register', async (req, res) => {
  try {
    const { device_id, mode, cell_id, forklift_id } = req.body;
    if (!device_id) return res.status(400).json({ success: false, message: 'device_id is required' });

    const now = new Date().toISOString();

    // Block duplicate cell registration
    if (cell_id) {
      const { rows: duplicate } = await pool.query(
        'SELECT * FROM devices WHERE cell_id = $1 AND device_id != $2',
        [cell_id, device_id]
      );
      if (duplicate.length > 0) {
        return res.status(400).json({ success: false, message: 'This cell is already registered on another tablet' });
      }
    }

    // Block duplicate forklift registration
    if (forklift_id) {
      const { rows: duplicate } = await pool.query(
        'SELECT * FROM devices WHERE forklift_id = $1 AND device_id != $2',
        [forklift_id, device_id]
      );
      if (duplicate.length > 0) {
        return res.status(400).json({ success: false, message: 'This forklift is already registered on another tablet' });
      }
    }

    const { rows: existing } = await pool.query('SELECT * FROM devices WHERE device_id = $1', [device_id]);

    if (existing[0]) {
      await pool.query(
        'UPDATE devices SET mode = $1, cell_id = $2, forklift_id = $3, last_seen = $4 WHERE device_id = $5',
        [mode || existing[0].mode, cell_id || existing[0].cell_id, forklift_id || existing[0].forklift_id, now, device_id]
      );
    } else {
      const id = generateId();
      await pool.query(
        'INSERT INTO devices (id, device_id, mode, cell_id, forklift_id, last_seen) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, device_id, mode || null, cell_id || null, forklift_id || null, now]
      );
    }

    const { rows } = await pool.query('SELECT * FROM devices WHERE device_id = $1', [device_id]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Ping device
router.put('/:device_id/ping', async (req, res) => {
  try {
    const now = new Date().toISOString();
    await pool.query('UPDATE devices SET last_seen = $1 WHERE device_id = $2', [now, req.params.device_id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete device - sends force reset to that tablet
router.delete('/:device_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM devices WHERE device_id = $1', [req.params.device_id]);

    // Notify the tablet to reset
    const io = req.app.get('io');
    io.emit('force_reset_' + req.params.device_id);

    return res.json({ success: true, message: 'Device removed' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;