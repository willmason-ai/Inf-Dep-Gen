#!/usr/bin/env node
// ============================================================================
// Infrastructure Deployment Generator — Test Runner
// ============================================================================
// Simple test runner that validates all generators and AI tools.
// Run: node tests/run-tests.js
// ============================================================================

import { parseAllSpecs } from '../src/backend/services/spec-parser.js';
import { generateArmTemplate } from '../src/backend/services/arm-generator.js';
import { generateLvmScript } from '../src/backend/services/lvm-generator.js';
import { generateNsgRules } from '../src/backend/services/nsg-generator.js';
import { generateTagScript } from '../src/backend/services/tag-generator.js';
// NOTE: executeTool is dynamically imported to avoid pulling in Azure SDK at
// module load time, which hangs without credentials configured.

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(testName);
    console.log(`  FAIL: ${testName}`);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

async function run() {
  console.log('Loading specs...');
  const specs = await parseAllSpecs();
  const odbSpecs = specs.filter(s => s.serverType === 'odb');
  const sqlSpecs = specs.filter(s => s.serverType === 'sql');

  // ==========================================================================
  section('Spec Parser');
  // ==========================================================================

  assert(specs.length >= 2, `Parses at least 2 server specs (found ${specs.length})`);
  assert(odbSpecs.length >= 1, `Finds at least 1 ODB server (found ${odbSpecs.length})`);
  assert(sqlSpecs.length >= 1, `Finds at least 1 SQL server (found ${sqlSpecs.length})`);

  // ==========================================================================
  section('ARM Generator');
  // ==========================================================================

  for (const spec of specs) {
    const result = generateArmTemplate(spec);
    assert(result.template && result.template.$schema, `ARM template generated for ${spec.hostname}`);
    assert(result.template.variables.vmName === spec.hostname, `VM name correct for ${spec.hostname}`);

    // Check no public IPs
    assert(!JSON.stringify(result.template).includes('publicIPAddresses'), `No public IPs for ${spec.hostname}`);

    // Check data disk count
    const expectedDisks = spec.volumeGroups
      ? spec.volumeGroups.reduce((s, vg) => s + (typeof vg.diskCount === 'number' ? vg.diskCount : 0), 0)
      : spec.diskGroups
        ? spec.diskGroups.reduce((s, dg) => s + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
        : 0;
    assert(result.summary.totalDataDisks === expectedDisks, `Disk count correct for ${spec.hostname} (${result.summary.totalDataDisks}==${expectedDisks})`);

    // Region
    const expectedRegion = spec.regionCode === 'wus2' ? 'westus2' : 'eastus2';
    assert(result.summary.region === expectedRegion, `Region correct for ${spec.hostname}`);
  }

  // ODB images
  for (const spec of odbSpecs) {
    const vm = generateArmTemplate(spec).template.resources.find(r => r.type === 'Microsoft.Compute/virtualMachines');
    assert(vm.properties.storageProfile.imageReference.publisher === 'RedHat', `ODB ${spec.hostname} uses RedHat`);
  }

  // SQL images
  for (const spec of sqlSpecs) {
    const vm = generateArmTemplate(spec).template.resources.find(r => r.type === 'Microsoft.Compute/virtualMachines');
    assert(vm.properties.storageProfile.imageReference.publisher === 'MicrosoftWindowsServer', `SQL ${spec.hostname} uses Windows`);
  }

  // TBD warnings
  const tbdSpecs = specs.filter(s => (s.diskGroups || []).some(dg => typeof dg.diskCount !== 'number'));
  for (const spec of tbdSpecs) {
    const result = generateArmTemplate(spec);
    assert(result.warnings && result.warnings.length > 0, `TBD warning for ${spec.hostname}`);
  }

  // NSG reference
  const nsgResult = generateArmTemplate(specs[0], { nsgId: '/test/nsg' });
  const nic = nsgResult.template.resources.find(r => r.type === 'Microsoft.Network/networkInterfaces');
  assert(nic.properties.networkSecurityGroup !== undefined, 'NSG reference added to NIC');
  assert(nsgResult.summary.hasNsgReference === true, 'NSG reference flagged in summary');

  // ==========================================================================
  section('LVM Generator');
  // ==========================================================================

  for (const spec of odbSpecs) {
    const result = generateLvmScript(spec);
    if (result.error) {
      assert(result.error.includes('[env]vg') || result.error.includes('disk count'), `LVM error expected for ${spec.hostname}`);
    } else {
      assert(result.script.includes('#!/bin/bash'), `LVM script header for ${spec.hostname}`);
      assert(result.script.includes('vgcreate'), `LVM has vgcreate for ${spec.hostname}`);
      assert(result.script.includes('pvcreate'), `LVM has pvcreate for ${spec.hostname}`);
      assert(result.script.includes('id -u'), `LVM checks root for ${spec.hostname}`);
    }
  }

  // SQL rejection
  for (const spec of sqlSpecs) {
    assert(generateLvmScript(spec).error !== undefined, `LVM rejects SQL ${spec.hostname}`);
  }

  // Invalid VG name
  const badVg = generateLvmScript({
    hostname: 'TEST', serverType: 'odb', role: 'Test', os: 'RHEL-8',
    volumeGroups: [{ name: '[env]vg', diskCount: 2, sizeGB: 100, iops: 3000, throughputMBs: 125 }],
  });
  assert(badVg.error && badVg.error.includes('[env]vg'), 'Rejects [env]vg name');

  // TBD handling
  const tbdVg = generateLvmScript({
    hostname: 'TEST', serverType: 'odb', role: 'Test', os: 'RHEL-8',
    volumeGroups: [
      { name: 'goodvg', diskCount: 2, sizeGB: 100, iops: 3000, throughputMBs: 125 },
      { name: 'tbdvg', diskCount: 'TBD', sizeGB: 100, iops: 3000, throughputMBs: 125 },
    ],
  });
  assert(!tbdVg.error, 'TBD VG does not block whole script');
  assert(tbdVg.warnings && tbdVg.warnings.length > 0, 'TBD VG generates warning');

  // ==========================================================================
  section('NSG Generator');
  // ==========================================================================

  for (const spec of specs) {
    const result = generateNsgRules(spec);
    assert(result.summary.nsgName === `${spec.hostname}-nsg`, `NSG name correct for ${spec.hostname}`);
    assert(result.template.outputs.nsgId.value.includes('networkSecurityGroups'), `NSG output ID for ${spec.hostname}`);

    const rules = result.summary.rules.map(r => r.name);
    assert(rules.includes('Deny-All-Inbound-Public'), `NSG has deny rule for ${spec.hostname}`);
  }

  for (const spec of odbSpecs) {
    const rules = generateNsgRules(spec).summary.rules.map(r => r.name);
    assert(rules.includes('Allow-SSH-VNet'), `ODB ${spec.hostname} has SSH rule`);
  }
  for (const spec of sqlSpecs) {
    const rules = generateNsgRules(spec).summary.rules.map(r => r.name);
    assert(rules.includes('Allow-RDP-VNet'), `SQL ${spec.hostname} has RDP rule`);
  }

  // ==========================================================================
  section('Tag Generator');
  // ==========================================================================

  for (const spec of specs) {
    const result = generateTagScript(spec);
    assert(result.script.includes('Update-AzTag'), `Tag script has Update-AzTag for ${spec.hostname}`);
    assert(result.summary.totalResourcesTagged === result.summary.totalDataDisks + 3, `Tag count for ${spec.hostname}`);
  }

  // Disk name consistency between ARM and Tag generators
  for (const spec of specs) {
    const armDisks = generateArmTemplate(spec).template.resources
      .filter(r => r.type === 'Microsoft.Compute/disks').map(r => r.name);
    const tagScript = generateTagScript(spec).script;
    const tagDisks = (tagScript.match(/DiskName "([^"]+)"/g) || []).map(m => m.match(/"([^"]+)"/)[1]);
    assert(tagDisks.length === armDisks.length, `Disk count matches ARM↔Tag for ${spec.hostname}`);
    for (const d of tagDisks) {
      assert(armDisks.includes(d), `Tag disk "${d}" matches ARM for ${spec.hostname}`);
    }
  }

  // ==========================================================================
  section('Tool Executor');
  // ==========================================================================

  // Dynamic import to avoid pulling Azure SDK at module load time
  let executeTool;
  try {
    const mod = await import('../src/backend/services/ai/tool-executor.js');
    executeTool = mod.executeTool;
  } catch (err) {
    console.log(`  SKIP: Tool Executor tests (import failed: ${err.message})`);
    printSummary();
    return;
  }

  // Parameter validation
  const r1 = JSON.parse(await executeTool('get_server_spec', {}));
  assert(r1.error && r1.error.includes('Missing'), 'Rejects missing hostname');

  const r2 = JSON.parse(await executeTool('confirm_approval', { approval_id: 'x' }));
  assert(r2.error && r2.error.includes('Missing'), 'Rejects missing action');

  // Unknown tool
  const r3 = JSON.parse(await executeTool('fake_tool', {}));
  assert(r3.error && r3.error.includes('Unknown'), 'Rejects unknown tool');

  // list_all_servers
  const r4 = JSON.parse(await executeTool('list_all_servers', {}));
  assert(r4.count >= 2, `list_all_servers returns at least 2 (found ${r4.count})`);

  // refresh_specs
  const r7 = JSON.parse(await executeTool('refresh_specs', {}));
  assert(r7.serverCount >= 2, `refresh_specs reloads at least 2 (found ${r7.serverCount})`);

  // ==========================================================================
  // Summary
  // ==========================================================================
  printSummary();
}

function printSummary() {
  console.log('\n===========================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('===========================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
