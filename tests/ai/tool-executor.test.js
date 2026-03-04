// ============================================================================
// AI Tool Executor Tests
// ============================================================================
// Tests parameter validation, RG validation, and tool handler logic.
// ============================================================================

import { executeTool } from '../../src/backend/services/ai/tool-executor.js';

describe('Tool Executor', () => {
  // -------------------------------------------------------------------------
  // Parameter validation
  // -------------------------------------------------------------------------
  describe('parameter validation', () => {
    test('rejects get_server_spec without hostname', async () => {
      const result = JSON.parse(await executeTool('get_server_spec', {}));
      expect(result.error).toContain('Missing required parameter');
      expect(result.error).toContain('hostname');
    });

    test('rejects generate_arm_template without hostname', async () => {
      const result = JSON.parse(await executeTool('generate_arm_template', {}));
      expect(result.error).toContain('Missing required parameter');
    });

    test('rejects generate_lvm_script without hostname', async () => {
      const result = JSON.parse(await executeTool('generate_lvm_script', {}));
      expect(result.error).toContain('Missing required parameter');
    });

    test('rejects confirm_approval without required params', async () => {
      const result = JSON.parse(await executeTool('confirm_approval', { approval_id: 'test' }));
      expect(result.error).toContain('Missing required parameter');
      expect(result.error).toContain('action');
    });

    test('allows list_all_servers without params', async () => {
      const result = JSON.parse(await executeTool('list_all_servers', {}));
      expect(result.error).toBeUndefined();
      expect(result.count).toBeDefined();
    });

    test('allows list_deficiencies without params', async () => {
      const result = JSON.parse(await executeTool('list_deficiencies', {}));
      expect(result.error).toBeUndefined();
      expect(result.count).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Unknown tool handling
  // -------------------------------------------------------------------------
  describe('unknown tools', () => {
    test('returns error for unknown tool', async () => {
      const result = JSON.parse(await executeTool('nonexistent_tool', {}));
      expect(result.error).toContain('Unknown tool');
    });
  });

  // -------------------------------------------------------------------------
  // Server spec tools
  // -------------------------------------------------------------------------
  describe('server spec tools', () => {
    test('list_all_servers returns servers', async () => {
      const result = JSON.parse(await executeTool('list_all_servers', {}));
      expect(result.count).toBeGreaterThanOrEqual(2);
      expect(result.servers).toBeDefined();
    });

    test('get_server_spec returns error for unknown hostname', async () => {
      const result = JSON.parse(await executeTool('get_server_spec', { hostname: 'NONEXISTENT' }));
      expect(result.error).toContain('No server spec found');
    });
  });

  // -------------------------------------------------------------------------
  // Generator tools
  // -------------------------------------------------------------------------
  describe('generator tools', () => {
    test('generate_lvm_script rejects SQL server', async () => {
      const result = JSON.parse(await executeTool('generate_lvm_script', { hostname: 'EUS2-SQLPROD01' }));
      expect(result.error).toContain('ODB');
    });
  });

  // -------------------------------------------------------------------------
  // Validation tools
  // -------------------------------------------------------------------------
  describe('validation tools', () => {
    test('validate_all_servers returns results for all servers', async () => {
      const result = JSON.parse(await executeTool('validate_all_servers', {}));
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThanOrEqual(2);
      expect(result.summary).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------
  describe('cache management', () => {
    test('refresh_specs clears and reloads', async () => {
      const result = JSON.parse(await executeTool('refresh_specs', {}));
      expect(result.serverCount).toBeGreaterThanOrEqual(2);
      expect(result.message).toContain('cleared');
    });
  });
});
