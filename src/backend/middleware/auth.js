// ============================================================================
// Infrastructure Deployment Generator — Authentication Middleware
// ============================================================================
// Validates Bearer tokens on all /api/* routes.
// Sessions are persisted in Cosmos DB (appConfig container) and cached
// in-memory for 5 minutes to reduce DB round-trips.
// ============================================================================

import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

// In-memory cache: token → { username, expiresAt }
const sessionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map();

// Paths that skip authentication
const PUBLIC_PATHS = [
  '/health',
  '/auth/login',
];

function isPublicPath(path) {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Session persistence helpers
// ---------------------------------------------------------------------------

export async function saveSessionToDb(token, username) {
  const container = getContainer(config.cosmos.containers.appConfig);
  const expiresAt = new Date(Date.now() + config.auth.sessionTtlHours * 60 * 60 * 1000).toISOString();
  const doc = {
    id: `session-${token}`,
    configKey: 'authSession',
    token,
    username,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  if (container) {
    try {
      await container.items.upsert(doc);
    } catch (err) {
      console.warn('[Auth] Failed to persist session to Cosmos DB:', err.message);
    }
  }

  // Also cache locally
  sessionCache.set(token, { username, expiresAt });
  cacheTimestamps.set(token, Date.now());

  return doc;
}

export async function deleteSessionFromDb(token) {
  sessionCache.delete(token);
  cacheTimestamps.delete(token);

  const container = getContainer(config.cosmos.containers.appConfig);
  if (container) {
    try {
      await container.item(`session-${token}`, 'authSession').delete();
    } catch (err) {
      // Ignore 404 — session may not exist
      if (err.code !== 404) {
        console.warn('[Auth] Failed to delete session from Cosmos DB:', err.message);
      }
    }
  }
}

async function lookupSession(token) {
  // Check in-memory cache first
  if (sessionCache.has(token)) {
    const cacheAge = Date.now() - (cacheTimestamps.get(token) || 0);
    if (cacheAge < CACHE_TTL_MS) {
      const cached = sessionCache.get(token);
      // Check expiry
      if (new Date(cached.expiresAt) > new Date()) {
        return cached;
      }
      // Expired — clean up
      sessionCache.delete(token);
      cacheTimestamps.delete(token);
      return null;
    }
  }

  // Check Cosmos DB
  const container = getContainer(config.cosmos.containers.appConfig);
  if (container) {
    try {
      const { resource } = await container.item(`session-${token}`, 'authSession').read();
      if (resource && new Date(resource.expiresAt) > new Date()) {
        // Refresh cache
        sessionCache.set(token, { username: resource.username, expiresAt: resource.expiresAt });
        cacheTimestamps.set(token, Date.now());
        return resource;
      }
    } catch (err) {
      // Not found or error
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

export function authMiddleware() {
  return async (req, res, next) => {
    // Skip public paths
    if (isPublicPath(req.path)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. Please log in.',
      });
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    const session = await lookupSession(token);

    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired session. Please log in again.',
      });
    }

    // Attach user info to request
    req.user = { username: session.username };
    next();
  };
}

export default authMiddleware;
