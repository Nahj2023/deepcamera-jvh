import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth.js';

/**
 * POST /api/auth/login
 * Autentica usuario y retorna JWT
 */
export const login = async (req, res, db) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const result = await db.query(
      'SELECT id, username, email, role, password_hash FROM dc_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/auth/me
 * Retorna datos del usuario autenticado
 */
export const getMe = async (req, res, db) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, role, created_at FROM dc_users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/auth/register (solo para superadmin)
 * Crea nuevo usuario
 */
export const register = async (req, res, db) => {
  const { username, email, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can create users' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      'INSERT INTO dc_users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email || null, hashedPassword, role || 'admin']
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
