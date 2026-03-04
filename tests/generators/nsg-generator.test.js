// ============================================================================
// NSG Generator Tests
// ============================================================================
// Validates NSG rule generation for all managed servers.
// ============================================================================

import { parseAllSpecs } from '../../src/backend/services/spec-parser.js';
import { generateNsgRules } from '../../src/backend/services/nsg-generator.js';

let specs;

beforeAll(async () => {
  specs = await parseAllSpecs();
});

describe('NSG Generator', () => {
  test('generates NSG rules for each server', () => {
    for (const spec of specs) {
      const result = generateNsgRules(spec);
      expect(result.template).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.template.$schema).toContain('deploymentTemplate.json');
    }
  });

  test('NSG name follows hostname-nsg pattern', () => {
    for (const spec of specs) {
      const result = generateNsgRules(spec);
      expect(result.summary.nsgName).toBe(`${spec.hostname}-nsg`);
    }
  });

  test('ODB servers have SSH and Oracle rules', () => {
    const odbSpecs = specs.filter(s => s.serverType === 'odb');
    for (const spec of odbSpecs) {
      const result = generateNsgRules(spec);
      const ruleNames = result.summary.rules.map(r => r.name);
      expect(ruleNames).toContain('Allow-SSH-VNet');
      expect(ruleNames).toContain('Allow-Oracle-VNet');
    }
  });

  test('SQL servers have RDP and SQL rules', () => {
    const sqlSpecs = specs.filter(s => s.serverType === 'sql');
    for (const spec of sqlSpecs) {
      const result = generateNsgRules(spec);
      const ruleNames = result.summary.rules.map(r => r.name);
      expect(ruleNames).toContain('Allow-RDP-VNet');
      expect(ruleNames).toContain('Allow-SQL-VNet');
    }
  });

  test('all servers have Deny-All-Inbound-Public rule', () => {
    for (const spec of specs) {
      const result = generateNsgRules(spec);
      const denyRule = result.summary.rules.find(r => r.name === 'Deny-All-Inbound-Public');
      expect(denyRule).toBeDefined();
      expect(denyRule.access).toBe('Deny');
      expect(denyRule.priority).toBe(4096);
    }
  });

  test('all servers have VNet inbound allow rule', () => {
    for (const spec of specs) {
      const result = generateNsgRules(spec);
      const vnetRule = result.summary.rules.find(r => r.name === 'Allow-VNet-Inbound');
      expect(vnetRule).toBeDefined();
      expect(vnetRule.access).toBe('Allow');
    }
  });

  test('NSG template has outputs with resource ID', () => {
    for (const spec of specs) {
      const result = generateNsgRules(spec);
      expect(result.template.outputs).toBeDefined();
      expect(result.template.outputs.nsgId).toBeDefined();
      expect(result.template.outputs.nsgId.value).toContain('networkSecurityGroups');
    }
  });

  test('correct region default for west US 2 servers', () => {
    const wus2Specs = specs.filter(s => s.regionCode === 'wus2');
    for (const spec of wus2Specs) {
      const result = generateNsgRules(spec);
      expect(result.summary.region).toBe('westus2');
    }
  });
});
