// ============================================================================
// Infrastructure Deployment Generator — Tool Executor
// ============================================================================
// Dispatches Claude tool calls to the appropriate backend services.
// Returns results as JSON strings for the tool_result content block.
// ============================================================================

import { parseAllSpecs } from '../spec-parser.js';
import { generateArmTemplate } from '../arm-generator.js';
import { generateLvmScript } from '../lvm-generator.js';
import { generateNsgRules } from '../nsg-generator.js';
import { generateTagScript } from '../tag-generator.js';
// NOTE: azure-discovery.js and cosmos.js are lazy-imported to avoid pulling in
// @azure/identity at module load time, which hangs without Azure credentials.
import config from '../../config/index.js';

// ---------------------------------------------------------------------------
// Lazy loaders for Azure-dependent modules
// ---------------------------------------------------------------------------
let _azureDiscovery = null;
async function getAzureDiscovery() {
  if (!_azureDiscovery) {
    _azureDiscovery = await import('../azure-discovery.js');
  }
  return _azureDiscovery;
}

let _cosmosModule = null;
async function getCosmosModule() {
  if (!_cosmosModule) {
    _cosmosModule = await import('../../config/cosmos.js');
  }
  return _cosmosModule;
}

// Optional cache-clearing callback set by chat-service.js to avoid circular imports
let _chatServiceCacheClearer = null;
export function registerCacheClearer(fn) { _chatServiceCacheClearer = fn; }

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Spec cache with TTL
// ---------------------------------------------------------------------------
let specsCache = null;
let specsCacheAt = 0;

async function getSpecs() {
  const now = Date.now();
  if (!specsCache || (now - specsCacheAt) > CACHE_TTL_MS) {
    specsCache = await parseAllSpecs();
    specsCacheAt = now;
  }
  return specsCache;
}

async function getSpecByHostname(hostname) {
  const specs = await getSpecs();
  return specs.find(s => s.hostname.toLowerCase() === hostname.toLowerCase()) || null;
}

// ---------------------------------------------------------------------------
// Resource group validation (2D)
// ---------------------------------------------------------------------------
function validateResourceGroup(rg) {
  if (!rg) return null; // No RG specified — allowed
  const permitted = config.permittedResourceGroups || [];
  const isPermitted = permitted.some(p => p.toLowerCase() === rg.toLowerCase());
  if (!isPermitted) {
    return `Resource group "${rg}" is not in the permitted list. Allowed: ${permitted.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool parameter validation (2F)
// ---------------------------------------------------------------------------
const requiredParams = {
  get_server_spec: ['hostname'],
  generate_arm_template: ['hostname'],
  generate_lvm_script: ['hostname'],
  generate_nsg_rules: ['hostname'],
  generate_tag_script: ['hostname'],
  validate_server: ['hostname'],
  compare_spec_vs_actual: ['hostname'],
  deploy_arm_template: ['hostname'],
  apply_tags_to_server: ['hostname'],
  confirm_approval: ['approval_id', 'action'],
  get_avs_capacity: ['sku', 'node_count'],
  create_companion_vm: ['hostname', 'companionRole', 'os', 'sku'],
};

function validateParams(toolName, input) {
  const required = requiredParams[toolName];
  if (!required) return null;

  const missing = required.filter(p => !input || input[p] === undefined || input[p] === null || input[p] === '');
  if (missing.length > 0) {
    return `Missing required parameter(s): ${missing.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deficiency records — loaded from Cosmos DB with cache, hardcoded fallback
// ---------------------------------------------------------------------------
let deficiencyCache = null;
let deficiencyCacheAt = 0;
const DEFICIENCY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Hardcoded fallback — empty for generic deployments.
// Deficiencies are loaded from Cosmos DB when available, or seeded via seed-data.js.
const hardcodedDeficiencies = [];

async function getDeficiencies() {
  const now = Date.now();
  if (deficiencyCache && (now - deficiencyCacheAt) < DEFICIENCY_CACHE_TTL_MS) {
    return deficiencyCache;
  }

  // Try Cosmos DB first
  let container = null;
  try {
    const cosmos = await getCosmosModule();
    container = cosmos.getContainer(config.cosmos.containers.deficiencies);
  } catch { /* Cosmos not available */ }
  if (container) {
    try {
      const { resources } = await container.items
        .query('SELECT * FROM c')
        .fetchAll();
      if (resources.length > 0) {
        deficiencyCache = resources;
        deficiencyCacheAt = now;
        return deficiencyCache;
      }
    } catch (error) {
      console.warn('[ToolExecutor] Failed to load deficiencies from Cosmos DB:', error.message);
    }
  }

  // Fallback to hardcoded
  deficiencyCache = hardcodedDeficiencies;
  deficiencyCacheAt = now;
  return deficiencyCache;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------
const toolHandlers = {
  async list_all_servers() {
    const specs = await getSpecs();
    const servers = specs.map(s => ({
      hostname: s.hostname,
      role: s.role,
      serverType: s.serverType,
      os: s.os,
      sku: s.sku,
      currentSku: s.currentSku,
      skuDeficient: s.skuDeficient,
      region: s.region,
      totalDisks: s.volumeGroups
        ? s.volumeGroups.reduce((sum, vg) => sum + (vg.diskCount || 0), 0)
        : s.diskGroups
          ? s.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
          : 0,
      deficiencyCount: (s.deficiencies || []).length,
    }));
    return JSON.stringify({ count: servers.length, servers }, null, 2);
  },

  async get_server_spec({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }
    return JSON.stringify(spec, null, 2);
  },

  async generate_arm_template({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }
    const result = generateArmTemplate(spec);
    return JSON.stringify({
      summary: result.summary,
      template: result.template,
      warnings: result.warnings,
    }, null, 2);
  },

  async generate_lvm_script({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }
    const result = generateLvmScript(spec);
    if (result.error) {
      return JSON.stringify({ error: result.error });
    }
    return JSON.stringify({
      summary: result.summary,
      script: result.script,
      warnings: result.warnings,
    }, null, 2);
  },

  async generate_nsg_rules({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }
    const result = generateNsgRules(spec);
    return JSON.stringify({
      summary: result.summary,
      template: result.template,
    }, null, 2);
  },

  async generate_tag_script({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }
    const result = generateTagScript(spec);
    return JSON.stringify({
      summary: result.summary,
      script: result.script,
      warnings: result.warnings,
    }, null, 2);
  },

  async list_deficiencies({ hostname, category } = {}) {
    const deficiencyRecords = await getDeficiencies();
    let filtered = [...deficiencyRecords];

    if (hostname) {
      filtered = filtered.filter(d =>
        (d.hostname && d.hostname.toLowerCase().includes(hostname.toLowerCase())) ||
        (d.affectedServers && d.affectedServers.toLowerCase().includes(hostname.toLowerCase()))
      );
    }

    if (category) {
      filtered = filtered.filter(d =>
        d.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    return JSON.stringify({
      count: filtered.length,
      deficiencies: filtered,
    }, null, 2);
  },

  // -------------------------------------------------------------------------
  // Azure Environment Discovery Tools (with RG validation)
  // -------------------------------------------------------------------------

  async discover_vnets({ resource_group } = {}) {
    if (resource_group) {
      const err = validateResourceGroup(resource_group);
      if (err) return JSON.stringify({ error: err });
    }
    try {
      const { discoverVnets } = await getAzureDiscovery();
      const vnets = await discoverVnets(resource_group || null);
      return JSON.stringify({
        count: vnets.filter(v => !v.error).length,
        errors: vnets.filter(v => v.error).length,
        vnets,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Azure discovery failed',
        message: error.message,
        hint: 'Check that AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_SUBSCRIPTION_ID are configured.',
      });
    }
  },

  async discover_vms({ resource_group } = {}) {
    if (resource_group) {
      const err = validateResourceGroup(resource_group);
      if (err) return JSON.stringify({ error: err });
    }
    try {
      const { discoverVMs } = await getAzureDiscovery();
      const vms = await discoverVMs(resource_group || null);
      return JSON.stringify({
        count: vms.filter(v => !v.error).length,
        errors: vms.filter(v => v.error).length,
        vms,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Azure discovery failed',
        message: error.message,
        hint: 'Check that Azure service principal credentials are configured.',
      });
    }
  },

  async discover_disks({ resource_group } = {}) {
    if (resource_group) {
      const err = validateResourceGroup(resource_group);
      if (err) return JSON.stringify({ error: err });
    }
    try {
      const { discoverDisks } = await getAzureDiscovery();
      const disks = await discoverDisks(resource_group || null);
      return JSON.stringify({
        count: disks.filter(d => !d.error).length,
        errors: disks.filter(d => d.error).length,
        disks,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Azure discovery failed',
        message: error.message,
        hint: 'Check that Azure service principal credentials are configured.',
      });
    }
  },

  async discover_nsgs({ resource_group } = {}) {
    if (resource_group) {
      const err = validateResourceGroup(resource_group);
      if (err) return JSON.stringify({ error: err });
    }
    try {
      const { discoverNSGs } = await getAzureDiscovery();
      const nsgs = await discoverNSGs(resource_group || null);
      return JSON.stringify({
        count: nsgs.filter(n => !n.error).length,
        errors: nsgs.filter(n => n.error).length,
        nsgs,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Azure discovery failed',
        message: error.message,
        hint: 'Check that Azure service principal credentials are configured.',
      });
    }
  },

  async discover_nics({ resource_group } = {}) {
    if (resource_group) {
      const err = validateResourceGroup(resource_group);
      if (err) return JSON.stringify({ error: err });
    }
    try {
      const { discoverNICs } = await getAzureDiscovery();
      const nics = await discoverNICs(resource_group || null);
      return JSON.stringify({
        count: nics.filter(n => !n.error).length,
        errors: nics.filter(n => n.error).length,
        nics,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Azure discovery failed',
        message: error.message,
        hint: 'Check that Azure service principal credentials are configured.',
      });
    }
  },

  async discover_full_environment() {
    try {
      const { discoverFullEnvironment } = await getAzureDiscovery();
      const snapshot = await discoverFullEnvironment();
      return JSON.stringify(snapshot, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Full environment discovery failed',
        message: error.message,
        hint: 'Check that Azure service principal credentials are configured.',
      });
    }
  },

  async validate_server({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }

    const deficiencyRecords = await getDeficiencies();
    const issues = [];

    // Check SKU deficiency
    if (spec.skuDeficient) {
      issues.push({
        check: 'SKU Match',
        status: 'DEFICIENT',
        expected: spec.sku,
        actual: spec.currentSku,
        message: `VM SKU is ${spec.currentSku}, spec requires ${spec.sku}`,
      });
    } else {
      issues.push({
        check: 'SKU Match',
        status: 'OK',
        value: spec.sku,
      });
    }

    // Check for known deficiencies
    const serverDeficiencies = deficiencyRecords.filter(d =>
      (d.hostname && d.hostname.toLowerCase().includes(hostname.toLowerCase())) ||
      (d.affectedServers && d.affectedServers.toLowerCase().includes(hostname.toLowerCase()))
    );

    for (const def of serverDeficiencies) {
      issues.push({
        check: def.category,
        status: 'DEFICIENT',
        issueId: def.issueId,
        description: def.description || def.impact,
        priority: def.priority,
      });
    }

    // Check required tags (use spec-defined tags as the required set)
    const requiredTags = Object.keys(spec.tags || {});
    for (const tag of requiredTags) {
      if (spec.tags?.[tag]) {
        issues.push({ check: `Tag: ${tag}`, status: 'OK', value: spec.tags[tag] });
      } else {
        issues.push({ check: `Tag: ${tag}`, status: 'MISSING', message: `Required tag "${tag}" not defined in spec` });
      }
    }

    // Check disk configuration
    const totalDisks = spec.volumeGroups
      ? spec.volumeGroups.reduce((sum, vg) => sum + (vg.diskCount || 0), 0)
      : spec.diskGroups
        ? spec.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
        : 0;

    issues.push({
      check: 'Data Disk Count',
      status: totalDisks > 0 ? 'OK' : 'WARNING',
      value: totalDisks,
      message: totalDisks === 0 ? 'No data disks defined in spec' : undefined,
    });

    const passCount = issues.filter(i => i.status === 'OK').length;
    const failCount = issues.filter(i => i.status === 'DEFICIENT' || i.status === 'MISSING').length;
    const warnCount = issues.filter(i => i.status === 'WARNING').length;

    return JSON.stringify({
      hostname: spec.hostname,
      serverType: spec.serverType,
      overallStatus: failCount > 0 ? 'DEFICIENT' : warnCount > 0 ? 'WARNING' : 'COMPLIANT',
      summary: `${passCount} passed, ${failCount} failed, ${warnCount} warnings`,
      checks: issues,
    }, null, 2);
  },

  // -------------------------------------------------------------------------
  // compare_spec_vs_actual — Phase 3A (most important new tool)
  // -------------------------------------------------------------------------
  async compare_spec_vs_actual({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }

    const diff = {
      hostname: spec.hostname,
      serverType: spec.serverType,
      specRegion: spec.region,
      checks: [],
      discoveryErrors: [],
    };

    // Discover live state from Azure
    let liveVMs, liveDisks, liveNSGs, liveNICs;
    try {
      const azure = await getAzureDiscovery();
      [liveVMs, liveDisks, liveNSGs, liveNICs] = await Promise.all([
        azure.discoverVMs(),
        azure.discoverDisks(),
        azure.discoverNSGs(),
        azure.discoverNICs(),
      ]);
    } catch (error) {
      return JSON.stringify({
        error: 'Azure discovery failed during comparison',
        message: error.message,
        hint: 'Check Azure credentials. Spec data is still available via get_server_spec.',
      });
    }

    // Find the VM in live state
    const liveVM = liveVMs.find(v =>
      !v.error && v.name && v.name.toLowerCase() === hostname.toLowerCase()
    );

    if (!liveVM) {
      diff.checks.push({
        check: 'VM Exists',
        match: false,
        expected: hostname,
        actual: 'NOT FOUND',
        message: `VM ${hostname} was not found in any permitted resource group.`,
      });
      return JSON.stringify(diff, null, 2);
    }

    diff.checks.push({
      check: 'VM Exists',
      match: true,
      actual: `${liveVM.name} in ${liveVM.resourceGroup}`,
    });

    // SKU check
    const expectedSku = spec.sku;
    const actualSku = liveVM.vmSize;
    diff.checks.push({
      check: 'SKU',
      match: expectedSku === actualSku,
      expected: expectedSku,
      actual: actualSku,
      message: expectedSku !== actualSku ? `SKU mismatch: spec=${expectedSku}, actual=${actualSku}` : undefined,
    });

    // Region check
    const expectedRegion = spec.regionCode === 'wus2' ? 'westus2' : 'eastus2';
    diff.checks.push({
      check: 'Region',
      match: liveVM.location === expectedRegion,
      expected: expectedRegion,
      actual: liveVM.location,
    });

    // Disk count check
    const expectedDiskCount = spec.volumeGroups
      ? spec.volumeGroups.reduce((sum, vg) => sum + (typeof vg.diskCount === 'number' ? vg.diskCount : 0), 0)
      : spec.diskGroups
        ? spec.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
        : 0;
    const actualDiskCount = liveVM.dataDiskCount || 0;

    diff.checks.push({
      check: 'Data Disk Count',
      match: expectedDiskCount === actualDiskCount,
      expected: expectedDiskCount,
      actual: actualDiskCount,
      message: expectedDiskCount !== actualDiskCount
        ? `Expected ${expectedDiskCount} data disks, found ${actualDiskCount}`
        : undefined,
    });

    // Find attached disks and check sizes/IOPS
    const vmDisks = liveDisks.filter(d =>
      !d.error && d.attachedTo && d.attachedTo.toLowerCase() === hostname.toLowerCase()
    );

    // Check individual disk specs
    if (spec.serverType === 'odb' && spec.volumeGroups) {
      for (const vg of spec.volumeGroups) {
        if (typeof vg.diskCount !== 'number') continue;
        const vgDisks = vmDisks.filter(d =>
          d.tags?.VolumeGroup === vg.name ||
          (d.name && d.name.toLowerCase().includes(vg.name.toLowerCase()))
        );
        diff.checks.push({
          check: `VG ${vg.name} Disk Count`,
          match: vgDisks.length === vg.diskCount,
          expected: vg.diskCount,
          actual: vgDisks.length,
        });

        // Check disk sizes if disks exist
        for (const disk of vgDisks) {
          if (vg.sizeGB && disk.sizeGB !== vg.sizeGB) {
            diff.checks.push({
              check: `Disk ${disk.name} Size`,
              match: false,
              expected: `${vg.sizeGB} GB`,
              actual: `${disk.sizeGB} GB`,
            });
          }
        }
      }
    }

    if (spec.serverType === 'sql' && spec.diskGroups) {
      for (const dg of spec.diskGroups) {
        if (typeof dg.diskCount !== 'number') continue;
        const dgDisks = vmDisks.filter(d =>
          d.tags?.DiskPurpose === dg.purpose ||
          (d.name && d.name.toLowerCase().includes(dg.purpose.toLowerCase().replace(/\s+/g, '')))
        );
        diff.checks.push({
          check: `${dg.purpose} Disk Count`,
          match: dgDisks.length === dg.diskCount,
          expected: dg.diskCount,
          actual: dgDisks.length,
        });
      }
    }

    // Tag checks — use all tags from the spec as the required set
    const requiredTags = Object.keys(spec.tags || {});
    for (const tagName of requiredTags) {
      const expectedVal = spec.tags?.[tagName];
      const actualVal = liveVM.tags?.[tagName];
      diff.checks.push({
        check: `Tag: ${tagName}`,
        match: !!(expectedVal && actualVal && expectedVal === actualVal),
        expected: expectedVal || 'NOT IN SPEC',
        actual: actualVal || 'MISSING',
      });
    }

    // NSG check
    const liveNIC = liveNICs.find(n =>
      !n.error && n.attachedTo && n.attachedTo.toLowerCase() === hostname.toLowerCase()
    );
    const hasNSG = !!(liveNIC && liveNIC.nsg);
    diff.checks.push({
      check: 'NSG Attached',
      match: hasNSG,
      expected: `${hostname}-nsg`,
      actual: hasNSG ? liveNIC.nsg : 'NONE',
      message: !hasNSG ? 'No NSG attached to NIC — security risk' : undefined,
    });

    // OS disk public access check
    const osDisk = liveDisks.find(d =>
      !d.error && d.name === liveVM.osDiskName
    );
    if (osDisk) {
      const publicAccessDenied = osDisk.publicAccess === 'Disabled';
      diff.checks.push({
        check: 'OS Disk Public Access',
        match: publicAccessDenied,
        expected: 'Disabled',
        actual: osDisk.publicAccess || 'unknown',
        message: !publicAccessDenied ? 'OS disk has public access enabled — must be disabled per policy' : undefined,
      });
    }

    // Summary
    const matchCount = diff.checks.filter(c => c.match).length;
    const mismatchCount = diff.checks.filter(c => !c.match).length;
    diff.overallStatus = mismatchCount === 0 ? 'COMPLIANT' : 'DRIFT_DETECTED';
    diff.summary = `${matchCount} match, ${mismatchCount} mismatch out of ${diff.checks.length} checks`;

    return JSON.stringify(diff, null, 2);
  },

  // -------------------------------------------------------------------------
  // Execution tools (Phase 3D-3E)
  // -------------------------------------------------------------------------

  async deploy_arm_template({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }

    const result = generateArmTemplate(spec);

    // Don't execute directly — create approval request
    let approvalManager;
    try {
      approvalManager = await import('./approval-manager.js');
    } catch {
      return JSON.stringify({
        action: 'APPROVAL_REQUIRED',
        message: `ARM template generated for ${hostname}. Deployment requires human approval. Review the template and use the confirm_approval tool to approve.`,
        templateSummary: result.summary,
        warnings: result.warnings,
      }, null, 2);
    }

    const approval = await approvalManager.createApprovalRequest(
      'deploy_arm_template',
      {
        hostname,
        resourceGroup: spec.resourceGroup,
        templateSummary: result.summary,
        template: result.template,
      },
    );

    return JSON.stringify({
      action: 'APPROVAL_REQUIRED',
      approvalId: approval.id,
      message: `ARM template deployment for ${hostname} requires approval. Review the template summary and approve or reject.`,
      templateSummary: result.summary,
      warnings: result.warnings,
    }, null, 2);
  },

  async apply_tags_to_server({ hostname }) {
    const spec = await getSpecByHostname(hostname);
    if (!spec) {
      return JSON.stringify({ error: `No server spec found for hostname: ${hostname}` });
    }

    const result = generateTagScript(spec);

    let approvalManager;
    try {
      approvalManager = await import('./approval-manager.js');
    } catch {
      return JSON.stringify({
        action: 'APPROVAL_REQUIRED',
        message: `Tag script generated for ${hostname}. Tag application requires human approval.`,
        tagSummary: result.summary,
        warnings: result.warnings,
      }, null, 2);
    }

    const approval = await approvalManager.createApprovalRequest(
      'apply_tags',
      {
        hostname,
        resourceGroup: spec.resourceGroup,
        tagSummary: result.summary,
        tags: result.summary.standardTags,
      },
    );

    return JSON.stringify({
      action: 'APPROVAL_REQUIRED',
      approvalId: approval.id,
      message: `Tag application for ${hostname} requires approval. Review the tags and approve or reject.`,
      tagSummary: result.summary,
      warnings: result.warnings,
    }, null, 2);
  },

  async confirm_approval({ approval_id, action }) {
    let approvalManager;
    try {
      approvalManager = await import('./approval-manager.js');
    } catch {
      return JSON.stringify({ error: 'Approval system not available' });
    }

    if (action === 'approve') {
      const result = await approvalManager.approveRequest(approval_id);
      if (result.error) return JSON.stringify(result);

      // Execute the approved operation
      const execResult = await approvalManager.executeApproved(approval_id);
      return JSON.stringify(execResult, null, 2);
    }

    if (action === 'reject') {
      const result = await approvalManager.rejectRequest(approval_id);
      return JSON.stringify(result, null, 2);
    }

    if (action === 'status') {
      const result = await approvalManager.getApprovalStatus(approval_id);
      return JSON.stringify(result, null, 2);
    }

    return JSON.stringify({ error: `Unknown action: ${action}. Use "approve", "reject", or "status".` });
  },

  async update_avs_config(input) {
    let avsConfig;
    try {
      avsConfig = await import('../avs-config.js');
    } catch (error) {
      return JSON.stringify({ error: 'AVS config service not available', message: error.message });
    }

    const { config: existing } = await avsConfig.getConfig();
    const merged = deepMerge(existing, input);

    // Handle segments specially
    if (input.nsxtSegments) {
      const { randomUUID } = await import('crypto');
      merged.nsxtSegments = input.nsxtSegments.map(s => ({
        id: s.id || randomUUID(),
        name: s.name || '',
        cidr: s.cidr || '',
        gatewayAddress: s.gatewayAddress || '',
        dhcpEnabled: s.dhcpEnabled || false,
        dhcpRange: s.dhcpRange || '',
        dnsServers: s.dnsServers || [],
        tier1Gateway: s.tier1Gateway || 'default',
        autoName: s.autoName ?? false,
      }));
    }

    const result = await avsConfig.saveConfig(merged);
    return JSON.stringify({
      message: 'AVS configuration updated successfully',
      validation: result.validation,
      config: result.config,
    }, null, 2);
  },

  async get_avs_capacity({ sku, node_count }) {
    let avsConfig;
    try {
      avsConfig = await import('../avs-config.js');
    } catch (error) {
      return JSON.stringify({ error: 'AVS config service not available' });
    }
    const result = avsConfig.calculateCapacity(sku, node_count);
    return JSON.stringify(result, null, 2);
  },

  async create_companion_vm(input) {
    let companionVm;
    try {
      companionVm = await import('../companion-vm.js');
    } catch (error) {
      return JSON.stringify({ error: 'Companion VM service not available', message: error.message });
    }

    try {
      const spec = await companionVm.createCompanionSpec(input);
      return JSON.stringify({
        message: `Companion VM "${spec.hostname}" created successfully`,
        spec,
      }, null, 2);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },

  async list_available_subnets() {
    let companionVm;
    try {
      companionVm = await import('../companion-vm.js');
    } catch (error) {
      return JSON.stringify({ error: 'Companion VM service not available' });
    }
    const subnets = await companionVm.getAvailableSubnets();
    return JSON.stringify({ count: subnets.length, subnets }, null, 2);
  },

  async update_networking_config(input) {
    let networkingConfig;
    try {
      networkingConfig = await import('../networking-config.js');
    } catch (error) {
      return JSON.stringify({ error: 'Networking config service not available', message: error.message });
    }

    // Load existing config
    const { config: existing } = await networkingConfig.getConfig();

    // Deep merge provided fields into existing config
    const merged = deepMerge(existing, input);

    // Handle subnets specially — if provided, they replace (with IDs added)
    if (input.subnets) {
      const { randomUUID } = await import('crypto');
      merged.subnets = input.subnets.map(s => ({
        id: s.id || randomUUID(),
        purpose: s.purpose || 'custom',
        name: s.name || (s.purpose === 'gateway' ? 'GatewaySubnet' : s.purpose === 'bastion' ? 'AzureBastionSubnet' : s.purpose === 'firewall' ? 'AzureFirewallSubnet' : ''),
        cidr: s.cidr || '',
        fixedName: ['gateway', 'bastion', 'firewall'].includes(s.purpose),
        minPrefix: { gateway: 27, bastion: 26, firewall: 26 }[s.purpose] || 28,
        autoName: s.autoName ?? !['gateway', 'bastion', 'firewall'].includes(s.purpose),
        nsg: s.nsg ?? !['gateway', 'bastion', 'firewall'].includes(s.purpose),
        routeTable: s.routeTable ?? !['gateway', 'bastion', 'firewall'].includes(s.purpose),
        enabled: s.enabled !== false,
      }));
    }

    // Save and validate
    const result = await networkingConfig.saveConfig(merged);

    return JSON.stringify({
      message: 'Networking configuration updated successfully',
      validation: result.validation,
      config: result.config,
    }, null, 2);
  },

  async refresh_specs() {
    // Clear all caches
    specsCache = null;
    specsCacheAt = 0;
    deficiencyCache = null;
    deficiencyCacheAt = 0;

    // Chat-service has its own cache TTL and will refresh automatically.
    // We avoid importing chat-service.js here since it pulls in @anthropic-ai/sdk
    // which can block the event loop during ESM resolution.
    if (_chatServiceCacheClearer) _chatServiceCacheClearer();

    // Re-load
    const specs = await getSpecs();
    return JSON.stringify({
      message: 'All spec and deficiency caches cleared and reloaded.',
      serverCount: specs.length,
      servers: specs.map(s => s.hostname),
    }, null, 2);
  },

  async validate_all_servers() {
    const specs = await getSpecs();
    const deficiencyRecords = await getDeficiencies();
    const results = [];

    for (const spec of specs) {
      const issues = [];

      // SKU check
      if (spec.skuDeficient) {
        issues.push({ check: 'SKU', status: 'DEFICIENT', expected: spec.sku, actual: spec.currentSku });
      }

      // Deficiency check
      const serverDefs = deficiencyRecords.filter(d =>
        (d.hostname && d.hostname.toLowerCase().includes(spec.hostname.toLowerCase())) ||
        (d.affectedServers && d.affectedServers.toLowerCase().includes(spec.hostname.toLowerCase()))
      );
      if (serverDefs.length > 0) {
        issues.push(...serverDefs.map(d => ({
          check: d.category,
          status: 'DEFICIENT',
          issueId: d.issueId,
          description: d.description || d.impact,
        })));
      }

      // Tag check — use spec-defined tags
      const requiredTags = Object.keys(spec.tags || {});
      for (const tag of requiredTags) {
        if (!spec.tags?.[tag]) {
          issues.push({ check: `Tag: ${tag}`, status: 'MISSING' });
        }
      }

      // Disk check
      const totalDisks = spec.volumeGroups
        ? spec.volumeGroups.reduce((sum, vg) => sum + (typeof vg.diskCount === 'number' ? vg.diskCount : 0), 0)
        : spec.diskGroups
          ? spec.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
          : 0;
      if (totalDisks === 0) {
        issues.push({ check: 'Data Disks', status: 'WARNING', message: 'No data disks defined' });
      }

      const failCount = issues.filter(i => i.status === 'DEFICIENT' || i.status === 'MISSING').length;
      const warnCount = issues.filter(i => i.status === 'WARNING').length;

      results.push({
        hostname: spec.hostname,
        serverType: spec.serverType,
        status: failCount > 0 ? 'DEFICIENT' : warnCount > 0 ? 'WARNING' : 'COMPLIANT',
        issueCount: failCount,
        warningCount: warnCount,
        issues: issues.length > 0 ? issues : undefined,
      });
    }

    const compliant = results.filter(r => r.status === 'COMPLIANT').length;
    const deficient = results.filter(r => r.status === 'DEFICIENT').length;
    const warning = results.filter(r => r.status === 'WARNING').length;

    return JSON.stringify({
      summary: `${compliant} compliant, ${deficient} deficient, ${warning} warnings out of ${results.length} servers`,
      results,
    }, null, 2);
  },
};

// ---------------------------------------------------------------------------
// Execute a tool call (with parameter validation)
// ---------------------------------------------------------------------------
export async function executeTool(toolName, toolInput) {
  const handler = toolHandlers[toolName];
  if (!handler) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  // Parameter validation
  const paramError = validateParams(toolName, toolInput);
  if (paramError) {
    return JSON.stringify({ error: paramError, tool: toolName });
  }

  try {
    return await handler(toolInput || {});
  } catch (error) {
    console.error(`[ToolExecutor] Error executing ${toolName}:`, error.message);
    return JSON.stringify({ error: `Tool execution failed: ${error.message}` });
  }
}

// ---------------------------------------------------------------------------
// Deep merge utility (for networking config updates)
// ---------------------------------------------------------------------------
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export default { executeTool };
