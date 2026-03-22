import crypto from 'crypto';

/**
 * GET /api/customers
 * Lista todos los clientes (multi-tenant)
 */
export const getCustomers = async (req, res, db) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, status, contact_person, phone,
              (SELECT COUNT(*) FROM dc_cameras WHERE customer_id = dc_customers.id) as camera_count,
              (SELECT COUNT(*) FROM dc_alerts WHERE customer_id = dc_customers.id AND created_at > NOW() - INTERVAL '24 hours') as alerts_today,
              created_at
       FROM dc_customers
       ORDER BY created_at DESC`
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get customers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/customers/:id
 * Obtiene detalle de un cliente
 */
export const getCustomerById = async (req, res, db) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM dc_customers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/customers
 * Crea nuevo cliente
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
    // Generar API key única
    const apiKey = crypto.randomBytes(32).toString('hex');

    const result = await db.query(
      `INSERT INTO dc_customers (name, email, contact_person, phone, address, api_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, api_key, status, created_at`,
      [name, email || null, contact_person || null, phone || null, address || null, apiKey]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PUT /api/customers/:id
 * Actualiza cliente
 */
export const updateCustomer = async (req, res, db) => {
  const { id } = req.params;
  const { name, email, contact_person, phone, address, status } = req.body;

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const result = await db.query(
      `UPDATE dc_customers
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           contact_person = COALESCE($3, contact_person),
           phone = COALESCE($4, phone),
           address = COALESCE($5, address),
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, email, status, created_at`,
      [name, email, contact_person, phone, address, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update customer error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/customers/:id
 * Elimina cliente (solo superadmin)
 */
export const deleteCustomer = async (req, res, db) => {
  const { id } = req.params;

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can delete' });
  }

  try {
    const result = await db.query(
      'DELETE FROM dc_customers WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
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
 * Regenera API key de un cliente
 */
export const regenerateAPIKey = async (req, res, db) => {
  const { id } = req.params;

  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const newApiKey = crypto.randomBytes(32).toString('hex');

    const result = await db.query(
      'UPDATE dc_customers SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, api_key',
      [newApiKey, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Regenerate API key error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
