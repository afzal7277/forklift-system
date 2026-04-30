const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forklift_types (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS forklifts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type_id INTEGER NOT NULL REFERENCES forklift_types(id),
      status TEXT DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cells (
      id TEXT PRIMARY KEY,
      cell_number TEXT NOT NULL UNIQUE,
      operator_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      cell_id TEXT NOT NULL REFERENCES cells(id),
      forklift_type_id INTEGER NOT NULL REFERENCES forklift_types(id),
      forklift_id TEXT REFERENCES forklifts(id),
      status TEXT DEFAULT 'pending',
      decline_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      timeout_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS leave_log (
      id SERIAL PRIMARY KEY,
      forklift_id TEXT NOT NULL REFERENCES forklifts(id),
      reason TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS leave_comments (
      id SERIAL PRIMARY KEY,
      comment TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kpi_logs (
      id SERIAL PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id),
      event TEXT NOT NULL,
      value_seconds INTEGER,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      mode TEXT,
      cell_id TEXT REFERENCES cells(id) ON DELETE SET NULL,
      forklift_id TEXT REFERENCES forklifts(id) ON DELETE SET NULL,
      last_seen TIMESTAMPTZ,
      registered_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed forklift types
  const typesCount = await pool.query('SELECT COUNT(*) as count FROM forklift_types');
  if (parseInt(typesCount.rows[0].count) === 0) {
    for (const name of ['3T', '3.5T', '7T Prod', '7T Galv']) {
      await pool.query('INSERT INTO forklift_types (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    }
  }

  // Seed leave comments
  const commentsCount = await pool.query('SELECT COUNT(*) as count FROM leave_comments');
  if (parseInt(commentsCount.rows[0].count) === 0) {
    for (const comment of [
      'Prayer break', 'Lunch break', 'Technical issue with forklift',
      'On another task', 'End of shift',
    ]) {
      await pool.query('INSERT INTO leave_comments (comment) VALUES ($1) ON CONFLICT DO NOTHING', [comment]);
    }
  }

  // Seed config
  const configCount = await pool.query('SELECT COUNT(*) as count FROM config');
  if (parseInt(configCount.rows[0].count) === 0) {
    await pool.query("INSERT INTO config (key, value) VALUES ('task_timeout_seconds', '300') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO config (key, value) VALUES ('admin_pin', '1234') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO config (key, value) VALUES ('request_timeout_seconds', '30') ON CONFLICT DO NOTHING");
  }

  console.log('Database initialized');
}

module.exports = { pool, initDb };