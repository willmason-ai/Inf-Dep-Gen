// ============================================================================
// Infrastructure Deployment Generator — Health Check API
// ============================================================================

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { checkCosmosHealth } from '../config/cosmos.js';
import config from '../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'));

const router = Router();

// GET /api/health
router.get('/', async (req, res) => {
  const cosmosHealth = await checkCosmosHealth();
  const uptime = process.uptime();

  res.json({
    status: 'ok',
    service: 'inf-dep-gen',
    version: pkg.version,
    environment: config.environment,
    nodeEnv: config.app.nodeEnv,
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    timestamp: new Date().toISOString(),
    cosmos: cosmosHealth,
    azure: {
      subscriptionId: config.azure.subscriptionId ? '***configured***' : 'not configured',
      tenantId: config.azure.tenantId ? '***configured***' : 'not configured',
    },
    anthropic: {
      apiKey: config.anthropic.apiKey ? '***configured***' : 'not configured',
      model: config.anthropic.model,
    },
  });
});

export default router;
