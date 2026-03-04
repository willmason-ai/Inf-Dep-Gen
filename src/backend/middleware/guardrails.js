// ============================================================================
// Infrastructure Deployment Generator — Guardrails Middleware
// ============================================================================
// Checks operations against guardrail rules.
// Blocks BLOCKED operations, flags APPROVAL_REQUIRED operations.
// ============================================================================

import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Blocked operations — these are never allowed through the API
// ---------------------------------------------------------------------------
const BLOCKED_PATTERNS = [
  { method: 'DELETE', pathPattern: /\/api\/servers/, rule: 'G-BLK-001', reason: 'VM deletion is permanently blocked' },
  { method: 'DELETE', pathPattern: /\/api\/disks/, rule: 'G-BLK-003', reason: 'Disk deletion is permanently blocked' },
  { method: 'DELETE', pathPattern: /\/api\//, rule: 'G-BLK-002', reason: 'Resource deletion is blocked' },
];

// ---------------------------------------------------------------------------
// Resource group validation
// ---------------------------------------------------------------------------
function isPermittedResourceGroup(rgName) {
  if (!rgName) return true; // No RG specified — no check needed
  return config.permittedResourceGroups.some(
    rg => rg.toLowerCase() === rgName.toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// Main guardrails middleware
// ---------------------------------------------------------------------------
export function guardrails() {
  return (req, res, next) => {
    // Check for blocked operation patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (req.method === pattern.method && pattern.pathPattern.test(req.path)) {
        console.warn(`[Guardrails] BLOCKED: ${req.method} ${req.path} — ${pattern.rule}: ${pattern.reason}`);
        return res.status(403).json({
          error: 'Operation Blocked',
          rule: pattern.rule,
          reason: pattern.reason,
          message: 'This operation is permanently blocked by guardrail rules. See docs/GUARDRAILS.md for details.',
        });
      }
    }

    // Check resource group permissions (if RG is in the request)
    const resourceGroup = req.body?.resourceGroup || req.query?.resourceGroup;
    if (resourceGroup && !isPermittedResourceGroup(resourceGroup)) {
      console.warn(`[Guardrails] BLOCKED: Operation on non-permitted RG "${resourceGroup}" — G-BLK-006`);
      return res.status(403).json({
        error: 'Operation Blocked',
        rule: 'G-BLK-006',
        reason: `Resource group "${resourceGroup}" is not in the permitted list`,
        permittedGroups: config.permittedResourceGroups,
      });
    }

    next();
  };
}

export default guardrails;
