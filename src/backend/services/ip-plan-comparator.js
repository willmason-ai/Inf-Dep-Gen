// ============================================================================
// Infrastructure Deployment Generator — IP Plan Comparator
// ============================================================================
// Compares parsed IP plan data against existing networking config.
// Produces diff report for the import review flow.
// ============================================================================

import { cidrOverlaps, validateIpPlan } from './cidr-utils.js';

// ---------------------------------------------------------------------------
// Compare imported IP plan against current networking config
// ---------------------------------------------------------------------------

export function compareIpPlan(parsedIpPlan, currentNetworkingConfig) {
  const changes = [];
  const warnings = [];
  const current = currentNetworkingConfig?.ipAddressPlan || {};

  // AVS block
  if (parsedIpPlan.avsBlock && parsedIpPlan.avsBlock !== current.avsBlock) {
    changes.push({
      field: 'ipAddressPlan.avsBlock',
      label: 'AVS /22 Block',
      current: current.avsBlock || '(not set)',
      incoming: parsedIpPlan.avsBlock,
      changeType: current.avsBlock ? 'modified' : 'added',
    });
  }

  // On-prem ranges (append new ones)
  const currentOnPrem = current.onPremRanges || [];
  for (const range of (parsedIpPlan.onPremRanges || [])) {
    if (!currentOnPrem.includes(range)) {
      changes.push({
        field: `ipAddressPlan.onPremRanges`,
        label: `On-Prem Range: ${range}`,
        current: null,
        incoming: range,
        changeType: 'added',
      });
    }
  }

  // Workload VNet ranges (append new ones)
  const currentWorkload = current.workloadVnetRanges || [];
  for (const range of (parsedIpPlan.workloadVnetRanges || [])) {
    if (!currentWorkload.includes(range)) {
      changes.push({
        field: `ipAddressPlan.workloadVnetRanges`,
        label: `Workload Range: ${range}`,
        current: null,
        incoming: range,
        changeType: 'added',
      });
    }
  }

  // Reserved ranges (append new ones)
  const currentReserved = current.reservedRanges || [];
  for (const range of (parsedIpPlan.reservedRanges || [])) {
    if (!currentReserved.includes(range)) {
      changes.push({
        field: `ipAddressPlan.reservedRanges`,
        label: `Reserved Range: ${range}`,
        current: null,
        incoming: range,
        changeType: 'added',
      });
    }
  }

  // Hub VNet address spaces
  const currentSpaces = currentNetworkingConfig?.hubVnet?.addressSpaces || [];
  for (const space of (parsedIpPlan.hubVnetSpaces || [])) {
    if (!currentSpaces.includes(space)) {
      changes.push({
        field: 'hubVnet.addressSpaces',
        label: `Hub VNet Address Space: ${space}`,
        current: null,
        incoming: space,
        changeType: 'added',
      });
    }
  }

  // Validate merged result for overlaps
  const mergedOnPrem = [...currentOnPrem, ...(parsedIpPlan.onPremRanges || []).filter(r => !currentOnPrem.includes(r))];
  const mergedWorkload = [...currentWorkload, ...(parsedIpPlan.workloadVnetRanges || []).filter(r => !currentWorkload.includes(r))];
  const mergedHubSpace = currentSpaces.length > 0 ? currentSpaces[0] : (parsedIpPlan.hubVnetSpaces?.[0] || null);

  const ipResult = validateIpPlan({
    avsBlock: parsedIpPlan.avsBlock || current.avsBlock || null,
    onPremRanges: mergedOnPrem,
    hubVnetSpace: mergedHubSpace,
    workloadRanges: mergedWorkload,
  });

  for (const overlap of ipResult.overlaps) {
    warnings.push(`Overlap: ${overlap.a.label} (${overlap.a.cidr}) overlaps with ${overlap.b.label} (${overlap.b.cidr})`);
  }
  for (const w of ipResult.avsWarnings) {
    warnings.push(`AVS: ${w}`);
  }

  return { changes, warnings, changeCount: changes.length };
}

// ---------------------------------------------------------------------------
// Merge IP plan into networking config (non-destructive)
// ---------------------------------------------------------------------------

export function mergeIpPlan(parsedIpPlan, currentNetworkingConfig) {
  const cfg = { ...currentNetworkingConfig };
  const ipPlan = { ...(cfg.ipAddressPlan || {}) };

  if (parsedIpPlan.avsBlock) {
    ipPlan.avsBlock = parsedIpPlan.avsBlock;
  }

  const existingOnPrem = ipPlan.onPremRanges || [];
  ipPlan.onPremRanges = [...existingOnPrem, ...(parsedIpPlan.onPremRanges || []).filter(r => !existingOnPrem.includes(r))];

  const existingWorkload = ipPlan.workloadVnetRanges || [];
  ipPlan.workloadVnetRanges = [...existingWorkload, ...(parsedIpPlan.workloadVnetRanges || []).filter(r => !existingWorkload.includes(r))];

  const existingReserved = ipPlan.reservedRanges || [];
  ipPlan.reservedRanges = [...existingReserved, ...(parsedIpPlan.reservedRanges || []).filter(r => !existingReserved.includes(r))];

  cfg.ipAddressPlan = ipPlan;

  // Hub VNet spaces
  if (parsedIpPlan.hubVnetSpaces?.length) {
    if (!cfg.hubVnet) cfg.hubVnet = { name: '', addressSpaces: [], autoName: true };
    const existingSpaces = cfg.hubVnet.addressSpaces || [];
    cfg.hubVnet.addressSpaces = [...existingSpaces, ...parsedIpPlan.hubVnetSpaces.filter(s => !existingSpaces.includes(s))];
  }

  return cfg;
}

export default { compareIpPlan, mergeIpPlan };
