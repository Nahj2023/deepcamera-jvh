/**
 * Auth Handler — SQLite
 */

import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth.js';

export const login = (req, res, db) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare(
    'SELECT id, username, email, role, password_hash FROM dc_users WHERE username = ?'
  ).get(username);

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken(user);
  return res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role }
  });
};

export const getMe = (req, res, db) => {
  const user = db.prepare(
    'SELECT id, username, email, role, created_at FROM dc_users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
};

export const register = (req, res, db) => {
  const { username, email, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can create users' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO dc_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(username, email || null, hash, role || 'admin');

    return res.status(201).json({ id: result.lastInsertRowid, username, email, role: role || 'admin' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
