// ============================================================================
// Infrastructure Deployment Generator — Approval Manager
// ============================================================================
// Manages approval workflow for infrastructure operations.
// All destructive/modifying operations must go through approval.
// Approvals are stored in Cosmos DB with 30-minute expiry.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { getContainer } from '../../config/cosmos.js';
import { deployArmTemplate, applyTags, resizeVm, addDisk } from '../azure-executor.js';
import config from '../../config/index.js';

const APPROVAL_TTL_MS = 30 * 60 * 1000; // 30 minutes
const inMemoryApprovals = new Map();

// ---------------------------------------------------------------------------
// Create an approval request
// ---------------------------------------------------------------------------
export async function createApprovalRequest(type, details, sessionId) {
  const id = `apr-${uuidv4().slice(0, 8)}`;
  const approval = {
    id,
    approvalId: id,
    type,
    details,
    sessionId: sessionId || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  };

  const container = getContainer(config.cosmos.containers.appConfig);
  if (container) {
    try {
      approval.configKey = `approval-${id}`;
      await container.items.upsert(approval);
      return approval;
    } catch (err) {
      console.warn('[ApprovalManager] Failed to save to Cosmos DB:', err.message);
    }
  }

  inMemoryApprovals.set(id, approval);
  return approval;
}

// ---------------------------------------------------------------------------
// Get an approval request
// ---------------------------------------------------------------------------
async function getApproval(id) {
  const container = getContainer(config.cosmos.containers.appConfig);
  if (container) {
    try {
      const { resource } = await container.item(`approval-${id}`, `approval-${id}`).read();
      if (resource) return resource;
    } catch { /* not found */ }
  }

  return inMemoryApprovals.get(id) || null;
}

// ---------------------------------------------------------------------------
// Update an approval request
// ---------------------------------------------------------------------------
async function updateApproval(approval) {
  const container = getContainer(config.cosmos.containers.appConfig);
  if (container) {
    try {
      await container.items.upsert(approval);
      return;
    } catch (err) {
      console.warn('[ApprovalManager] Failed to update in Cosmos DB:', err.message);
    }
  }
  inMemoryApprovals.set(approval.id, approval);
}

// ---------------------------------------------------------------------------
// Check if approval is expired
// ---------------------------------------------------------------------------
function isExpired(approval) {
  return new Date(approval.expiresAt) < new Date();
}

// ---------------------------------------------------------------------------
// Approve a request
// ---------------------------------------------------------------------------
export async function approveRequest(id) {
  const approval = await getApproval(id);
  if (!approval) return { error: `Approval request "${id}" not found` };
  if (isExpired(approval)) return { error: `Approval request "${id}" has expired (30-minute window)` };
  if (approval.status !== 'pending') return { error: `Approval "${id}" is already ${approval.status}` };

  approval.status = 'approved';
  approval.approvedAt = new Date().toISOString();
  await updateApproval(approval);

  return { success: true, id, status: 'approved', message: `Approval ${id} approved. Executing...` };
}

// ---------------------------------------------------------------------------
// Reject a request
// ---------------------------------------------------------------------------
export async function rejectRequest(id) {
  const approval = await getApproval(id);
  if (!approval) return { error: `Approval request "${id}" not found` };
  if (approval.status !== 'pending') return { error: `Approval "${id}" is already ${approval.status}` };

  approval.status = 'rejected';
  approval.rejectedAt = new Date().toISOString();
  await updateApproval(approval);

  return { success: true, id, status: 'rejected', message: `Approval ${id} rejected. No action taken.` };
}

// ---------------------------------------------------------------------------
// Get approval status
// ---------------------------------------------------------------------------
export async function getApprovalStatus(id) {
  const approval = await getApproval(id);
  if (!approval) return { error: `Approval request "${id}" not found` };

  return {
    id: approval.id,
    type: approval.type,
    status: isExpired(approval) && approval.status === 'pending' ? 'expired' : approval.status,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
    details: approval.details,
  };
}

// ---------------------------------------------------------------------------
// Execute an approved operation
// ---------------------------------------------------------------------------
export async function executeApproved(id) {
  const approval = await getApproval(id);
  if (!approval) return { error: `Approval request "${id}" not found` };
  if (approval.status !== 'approved') return { error: `Approval "${id}" is ${approval.status}, not approved` };
  if (isExpired(approval)) return { error: `Approval "${id}" has expired` };

  const { type, details } = approval;
  let result;

  try {
    switch (type) {
      case 'deploy_arm_template': {
        const deploymentName = `epic-${details.hostname.toLowerCase()}-${Date.now()}`;
        result = await deployArmTemplate(
          details.resourceGroup,
          deploymentName,
          details.template,
          details.parameters || {},
        );
        break;
      }

      case 'apply_tags': {
        result = await applyTags(
          details.resourceGroup,
          details.hostname,
          details.tags,
        );
        break;
      }

      case 'resize_vm': {
        result = await resizeVm(
          details.resourceGroup,
          details.hostname,
          details.newSize,
        );
        break;
      }

      case 'add_disk': {
        result = await addDisk(
          details.resourceGroup,
          details.hostname,
          details.diskName,
          details.diskSizeGB,
          details.diskSku,
          details.lun,
          details.iops,
          details.throughputMBps,
        );
        break;
      }

      default:
        result = { error: `Unknown operation type: ${type}` };
    }
  } catch (error) {
    result = { success: false, error: error.message };
  }

  // Update approval with execution result
  approval.status = result.success ? 'executed' : 'execution_failed';
  approval.executedAt = new Date().toISOString();
  approval.executionResult = result;
  await updateApproval(approval);

  return {
    approvalId: id,
    operationType: type,
    ...result,
  };
}

// ---------------------------------------------------------------------------
// List pending approvals
// ---------------------------------------------------------------------------
export async function listPendingApprovals() {
  const container = getContainer(config.cosmos.containers.appConfig);
  if (container) {
    try {
      const { resources } = await container.items
        .query("SELECT * FROM c WHERE STARTSWITH(c.configKey, 'approval-') AND c.status = 'pending'")
        .fetchAll();
      return resources.filter(r => !isExpired(r));
    } catch (err) {
      console.warn('[ApprovalManager] Failed to query Cosmos DB:', err.message);
    }
  }

  return Array.from(inMemoryApprovals.values())
    .filter(a => a.status === 'pending' && !isExpired(a));
}

export default {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  getApprovalStatus,
  executeApproved,
  listPendingApprovals,
};
