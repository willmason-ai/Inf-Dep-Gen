// ============================================================================
// Infrastructure Deployment Generator — Networking Configuration Service
// ============================================================================
// CRUD, validation, auto-naming, and ARM export import for the networking
// topology (hub VNet, ExpressRoute, Bastion, Firewall, subnets, IP plan).
// ============================================================================

import { randomUUID } from 'crypto';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';
import {
  parseCidr,
  validateCidr,
  cidrOverlaps,
  cidrContains,
  validateNoOverlap,
  validateSubnetsInVnet,
  validateIpPlan,
  getSubnetMinPrefix,
  calculateUtilization,
} from './cidr-utils.js';

const CONFIG_KEY = 'networkingConfig';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export function getDefaultConfig(region = 'eastus2') {
  return {
    region,
    resourceGroupName: '',

    hubVnet: {
      name: '',
      addressSpaces: ['10.0.0.0/16'],
      autoName: true,
    },

    subnets: [
      {
        id: randomUUID(),
        purpose: 'gateway',
        name: 'GatewaySubnet',
        cidr: '10.0.0.0/26',
        fixedName: true,
        minPrefix: 27,
        nsg: false,
        routeTable: false,
      },
      {
        id: randomUUID(),
        purpose: 'bastion',
        name: 'AzureBastionSubnet',
        cidr: '10.0.0.64/26',
        fixedName: true,
        minPrefix: 26,
        nsg: false,
        routeTable: false,
      },
      {
        id: randomUUID(),
        purpose: 'firewall',
        name: 'AzureFirewallSubnet',
        cidr: '10.0.1.0/26',
        fixedName: true,
        minPrefix: 26,
        enabled: true,
        nsg: false,
        routeTable: false,
      },
      {
        id: randomUUID(),
        purpose: 'compute',
        name: '',
        cidr: '10.0.2.0/24',
        autoName: true,
        nsg: true,
        routeTable: true,
      },
    ],

    connectivity: {
      expressRouteGateway: {
        enabled: true,
        sku: 'ErGw3AZ',
        name: '',
        autoName: true,
      },
      expressRouteConnection: {
        enabled: true,
        name: '',
        autoName: true,
        circuitResourceId: '',
        authorizationKey: '',
      },
      expressRouteCircuit: {
        planNew: false,
        provider: '',
        bandwidth: '',
        peeringLocation: '',
        sku: 'Standard',
        name: '',
        autoName: true,
      },
      globalReach: {
        enabled: false,
        onPremCircuitResourceId: '',
        avsCircuitResourceId: '',
      },
      bastion: {
        enabled: true,
        sku: 'Standard',
        name: '',
        autoName: true,
      },
      firewall: {
        enabled: true,
        sku: 'Standard',
        name: '',
        autoName: true,
        policyName: '',
        threatIntelMode: 'Alert',
      },
    },

    ipAddressPlan: {
      avsBlock: '',
      onPremRanges: [],
      workloadVnetRanges: [],
      reservedRanges: [],
    },

    nsgs: [],
    routeTables: [],
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
        const validation = validateTopology(resource.config);
        return { config: resource.config, validation, updatedAt: resource.updatedAt };
      }
    } catch {
      // 404 or not found — return default
    }
  }

  const defaultConfig = getDefaultConfig();
  const validation = validateTopology(defaultConfig);
  return { config: defaultConfig, validation, updatedAt: null };
}

// ---------------------------------------------------------------------------
// Save config to Cosmos DB
// ---------------------------------------------------------------------------

export async function saveConfig(networkingConfig) {
  const validation = validateTopology(networkingConfig);

  const container = getContainer(config.cosmos.containers.appConfig);
  const doc = {
    id: CONFIG_KEY,
    configKey: CONFIG_KEY,
    config: networkingConfig,
    updatedAt: new Date().toISOString(),
  };

  if (container) {
    try {
      await container.items.upsert(doc);
    } catch (err) {
      console.error('[NetworkingConfig] Failed to save:', err.message);
      throw new Error('Failed to save networking configuration');
    }
  }

  return { config: networkingConfig, validation, updatedAt: doc.updatedAt };
}

// ---------------------------------------------------------------------------
// Topology validation
// ---------------------------------------------------------------------------

export function validateTopology(cfg) {
  const errors = [];
  const warnings = [];

  if (!cfg) {
    return { valid: false, errors: ['No configuration provided'], warnings: [] };
  }

  // Validate VNet address spaces
  if (!cfg.hubVnet?.addressSpaces?.length) {
    errors.push('Hub VNet must have at least one address space');
  } else {
    for (const space of cfg.hubVnet.addressSpaces) {
      const result = validateCidr(space);
      if (!result.valid) {
        errors.push(`VNet address space "${space}": ${result.errors.join(', ')}`);
      }
    }
  }

  // Validate subnets
  const enabledSubnets = (cfg.subnets || []).filter(s => s.enabled !== false);
  const subnetCidrs = [];

  for (const subnet of enabledSubnets) {
    if (!subnet.cidr) {
      errors.push(`Subnet "${subnet.name || subnet.purpose}" has no CIDR`);
      continue;
    }

    const result = validateCidr(subnet.cidr);
    if (!result.valid) {
      errors.push(`Subnet "${subnet.name || subnet.purpose}" CIDR "${subnet.cidr}": ${result.errors.join(', ')}`);
      continue;
    }

    // Check min prefix
    const minPrefix = subnet.minPrefix || getSubnetMinPrefix(subnet.purpose);
    if (result.parsed.prefix > minPrefix) {
      errors.push(
        `Subnet "${subnet.name || subnet.purpose}" has /${result.parsed.prefix} but minimum is /${minPrefix}`
      );
    }

    subnetCidrs.push(subnet.cidr);
  }

  // Subnet overlap check
  if (subnetCidrs.length > 1) {
    const overlapResult = validateNoOverlap(subnetCidrs);
    for (const overlap of overlapResult.overlaps) {
      errors.push(`Subnet overlap: ${overlap.a} overlaps with ${overlap.b}`);
    }
  }

  // Subnets must be within VNet
  if (cfg.hubVnet?.addressSpaces?.length && subnetCidrs.length) {
    const containResult = validateSubnetsInVnet(cfg.hubVnet.addressSpaces, subnetCidrs);
    for (const err of containResult.errors) {
      errors.push(err.error);
    }
  }

  // Connectivity checks
  const conn = cfg.connectivity || {};

  if (conn.expressRouteGateway?.enabled) {
    const hasGwSubnet = enabledSubnets.some(s => s.purpose === 'gateway');
    if (!hasGwSubnet) {
      errors.push('ExpressRoute Gateway requires a GatewaySubnet');
    }
  }

  if (conn.bastion?.enabled) {
    const hasBastionSubnet = enabledSubnets.some(s => s.purpose === 'bastion');
    if (!hasBastionSubnet) {
      errors.push('Azure Bastion requires an AzureBastionSubnet');
    }
  }

  if (conn.firewall?.enabled) {
    const hasFwSubnet = enabledSubnets.some(s => s.purpose === 'firewall' && s.enabled !== false);
    if (!hasFwSubnet) {
      errors.push('Azure Firewall requires an AzureFirewallSubnet (must be enabled)');
    }
  }

  if (conn.expressRouteConnection?.enabled && !conn.expressRouteGateway?.enabled) {
    warnings.push('ExpressRoute Connection is enabled but the gateway is not');
  }

  if (conn.globalReach?.enabled) {
    if (!conn.globalReach.onPremCircuitResourceId && !conn.globalReach.avsCircuitResourceId) {
      warnings.push('Global Reach is enabled but no circuit resource IDs are configured');
    }
  }

  // IP Plan validation
  const ipPlan = cfg.ipAddressPlan || {};
  if (ipPlan.avsBlock || ipPlan.onPremRanges?.length || ipPlan.workloadVnetRanges?.length) {
    const ipResult = validateIpPlan({
      avsBlock: ipPlan.avsBlock || null,
      onPremRanges: ipPlan.onPremRanges || [],
      hubVnetSpace: cfg.hubVnet?.addressSpaces?.[0] || null,
      workloadRanges: ipPlan.workloadVnetRanges || [],
    });

    for (const overlap of ipResult.overlaps) {
      errors.push(`IP Plan overlap: ${overlap.a.label} (${overlap.a.cidr}) overlaps with ${overlap.b.label} (${overlap.b.cidr})`);
    }
    for (const w of ipResult.avsWarnings) {
      errors.push(`AVS: ${w}`);
    }
  }

  // Utilization info
  let utilization = null;
  if (cfg.hubVnet?.addressSpaces?.length && subnetCidrs.length) {
    utilization = calculateUtilization(cfg.hubVnet.addressSpaces, subnetCidrs);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    utilization,
  };
}

// ---------------------------------------------------------------------------
// ARM Export Import
// ---------------------------------------------------------------------------

export function importFromArmExport(armJson) {
  const cfg = getDefaultConfig();
  const summary = {
    resourcesFound: 0,
    imported: [],
    skipped: [],
  };

  const resources = armJson.resources || [];

  for (const resource of resources) {
    const type = (resource.type || '').toLowerCase();
    summary.resourcesFound++;

    // VNet
    if (type === 'microsoft.network/virtualnetworks') {
      const addressPrefixes = resource.properties?.addressSpace?.addressPrefixes || [];
      cfg.hubVnet.name = resource.name || '';
      cfg.hubVnet.addressSpaces = addressPrefixes.length ? addressPrefixes : ['10.0.0.0/16'];
      cfg.hubVnet.autoName = false;
      cfg.region = resource.location || cfg.region;

      // Extract subnets
      const armSubnets = resource.properties?.subnets || [];
      if (armSubnets.length > 0) {
        cfg.subnets = armSubnets.map(s => {
          const subnetName = s.name || '';
          const cidr = s.properties?.addressPrefix || '';
          const purpose = detectSubnetPurpose(subnetName);
          return {
            id: randomUUID(),
            purpose,
            name: subnetName,
            cidr,
            fixedName: ['GatewaySubnet', 'AzureBastionSubnet', 'AzureFirewallSubnet'].includes(subnetName),
            minPrefix: getSubnetMinPrefix(purpose),
            autoName: false,
            nsg: !!s.properties?.networkSecurityGroup,
            routeTable: !!s.properties?.routeTable,
          };
        });
      }

      summary.imported.push(`VNet: ${resource.name} (${addressPrefixes.join(', ')})`);
      continue;
    }

    // NSG
    if (type === 'microsoft.network/networksecuritygroups') {
      const rules = (resource.properties?.securityRules || []).map(r => ({
        name: r.name,
        priority: r.properties?.priority,
        direction: r.properties?.direction,
        access: r.properties?.access,
        protocol: r.properties?.protocol,
        sourceAddressPrefix: r.properties?.sourceAddressPrefix,
        destinationAddressPrefix: r.properties?.destinationAddressPrefix,
        destinationPortRange: r.properties?.destinationPortRange,
      }));
      cfg.nsgs.push({ name: resource.name, rules });
      summary.imported.push(`NSG: ${resource.name} (${rules.length} rules)`);
      continue;
    }

    // Route Table
    if (type === 'microsoft.network/routetables') {
      const routes = (resource.properties?.routes || []).map(r => ({
        name: r.name,
        addressPrefix: r.properties?.addressPrefix,
        nextHopType: r.properties?.nextHopType,
        nextHopIpAddress: r.properties?.nextHopIpAddress,
      }));
      cfg.routeTables.push({ name: resource.name, routes });
      summary.imported.push(`Route Table: ${resource.name} (${routes.length} routes)`);
      continue;
    }

    // Virtual Network Gateway (ExpressRoute)
    if (type === 'microsoft.network/virtualnetworkgateways') {
      const gwType = resource.properties?.gatewayType || '';
      if (gwType.toLowerCase() === 'expressroute') {
        cfg.connectivity.expressRouteGateway.enabled = true;
        cfg.connectivity.expressRouteGateway.name = resource.name || '';
        cfg.connectivity.expressRouteGateway.autoName = false;
        const sku = resource.properties?.sku?.name || 'ErGw3AZ';
        cfg.connectivity.expressRouteGateway.sku = sku;
        summary.imported.push(`ER Gateway: ${resource.name} (${sku})`);
      }
      continue;
    }

    // Bastion
    if (type === 'microsoft.network/bastionhosts') {
      cfg.connectivity.bastion.enabled = true;
      cfg.connectivity.bastion.name = resource.name || '';
      cfg.connectivity.bastion.autoName = false;
      cfg.connectivity.bastion.sku = resource.properties?.sku?.name || resource.sku?.name || 'Standard';
      summary.imported.push(`Bastion: ${resource.name}`);
      continue;
    }

    // Firewall
    if (type === 'microsoft.network/azurefirewalls') {
      cfg.connectivity.firewall.enabled = true;
      cfg.connectivity.firewall.name = resource.name || '';
      cfg.connectivity.firewall.autoName = false;
      cfg.connectivity.firewall.sku = resource.properties?.sku?.tier || 'Standard';
      cfg.connectivity.firewall.threatIntelMode = resource.properties?.threatIntelMode || 'Alert';
      // Extract policy reference
      if (resource.properties?.firewallPolicy?.id) {
        const policyId = resource.properties.firewallPolicy.id;
        cfg.connectivity.firewall.policyName = policyId.split('/').pop() || '';
      }
      summary.imported.push(`Firewall: ${resource.name} (${cfg.connectivity.firewall.sku})`);
      continue;
    }

    // ExpressRoute Circuit
    if (type === 'microsoft.network/expressroutecircuits') {
      cfg.connectivity.expressRouteCircuit.planNew = false;
      cfg.connectivity.expressRouteCircuit.name = resource.name || '';
      cfg.connectivity.expressRouteCircuit.autoName = false;
      cfg.connectivity.expressRouteCircuit.provider = resource.properties?.serviceProviderProperties?.serviceProviderName || '';
      cfg.connectivity.expressRouteCircuit.bandwidth = String(resource.properties?.serviceProviderProperties?.bandwidthInMbps || '');
      cfg.connectivity.expressRouteCircuit.peeringLocation = resource.properties?.serviceProviderProperties?.peeringLocation || '';
      cfg.connectivity.expressRouteCircuit.sku = resource.sku?.tier || 'Standard';
      summary.imported.push(`ER Circuit: ${resource.name}`);
      continue;
    }

    summary.skipped.push(`${resource.type}: ${resource.name || '(unnamed)'}`);
  }

  // Extract resource group from any resource ID
  if (resources.length > 0 && !cfg.resourceGroupName) {
    for (const r of resources) {
      if (r.id) {
        const rgMatch = r.id.match(/\/resourceGroups\/([^/]+)/i);
        if (rgMatch) {
          cfg.resourceGroupName = rgMatch[1];
          break;
        }
      }
    }
  }

  return { config: cfg, importSummary: summary };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectSubnetPurpose(name) {
  const lower = name.toLowerCase();
  if (lower === 'gatewaysubnet') return 'gateway';
  if (lower === 'azurebastionsubnet') return 'bastion';
  if (lower === 'azurefirewallsubnet') return 'firewall';
  if (lower.includes('compute')) return 'compute';
  if (lower.includes('mgmt') || lower.includes('management')) return 'management';
  return 'custom';
}

export default {
  getDefaultConfig,
  getConfig,
  saveConfig,
  validateTopology,
  importFromArmExport,
};
