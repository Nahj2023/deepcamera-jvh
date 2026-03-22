/**
 * Auth Handler — SQLite (CJS)
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const dotenv = require('dotenv');
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

exports.login = (req, res, db) => {
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

exports.getMe = (req, res, db) => {
  const user = db.prepare(
    'SELECT id, username, email, role, created_at FROM dc_users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
};

exports.register = (req, res, db) => {
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
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
