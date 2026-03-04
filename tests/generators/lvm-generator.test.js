// ============================================================================
// LVM Generator Tests
// ============================================================================
// Validates LVM script generation for ODB servers.
// ============================================================================

import { parseAllSpecs } from '../../src/backend/services/spec-parser.js';
import { generateLvmScript } from '../../src/backend/services/lvm-generator.js';

let specs;
let odbSpecs;
let sqlSpecs;

beforeAll(async () => {
  specs = await parseAllSpecs();
  odbSpecs = specs.filter(s => s.serverType === 'odb');
  sqlSpecs = specs.filter(s => s.serverType === 'sql');
});

describe('LVM Generator', () => {
  test('finds ODB servers', () => {
    expect(odbSpecs.length).toBeGreaterThan(0);
  });

  test('generates LVM script for each ODB server', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) {
        expect(result.error).toContain('[env]vg');
      } else {
        expect(result.script).toBeDefined();
        expect(result.script).toContain('#!/bin/bash');
        expect(result.script).toContain('set -e');
        expect(result.summary).toBeDefined();
      }
    }
  });

  test('rejects SQL servers', () => {
    for (const spec of sqlSpecs) {
      const result = generateLvmScript(spec);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('ODB');
    }
  });

  test('VG names are valid (no brackets or spaces)', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) continue;

      for (const vg of result.summary.volumeGroups) {
        expect(vg.name).not.toMatch(/[\[\]\s]/);
        expect(vg.name).toMatch(/^[a-zA-Z0-9._-]+$/);
      }
    }
  });

  test('disk counts match spec for each VG', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) continue;

      const specTotalDisks = spec.volumeGroups
        .reduce((sum, vg) => sum + (typeof vg.diskCount === 'number' ? vg.diskCount : 0), 0);
      expect(result.summary.totalDisks).toBe(specTotalDisks);
    }
  });

  test('scripts check for root', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) continue;
      expect(result.script).toContain('id -u');
      expect(result.script).toContain('must be run as root');
    }
  });

  test('scripts use idempotent VG creation', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) continue;
      expect(result.script).toContain('vgs');
      expect(result.script).toContain('already exists');
      expect(result.script).toContain('vgcreate');
    }
  });

  test('scripts use idempotent PV creation', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) continue;
      expect(result.script).toContain('pvs');
      expect(result.script).toContain('pvcreate');
    }
  });

  test('scripts verify disk existence before creating', () => {
    for (const spec of odbSpecs) {
      const result = generateLvmScript(spec);
      if (result.error) continue;
      expect(result.script).toContain('! -b "$disk"');
    }
  });

  test('non-numeric diskCount generates warnings', () => {
    const mockSpec = {
      hostname: 'TEST-SERVER',
      serverType: 'odb',
      role: 'Test',
      os: 'RHEL-8',
      volumeGroups: [
        { name: 'testvg', diskCount: 2, sizeGB: 100, iops: 3000, throughputMBs: 125 },
        { name: 'tbdvg', diskCount: 'TBD', sizeGB: 100, iops: 3000, throughputMBs: 125 },
      ],
    };

    const result = generateLvmScript(mockSpec);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('tbdvg');
  });

  test('rejects specs where all VGs have invalid disk counts', () => {
    const mockSpec = {
      hostname: 'TEST-SERVER',
      serverType: 'odb',
      role: 'Test',
      os: 'RHEL-8',
      volumeGroups: [
        { name: 'testvg', diskCount: 'TBD', sizeGB: 100, iops: 3000, throughputMBs: 125 },
      ],
    };

    const result = generateLvmScript(mockSpec);
    expect(result.error).toBeDefined();
  });

  test('rejects invalid VG names with brackets', () => {
    const mockSpec = {
      hostname: 'TEST-SERVER',
      serverType: 'odb',
      role: 'Test',
      os: 'RHEL-8',
      volumeGroups: [
        { name: '[env]vg', diskCount: 2, sizeGB: 100, iops: 3000, throughputMBs: 125 },
      ],
    };

    const result = generateLvmScript(mockSpec);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('[env]vg');
  });
});
