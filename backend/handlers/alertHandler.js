/**
 * Alert Handler — CRUD alertas
 */

/**
 * GET /api/alerts
 * Lista alertas con filtros opcionales
 */
export const getAlerts = async (req, res, db) => {
  const { customer_id, type, from, to, limit } = req.query;

  let query = 'SELECT * FROM dc_alerts WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (customer_id) {
    query += ` AND customer_id = $${paramIndex}`;
    params.push(customer_id);
    paramIndex++;
  }

  if (type) {
    query += ` AND alert_type = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }

  if (from) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(from);
    paramIndex++;
  }

  if (to) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(to);
    paramIndex++;
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(limit);
  }

  try {
    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Get alerts error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/alerts/:id
 * Obtiene detalle de una alerta
 */
export const getAlertById = async (req, res, db) => {
  const { id } = req.params;

  try {
    const result = await db.query('SELECT * FROM dc_alerts WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/alerts
 * Crea nueva alerta (desde edge con API key)
 * Autenticado por API key, no JWT
 */
export const createAlert = async (req, res, db, customer) => {
  const { camera_id, alert_type, description, confidence, image_url, video_url, metadata } = req.body;

  if (!alert_type) {
    return res.status(400).json({ error: 'alert_type required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO dc_alerts (customer_id, camera_id, alert_type, description, confidence, image_url, video_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [customer.id, camera_id || null, alert_type, description || null, confidence || 0, image_url || null, video_url || null, metadata ? JSON.stringify(metadata) : null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/alerts/:id/acknowledge
 * Marca una alerta como leída
 */
export const acknowledgeAlert = async (req, res, db) => {
  const { id } = req.params;
  const { acknowledged_by } = req.body;

  try {
    const result = await db.query(
      `UPDATE dc_alerts
       SET acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2
       RETURNING *`,
      [acknowledged_by || req.user.username, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Acknowledge alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/alerts/:id
 * Elimina una alerta
 */
export const deleteAlert = async (req, res, db) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM dc_alerts WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    return res.json({ message: 'Alert deleted' });
  } catch (err) {
    console.error('Delete alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/test-alerts
 * Obtiene alertas del test lab
 */
export const getTestAlerts = async (req, res, db) => {
  try {
    const result = await db.query(
      `SELECT * FROM dc_test_alerts
       ORDER BY created_at DESC
       LIMIT 100`
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get test alerts error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
