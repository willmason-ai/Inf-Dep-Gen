// ============================================================================
// Tag Generator Tests
// ============================================================================
// Validates tag script generation for all managed servers.
// Checks that disk names match ARM generator output.
// ============================================================================

import { parseAllSpecs } from '../../src/backend/services/spec-parser.js';
import { generateTagScript } from '../../src/backend/services/tag-generator.js';
import { generateArmTemplate } from '../../src/backend/services/arm-generator.js';

let specs;

beforeAll(async () => {
  specs = await parseAllSpecs();
});

describe('Tag Generator', () => {
  test('generates tag script for each server', () => {
    for (const spec of specs) {
      const result = generateTagScript(spec);
      expect(result.script).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.script).toContain('Update-AzTag');
    }
  });

  test('tags VM, NIC, and OS disk', () => {
    for (const spec of specs) {
      const result = generateTagScript(spec);
      expect(result.script).toContain('Tag the Virtual Machine');
      expect(result.script).toContain('Tag the Network Interface');
      expect(result.script).toContain('Tag OS Disk');
    }
  });

  test('uses Update-AzTag -Operation Merge', () => {
    for (const spec of specs) {
      const result = generateTagScript(spec);
      expect(result.script).toContain('-Operation Merge');
    }
  });

  test('disk names in tag script match ARM template', () => {
    for (const spec of specs) {
      const armResult = generateArmTemplate(spec);
      const tagResult = generateTagScript(spec);

      const armDiskNames = armResult.template.resources
        .filter(r => r.type === 'Microsoft.Compute/disks')
        .map(r => r.name);

      const diskNameMatches = tagResult.script.match(/DiskName "([^"]+)"/g) || [];
      const tagDiskNames = diskNameMatches.map(m => m.match(/"([^"]+)"/)[1]);

      for (const diskName of tagDiskNames) {
        expect(armDiskNames).toContain(diskName);
      }

      expect(tagDiskNames.length).toBe(armDiskNames.length);
    }
  });

  test('data disk count matches spec', () => {
    for (const spec of specs) {
      const result = generateTagScript(spec);
      const expectedDisks = spec.volumeGroups
        ? spec.volumeGroups.reduce((sum, vg) => sum + (typeof vg.diskCount === 'number' ? vg.diskCount : 0), 0)
        : spec.diskGroups
          ? spec.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
          : 0;
      expect(result.summary.totalDataDisks).toBe(expectedDisks);
    }
  });

  test('total resources tagged = VM + NIC + OS disk + data disks', () => {
    for (const spec of specs) {
      const result = generateTagScript(spec);
      expect(result.summary.totalResourcesTagged).toBe(result.summary.totalDataDisks + 3);
    }
  });
});
