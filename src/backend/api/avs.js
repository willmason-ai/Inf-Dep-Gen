// ============================================================================
// Infrastructure Deployment Generator — AVS API Routes
// ============================================================================

import { Router } from 'express';
import {
  getConfig,
  saveConfig,
  validateAvsConfig,
  calculateCapacity,
  getDefaultConfig,
  HOST_SKUS,
} from '../services/avs-config.js';
import { generateAvsBicep, generateAvsArmJson } from '../services/avs-bicep-generator.js';

const router = Router();

// GET /api/avs — Get current AVS config
router.get('/', async (req, res, next) => {
  try {
    const result = await getConfig();
    res.json({ ...result, hostSkus: HOST_SKUS });
  } catch (error) {
    next(error);
  }
});

// POST /api/avs — Save AVS config
router.post('/', async (req, res, next) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'Missing config in request body' });
    const result = await saveConfig(config);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/avs/validate — Validate AVS config
router.post('/validate', async (req, res, next) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'Missing config' });
    const validation = await validateAvsConfig(config);
    res.json(validation);
  } catch (error) {
    next(error);
  }
});

// POST /api/avs/capacity — Calculate vSAN capacity
router.post('/capacity', async (req, res, next) => {
  try {
    const { sku, nodeCount } = req.body;
    const result = calculateCapacity(sku || 'AV36P', nodeCount || 3);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/avs/generate/bicep
router.post('/generate/bicep', async (req, res, next) => {
  try {
    const { config: cfg } = await getConfig();
    const result = generateAvsBicep(cfg);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/avs/generate/arm
router.post('/generate/arm', async (req, res, next) => {
  try {
    const { config: cfg } = await getConfig();
    const result = generateAvsArmJson(cfg);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/avs/reset
router.post('/reset', async (req, res, next) => {
  try {
    const { region } = req.body;
    const defaultConfig = getDefaultConfig(region || 'eastus2');
    const result = await saveConfig(defaultConfig);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/avs/host-skus — Reference data
router.get('/host-skus', (req, res) => {
  res.json(HOST_SKUS);
});

export default router;
