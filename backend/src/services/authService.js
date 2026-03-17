import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, queryOne, queryAll } from '../db/database.js';
import { cacheGet, cacheSet, cacheDelete } from '../db/redis.js';

const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

// Generate tokens
function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET || 'default_secret',
    { expiresIn: JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_SECRET || 'default_secret',
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
}

// Verify token
export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
  } catch (error) {
    return null;
  }
}

// Auth middleware
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user from database
    const user = await queryOne(
      'SELECT id, username, email, avatar_url, preferences, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

// Optional auth - doesn't fail if no token
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (decoded) {
      const user = await queryOne(
        'SELECT id, username, email, avatar_url, preferences FROM users WHERE id = $1',
        [decoded.id]
      );
      req.user = user;
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Login
export async function login(username, password) {
  const user = await queryOne(
    'SELECT * FROM users WHERE username = $1 OR email = $1',
    [username]
  );

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const tokens = generateTokens(user);
  
  // Don't return password hash
  delete user.password_hash;
  
  return { user, ...tokens };
}

// Register
export async function register(username, email, password) {
  // Check if user exists
  const existing = await queryOne(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );

  if (existing) {
    throw new Error('Username or email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user
  const user = await queryOne(`
    INSERT INTO users (username, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, username, email, avatar_url, preferences, created_at, updated_at
  `, [username, email, passwordHash]);

  const tokens = generateTokens(user);
  
  return { user, ...tokens };
}

// Refresh token
export async function refreshToken(refreshToken) {
  try {
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_SECRET || 'default_secret'
    );

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const user = await queryOne(
      'SELECT id, username, email, avatar_url, preferences FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!user) {
      throw new Error('User not found');
    }

    const tokens = generateTokens(user);
    
    return { user, ...tokens };
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

// Change password
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [userId]);
  
  if (!user) {
    throw new Error('User not found');
  }

  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  
  await query('UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
    userId, 
    newHash
  ]);

  return { success: true };
}

export default {
  login,
  register,
  refreshToken,
  changePassword,
  verifyToken,
  authMiddleware,
  optionalAuth
};

