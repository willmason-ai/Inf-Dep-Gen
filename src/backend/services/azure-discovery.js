// ============================================================================
// Infrastructure Deployment Generator — Azure Resource Discovery Service
// ============================================================================
// Queries live Azure environment using ARM SDKs to discover VNets, VMs, disks,
// NSGs, and NICs in permitted resource groups. Provides real-time state data
// for environment-aware AI planning and deployment operations.
// ============================================================================

import { ClientSecretCredential } from '@azure/identity';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Credential & client initialization
// ---------------------------------------------------------------------------
let credential = null;
let computeClient = null;
let networkClient = null;

function getCredential() {
  if (!credential) {
    const { tenantId, clientId, clientSecret } = config.azure;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.');
    }
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return credential;
}

function getComputeClient() {
  if (!computeClient) {
    const { subscriptionId } = config.azure;
    if (!subscriptionId) throw new Error('AZURE_SUBSCRIPTION_ID not configured.');
    computeClient = new ComputeManagementClient(getCredential(), subscriptionId);
  }
  return computeClient;
}

function getNetworkClient() {
  if (!networkClient) {
    const { subscriptionId } = config.azure;
    if (!subscriptionId) throw new Error('AZURE_SUBSCRIPTION_ID not configured.');
    networkClient = new NetworkManagementClient(getCredential(), subscriptionId);
  }
  return networkClient;
}

// ---------------------------------------------------------------------------
// Timeout helper — prevents hung SDK calls from blocking the app
// ---------------------------------------------------------------------------
async function collectPaged(iterableFn, timeoutMs = 20000) {
  const items = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const iterable = iterableFn();
    for await (const item of iterable) {
      items.push(item);
      if (controller.signal.aborted) break;
    }
  } finally {
    clearTimeout(timer);
  }
  return items;
}

function handleAzureError(err, rg) {
  const code = err.statusCode || err.code;
  if (code === 403 || err.code === 'AuthorizationFailed') {
    return { resourceGroup: rg, error: 'Access denied', message: err.message };
  }
  if (code === 404 || err.code === 'ResourceGroupNotFound') {
    return null; // skip silently
  }
  return { resourceGroup: rg, error: err.code || String(code) || 'Unknown', message: err.message };
}

// ---------------------------------------------------------------------------
// Resource group helpers
// ---------------------------------------------------------------------------

export function getDiscoverableResourceGroups() {
  const profile = config.profile;
  const rgs = new Set();
  if (profile.resourceGroups) {
    Object.values(profile.resourceGroups).forEach(rg => rgs.add(rg));
  }
  (config.permittedResourceGroups || []).forEach(rg => rgs.add(rg));
  return [...rgs];
}

// ---------------------------------------------------------------------------
// VNet Discovery
// ---------------------------------------------------------------------------
export async function discoverVnets(resourceGroup = null) {
  const client = getNetworkClient();
  const rgs = resourceGroup ? [resourceGroup] : getDiscoverableResourceGroups();
  const results = [];

  for (const rg of rgs) {
    try {
      const vnetList = await collectPaged(() => client.virtualNetworks.list(rg));
      for (const vnet of vnetList) {
        const subnets = (vnet.subnets || []).map(s => ({
          name: s.name,
          addressPrefix: s.addressPrefix,
          nsg: s.networkSecurityGroup ? s.networkSecurityGroup.id.split('/').pop() : null,
          privateEndpointPolicies: s.privateEndpointNetworkPolicies,
          ipAllocations: s.ipConfigurations ? s.ipConfigurations.length : 0,
        }));
        const peerings = (vnet.virtualNetworkPeerings || []).map(p => ({
          name: p.name,
          remoteVnet: p.remoteVirtualNetwork?.id?.split('/').pop() || 'unknown',
          remoteRg: extractResourceGroup(p.remoteVirtualNetwork?.id),
          state: p.peeringState,
        }));
        results.push({
          name: vnet.name,
          resourceGroup: rg,
          location: vnet.location,
          addressSpace: vnet.addressSpace?.addressPrefixes || [],
          subnets,
          peerings,
          provisioningState: vnet.provisioningState,
        });
      }
    } catch (err) {
      const errResult = handleAzureError(err, rg);
      if (errResult) results.push(errResult);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// VM Discovery
// ---------------------------------------------------------------------------
export async function discoverVMs(resourceGroup = null) {
  const client = getComputeClient();
  const rgs = resourceGroup ? [resourceGroup] : getDiscoverableResourceGroups();
  const results = [];

  for (const rg of rgs) {
    try {
      const vmList = await collectPaged(() => client.virtualMachines.list(rg));
      for (const vm of vmList) {
        let powerState = 'unknown';
        try {
          const iv = await client.virtualMachines.instanceView(rg, vm.name);
          const s = (iv.statuses || []).find(x => x.code?.startsWith('PowerState/'));
          powerState = s ? s.code.replace('PowerState/', '') : 'unknown';
        } catch { /* skip */ }

        const dataDisks = (vm.storageProfile?.dataDisks || []).map(d => ({
          name: d.name, lun: d.lun, sizeGB: d.diskSizeGB,
          caching: d.caching, storageType: d.managedDisk?.storageAccountType || 'unknown',
        }));
        const nics = (vm.networkProfile?.networkInterfaces || []).map(n => ({
          name: n.id?.split('/').pop(), primary: n.primary,
        }));
        results.push({
          name: vm.name, resourceGroup: rg, location: vm.location,
          vmSize: vm.hardwareProfile?.vmSize, powerState,
          os: vm.storageProfile?.osDisk?.osType || 'unknown',
          osDiskName: vm.storageProfile?.osDisk?.name,
          osDiskSizeGB: vm.storageProfile?.osDisk?.diskSizeGB,
          dataDisks, dataDiskCount: dataDisks.length, nics,
          tags: vm.tags || {}, provisioningState: vm.provisioningState,
        });
      }
    } catch (err) {
      const errResult = handleAzureError(err, rg);
      if (errResult) results.push(errResult);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Managed Disk Discovery
// ---------------------------------------------------------------------------
export async function discoverDisks(resourceGroup = null) {
  const client = getComputeClient();
  const rgs = resourceGroup ? [resourceGroup] : getDiscoverableResourceGroups();
  const results = [];

  for (const rg of rgs) {
    try {
      const diskList = await collectPaged(() => client.disks.listByResourceGroup(rg));
      for (const disk of diskList) {
        results.push({
          name: disk.name, resourceGroup: rg, location: disk.location,
          sizeGB: disk.diskSizeGB, sku: disk.sku?.name,
          osType: disk.osType || null, state: disk.diskState,
          attachedTo: disk.managedBy ? disk.managedBy.split('/').pop() : null,
          iops: disk.diskIOPSReadWrite || null,
          throughputMBps: disk.diskMBpsReadWrite || null,
          tags: disk.tags || {}, publicAccess: disk.publicNetworkAccess || 'unknown',
        });
      }
    } catch (err) {
      const errResult = handleAzureError(err, rg);
      if (errResult) results.push(errResult);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// NSG Discovery
// ---------------------------------------------------------------------------
export async function discoverNSGs(resourceGroup = null) {
  const client = getNetworkClient();
  const rgs = resourceGroup ? [resourceGroup] : getDiscoverableResourceGroups();
  const results = [];

  for (const rg of rgs) {
    try {
      const nsgList = await collectPaged(() => client.networkSecurityGroups.list(rg));
      for (const nsg of nsgList) {
        const rules = (nsg.securityRules || []).map(r => ({
          name: r.name, priority: r.priority, direction: r.direction,
          access: r.access, protocol: r.protocol,
          sourceAddress: r.sourceAddressPrefix || (r.sourceAddressPrefixes || []).join(', '),
          destAddress: r.destinationAddressPrefix || (r.destinationAddressPrefixes || []).join(', '),
          destPorts: r.destinationPortRange || (r.destinationPortRanges || []).join(', '),
        }));
        const associatedSubnets = (nsg.subnets || []).map(s => ({
          subnetName: s.id?.split('/').pop(),
          vnetName: extractVnetFromSubnetId(s.id),
        }));
        results.push({
          name: nsg.name, resourceGroup: rg, location: nsg.location,
          rules, ruleCount: rules.length, associatedSubnets,
          tags: nsg.tags || {}, provisioningState: nsg.provisioningState,
        });
      }
    } catch (err) {
      const errResult = handleAzureError(err, rg);
      if (errResult) results.push(errResult);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// NIC Discovery
// ---------------------------------------------------------------------------
export async function discoverNICs(resourceGroup = null) {
  const client = getNetworkClient();
  const rgs = resourceGroup ? [resourceGroup] : getDiscoverableResourceGroups();
  const results = [];

  for (const rg of rgs) {
    try {
      const nicList = await collectPaged(() => client.networkInterfaces.list(rg));
      for (const nic of nicList) {
        const ipConfigs = (nic.ipConfigurations || []).map(ip => ({
          name: ip.name, privateIP: ip.privateIPAddress,
          allocation: ip.privateIPAllocationMethod,
          subnet: ip.subnet?.id?.split('/').pop(),
          vnet: extractVnetFromSubnetId(ip.subnet?.id),
          primary: ip.primary,
        }));
        results.push({
          name: nic.name, resourceGroup: rg, location: nic.location,
          attachedTo: nic.virtualMachine ? nic.virtualMachine.id.split('/').pop() : null,
          ipConfigurations: ipConfigs,
          nsg: nic.networkSecurityGroup ? nic.networkSecurityGroup.id.split('/').pop() : null,
          acceleratedNetworking: nic.enableAcceleratedNetworking,
          tags: nic.tags || {},
        });
      }
    } catch (err) {
      const errResult = handleAzureError(err, rg);
      if (errResult) results.push(errResult);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Full Environment Snapshot
// ---------------------------------------------------------------------------
export async function discoverFullEnvironment() {
  const [vnets, vms, disks, nsgs, nics] = await Promise.all([
    discoverVnets(), discoverVMs(), discoverDisks(), discoverNSGs(), discoverNICs(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    environment: config.environment,
    discoveredResourceGroups: getDiscoverableResourceGroups(),
    summary: {
      vnetCount: vnets.filter(v => !v.error).length,
      vmCount: vms.filter(v => !v.error).length,
      diskCount: disks.filter(d => !d.error).length,
      nsgCount: nsgs.filter(n => !n.error).length,
      nicCount: nics.filter(n => !n.error).length,
    },
    vnets, vms, disks, nsgs, nics,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractResourceGroup(resourceId) {
  if (!resourceId) return null;
  const m = resourceId.match(/resourceGroups\/([^/]+)/i);
  return m ? m[1] : null;
}

function extractVnetFromSubnetId(subnetId) {
  if (!subnetId) return null;
  const m = subnetId.match(/virtualNetworks\/([^/]+)/i);
  return m ? m[1] : null;
}

export default {
  discoverVnets, discoverVMs, discoverDisks, discoverNSGs, discoverNICs,
  discoverFullEnvironment, getDiscoverableResourceGroups,
};
