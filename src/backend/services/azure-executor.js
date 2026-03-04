// ============================================================================
// Infrastructure Deployment Generator — Azure Execution Service
// ============================================================================
// Executes approved infrastructure operations against Azure via ARM SDK.
// All operations validate resource groups, use Incremental deployment mode,
// and log to the audit trail.
// ============================================================================

import { ClientSecretCredential } from '@azure/identity';
import { ResourceManagementClient } from '@azure/arm-resources';
import { ComputeManagementClient } from '@azure/arm-compute';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Credential & client initialization
// ---------------------------------------------------------------------------
let credential = null;
let resourceClient = null;
let computeClient = null;

function getCredential() {
  if (!credential) {
    const { tenantId, clientId, clientSecret } = config.azure;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials not configured.');
    }
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return credential;
}

function getResourceClient() {
  if (!resourceClient) {
    const { subscriptionId } = config.azure;
    if (!subscriptionId) throw new Error('AZURE_SUBSCRIPTION_ID not configured.');
    resourceClient = new ResourceManagementClient(getCredential(), subscriptionId);
  }
  return resourceClient;
}

function getComputeClient() {
  if (!computeClient) {
    const { subscriptionId } = config.azure;
    if (!subscriptionId) throw new Error('AZURE_SUBSCRIPTION_ID not configured.');
    computeClient = new ComputeManagementClient(getCredential(), subscriptionId);
  }
  return computeClient;
}

// ---------------------------------------------------------------------------
// Resource group validation
// ---------------------------------------------------------------------------
function validateResourceGroup(rg) {
  if (!rg) throw new Error('Resource group is required');
  const permitted = config.permittedResourceGroups || [];
  if (!permitted.some(p => p.toLowerCase() === rg.toLowerCase())) {
    throw new Error(`Resource group "${rg}" is not in the permitted list.`);
  }
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------
async function logAudit(action, details, result) {
  const entry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    action,
    details,
    result: result.success ? 'SUCCESS' : 'FAILED',
    error: result.error || undefined,
    environment: config.environment,
  };

  const container = getContainer(config.cosmos.containers.auditLog);
  if (container) {
    try {
      await container.items.upsert(entry);
    } catch (err) {
      console.warn('[AzureExecutor] Failed to write audit log:', err.message);
    }
  }
  console.log(`[AzureExecutor] ${entry.result}: ${action} — ${JSON.stringify(details)}`);
}

// ---------------------------------------------------------------------------
// Deploy ARM template (Incremental mode — never Complete)
// ---------------------------------------------------------------------------
export async function deployArmTemplate(resourceGroup, deploymentName, template, parameters = {}) {
  validateResourceGroup(resourceGroup);

  const client = getResourceClient();
  const deployment = {
    properties: {
      mode: 'Incremental',
      template,
      parameters,
    },
  };

  try {
    const result = await client.deployments.beginCreateOrUpdateAndWait(
      resourceGroup,
      deploymentName,
      deployment,
    );

    const auditResult = { success: true, provisioningState: result.properties?.provisioningState };
    await logAudit('deploy_arm_template', { resourceGroup, deploymentName }, auditResult);

    return {
      success: true,
      deploymentName,
      resourceGroup,
      provisioningState: result.properties?.provisioningState,
      outputs: result.properties?.outputs,
    };
  } catch (error) {
    const auditResult = { success: false, error: error.message };
    await logAudit('deploy_arm_template', { resourceGroup, deploymentName }, auditResult);

    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
}

// ---------------------------------------------------------------------------
// Apply tags to a VM and its resources
// ---------------------------------------------------------------------------
export async function applyTags(resourceGroup, vmName, tags) {
  validateResourceGroup(resourceGroup);

  const client = getResourceClient();
  const subscriptionId = config.azure.subscriptionId;

  try {
    // Tag the VM
    const vmResourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}`;
    await client.tags.beginCreateOrUpdateAtScopeAndWait(vmResourceId, {
      properties: { tags },
    });

    const auditResult = { success: true };
    await logAudit('apply_tags', { resourceGroup, vmName, tagCount: Object.keys(tags).length }, auditResult);

    return {
      success: true,
      vmName,
      resourceGroup,
      tagsApplied: Object.keys(tags).length,
    };
  } catch (error) {
    const auditResult = { success: false, error: error.message };
    await logAudit('apply_tags', { resourceGroup, vmName }, auditResult);

    return {
      success: false,
      error: error.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Resize a VM (requires deallocate → resize → start)
// ---------------------------------------------------------------------------
export async function resizeVm(resourceGroup, vmName, newSize) {
  validateResourceGroup(resourceGroup);

  const client = getComputeClient();

  try {
    // Get current VM
    const vm = await client.virtualMachines.get(resourceGroup, vmName);
    const currentSize = vm.hardwareProfile?.vmSize;

    if (currentSize === newSize) {
      return { success: true, message: `VM ${vmName} is already size ${newSize}`, noChange: true };
    }

    // Deallocate
    await client.virtualMachines.beginDeallocateAndWait(resourceGroup, vmName);

    // Update size
    vm.hardwareProfile.vmSize = newSize;
    await client.virtualMachines.beginCreateOrUpdateAndWait(resourceGroup, vmName, vm);

    // Start
    await client.virtualMachines.beginStartAndWait(resourceGroup, vmName);

    const auditResult = { success: true, previousSize: currentSize, newSize };
    await logAudit('resize_vm', { resourceGroup, vmName, previousSize: currentSize, newSize }, auditResult);

    return {
      success: true,
      vmName,
      previousSize: currentSize,
      newSize,
      message: `VM resized from ${currentSize} to ${newSize} and restarted`,
    };
  } catch (error) {
    const auditResult = { success: false, error: error.message };
    await logAudit('resize_vm', { resourceGroup, vmName, newSize }, auditResult);

    return {
      success: false,
      error: error.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Add a data disk to a VM
// ---------------------------------------------------------------------------
export async function addDisk(resourceGroup, vmName, diskName, diskSizeGB, diskSku = 'PremiumV2_LRS', lun, iops, throughputMBps) {
  validateResourceGroup(resourceGroup);

  const compute = getComputeClient();

  try {
    // Create the managed disk
    const diskParams = {
      location: 'eastus2', // Will be overridden by caller
      sku: { name: diskSku },
      properties: {
        creationData: { createOption: 'Empty' },
        diskSizeGB,
      },
    };
    if (iops) diskParams.properties.diskIOPSReadWrite = iops;
    if (throughputMBps) diskParams.properties.diskMBpsReadWrite = throughputMBps;

    await compute.disks.beginCreateOrUpdateAndWait(resourceGroup, diskName, diskParams);

    // Attach to VM
    const vm = await compute.virtualMachines.get(resourceGroup, vmName);
    const dataDisks = vm.storageProfile.dataDisks || [];
    const subscriptionId = config.azure.subscriptionId;

    dataDisks.push({
      lun,
      name: diskName,
      createOption: 'Attach',
      caching: 'None',
      managedDisk: {
        id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/disks/${diskName}`,
      },
    });

    vm.storageProfile.dataDisks = dataDisks;
    await compute.virtualMachines.beginCreateOrUpdateAndWait(resourceGroup, vmName, vm);

    const auditResult = { success: true };
    await logAudit('add_disk', { resourceGroup, vmName, diskName, diskSizeGB, lun }, auditResult);

    return {
      success: true,
      vmName,
      diskName,
      diskSizeGB,
      lun,
    };
  } catch (error) {
    const auditResult = { success: false, error: error.message };
    await logAudit('add_disk', { resourceGroup, vmName, diskName }, auditResult);

    return {
      success: false,
      error: error.message,
    };
  }
}

export default { deployArmTemplate, applyTags, resizeVm, addDisk };
