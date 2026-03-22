/**
 * Alert Handler — CRUD alertas (SQLite)
 */

/**
 * GET /api/alerts
 */
export const getAlerts = async (req, res, db) => {
  const { customer_id, type, from, to, limit } = req.query;

  let query = 'SELECT * FROM dc_alerts WHERE 1=1';
  const params = [];

  if (customer_id) {
    query += ' AND customer_id = ?';
    params.push(customer_id);
  }

  if (type) {
    query += ' AND alert_type = ?';
    params.push(type);
  }

  if (from) {
    query += ' AND created_at >= ?';
    params.push(from);
  }

  if (to) {
    query += ' AND created_at <= ?';
    params.push(to);
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  }

  try {
    const rows = await db.all(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('Get alerts error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/alerts (desde edge con API key)
 */
export const createAlert = async (req, res, db) => {
  const { camera_id, alert_type, description, confidence, image_url, video_url, metadata } = req.body;

  if (!alert_type) {
    return res.status(400).json({ error: 'alert_type required' });
  }

  try {
    const result = await db.run(
      `INSERT INTO dc_alerts (customer_id, camera_id, alert_type, description, confidence, image_url, video_url, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.customer.id, camera_id || null, alert_type, description || null, confidence || 0, image_url || null, video_url || null, metadata ? JSON.stringify(metadata) : null]
    );

    const row = await db.get('SELECT * FROM dc_alerts WHERE id = ?', [result.lastID]);
    return res.status(201).json(row);
  } catch (err) {
    console.error('Create alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/alerts/:id/acknowledge
 */
export const acknowledgeAlert = async (req, res, db) => {
  const { id } = req.params;
  const { acknowledged_by } = req.body;

  try {
    const result = await db.run(
      `UPDATE dc_alerts
       SET acknowledged_at = datetime('now'), acknowledged_by = ?
       WHERE id = ?`,
      [acknowledged_by || req.user.username, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const row = await db.get('SELECT * FROM dc_alerts WHERE id = ?', [id]);
    return res.json(row);
  } catch (err) {
    console.error('Acknowledge alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/test-alerts
 */
export const getTestAlerts = async (req, res, db) => {
  try {
    const rows = await db.all(
      'SELECT * FROM dc_test_alerts ORDER BY created_at DESC LIMIT 100'
    );

    return res.json(rows);
  } catch (err) {
    console.error('Get test alerts error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
