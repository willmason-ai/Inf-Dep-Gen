// ============================================================================
// Infrastructure Deployment Generator — Authentication API
// ============================================================================
// POST /api/auth/login   — Validate credentials, return session token
// POST /api/auth/logout  — Invalidate session token
// GET  /api/auth/me      — Check if current token is valid
// ============================================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { saveSessionToDb, deleteSessionFromDb } from '../middleware/auth.js';
import { getContainer } from '../config/cosmos.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Username and password are required.',
    });
  }

  // Validate credentials
  if (username !== config.auth.adminUsername || password !== config.auth.adminPassword) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid username or password.',
    });
  }

  // Create session token
  const token = uuidv4();
  await saveSessionToDb(token, username);

  // Audit log the login
  const container = getContainer(config.cosmos.containers.auditLog);
  if (container) {
    try {
      await container.items.create({
        id: uuidv4(),
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        method: 'AUTH',
        path: '/api/auth/login',
        fullUrl: '/api/auth/login',
        statusCode: 200,
        duration: '0ms',
        environment: config.environment,
        requestSummary: { action: 'login', username },
      });
    } catch (err) {
      console.warn('[Auth] Failed to write login audit log:', err.message);
    }
  }

  res.json({
    token,
    username,
    expiresIn: `${config.auth.sessionTtlHours} hours`,
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    await deleteSessionFromDb(token);
  }
  res.json({ message: 'Logged out successfully.' });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get('/me', (req, res) => {
  // If we get here, the auth middleware already validated the token
  // (unless this is a public path, but /me is not public)
  if (req.user) {
    return res.json({
      authenticated: true,
      username: req.user.username,
    });
  }

  res.status(401).json({
    authenticated: false,
    message: 'Not authenticated.',
  });
});

export default router;
