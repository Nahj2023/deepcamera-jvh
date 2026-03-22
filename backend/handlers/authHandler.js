import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth.js';

/**
 * POST /api/auth/login
 */
export const login = async (req, res, db) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await db.get(
      'SELECT id, username, email, role, password_hash FROM dc_users WHERE username = ?',
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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
 */
export const getMe = async (req, res, db) => {
  try {
    const user = await db.get(
      'SELECT id, username, email, role, created_at FROM dc_users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/auth/register (solo superadmin)
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

    const result = await db.run(
      'INSERT INTO dc_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email || null, hashedPassword, role || 'admin']
    );

    return res.status(201).json({
      id: result.lastID,
      username,
      email: email || null,
      role: role || 'admin'
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
