// ============================================================================
// Infrastructure Deployment Generator — Tool-Level Guardrails
// ============================================================================
// Maps each AI tool to its guardrail classification and validates
// that operations comply with guardrail rules before execution.
// ============================================================================

// ---------------------------------------------------------------------------
// Tool guardrail classification
// ---------------------------------------------------------------------------
const toolGuardrails = {
  // ALLOWED — read-only, no approval needed
  list_all_servers:          { level: 'ALLOWED',           rule: 'G-ALW-001' },
  get_server_spec:           { level: 'ALLOWED',           rule: 'G-ALW-001' },
  list_deficiencies:         { level: 'ALLOWED',           rule: 'G-ALW-001' },
  validate_server:           { level: 'ALLOWED',           rule: 'G-ALW-003' },
  validate_all_servers:      { level: 'ALLOWED',           rule: 'G-ALW-003' },
  compare_spec_vs_actual:    { level: 'ALLOWED',           rule: 'G-ALW-003' },
  discover_vnets:            { level: 'ALLOWED',           rule: 'G-ALW-002' },
  discover_vms:              { level: 'ALLOWED',           rule: 'G-ALW-002' },
  discover_disks:            { level: 'ALLOWED',           rule: 'G-ALW-002' },
  discover_nsgs:             { level: 'ALLOWED',           rule: 'G-ALW-002' },
  discover_nics:             { level: 'ALLOWED',           rule: 'G-ALW-002' },
  discover_full_environment: { level: 'ALLOWED',           rule: 'G-ALW-002' },
  refresh_specs:             { level: 'ALLOWED',           rule: 'G-ALW-001' },

  // ALLOWED — generates previews only (no execution)
  generate_arm_template:     { level: 'ALLOWED',           rule: 'G-ALW-004' },
  generate_lvm_script:       { level: 'ALLOWED',           rule: 'G-ALW-004' },
  generate_nsg_rules:        { level: 'ALLOWED',           rule: 'G-ALW-004' },
  generate_tag_script:       { level: 'ALLOWED',           rule: 'G-ALW-004' },

  // APPROVAL_REQUIRED — creates approval request, not direct execution
  deploy_arm_template:       { level: 'APPROVAL_REQUIRED', rule: 'G-APR-008' },
  apply_tags_to_server:      { level: 'APPROVAL_REQUIRED', rule: 'G-APR-011' },

  // APPROVAL_REQUIRED — but managed internally
  confirm_approval:          { level: 'ALLOWED',           rule: 'G-ALW-001' },
};

// ---------------------------------------------------------------------------
// Check if a tool call is allowed by guardrails
// Returns { allowed: true } or { allowed: false, reason, rule }
// ---------------------------------------------------------------------------
export function checkToolGuardrail(toolName, input) {
  const guardrail = toolGuardrails[toolName];

  if (!guardrail) {
    return {
      allowed: false,
      reason: `Unknown tool "${toolName}" — not in guardrail registry`,
      rule: 'G-BLK-UNKNOWN',
    };
  }

  // All tools go through the approval workflow for destructive operations,
  // so we allow them at the tool-dispatch level. The approval manager
  // ensures human review before execution.
  return { allowed: true, level: guardrail.level, rule: guardrail.rule };
}

// ---------------------------------------------------------------------------
// Get guardrail info for a tool
// ---------------------------------------------------------------------------
export function getToolGuardrailInfo(toolName) {
  return toolGuardrails[toolName] || null;
}

export default { checkToolGuardrail, getToolGuardrailInfo };
