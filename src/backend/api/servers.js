// ============================================================================
// Infrastructure Deployment Generator — Servers API
// ============================================================================
// Endpoints for server spec CRUD and artifact generation.
// ============================================================================

import { Router } from 'express';
import { getContainer } from '../config/cosmos.js';
import { parseAllSpecs } from '../services/spec-parser.js';
import { generateArmTemplate } from '../services/arm-generator.js';
import { generateLvmScript } from '../services/lvm-generator.js';
import { generateNsgRules } from '../services/nsg-generator.js';
import { generateTagScript } from '../services/tag-generator.js';
import { saveArtifact } from '../services/artifact-store.js';
import config from '../config/index.js';
import {
  createCompanionSpec,
  updateCompanionSpec,
  getAvailableSubnets,
  assignSubnet,
  COMPANION_ROLES,
  COMPANION_OS_OPTIONS,
  COMPANION_SKU_OPTIONS,
} from '../services/companion-vm.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get server spec from Cosmos DB or in-memory parse
// ---------------------------------------------------------------------------
let cachedSpecs = null;
let cachedSpecsAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getSpecs() {
  const container = getContainer(config.cosmos.containers.serverSpecs);

  if (container) {
    try {
      const { resources } = await container.items
        .query('SELECT * FROM c ORDER BY c.hostname')
        .fetchAll();
      if (resources.length > 0) return resources;
    } catch (error) {
      console.warn('[Servers] Cosmos DB query failed, falling back to file parse:', error.message);
    }
  }

  // Fallback: parse from markdown files (cached with TTL)
  const now = Date.now();
  if (!cachedSpecs || (now - cachedSpecsAt) > CACHE_TTL_MS) {
    cachedSpecs = await parseAllSpecs();
    cachedSpecsAt = now;
  }
  return cachedSpecs;
}

async function getSpecByHostname(hostname) {
  const specs = await getSpecs();
  return specs.find(s => s.hostname.toLowerCase() === hostname.toLowerCase()) || null;
}

// ---------------------------------------------------------------------------
// GET /api/servers — List all servers
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const specs = await getSpecs();
    const servers = specs.map(s => ({
      hostname: s.hostname,
      role: s.companionRole || s.role,
      serverType: s.serverType,
      companionRole: s.companionRole,
      os: s.os,
      region: s.region,
      regionCode: s.regionCode,
      sku: s.sku,
      currentSku: s.currentSku,
      skuDeficient: s.skuDeficient,
      resourceGroup: s.resourceGroup,
      subnetName: s.subnetName,
      dependsOn: s.dependsOn,
      totalDisks: s.volumeGroups
        ? s.volumeGroups.reduce((sum, vg) => sum + (vg.diskCount || 0), 0)
        : s.diskGroups
          ? s.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
          : (s.dataDisks || []).length,
      tags: s.tags,
      deficiencyCount: (s.deficiencies || []).length,
    }));

    res.json({
      count: servers.length,
      environment: config.environment,
      servers,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/servers/subnets — Get available subnets from networking config
// ---------------------------------------------------------------------------
router.get('/subnets', async (req, res, next) => {
  try {
    const subnets = await getAvailableSubnets();
    res.json({ subnets, roles: COMPANION_ROLES, osOptions: COMPANION_OS_OPTIONS, skuOptions: COMPANION_SKU_OPTIONS });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers — Create a new server spec
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const spec = await createCompanionSpec(req.body);
    // Clear cache so the new spec appears in listings
    cachedSpecs = null;
    cachedSpecsAt = 0;
    res.status(201).json(spec);
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/servers/:hostname — Update server spec
// ---------------------------------------------------------------------------
router.put('/:hostname', async (req, res, next) => {
  try {
    const spec = await updateCompanionSpec(req.params.hostname, req.body);
    cachedSpecs = null;
    cachedSpecsAt = 0;
    res.json(spec);
  } catch (error) {
    if (error.message.includes('No spec found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers/:hostname/subnet — Assign VM to subnet
// ---------------------------------------------------------------------------
router.post('/:hostname/subnet', async (req, res, next) => {
  try {
    const { subnetId } = req.body;
    if (!subnetId) return res.status(400).json({ error: 'Missing subnetId' });
    const spec = await assignSubnet(req.params.hostname, subnetId);
    cachedSpecs = null;
    cachedSpecsAt = 0;
    res.json(spec);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers/batch/arm — Batch ARM generation
// ---------------------------------------------------------------------------
router.post('/batch/arm', async (req, res, next) => {
  try {
    const { hostnames, filter } = req.body;
    let specs = await getSpecs();

    if (filter && filter !== 'all') {
      specs = specs.filter(s => s.serverType === filter);
    } else if (hostnames?.length) {
      specs = specs.filter(s => hostnames.includes(s.hostname));
    }

    const results = specs.map(spec => {
      try {
        const result = generateArmTemplate(spec);
        return { hostname: spec.hostname, success: true, summary: result.summary };
      } catch (err) {
        return { hostname: spec.hostname, success: false, error: err.message };
      }
    });

    res.json({ count: results.length, results });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/servers/:hostname — Get full server spec
// ---------------------------------------------------------------------------
router.get('/:hostname', async (req, res, next) => {
  try {
    const spec = await getSpecByHostname(req.params.hostname);
    if (!spec) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No server spec found for hostname: ${req.params.hostname}`,
      });
    }
    res.json(spec);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers/:hostname/arm — Generate ARM template
// ---------------------------------------------------------------------------
router.post('/:hostname/arm', async (req, res, next) => {
  try {
    const spec = await getSpecByHostname(req.params.hostname);
    if (!spec) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No server spec found for hostname: ${req.params.hostname}`,
      });
    }

    const result = generateArmTemplate(spec);

    // Save artifact to Cosmos DB
    try {
      await saveArtifact(spec.hostname, 'arm', result.template, result.summary);
    } catch (err) {
      console.warn('[Servers] Failed to save ARM artifact:', err.message);
    }

    res.json({
      hostname: spec.hostname,
      type: 'arm',
      template: result.template,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers/:hostname/lvm — Generate LVM script
// ---------------------------------------------------------------------------
router.post('/:hostname/lvm', async (req, res, next) => {
  try {
    const spec = await getSpecByHostname(req.params.hostname);
    if (!spec) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No server spec found for hostname: ${req.params.hostname}`,
      });
    }

    const result = generateLvmScript(spec);

    if (result.error) {
      return res.status(400).json({
        error: 'Invalid Operation',
        message: result.error,
      });
    }

    // Save artifact
    try {
      await saveArtifact(spec.hostname, 'lvm', result.script, result.summary);
    } catch (err) {
      console.warn('[Servers] Failed to save LVM artifact:', err.message);
    }

    res.json({
      hostname: spec.hostname,
      type: 'lvm',
      script: result.script,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers/:hostname/nsg — Generate NSG rules
// ---------------------------------------------------------------------------
router.post('/:hostname/nsg', async (req, res, next) => {
  try {
    const spec = await getSpecByHostname(req.params.hostname);
    if (!spec) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No server spec found for hostname: ${req.params.hostname}`,
      });
    }

    const result = generateNsgRules(spec);

    try {
      await saveArtifact(spec.hostname, 'nsg', result.template, result.summary);
    } catch (err) {
      console.warn('[Servers] Failed to save NSG artifact:', err.message);
    }

    res.json({
      hostname: spec.hostname,
      type: 'nsg',
      template: result.template,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/servers/:hostname/tags — Generate tag script
// ---------------------------------------------------------------------------
router.post('/:hostname/tags', async (req, res, next) => {
  try {
    const spec = await getSpecByHostname(req.params.hostname);
    if (!spec) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No server spec found for hostname: ${req.params.hostname}`,
      });
    }

    const result = generateTagScript(spec);

    try {
      await saveArtifact(spec.hostname, 'tag', result.script, result.summary);
    } catch (err) {
      console.warn('[Servers] Failed to save tag artifact:', err.message);
    }

    res.json({
      hostname: spec.hostname,
      type: 'tag',
      script: result.script,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
