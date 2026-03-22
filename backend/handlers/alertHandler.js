/**
 * Alert Handler — SQLite
 */

export const getAlerts = (req, res, db) => {
  const { customer_id, type, from, to, limit = 100 } = req.query;

  let sql = 'SELECT * FROM dc_alerts WHERE 1=1';
  const params = [];

  if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
  if (type)        { sql += ' AND alert_type = ?';  params.push(type); }
  if (from)        { sql += ' AND created_at >= ?'; params.push(from); }
  if (to)          { sql += ' AND created_at <= ?'; params.push(to); }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10));

  try {
    return res.json(db.prepare(sql).all(...params));
  } catch (err) {
    console.error('Get alerts error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const getAlertById = (req, res, db) => {
  const row = db.prepare('SELECT * FROM dc_alerts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Alert not found' });
  return res.json(row);
};

export const createAlert = (req, res, db, customer) => {
  const { camera_id, alert_type, description, confidence, image_url, video_url, metadata } = req.body;
  if (!alert_type) return res.status(400).json({ error: 'alert_type required' });

  try {
    const result = db.prepare(`
      INSERT INTO dc_alerts
        (customer_id, camera_id, alert_type, description, confidence, image_url, video_url, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customer.id,
      camera_id || null,
      alert_type,
      description || null,
      confidence || 0,
      image_url || null,
      video_url || null,
      metadata ? JSON.stringify(metadata) : null
    );

    return res.status(201).json({ id: result.lastInsertRowid, ...req.body, customer_id: customer.id });
  } catch (err) {
    console.error('Create alert error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const acknowledgeAlert = (req, res, db) => {
  const { id } = req.params;
  const acknowledgedBy = req.body.acknowledged_by || req.user.username;

  const result = db.prepare(`
    UPDATE dc_alerts
    SET acknowledged_at = datetime('now'), acknowledged_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(acknowledgedBy, id);

  if (result.changes === 0) return res.status(404).json({ error: 'Alert not found' });
  return res.json(db.prepare('SELECT * FROM dc_alerts WHERE id = ?').get(id));
};

export const deleteAlert = (req, res, db) => {
  const result = db.prepare('DELETE FROM dc_alerts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Alert not found' });
  return res.json({ message: 'Alert deleted' });
};

export const getTestAlerts = (req, res, db) => {
  try {
    return res.json(
      db.prepare('SELECT * FROM dc_test_alerts ORDER BY created_at DESC LIMIT 100').all()
    );
  } catch (err) {
    console.error('Get test alerts error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
