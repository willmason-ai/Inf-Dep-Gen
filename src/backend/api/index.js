// ============================================================================
// Infrastructure Deployment Generator — API Route Aggregator
// ============================================================================

import { Router } from 'express';
import healthRouter from './health.js';
import authRouter from './auth.js';
import serversRouter from './servers.js';
import aiRouter from './ai.js';
import azureRouter from './azure.js';
import importRouter from './import.js';

const router = Router();

// Mount route modules
router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/servers', serversRouter);
router.use('/ai', aiRouter);
router.use('/azure', azureRouter);
router.use('/import', importRouter);

// Future mounts:
// router.use('/validate', validateRouter);
// router.use('/logs', logsRouter);

export default router;
