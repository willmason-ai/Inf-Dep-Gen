// ============================================================================
// Infrastructure Deployment Generator — CIDR Utilities
// ============================================================================
// Pure JS IP math for CIDR validation, overlap detection, and subnet sizing.
// Zero external dependencies.
// ============================================================================

// ---------------------------------------------------------------------------
// IP ↔ 32-bit integer conversion
// ---------------------------------------------------------------------------

export function ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function longToIp(n) {
  return [
    (n >>> 24) & 0xFF,
    (n >>> 16) & 0xFF,
    (n >>> 8) & 0xFF,
    n & 0xFF,
  ].join('.');
}

// ---------------------------------------------------------------------------
// Parse CIDR notation → structured object
// ---------------------------------------------------------------------------

export function parseCidr(cidr) {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;

  const ip = match[1];
  const prefix = parseInt(match[2], 10);

  if (prefix < 0 || prefix > 32) return null;

  const octets = ip.split('.').map(Number);
  if (octets.some(o => o < 0 || o > 255)) return null;

  const ipLong = ipToLong(ip);
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ipLong & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostCount = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.pow(2, 32 - prefix) - 2;

  return {
    ip,
    prefix,
    mask: longToIp(mask),
    network: longToIp(network),
    broadcast: longToIp(broadcast),
    networkLong: network,
    broadcastLong: broadcast,
    hostCount,
    totalAddresses: Math.pow(2, 32 - prefix),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateCidrFormat(cidr) {
  if (!cidr || typeof cidr !== 'string') {
    return { valid: false, error: 'CIDR must be a non-empty string' };
  }

  const parsed = parseCidr(cidr);
  if (!parsed) {
    return { valid: false, error: 'Invalid CIDR notation. Expected format: x.x.x.x/n' };
  }

  return { valid: true, parsed };
}

export function isAligned(cidr) {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  return parsed.ip === parsed.network;
}

export function validateCidr(cidr) {
  const formatResult = validateCidrFormat(cidr);
  if (!formatResult.valid) return formatResult;

  const parsed = formatResult.parsed;
  const errors = [];
  const warnings = [];

  if (parsed.ip !== parsed.network) {
    errors.push(`IP ${parsed.ip} is not the network address. Did you mean ${parsed.network}/${parsed.prefix}?`);
  }

  if (parsed.prefix < 8) {
    warnings.push(`/${parsed.prefix} is an unusually large block (${parsed.totalAddresses.toLocaleString()} addresses)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed,
  };
}

// ---------------------------------------------------------------------------
// Overlap and containment
// ---------------------------------------------------------------------------

export function cidrOverlaps(a, b) {
  const pa = parseCidr(a);
  const pb = parseCidr(b);
  if (!pa || !pb) return false;

  return pa.networkLong <= pb.broadcastLong && pa.broadcastLong >= pb.networkLong;
}

export function cidrContains(outer, inner) {
  const po = parseCidr(outer);
  const pi = parseCidr(inner);
  if (!po || !pi) return false;

  return po.networkLong <= pi.networkLong && po.broadcastLong >= pi.broadcastLong;
}

// ---------------------------------------------------------------------------
// Multi-range validation
// ---------------------------------------------------------------------------

export function validateNoOverlap(cidrs) {
  const overlaps = [];
  for (let i = 0; i < cidrs.length; i++) {
    for (let j = i + 1; j < cidrs.length; j++) {
      if (cidrOverlaps(cidrs[i], cidrs[j])) {
        overlaps.push({ a: cidrs[i], b: cidrs[j] });
      }
    }
  }
  return { valid: overlaps.length === 0, overlaps };
}

export function validateSubnetsInVnet(vnetSpaces, subnetCidrs) {
  const errors = [];

  for (const subnet of subnetCidrs) {
    const containedByAny = vnetSpaces.some(space => cidrContains(space, subnet));
    if (!containedByAny) {
      errors.push({
        subnet,
        error: `Subnet ${subnet} is not contained within any VNet address space (${vnetSpaces.join(', ')})`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateIpPlan({ avsBlock, onPremRanges = [], hubVnetSpace, workloadRanges = [] }) {
  const allRanges = [];
  const labels = [];

  if (hubVnetSpace) {
    allRanges.push(hubVnetSpace);
    labels.push('Hub VNet');
  }

  if (avsBlock) {
    allRanges.push(avsBlock);
    labels.push('AVS /22 Block');
  }

  for (let i = 0; i < onPremRanges.length; i++) {
    allRanges.push(onPremRanges[i]);
    labels.push(`On-Prem Range ${i + 1}`);
  }

  for (let i = 0; i < workloadRanges.length; i++) {
    allRanges.push(workloadRanges[i]);
    labels.push(`Workload Range ${i + 1}`);
  }

  const overlaps = [];
  for (let i = 0; i < allRanges.length; i++) {
    for (let j = i + 1; j < allRanges.length; j++) {
      if (cidrOverlaps(allRanges[i], allRanges[j])) {
        overlaps.push({
          a: { label: labels[i], cidr: allRanges[i] },
          b: { label: labels[j], cidr: allRanges[j] },
        });
      }
    }
  }

  // AVS block must be exactly /22
  const avsWarnings = [];
  if (avsBlock) {
    const parsed = parseCidr(avsBlock);
    if (parsed && parsed.prefix !== 22) {
      avsWarnings.push(`AVS block must be a /22 (currently /${parsed.prefix})`);
    }
    if (parsed && parsed.ip !== parsed.network) {
      avsWarnings.push(`AVS block is not aligned. Use ${parsed.network}/${parsed.prefix}`);
    }
  }

  return {
    valid: overlaps.length === 0 && avsWarnings.length === 0,
    overlaps,
    avsWarnings,
    rangeCount: allRanges.length,
  };
}

// ---------------------------------------------------------------------------
// Azure subnet minimum prefix sizes
// ---------------------------------------------------------------------------

const SUBNET_MIN_PREFIX = {
  gateway: 27,
  bastion: 26,
  firewall: 26,
  'route-server': 27,
  compute: 28,
  management: 28,
  custom: 29,
};

export function getSubnetMinPrefix(purpose) {
  return SUBNET_MIN_PREFIX[purpose] || 29;
}

// ---------------------------------------------------------------------------
// Utilization calculation
// ---------------------------------------------------------------------------

export function calculateUtilization(vnetSpaces, subnetCidrs) {
  let totalVnetAddresses = 0;
  for (const space of vnetSpaces) {
    const parsed = parseCidr(space);
    if (parsed) totalVnetAddresses += parsed.totalAddresses;
  }

  let allocatedAddresses = 0;
  for (const cidr of subnetCidrs) {
    const parsed = parseCidr(cidr);
    if (parsed) allocatedAddresses += parsed.totalAddresses;
  }

  return {
    total: totalVnetAddresses,
    allocated: allocatedAddresses,
    free: totalVnetAddresses - allocatedAddresses,
    percentUsed: totalVnetAddresses > 0
      ? Math.round((allocatedAddresses / totalVnetAddresses) * 100)
      : 0,
  };
}

export default {
  ipToLong,
  longToIp,
  parseCidr,
  validateCidrFormat,
  validateCidr,
  isAligned,
  cidrOverlaps,
  cidrContains,
  validateNoOverlap,
  validateSubnetsInVnet,
  validateIpPlan,
  getSubnetMinPrefix,
  calculateUtilization,
};
