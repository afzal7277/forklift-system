const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database.sqlite');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Forklift types master table
  CREATE TABLE IF NOT EXISTS forklift_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Forklifts (each physical forklift)
  CREATE TABLE IF NOT EXISTS forklifts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type_id INTEGER NOT NULL,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (type_id) REFERENCES forklift_types(id)
  );

  -- Cells (workstations)
  CREATE TABLE IF NOT EXISTS cells (
    id TEXT PRIMARY KEY,
    cell_number TEXT NOT NULL UNIQUE,
    operator_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Requests (core table)
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL,
    forklift_type_id INTEGER NOT NULL,
    forklift_id TEXT,
    status TEXT DEFAULT 'pending',
    decline_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME,
    completed_at DATETIME,
    timeout_at DATETIME,
    FOREIGN KEY (cell_id) REFERENCES cells(id),
    FOREIGN KEY (forklift_type_id) REFERENCES forklift_types(id),
    FOREIGN KEY (forklift_id) REFERENCES forklifts(id)
  );

  -- Driver leave log
  CREATE TABLE IF NOT EXISTS leave_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    forklift_id TEXT NOT NULL,
    reason TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY (forklift_id) REFERENCES forklifts(id)
  );

  -- Predefined leave comments
  CREATE TABLE IF NOT EXISTS leave_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- KPI logs (for reporting)
  CREATE TABLE IF NOT EXISTS kpi_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    event TEXT NOT NULL,
    value_seconds INTEGER,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES requests(id)
  );

  -- Admin config
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Device registry
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    mode TEXT,
    cell_id TEXT,
    forklift_id TEXT,
    last_seen DATETIME,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id),
    FOREIGN KEY (forklift_id) REFERENCES forklifts(id)
  );

`);

// Seed default data if empty
const typesCount = db.prepare('SELECT COUNT(*) as count FROM forklift_types').get();
if (typesCount.count === 0) {
  const insertType = db.prepare('INSERT INTO forklift_types (name) VALUES (?)');
  ['3T', '3.5T', '7T Prod', '7T Galv'].forEach(type => insertType.run(type));
}

const commentsCount = db.prepare('SELECT COUNT(*) as count FROM leave_comments').get();
if (commentsCount.count === 0) {
  const insertComment = db.prepare('INSERT INTO leave_comments (comment) VALUES (?)');
  [
    'Prayer break',
    'Lunch break',
    'Technical issue with forklift',
    'On another task',
    'End of shift',
  ].forEach(comment => insertComment.run(comment));
}

const configCount = db.prepare('SELECT COUNT(*) as count FROM config').get();
if (configCount.count === 0) {
  const insertConfig = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');
  insertConfig.run('task_timeout_seconds', '300');  // 5 min default
  insertConfig.run('admin_pin', '1234');
  insertConfig.run('request_timeout_seconds', '30'); // 30s to respond
}

console.log('Database initialized');

module.exports = db;