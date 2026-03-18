// ============================================================================
// Infrastructure Deployment Generator — AVS Configuration Service
// ============================================================================
// CRUD, validation, capacity calculation for Azure VMware Solution config.
// Cross-references networking config for IP plan overlap validation.
// ============================================================================

import { randomUUID } from 'crypto';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';
import {
  parseCidr,
  validateCidr,
  cidrOverlaps,
  validateNoOverlap,
} from './cidr-utils.js';

const CONFIG_KEY = 'avsConfig';

// ---------------------------------------------------------------------------
// Host SKU reference data
// ---------------------------------------------------------------------------

export const HOST_SKUS = {
  AV36:  { cores: 36, ramGB: 576,  vsanRawTB: 15.36, vsanUsableTB: 7.68,  nvmeCacheTB: 3.2,  label: 'AV36 (Standard)' },
  AV36P: { cores: 36, ramGB: 768,  vsanRawTB: 19.20, vsanUsableTB: 9.60,  nvmeCacheTB: 3.2,  label: 'AV36P (Performance)' },
  AV52:  { cores: 52, ramGB: 1536, vsanRawTB: 38.40, vsanUsableTB: 19.20, nvmeCacheTB: 6.4,  label: 'AV52 (Memory Optimized)' },
  AV64:  { cores: 64, ramGB: 1024, vsanRawTB: 30.72, vsanUsableTB: 15.36, nvmeCacheTB: 3.84, label: 'AV64 (Storage Dense)' },
};

// ---------------------------------------------------------------------------
// Capacity calculation
// ---------------------------------------------------------------------------

export function calculateCapacity(sku, nodeCount) {
  const host = HOST_SKUS[sku];
  if (!host) return { error: `Unknown SKU: ${sku}` };
  if (nodeCount < 3) return { error: 'Minimum 3 nodes required for vSAN' };

  return {
    sku,
    nodeCount,
    label: host.label,
    totalCores: host.cores * nodeCount,
    totalRamGB: host.ramGB * nodeCount,
    vsanRawTB: +(host.vsanRawTB * nodeCount).toFixed(2),
    vsanUsableTB: +(host.vsanUsableTB * nodeCount).toFixed(2),
    nvmeCacheTB: +(host.nvmeCacheTB * nodeCount).toFixed(2),
    perHost: {
      cores: host.cores,
      ramGB: host.ramGB,
      vsanRawTB: host.vsanRawTB,
      vsanUsableTB: host.vsanUsableTB,
    },
  };
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export function getDefaultConfig(region = 'eastus2') {
  return {
    region,
    resourceGroupName: '',
    subscriptionId: '',

    privateCloud: {
      name: '',
      autoName: true,
      addressBlock: '',
      sku: 'AV36P',
      clusterName: 'cluster-1',
      nodeCount: 3,
      secondaryClusters: [],
    },

    nsxtSegments: [
      {
        id: randomUUID(),
        name: 'workload-seg-01',
        autoName: true,
        cidr: '',
        gatewayAddress: '',
        dhcpEnabled: false,
        dhcpRange: '',
        dnsServers: [],
        tier1Gateway: 'default',
      },
    ],

    hcx: {
      enabled: false,
      serviceMesh: {
        name: '',
        autoName: true,
        sourceVCenter: '',
        uplinkProfile: '',
        computeProfile: '',
      },
      networkExtensions: [],
      migrationWaves: [],
    },

    connectivity: {
      avsExpressRoute: {
        enabled: true,
        authorizationKeyName: '',
        autoName: true,
      },
      hubConnection: {
        enabled: true,
        hubGatewayResourceId: '',
        connectionName: '',
        autoName: true,
      },
      globalReach: {
        enabled: false,
        onPremCircuitResourceId: '',
        peeringAddressPrefix: '',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Read config from Cosmos DB
// ---------------------------------------------------------------------------

export async function getConfig() {
  const container = getContainer(config.cosmos.containers.appConfig);

  if (container) {
    try {
      const { resource } = await container.item(CONFIG_KEY, CONFIG_KEY).read();
      if (resource && resource.config) {
        const validation = await validateAvsConfig(resource.config);
        return { config: resource.config, validation, updatedAt: resource.updatedAt };
      }
    } catch {
      // 404 — return default
    }
  }

  const defaultConfig = getDefaultConfig();
  const validation = await validateAvsConfig(defaultConfig);
  return { config: defaultConfig, validation, updatedAt: null };
}

// ---------------------------------------------------------------------------
// Save config to Cosmos DB
// ---------------------------------------------------------------------------

export async function saveConfig(avsConfig) {
  const validation = await validateAvsConfig(avsConfig);

  const container = getContainer(config.cosmos.containers.appConfig);
  const doc = {
    id: CONFIG_KEY,
    configKey: CONFIG_KEY,
    config: avsConfig,
    updatedAt: new Date().toISOString(),
  };

  if (container) {
    try {
      await container.items.upsert(doc);

      // Sync AVS block to networking config IP plan
      if (avsConfig.privateCloud?.addressBlock) {
        await syncAvsBlockToNetworking(avsConfig.privateCloud.addressBlock);
      }
    } catch (err) {
      console.error('[AvsConfig] Failed to save:', err.message);
      throw new Error('Failed to save AVS configuration');
    }
  }

  return { config: avsConfig, validation, updatedAt: doc.updatedAt };
}

// ---------------------------------------------------------------------------
// Sync AVS /22 block to networking config's IP plan
// ---------------------------------------------------------------------------

async function syncAvsBlockToNetworking(avsBlock) {
  try {
    const { getConfig: getNetConfig, saveConfig: saveNetConfig } = await import('./networking-config.js');
    const { config: netCfg } = await getNetConfig();
    if (netCfg && netCfg.ipAddressPlan) {
      if (netCfg.ipAddressPlan.avsBlock !== avsBlock) {
        netCfg.ipAddressPlan.avsBlock = avsBlock;
        await saveNetConfig(netCfg);
      }
    }
  } catch {
    // Non-critical — networking config may not be available
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateAvsConfig(cfg) {
  const errors = [];
  const warnings = [];

  if (!cfg) {
    return { valid: false, errors: ['No configuration provided'], warnings: [] };
  }

  const pc = cfg.privateCloud || {};

  // /22 block validation
  if (pc.addressBlock) {
    const result = validateCidr(pc.addressBlock);
    if (!result.valid) {
      errors.push(`AVS address block "${pc.addressBlock}": ${result.errors.join(', ')}`);
    } else if (result.parsed.prefix !== 22) {
      errors.push(`AVS address block must be exactly /22 (currently /${result.parsed.prefix})`);
    }
  } else {
    warnings.push('AVS /22 address block not set');
  }

  // Node count
  if (pc.nodeCount < 3) {
    errors.push('Minimum 3 nodes required for vSAN cluster');
  }
  if (pc.nodeCount > 16) {
    errors.push('Maximum 16 nodes per cluster');
  }

  // SKU validation
  if (pc.sku && !HOST_SKUS[pc.sku]) {
    errors.push(`Unknown host SKU: ${pc.sku}. Valid: ${Object.keys(HOST_SKUS).join(', ')}`);
  }

  // Secondary clusters
  for (const cluster of (pc.secondaryClusters || [])) {
    if (cluster.nodeCount < 3) {
      errors.push(`Secondary cluster "${cluster.name}" has fewer than 3 nodes`);
    }
  }

  // NSX-T segment validation
  const segmentCidrs = [];
  for (const seg of (cfg.nsxtSegments || [])) {
    if (seg.cidr) {
      const result = validateCidr(seg.cidr);
      if (!result.valid) {
        errors.push(`NSX-T segment "${seg.name}": ${result.errors.join(', ')}`);
      } else {
        segmentCidrs.push(seg.cidr);
      }
    }
  }

  // Segment overlap check
  if (segmentCidrs.length > 1) {
    const overlapResult = validateNoOverlap(segmentCidrs);
    for (const overlap of overlapResult.overlaps) {
      errors.push(`NSX-T segment overlap: ${overlap.a} overlaps with ${overlap.b}`);
    }
  }

  // HCX migration wave validation
  if (cfg.hcx?.enabled) {
    const segmentNames = (cfg.nsxtSegments || []).map(s => s.name).filter(Boolean);
    for (const wave of (cfg.hcx.migrationWaves || [])) {
      for (const vm of (wave.vms || [])) {
        if (vm.targetSegment && segmentNames.length > 0 && !segmentNames.includes(vm.targetSegment)) {
          warnings.push(`Wave "${wave.name}" VM "${vm.sourceVm}": target segment "${vm.targetSegment}" not found in NSX-T segments`);
        }
      }
    }
  }

  // Cross-reference with networking config
  if (pc.addressBlock) {
    try {
      const { getConfig: getNetConfig } = await import('./networking-config.js');
      const { config: netCfg } = await getNetConfig();
      if (netCfg) {
        const allNetRanges = [];
        const allNetLabels = [];

        for (const space of (netCfg.hubVnet?.addressSpaces || [])) {
          allNetRanges.push(space);
          allNetLabels.push('Hub VNet');
        }
        for (const r of (netCfg.ipAddressPlan?.onPremRanges || [])) {
          allNetRanges.push(r);
          allNetLabels.push('On-Prem');
        }
        for (const r of (netCfg.ipAddressPlan?.workloadVnetRanges || [])) {
          allNetRanges.push(r);
          allNetLabels.push('Workload');
        }

        for (let i = 0; i < allNetRanges.length; i++) {
          if (cidrOverlaps(pc.addressBlock, allNetRanges[i])) {
            errors.push(`AVS /22 block ${pc.addressBlock} overlaps with ${allNetLabels[i]} range ${allNetRanges[i]}`);
          }
        }
      }
    } catch {
      // Networking config not available — skip cross-reference
    }
  }

  // Connectivity
  const conn = cfg.connectivity || {};
  if (conn.hubConnection?.enabled && !conn.hubConnection.hubGatewayResourceId) {
    warnings.push('Hub connection enabled but no gateway resource ID configured');
  }
  if (conn.globalReach?.enabled && !conn.globalReach.onPremCircuitResourceId) {
    warnings.push('Global Reach enabled but no on-prem circuit resource ID configured');
  }

  // Capacity
  let capacity = null;
  if (pc.sku && HOST_SKUS[pc.sku] && pc.nodeCount >= 3) {
    capacity = calculateCapacity(pc.sku, pc.nodeCount);
  }

  return { valid: errors.length === 0, errors, warnings, capacity };
}

export default {
  HOST_SKUS,
  calculateCapacity,
  getDefaultConfig,
  getConfig,
  saveConfig,
  validateAvsConfig,
};
