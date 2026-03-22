import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';

/**
 * JWT Middleware — verifica token en Authorization header
 * Token debe estar en formato: Authorization: Bearer <token>
 */
export const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Genera JWT con payload de usuario
 */
export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Verifica API key (para endpoints que reciben alertas desde edge)
 * API key debe estar en query param: ?api_key=...
 */
export const verifyAPIKey = async (req, res, next, db) => {
  const apiKey = req.query.api_key || req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await db.query(
      'SELECT id, name FROM dc_customers WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.customer = result.rows[0];
    next();
  } catch (err) {
    console.error('API key verification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
