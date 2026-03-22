/**
 * Camera Handler — CRUD cámaras
 */

/**
 * GET /api/cameras
 * Lista cámaras con filtros opcionales
 */
export const getCameras = async (req, res, db) => {
  const { customer_id } = req.query;

  let query = 'SELECT * FROM dc_cameras WHERE 1=1';
  const params = [];

  if (customer_id) {
    query += ' AND customer_id = $1';
    params.push(customer_id);
  }

  query += ' ORDER BY name';

  try {
    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Get cameras error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/cameras/:id
 * Obtiene detalle de una cámara
 */
export const getCameraById = async (req, res, db) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM dc_cameras WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/cameras
 * Crea nueva cámara
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
    const result = await db.query(
      `INSERT INTO dc_cameras (customer_id, name, location, camera_url, camera_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [customer_id, name, location || null, camera_url, camera_type || 'rtsp']
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/cameras/:id
 * Actualiza cámara
 */
export const updateCamera = async (req, res, db) => {
  const { id } = req.params;
  const { name, location, camera_url, camera_type, status, fps_current, fps_target } = req.body;

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const result = await db.query(
      `UPDATE dc_cameras
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           camera_url = COALESCE($3, camera_url),
           camera_type = COALESCE($4, camera_type),
           status = COALESCE($5, status),
           fps_current = COALESCE($6, fps_current),
           fps_target = COALESCE($7, fps_target),
           last_seen = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE last_seen END,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, location, camera_url, camera_type, status, fps_current, fps_target, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/cameras/:id
 * Elimina cámara
 */
export const deleteCamera = async (req, res, db) => {
  const { id } = req.params;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can delete' });
  }

  try {
    const result = await db.query(
      'DELETE FROM dc_cameras WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    return res.json({ message: 'Camera deleted' });
  } catch (err) {
    console.error('Delete camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/test-cameras
 * Obtiene cámaras del test lab
 */
export const getTestCameras = async (req, res, db) => {
  try {
    const result = await db.query(
      'SELECT * FROM dc_test_cameras ORDER BY name'
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get test cameras error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/test-cameras
 * Crea cámara de test
 */
export const createTestCamera = async (req, res, db) => {
  const { name, rtsp_url, location } = req.body;

  if (!name || !rtsp_url) {
    return res.status(400).json({ error: 'name, rtsp_url required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO dc_test_cameras (name, rtsp_url, location)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, rtsp_url, location || null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create test camera error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/test-cameras/:id/status
 * Actualiza estado de cámara de test (heartbeat)
 */
export const updateTestCameraStatus = async (req, res, db) => {
  const { id } = req.params;
  const { status, fps_current } = req.body;

  try {
    const result = await db.query(
      `UPDATE dc_test_cameras
       SET status = COALESCE($1, status),
           fps_current = COALESCE($2, fps_current),
           last_seen = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, fps_current, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test camera not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update test camera status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
