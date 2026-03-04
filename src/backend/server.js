// ============================================================================
// Infrastructure Deployment Generator — Server Entry Point
// ============================================================================
// Initializes Cosmos DB, starts the Express server.
// ============================================================================

import app from './app.js';
import { initializeDatabase } from './config/cosmos.js';
import config from './config/index.js';

async function start() {
  console.log('==============================================');
  console.log(' Infrastructure Deployment Generator');
  console.log('==============================================');
  console.log(`  Environment : ${config.environment}`);
  console.log(`  Node Env    : ${config.app.nodeEnv}`);
  console.log(`  Log Level   : ${config.app.logLevel}`);
  console.log('');

  // Initialize Cosmos DB (non-blocking if credentials missing)
  try {
    const cosmosReady = await initializeDatabase();
    if (cosmosReady) {
      console.log('[Startup] Cosmos DB initialized successfully');
    } else {
      console.warn('[Startup] Cosmos DB running in offline mode — no credentials configured');
    }
  } catch (error) {
    console.error('[Startup] Cosmos DB initialization failed:', error.message);
    console.warn('[Startup] Server will start without Cosmos DB connectivity');
  }

  // Start Express
  const port = config.app.port;
  app.listen(port, () => {
    console.log('');
    console.log(`[Startup] Server listening on http://localhost:${port}`);
    console.log(`[Startup] Health check: http://localhost:${port}/api/health`);
    console.log('');
  });
}

start().catch(err => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
