// ============================================================================
// Infrastructure Deployment Generator — Companion VM Service
// ============================================================================
// CRUD for companion VMs (jumpboxes, DNS forwarders, backup servers).
// Cross-references networking config for subnet data.
// ============================================================================

import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMPANION_ROLES = ['jumpbox', 'dns-forwarder', 'backup-server', 'utility'];

export const COMPANION_OS_OPTIONS = [
  { value: 'Ubuntu 22.04', label: 'Ubuntu 22.04 LTS' },
  { value: 'RHEL-8', label: 'Red Hat Enterprise Linux 8' },
  { value: 'Windows Server 2022', label: 'Windows Server 2022' },
];

export const COMPANION_SKU_OPTIONS = [
  { value: 'Standard_D2s_v5', label: 'D2s v5 (2 vCPU, 8 GB)', cores: 2, ramGB: 8 },
  { value: 'Standard_D4s_v5', label: 'D4s v5 (4 vCPU, 16 GB)', cores: 4, ramGB: 16 },
  { value: 'Standard_D8s_v5', label: 'D8s v5 (8 vCPU, 32 GB)', cores: 8, ramGB: 32 },
  { value: 'Standard_B2ms', label: 'B2ms (2 vCPU, 8 GB, burstable)', cores: 2, ramGB: 8 },
  { value: 'Standard_B4ms', label: 'B4ms (4 vCPU, 16 GB, burstable)', cores: 4, ramGB: 16 },
];

// ---------------------------------------------------------------------------
// Get available subnets from networking config
// ---------------------------------------------------------------------------

export async function getAvailableSubnets() {
  try {
    const { getConfig } = await import('./networking-config.js');
    const { config: netCfg } = await getConfig();
    if (!netCfg || !netCfg.subnets) return [];

    return netCfg.subnets
      .filter(s => ['compute', 'management', 'custom'].includes(s.purpose) && s.enabled !== false)
      .map(s => ({
        id: s.id,
        name: s.name || s.purpose,
        purpose: s.purpose,
        cidr: s.cidr,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Create companion VM spec
// ---------------------------------------------------------------------------

export async function createCompanionSpec(specData) {
  const {
    hostname,
    companionRole,
    os,
    sku,
    region = 'eastus2',
    subnetId,
    dependsOn = [],
    dependencyType = '',
    dataDisks = [],
    tags = {},
    notes = '',
  } = specData;

  if (!hostname) throw new Error('Hostname is required');
  if (!COMPANION_ROLES.includes(companionRole)) {
    throw new Error(`Invalid companion role. Must be one of: ${COMPANION_ROLES.join(', ')}`);
  }

  // Check for duplicate hostname
  const container = getContainer(config.cosmos.containers.serverSpecs);
  if (container) {
    try {
      const { resources } = await container.items
        .query({
          query: 'SELECT c.hostname FROM c WHERE c.hostname = @hostname',
          parameters: [{ name: '@hostname', value: hostname }],
        })
        .fetchAll();
      if (resources.length > 0) {
        throw new Error(`Server spec already exists for hostname: ${hostname}`);
      }
    } catch (err) {
      if (err.message.includes('already exists')) throw err;
    }
  }

  // Resolve subnet info
  let subnetName = '';
  let subnetCidr = '';
  if (subnetId) {
    const subnets = await getAvailableSubnets();
    const subnet = subnets.find(s => s.id === subnetId);
    if (subnet) {
      subnetName = subnet.name;
      subnetCidr = subnet.cidr;
    }
  }

  const spec = {
    id: hostname,
    hostname,
    serverType: 'companion',
    companionRole,
    os,
    sku,
    region,
    regionCode: region === 'westus2' ? 'wus2' : region === 'eastus2' ? 'eus2' : region.replace(/\s+/g, '').toLowerCase(),
    subnetId: subnetId || '',
    subnetName,
    subnetCidr,
    dependsOn,
    dependencyType,
    dataDisks,
    tags,
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (container) {
    try {
      await container.items.upsert(spec);
    } catch (err) {
      console.error('[CompanionVM] Failed to create:', err.message);
      throw new Error('Failed to create companion VM spec');
    }
  }

  return spec;
}

// ---------------------------------------------------------------------------
// Update companion VM spec
// ---------------------------------------------------------------------------

export async function updateCompanionSpec(hostname, updates) {
  const container = getContainer(config.cosmos.containers.serverSpecs);
  if (!container) throw new Error('Database not available');

  try {
    const { resource: existing } = await container.item(hostname, hostname).read();
    if (!existing) throw new Error(`No spec found for hostname: ${hostname}`);

    const updated = {
      ...existing,
      ...updates,
      hostname, // Don't allow hostname change
      updatedAt: new Date().toISOString(),
    };

    await container.items.upsert(updated);
    return updated;
  } catch (err) {
    if (err.code === 404) throw new Error(`No spec found for hostname: ${hostname}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Assign VM to subnet
// ---------------------------------------------------------------------------

export async function assignSubnet(hostname, subnetId) {
  const subnets = await getAvailableSubnets();
  const subnet = subnets.find(s => s.id === subnetId);
  if (!subnet) throw new Error(`Subnet ${subnetId} not found in networking config`);

  return updateCompanionSpec(hostname, {
    subnetId: subnet.id,
    subnetName: subnet.name,
    subnetCidr: subnet.cidr,
  });
}

// ---------------------------------------------------------------------------
// Get companion VMs
// ---------------------------------------------------------------------------

export async function getCompanionVMs() {
  const container = getContainer(config.cosmos.containers.serverSpecs);
  if (!container) return [];

  try {
    const { resources } = await container.items
      .query("SELECT * FROM c WHERE c.serverType = 'companion'")
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get dependency graph
// ---------------------------------------------------------------------------

export async function getDependencyGraph() {
  const companions = await getCompanionVMs();

  const graph = {
    jumpboxes: [],
    dnsForwarders: [],
    backupServers: [],
    utilities: [],
  };

  for (const vm of companions) {
    const entry = {
      hostname: vm.hostname,
      role: vm.companionRole,
      subnet: vm.subnetName,
      serves: vm.dependsOn || [],
      dependencyType: vm.dependencyType || '',
    };

    switch (vm.companionRole) {
      case 'jumpbox': graph.jumpboxes.push(entry); break;
      case 'dns-forwarder': graph.dnsForwarders.push(entry); break;
      case 'backup-server': graph.backupServers.push(entry); break;
      default: graph.utilities.push(entry);
    }
  }

  return graph;
}

export default {
  COMPANION_ROLES,
  COMPANION_OS_OPTIONS,
  COMPANION_SKU_OPTIONS,
  getAvailableSubnets,
  createCompanionSpec,
  updateCompanionSpec,
  assignSubnet,
  getCompanionVMs,
  getDependencyGraph,
};
