/**
 * DeepCamera JVH — SQLite Schema Init
 */

export function initDB(db) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS dc_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dc_customers (
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
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dc_cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES dc_customers(id),
      name TEXT,
      location TEXT,
      camera_url TEXT,
      camera_type TEXT,
      status TEXT DEFAULT 'offline',
      last_seen TEXT,
      fps_current REAL,
      fps_target INTEGER DEFAULT 30,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dc_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES dc_customers(id),
      camera_id INTEGER REFERENCES dc_cameras(id),
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
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dc_test_cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rtsp_url TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'offline',
      last_seen TEXT,
      fps_current REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dc_test_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_camera_id INTEGER REFERENCES dc_test_cameras(id),
      alert_type TEXT,
      description TEXT,
      confidence REAL,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_customers_status ON dc_customers(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_cameras_customer ON dc_cameras(customer_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_cameras_status ON dc_cameras(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_customer ON dc_alerts(customer_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_camera ON dc_alerts(camera_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_type ON dc_alerts(alert_type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_alerts_created ON dc_alerts(created_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_test_alerts_camera ON dc_test_alerts(test_camera_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_test_alerts_created ON dc_test_alerts(created_at)');
  });
}
