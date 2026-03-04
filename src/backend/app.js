// ============================================================================
// Infrastructure Deployment Generator — Express Application
// ============================================================================

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import apiRouter from './api/index.js';
import { auditLogger } from './middleware/audit-logger.js';
import { authMiddleware } from './middleware/auth.js';
import { guardrails } from './middleware/guardrails.js';
import { errorHandler } from './middleware/error-handler.js';
import config from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS — allow frontend dev server (Vite on :5173) and same-origin in production
app.use(cors({
  origin: config.app.nodeEnv === 'production'
    ? false  // same-origin only
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// JSON body parsing
app.use(express.json({ limit: '10mb' }));

// HTTP request logging
app.use(morgan(config.app.nodeEnv === 'production' ? 'combined' : 'dev'));

// Audit logging (writes to Cosmos DB)
app.use('/api', auditLogger());

// Authentication (validates Bearer token — skips /health and /auth/login)
app.use('/api', authMiddleware());

// Guardrails enforcement
app.use('/api', guardrails());

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// Static frontend (production — serves built React app)
// ---------------------------------------------------------------------------
if (config.app.nodeEnv === 'production') {
  const frontendPath = join(__dirname, '../../dist/frontend');
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(frontendPath, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Root — basic info (dev only, production serves React app)
// ---------------------------------------------------------------------------
if (config.app.nodeEnv !== 'production') {
  app.get('/', (req, res) => {
    res.json({
      service: 'Infrastructure Deployment Generator',
      description: 'Azure VM management and AI-powered infrastructure operations for Azure infrastructure',
      environment: config.environment,
      endpoints: {
        health: '/api/health',
        servers: '/api/servers',
        chat: '/api/ai/chat',
        frontend: 'http://localhost:5173 (Vite dev server)',
      },
    });
  });
}

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `No route matches ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET  /api/health',
      'GET  /api/servers',
      'GET  /api/servers/:hostname',
      'POST /api/servers/:hostname/arm',
      'POST /api/servers/:hostname/lvm',
      'POST /api/servers/:hostname/nsg',
      'POST /api/servers/:hostname/tags',
      'POST /api/ai/chat',
      'GET  /api/ai/history',
    ],
  });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use(errorHandler());

export default app;
