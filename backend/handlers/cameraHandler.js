/**
 * Camera Handler — CRUD cámaras (SQLite)
 */

/**
 * GET /api/cameras
 */
export const getCameras = async (req, res, db) => {
  const { customer_id } = req.query;

  let query = 'SELECT * FROM dc_cameras WHERE 1=1';
  const params = [];

  if (customer_id) {
    query += ' AND customer_id = ?';
    params.push(customer_id);
  }

  query += ' ORDER BY name';

  try {
    const rows = await db.all(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('Get cameras error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/cameras
 */
export const createCamera = async (req, res, db) => {
  const { customer_id, name, location, camera_url, camera_type } = req.body;

  if (!customer_id || !name || !camera_url) {
    return res.status(400).json({ error: 'customer_id, name, camera_url required' });
  }

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const result = await db.run(
      `INSERT INTO dc_cameras (customer_id, name, location, camera_url, camera_type)
       VALUES (?, ?, ?, ?, ?)`,
      [customer_id, name, location || null, camera_url, camera_type || 'rtsp']
    );

    const row = await db.get('SELECT * FROM dc_cameras WHERE id = ?', [result.lastID]);
    return res.status(201).json(row);
  } catch (err) {
    console.error('Create camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/cameras/:id
 */
export const updateCamera = async (req, res, db) => {
  const { id } = req.params;
  const { name, location, camera_url, camera_type, status, fps_current, fps_target } = req.body;

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const existing = await db.get('SELECT * FROM dc_cameras WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    await db.run(
      `UPDATE dc_cameras
       SET name = COALESCE(?, name),
           location = COALESCE(?, location),
           camera_url = COALESCE(?, camera_url),
           camera_type = COALESCE(?, camera_type),
           status = COALESCE(?, status),
           fps_current = COALESCE(?, fps_current),
           fps_target = COALESCE(?, fps_target),
           last_seen = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE last_seen END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [name, location, camera_url, camera_type, status, fps_current, fps_target, status, id]
    );

    const row = await db.get('SELECT * FROM dc_cameras WHERE id = ?', [id]);
    return res.json(row);
  } catch (err) {
    console.error('Update camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/test-cameras
 */
export const getTestCameras = async (req, res, db) => {
  try {
    const rows = await db.all('SELECT * FROM dc_test_cameras ORDER BY name');
    return res.json(rows);
  } catch (err) {
    console.error('Get test cameras error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/test-cameras
 */
export const createTestCamera = async (req, res, db) => {
  const { name, rtsp_url, location } = req.body;

  if (!name || !rtsp_url) {
    return res.status(400).json({ error: 'name, rtsp_url required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO dc_test_cameras (name, rtsp_url, location) VALUES (?, ?, ?)',
      [name, rtsp_url, location || null]
    );

    const row = await db.get('SELECT * FROM dc_test_cameras WHERE id = ?', [result.lastID]);
    return res.status(201).json(row);
  } catch (err) {
    console.error('Create test camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/test-cameras/:id/status
 */
export const updateTestCameraStatus = async (req, res, db) => {
  const { id } = req.params;
  const { status, fps_current } = req.body;

  try {
    const result = await db.run(
      `UPDATE dc_test_cameras
       SET status = COALESCE(?, status),
           fps_current = COALESCE(?, fps_current),
           last_seen = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      [status, fps_current, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Test camera not found' });
    }

    const row = await db.get('SELECT * FROM dc_test_cameras WHERE id = ?', [id]);
    return res.json(row);
  } catch (err) {
    console.error('Update test camera status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
