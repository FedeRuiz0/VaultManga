import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne, queryAll } from '../db/database.js';

const router = express.Router();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to verify JWT
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Register
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if user exists
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await queryOne(`
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, avatar_url, created_at
    `, [username, email, passwordHash]);

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await queryOne(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get user preferences
    const preferences = await queryOne(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        preferences
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await queryOne(`
      SELECT id, username, email, avatar_url, preferences, created_at, updated_at
      FROM users WHERE id = $1
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get preferences
    const preferences = await queryOne(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [user.id]
    );

    res.json({ ...user, preferences });
  } catch (error) {
    next(error);
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res, next) => {
  try {
    const { username, avatar_url } = req.body;

    const user = await queryOne(`
      UPDATE users SET
        username = COALESCE($2, username),
        avatar_url = COALESCE($3, avatar_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, email, avatar_url, created_at
    `, [req.user.id, username, avatar_url]);

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Change password
router.put('/password', authenticateToken, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const user = await queryOne(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const validPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(new_password, salt);

    await query(
      'UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.user.id, passwordHash]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;

