// ============================================================================
// Infrastructure Deployment Generator — Azure Discovery API Routes
// ============================================================================
// REST endpoints for querying live Azure environment state.
// Used by the dashboard and available for direct API calls.
// ============================================================================

import { Router } from 'express';
import {
  discoverVnets,
  discoverVMs,
  discoverDisks,
  discoverNSGs,
  discoverNICs,
  discoverFullEnvironment,
  getDiscoverableResourceGroups,
} from '../services/azure-discovery.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/azure/resource-groups — List discoverable resource groups
// ---------------------------------------------------------------------------
router.get('/resource-groups', (req, res) => {
  res.json({
    resourceGroups: getDiscoverableResourceGroups(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/azure/vnets — Discover VNets
// ---------------------------------------------------------------------------
router.get('/vnets', async (req, res, next) => {
  try {
    const vnets = await discoverVnets(req.query.resourceGroup || null);
    res.json({
      count: vnets.filter(v => !v.error).length,
      vnets,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/azure/vms — Discover VMs
// ---------------------------------------------------------------------------
router.get('/vms', async (req, res, next) => {
  try {
    const vms = await discoverVMs(req.query.resourceGroup || null);
    res.json({
      count: vms.filter(v => !v.error).length,
      vms,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/azure/disks — Discover Disks
// ---------------------------------------------------------------------------
router.get('/disks', async (req, res, next) => {
  try {
    const disks = await discoverDisks(req.query.resourceGroup || null);
    res.json({
      count: disks.filter(d => !d.error).length,
      disks,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/azure/nsgs — Discover NSGs
// ---------------------------------------------------------------------------
router.get('/nsgs', async (req, res, next) => {
  try {
    const nsgs = await discoverNSGs(req.query.resourceGroup || null);
    res.json({
      count: nsgs.filter(n => !n.error).length,
      nsgs,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/azure/nics — Discover NICs
// ---------------------------------------------------------------------------
router.get('/nics', async (req, res, next) => {
  try {
    const nics = await discoverNICs(req.query.resourceGroup || null);
    res.json({
      count: nics.filter(n => !n.error).length,
      nics,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/azure/snapshot — Full environment snapshot
// ---------------------------------------------------------------------------
router.get('/snapshot', async (req, res, next) => {
  try {
    const snapshot = await discoverFullEnvironment();
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;
