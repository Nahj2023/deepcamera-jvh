/**
 * DeepCamera JVH — SQLite Init (CJS)
 */

const Database = require('./db/sqlite-compat');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'deepcamera.db');

const dbPromise = Database.create(DB_PATH).then(db => {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS dc_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      api_key TEXT UNIQUE,
      mqtt_user TEXT,
      mqtt_pass TEXT,
      contact_person TEXT,
      phone TEXT,
      address TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES dc_customers(id) ON DELETE CASCADE,
      name TEXT,
      location TEXT,
      camera_url TEXT,
      camera_type TEXT DEFAULT 'rtsp',
      status TEXT DEFAULT 'offline',
      last_seen TEXT,
      fps_current REAL,
      fps_target INTEGER DEFAULT 30,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES dc_customers(id) ON DELETE CASCADE,
      camera_id INTEGER REFERENCES dc_cameras(id) ON DELETE SET NULL,
      alert_type TEXT,
      description TEXT,
      confidence REAL,
      image_url TEXT,
      video_url TEXT,
      metadata TEXT,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      detections TEXT NOT NULL,
      counts TEXT NOT NULL,
      total INTEGER DEFAULT 0,
      thumbnail TEXT,
      stats TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_edge_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cameras TEXT,
      status TEXT DEFAULT 'online',
      last_seen TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_test_cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rtsp_url TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'offline',
      last_seen TEXT,
      fps_current REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dc_test_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_camera_id INTEGER REFERENCES dc_test_cameras(id) ON DELETE CASCADE,
      alert_type TEXT,
      description TEXT,
      confidence REAL,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_camera ON dc_events(camera_id);
    CREATE INDEX IF NOT EXISTS idx_events_created ON dc_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_customer ON dc_alerts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON dc_alerts(created_at);
    CREATE INDEX IF NOT EXISTS idx_cameras_customer ON dc_cameras(customer_id);
  `);

  const existing = db.prepare('SELECT id FROM dc_users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('JVHadmin2026', 10);
    db.prepare(
      "INSERT INTO dc_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)"
    ).run('admin', 'admin@jvhsoporte.cl', hash, 'superadmin');
    console.log('[DB] Usuario admin creado');
  }

  console.log('[DB] SQLite listo:', DB_PATH);
  return db;
});

module.exports = dbPromise;
