// ============================================================================
// ARM Generator Tests
// ============================================================================
// Validates ARM template generation for all managed servers.
// ============================================================================

import { parseAllSpecs } from '../../src/backend/services/spec-parser.js';
import { generateArmTemplate } from '../../src/backend/services/arm-generator.js';

let specs;

beforeAll(async () => {
  specs = await parseAllSpecs();
});

describe('ARM Generator', () => {
  test('parses server specs', () => {
    expect(specs.length).toBeGreaterThanOrEqual(2);
  });

  test('generates ARM template for each server', () => {
    for (const spec of specs) {
      const result = generateArmTemplate(spec);
      expect(result.template).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.template.$schema).toContain('deploymentTemplate.json');
      expect(result.template.contentVersion).toBe('1.0.0.0');
    }
  });

  test('each ARM template has correct VM name', () => {
    for (const spec of specs) {
      const result = generateArmTemplate(spec);
      expect(result.summary.hostname).toBe(spec.hostname);
      expect(result.template.variables.vmName).toBe(spec.hostname);
    }
  });

  test('ODB servers use RHEL image', () => {
    const odbSpecs = specs.filter(s => s.serverType === 'odb');
    expect(odbSpecs.length).toBeGreaterThan(0);

    for (const spec of odbSpecs) {
      const result = generateArmTemplate(spec);
      const vm = result.template.resources.find(r => r.type === 'Microsoft.Compute/virtualMachines');
      expect(vm.properties.storageProfile.imageReference.publisher).toBe('RedHat');
      expect(vm.properties.storageProfile.imageReference.sku).toBe('8-lvm-gen2');
    }
  });

  test('SQL servers use Windows Server 2022 image', () => {
    const sqlSpecs = specs.filter(s => s.serverType === 'sql');
    expect(sqlSpecs.length).toBeGreaterThan(0);

    for (const spec of sqlSpecs) {
      const result = generateArmTemplate(spec);
      const vm = result.template.resources.find(r => r.type === 'Microsoft.Compute/virtualMachines');
      expect(vm.properties.storageProfile.imageReference.publisher).toBe('MicrosoftWindowsServer');
      expect(vm.properties.storageProfile.imageReference.sku).toBe('2022-datacenter-g2');
    }
  });

  test('no templates have public IPs', () => {
    for (const spec of specs) {
      const result = generateArmTemplate(spec);
      const templateJson = JSON.stringify(result.template);
      expect(templateJson).not.toContain('Microsoft.Network/publicIPAddresses');
    }
  });

  test('data disk count matches spec for ODB servers', () => {
    const odbSpecs = specs.filter(s => s.serverType === 'odb');
    for (const spec of odbSpecs) {
      const result = generateArmTemplate(spec);
      const expectedDisks = (spec.volumeGroups || [])
        .reduce((sum, vg) => sum + (typeof vg.diskCount === 'number' ? vg.diskCount : 0), 0);
      expect(result.summary.totalDataDisks).toBe(expectedDisks);
    }
  });

  test('data disk count matches spec for SQL servers', () => {
    const sqlSpecs = specs.filter(s => s.serverType === 'sql');
    for (const spec of sqlSpecs) {
      const result = generateArmTemplate(spec);
      const expectedDisks = (spec.diskGroups || [])
        .reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0);
      expect(result.summary.totalDataDisks).toBe(expectedDisks);
    }
  });

  test('NSG reference is added when nsgId option provided', () => {
    const spec = specs[0];
    const result = generateArmTemplate(spec, { nsgId: '/subscriptions/xxx/resourceGroups/rg/providers/Microsoft.Network/networkSecurityGroups/test-nsg' });
    const nic = result.template.resources.find(r => r.type === 'Microsoft.Network/networkInterfaces');
    expect(nic.properties.networkSecurityGroup).toBeDefined();
    expect(result.summary.hasNsgReference).toBe(true);
  });

  test('west US 2 servers have correct region default', () => {
    const wus2Specs = specs.filter(s => s.regionCode === 'wus2');
    for (const spec of wus2Specs) {
      const result = generateArmTemplate(spec);
      expect(result.summary.region).toBe('westus2');
      expect(result.template.parameters.location.defaultValue).toBe('westus2');
    }
  });

  test('east US 2 servers have correct region default', () => {
    const eus2Specs = specs.filter(s => s.regionCode === 'eus2');
    for (const spec of eus2Specs) {
      const result = generateArmTemplate(spec);
      expect(result.summary.region).toBe('eastus2');
      expect(result.template.parameters.location.defaultValue).toBe('eastus2');
    }
  });
});
