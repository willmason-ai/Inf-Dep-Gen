// ============================================================================
// Infrastructure Deployment Generator — Networking API Routes
// ============================================================================

import { Router } from 'express';
import {
  getConfig,
  saveConfig,
  validateTopology,
  importFromArmExport,
  getDefaultConfig,
} from '../services/networking-config.js';
import { generateBicep, generateArmJson } from '../services/bicep-generator.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/networking — Get current networking config
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const result = await getConfig();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/networking — Save networking config
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Missing config in request body' });
    }
    const result = await saveConfig(config);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/networking/validate — Validate topology
// ---------------------------------------------------------------------------
router.post('/validate', async (req, res, next) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Missing config in request body' });
    }
    const validation = validateTopology(config);
    res.json(validation);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/networking/generate/bicep — Generate Bicep template
// ---------------------------------------------------------------------------
router.post('/generate/bicep', async (req, res, next) => {
  try {
    const { config: cfg } = await getConfig();
    const result = generateBicep(cfg);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/networking/generate/arm — Generate ARM JSON template
// ---------------------------------------------------------------------------
router.post('/generate/arm', async (req, res, next) => {
  try {
    const { config: cfg } = await getConfig();
    const result = generateArmJson(cfg);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/networking/import — Import from ARM export
// ---------------------------------------------------------------------------
router.post('/import', async (req, res, next) => {
  try {
    const { armTemplate } = req.body;
    if (!armTemplate) {
      return res.status(400).json({ error: 'Missing armTemplate in request body' });
    }

    const { config: importedConfig, importSummary } = importFromArmExport(armTemplate);

    // Save the imported config
    const result = await saveConfig(importedConfig);

    res.json({
      ...result,
      importSummary,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/networking/reset — Reset to default config
// ---------------------------------------------------------------------------
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

export default router;
