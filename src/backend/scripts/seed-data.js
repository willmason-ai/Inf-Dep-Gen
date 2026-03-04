// ============================================================================
// Infrastructure Deployment Generator — Data Seed Script
// ============================================================================
// Reads server spec markdown files, parses them, and upserts to Cosmos DB.
// Also seeds guardrail rules.
//
// Usage: npm run seed
//        npm run seed -- --dry-run   (parse only, no Cosmos writes)
// ============================================================================

import { initializeDatabase, getContainer } from '../config/cosmos.js';
import { parseAllSpecs } from '../services/spec-parser.js';
import config from '../config/index.js';

const isDryRun = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Guardrail rules to seed
// ---------------------------------------------------------------------------
const guardrailRules = [
  // BLOCKED
  { ruleId: 'G-BLK-001', category: 'BLOCKED', rule: 'No VM deletion', reason: 'VMs must never be deleted through this application' },
  { ruleId: 'G-BLK-002', category: 'BLOCKED', rule: 'No resource group deletion', reason: 'Resource groups must never be deleted' },
  { ruleId: 'G-BLK-003', category: 'BLOCKED', rule: 'No disk deletion', reason: 'Managed disks must never be deleted' },
  { ruleId: 'G-BLK-004', category: 'BLOCKED', rule: 'No VNet/subnet/NIC modification', reason: 'Network topology is managed externally' },
  { ruleId: 'G-BLK-005', category: 'BLOCKED', rule: 'No identity/RBAC changes', reason: 'The app cannot modify service principals, role assignments, or AAD objects' },
  { ruleId: 'G-BLK-006', category: 'BLOCKED', rule: 'No operations outside permitted RGs', reason: 'Only the allowlisted resource groups are accessible' },
  { ruleId: 'G-BLK-007', category: 'BLOCKED', rule: 'No public IP creation', reason: 'Public IPs cannot be created or assigned' },
  { ruleId: 'G-BLK-008', category: 'BLOCKED', rule: 'No storage account deletion', reason: 'Storage accounts cannot be deleted' },
  { ruleId: 'G-BLK-009', category: 'BLOCKED', rule: 'No snapshot deletion', reason: 'VM snapshots cannot be deleted' },
  { ruleId: 'G-BLK-010', category: 'BLOCKED', rule: 'No key vault operations', reason: 'Key Vault secrets, keys, and certificates cannot be modified' },
  { ruleId: 'G-BLK-011', category: 'BLOCKED', rule: 'No disk size decrease', reason: 'Disks can never be shrunk' },
  { ruleId: 'G-BLK-012', category: 'BLOCKED', rule: 'No LVM volume group removal', reason: 'Once created, VGs cannot be removed via this app' },
  { ruleId: 'G-BLK-013', category: 'BLOCKED', rule: 'No OS disk public access', reason: 'OS disks must be set to deny all network access' },
  // APPROVAL REQUIRED
  { ruleId: 'G-APR-001', category: 'APPROVAL_REQUIRED', rule: 'VM resize (SKU change)', approvalFlow: 'Display current vs proposed SKU, estimated downtime, cost impact → require confirmation' },
  { ruleId: 'G-APR-002', category: 'APPROVAL_REQUIRED', rule: 'VM power off', approvalFlow: 'Display VM name, current state, dependent services → require confirmation' },
  { ruleId: 'G-APR-003', category: 'APPROVAL_REQUIRED', rule: 'Disk resize (increase)', approvalFlow: 'Display current vs proposed size, cost impact → require confirmation' },
  { ruleId: 'G-APR-004', category: 'APPROVAL_REQUIRED', rule: 'Disk type change', approvalFlow: 'Display current vs proposed type, performance impact → require confirmation' },
  { ruleId: 'G-APR-005', category: 'APPROVAL_REQUIRED', rule: 'VM restart', approvalFlow: 'Display VM name, uptime, active connections → require confirmation' },
  { ruleId: 'G-APR-006', category: 'APPROVAL_REQUIRED', rule: 'Bulk operations (3+ VMs)', approvalFlow: 'List all affected VMs, require individual acknowledgment → require confirmation' },
  { ruleId: 'G-APR-007', category: 'APPROVAL_REQUIRED', rule: 'Add new data disk', approvalFlow: 'Must match spec, show VG assignment, LUN, IOPS/throughput/size → require confirmation' },
  { ruleId: 'G-APR-008', category: 'APPROVAL_REQUIRED', rule: 'ARM template deployment', approvalFlow: 'Display full template diff, affected resources, cost impact → require confirmation before deployment' },
  { ruleId: 'G-APR-009', category: 'APPROVAL_REQUIRED', rule: 'LVM script execution', approvalFlow: 'Display script, target server, VG/LV changes → require confirmation' },
  { ruleId: 'G-APR-010', category: 'APPROVAL_REQUIRED', rule: 'NSG rule modification', approvalFlow: 'Display current vs proposed rules, affected ports/IPs → require confirmation' },
  { ruleId: 'G-APR-011', category: 'APPROVAL_REQUIRED', rule: 'Tag changes', approvalFlow: 'Display current vs proposed tags → require confirmation' },
  // ALLOWED
  { ruleId: 'G-ALW-001', category: 'ALLOWED', rule: 'Read VM properties (SKU, status, disks, tags)' },
  { ruleId: 'G-ALW-002', category: 'ALLOWED', rule: 'Read resource group properties' },
  { ruleId: 'G-ALW-003', category: 'ALLOWED', rule: 'List VMs across permitted resource groups' },
  { ruleId: 'G-ALW-004', category: 'ALLOWED', rule: 'Query audit logs' },
  { ruleId: 'G-ALW-005', category: 'ALLOWED', rule: 'Query AI chat history' },
  { ruleId: 'G-ALW-006', category: 'ALLOWED', rule: 'Read server specification documents' },
  { ruleId: 'G-ALW-007', category: 'ALLOWED', rule: 'VM power on (starting a stopped VM)' },
  { ruleId: 'G-ALW-008', category: 'ALLOWED', rule: 'Generate ARM template preview (read-only)' },
  { ruleId: 'G-ALW-009', category: 'ALLOWED', rule: 'Generate LVM script preview (read-only)' },
  { ruleId: 'G-ALW-010', category: 'ALLOWED', rule: 'Run validation checks (spec vs. actual state comparison)' },
  { ruleId: 'G-ALW-011', category: 'ALLOWED', rule: 'Read NSG rules' },
  { ruleId: 'G-ALW-012', category: 'ALLOWED', rule: 'Read tags' },
];

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------
async function upsertDocuments(containerName, documents, partitionKeyField) {
  const container = getContainer(containerName);
  if (!container) {
    console.log(`  [DryRun] Would upsert ${documents.length} documents to ${containerName}`);
    return;
  }

  let success = 0;
  let errors = 0;
  for (const doc of documents) {
    try {
      // Ensure document has an id
      if (!doc.id) {
        doc.id = doc[partitionKeyField] || crypto.randomUUID();
      }
      await container.items.upsert(doc);
      success++;
    } catch (error) {
      console.error(`  Error upserting ${doc.id || 'unknown'}:`, error.message);
      errors++;
    }
  }
  console.log(`  ${containerName}: ${success} upserted, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------
async function seed() {
  console.log('==============================================');
  console.log(' Infrastructure Deployment Generator — Data Seed');
  console.log('==============================================');
  console.log(`  Environment: ${config.environment}`);
  console.log(`  Dry Run    : ${isDryRun}`);
  console.log('');

  // Initialize Cosmos DB (unless dry run)
  if (!isDryRun) {
    try {
      const ready = await initializeDatabase();
      if (!ready) {
        console.warn('[Seed] No Cosmos DB credentials — switching to dry-run mode');
        console.log('');
      }
    } catch (error) {
      console.error('[Seed] Cosmos DB initialization failed:', error.message);
      console.warn('[Seed] Switching to dry-run mode');
      console.log('');
    }
  }

  // Step 1: Parse server specs
  console.log('[1/2] Parsing server specification files...');
  const specs = await parseAllSpecs();
  console.log(`  Found ${specs.length} server specifications:`);
  for (const spec of specs) {
    const diskCount = spec.volumeGroups
      ? spec.volumeGroups.reduce((s, vg) => s + (vg.diskCount || 0), 0)
      : spec.diskGroups
        ? spec.diskGroups.reduce((s, dg) => s + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
        : 0;
    console.log(`    ${spec.hostname.padEnd(16)} ${spec.serverType.toUpperCase().padEnd(4)} ${spec.sku.padEnd(24)} ${diskCount} data disks`);
  }
  console.log('');

  // Step 2: Seed server specs
  console.log('[2/2] Seeding server specifications and guardrail rules...');
  await upsertDocuments('serverSpecs', specs, 'hostname');

  // Seed guardrail rules
  const guardrailDocs = guardrailRules.map(r => ({ ...r, id: r.ruleId }));
  await upsertDocuments('guardrailRules', guardrailDocs, 'ruleId');

  console.log('');
  console.log('==============================================');
  console.log(' Seed Complete');
  console.log('==============================================');
  console.log(`  Server Specs     : ${specs.length}`);
  console.log(`  Guardrail Rules  : ${guardrailRules.length}`);
  console.log('');

  // In dry-run mode, output a sample spec as JSON
  if (isDryRun && specs.length > 0) {
    console.log('--- Sample Parsed Spec ---');
    const sample = specs[0];
    if (sample) {
      console.log('\nSample:', JSON.stringify(sample, null, 2));
    }
  }
}

seed().catch(err => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
