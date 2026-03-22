/**
 * Camera Handler — SQLite
 */

export const getCameras = (req, res, db) => {
  const { customer_id } = req.query;
  let sql = 'SELECT * FROM dc_cameras WHERE 1=1';
  const params = [];
  if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
  sql += ' ORDER BY name';
  try {
    return res.json(db.prepare(sql).all(...params));
  } catch (err) {
    console.error('Get cameras error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const getCameraById = (req, res, db) => {
  const row = db.prepare('SELECT * FROM dc_cameras WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Camera not found' });
  return res.json(row);
};

export const createCamera = (req, res, db) => {
  const { customer_id, name, location, camera_url, camera_type } = req.body;
  if (!customer_id || !name || !camera_url) {
    return res.status(400).json({ error: 'customer_id, name, camera_url required' });
  }
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO dc_cameras (customer_id, name, location, camera_url, camera_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(customer_id, name, location || null, camera_url, camera_type || 'rtsp');
    return res.status(201).json({ id: result.lastInsertRowid, customer_id, name, location, camera_url, camera_type });
  } catch (err) {
    console.error('Create camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const updateCamera = (req, res, db) => {
  const { id } = req.params;
  const { name, location, camera_url, camera_type, status, fps_current, fps_target } = req.body;
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const current = db.prepare('SELECT * FROM dc_cameras WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Camera not found' });

  db.prepare(`
    UPDATE dc_cameras
    SET name        = ?,
        location    = ?,
        camera_url  = ?,
        camera_type = ?,
        status      = ?,
        fps_current = ?,
        fps_target  = ?,
        last_seen   = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE last_seen END,
        updated_at  = datetime('now')
    WHERE id = ?
  `).run(
    name        ?? current.name,
    location    ?? current.location,
    camera_url  ?? current.camera_url,
    camera_type ?? current.camera_type,
    status      ?? current.status,
    fps_current ?? current.fps_current,
    fps_target  ?? current.fps_target,
    status,
    id
  );

  return res.json(db.prepare('SELECT * FROM dc_cameras WHERE id = ?').get(id));
};

export const deleteCamera = (req, res, db) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can delete' });
  }
  const result = db.prepare('DELETE FROM dc_cameras WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Camera not found' });
  return res.json({ message: 'Camera deleted' });
};

export const getTestCameras = (req, res, db) => {
  try {
    return res.json(db.prepare('SELECT * FROM dc_test_cameras ORDER BY name').all());
  } catch (err) {
    console.error('Get test cameras error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const createTestCamera = (req, res, db) => {
  const { name, rtsp_url, location } = req.body;
  if (!name || !rtsp_url) return res.status(400).json({ error: 'name, rtsp_url required' });
  try {
    const result = db.prepare(
      'INSERT INTO dc_test_cameras (name, rtsp_url, location) VALUES (?, ?, ?)'
    ).run(name, rtsp_url, location || null);
    return res.status(201).json({ id: result.lastInsertRowid, name, rtsp_url, location });
  } catch (err) {
    console.error('Create test camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const updateTestCameraStatus = (req, res, db) => {
  const { id } = req.params;
  const { status, fps_current } = req.body;
  const current = db.prepare('SELECT * FROM dc_test_cameras WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Test camera not found' });

  db.prepare(`
    UPDATE dc_test_cameras
    SET status      = ?,
        fps_current = ?,
        last_seen   = datetime('now'),
        updated_at  = datetime('now')
    WHERE id = ?
  `).run(status ?? current.status, fps_current ?? current.fps_current, id);

  return res.json(db.prepare('SELECT * FROM dc_test_cameras WHERE id = ?').get(id));
};
