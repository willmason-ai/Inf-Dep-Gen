// ============================================================================
// Infrastructure Deployment Generator — Audit Logger Middleware
// ============================================================================
// Logs every API call to the Cosmos DB auditLog container.
// Records timestamp, endpoint, method, user, status, and duration.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

export function auditLogger() {
  return async (req, res, next) => {
    const startTime = Date.now();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD for partition key

    // Capture response finish
    res.on('finish', async () => {
      const duration = Date.now() - startTime;

      const logEntry = {
        id: uuidv4(),
        date,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        fullUrl: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.headers['user-agent']?.substring(0, 200),
        ip: req.ip || req.connection?.remoteAddress,
        environment: config.environment,
      };

      // Include body summary for POST requests (not secrets)
      if (req.method === 'POST' && req.body) {
        logEntry.requestSummary = {
          hostname: req.body.hostname || req.params?.hostname,
          sessionId: req.body.sessionId,
          hasMessage: !!req.body.message,
        };
      }

      // Write to Cosmos DB asynchronously (don't block response)
      const container = getContainer(config.cosmos.containers.auditLog);
      if (container) {
        try {
          await container.items.create(logEntry);
        } catch (error) {
          console.warn('[AuditLogger] Failed to write audit log:', error.message);
        }
      }
    });

    next();
  };
}

export default auditLogger;
