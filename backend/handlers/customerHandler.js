import crypto from 'crypto';

/**
 * GET /api/customers
 */
export const getCustomers = async (req, res, db) => {
  try {
    const rows = await db.all(
      `SELECT c.id, c.name, c.email, c.status, c.contact_person, c.phone,
              (SELECT COUNT(*) FROM dc_cameras WHERE customer_id = c.id) as camera_count,
              (SELECT COUNT(*) FROM dc_alerts WHERE customer_id = c.id AND created_at > datetime('now', '-24 hours')) as alerts_today,
              c.created_at
       FROM dc_customers c
       ORDER BY c.created_at DESC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Get customers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/customers/:id
 */
export const getCustomerById = async (req, res, db) => {
  const { id } = req.params;

  try {
    const row = await db.get('SELECT * FROM dc_customers WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(row);
  } catch (err) {
    console.error('Get customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/customers
 */
export const createCustomer = async (req, res, db) => {
  const { name, email, contact_person, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const apiKey = crypto.randomBytes(32).toString('hex');

    const result = await db.run(
      `INSERT INTO dc_customers (name, email, contact_person, phone, address, api_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email || null, contact_person || null, phone || null, address || null, apiKey]
    );

    return res.status(201).json({
      id: result.lastID,
      name,
      email: email || null,
      api_key: apiKey,
      status: 'active',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/customers/:id
 */
export const updateCustomer = async (req, res, db) => {
  const { id } = req.params;
  const { name, email, contact_person, phone, address, status } = req.body;

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const existing = await db.get('SELECT * FROM dc_customers WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await db.run(
      `UPDATE dc_customers
       SET name = COALESCE(?, name),
           email = COALESCE(?, email),
           contact_person = COALESCE(?, contact_person),
           phone = COALESCE(?, phone),
           address = COALESCE(?, address),
           status = COALESCE(?, status),
           updated_at = datetime('now')
       WHERE id = ?`,
      [name, email, contact_person, phone, address, status, id]
    );

    const updated = await db.get('SELECT * FROM dc_customers WHERE id = ?', [id]);
    return res.json(updated);
  } catch (err) {
    console.error('Update customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/customers/:id
 */
export const deleteCustomer = async (req, res, db) => {
  const { id } = req.params;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can delete' });
  }

  try {
    const result = await db.run('DELETE FROM dc_customers WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error('Delete customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/customers/:id/api-key
 */
export const regenerateAPIKey = async (req, res, db) => {
  const { id } = req.params;

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const newApiKey = crypto.randomBytes(32).toString('hex');

    const result = await db.run(
      "UPDATE dc_customers SET api_key = ?, updated_at = datetime('now') WHERE id = ?",
      [newApiKey, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const updated = await db.get('SELECT id, name, api_key FROM dc_customers WHERE id = ?', [id]);
    return res.json(updated);
  } catch (err) {
    console.error('Regenerate API key error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
