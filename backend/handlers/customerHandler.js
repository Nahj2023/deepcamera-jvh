/**
 * Customer Handler — SQLite
 */

import crypto from 'crypto';

export const getCustomers = (req, res, db) => {
  try {
    const rows = db.prepare(`
      SELECT
        c.id, c.name, c.email, c.status, c.contact_person, c.phone, c.created_at,
        (SELECT COUNT(*) FROM dc_cameras WHERE customer_id = c.id) AS camera_count,
        (SELECT COUNT(*) FROM dc_alerts
         WHERE customer_id = c.id
           AND created_at >= datetime('now', '-24 hours')) AS alerts_today
      FROM dc_customers c
      ORDER BY c.created_at DESC
    `).all();
    return res.json(rows);
  } catch (err) {
    console.error('Get customers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const getCustomerById = (req, res, db) => {
  const row = db.prepare('SELECT * FROM dc_customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  return res.json(row);
};

export const createCustomer = (req, res, db) => {
  const { name, email, contact_person, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const apiKey = crypto.randomBytes(24).toString('hex');
  try {
    const result = db.prepare(`
      INSERT INTO dc_customers (name, email, contact_person, phone, address, api_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, email || null, contact_person || null, phone || null, address || null, apiKey);

    return res.status(201).json({
      id: result.lastInsertRowid, name, email, api_key: apiKey, status: 'active'
    });
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const updateCustomer = (req, res, db) => {
  const { id } = req.params;
  const { name, email, contact_person, phone, address, status } = req.body;
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const current = db.prepare('SELECT * FROM dc_customers WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Customer not found' });

  db.prepare(`
    UPDATE dc_customers
    SET name           = ?,
        email          = ?,
        contact_person = ?,
        phone          = ?,
        address        = ?,
        status         = ?,
        updated_at     = datetime('now')
    WHERE id = ?
  `).run(
    name           ?? current.name,
    email          ?? current.email,
    contact_person ?? current.contact_person,
    phone          ?? current.phone,
    address        ?? current.address,
    status         ?? current.status,
    id
  );

  return res.json(db.prepare('SELECT * FROM dc_customers WHERE id = ?').get(id));
};

export const deleteCustomer = (req, res, db) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can delete' });
  }
  const result = db.prepare('DELETE FROM dc_customers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ message: 'Customer deleted' });
};

export const regenerateAPIKey = (req, res, db) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const newKey = crypto.randomBytes(24).toString('hex');
  const result = db.prepare(
    "UPDATE dc_customers SET api_key = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newKey, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ api_key: newKey });
};
