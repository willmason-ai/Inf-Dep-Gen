// ============================================================================
// Infrastructure Deployment Generator — Server Spec Models
// ============================================================================
// Document shapes and helpers for ODB and SQL server specifications.
// These match the Cosmos DB "serverSpecs" container structure.
// ============================================================================

/**
 * @typedef {Object} VolumeGroup
 * @property {string} name         - VG name (e.g., "prdvg", "epicvg", "supvg")
 * @property {string} diskType     - "Premium SSD v2"
 * @property {number} diskCount    - Number of disks in the VG
 * @property {number} iops         - IOPS per disk
 * @property {number} throughputMBs - Throughput per disk in MB/s
 * @property {number} sizeGB       - Capacity per disk in GB
 * @property {number} totalSizeGB  - Total capacity across all disks
 * @property {number} snapshots    - Snapshots per disk
 */

/**
 * @typedef {Object} DiskGroup
 * @property {string} purpose       - Purpose (e.g., "Report Database Files", "Log Files")
 * @property {string} diskType      - "Premium SSD v2"
 * @property {number|string} diskCount - Number of disks (or "TBD" if unknown)
 * @property {number} iops          - IOPS per disk
 * @property {number} throughputMBs - Throughput per disk in MB/s
 * @property {number} sizeGB        - Capacity per disk in GB
 * @property {number|string} totalSizeGB - Total capacity (or "TBD")
 * @property {number} snapshots     - Snapshots per disk
 */

/**
 * @typedef {Object} ServerSpec
 * @property {string} id           - Cosmos DB document ID (same as hostname)
 * @property {string} hostname     - Server hostname (e.g., "EUS2-EPPRDODB")
 * @property {string} role         - Server role description
 * @property {string} os           - Operating system ("RHEL-8" or "Windows Server 2022")
 * @property {string} region       - Azure region ("East US 2" or "West US 2")
 * @property {string} regionCode   - Short region code ("eus2" or "wus2")
 * @property {string} resourceGroup - Target resource group
 * @property {string} serverType   - "odb" or "sql"
 * @property {string} sku          - Required VM SKU
 * @property {string} [currentSku] - Current (built) SKU if different from required
 * @property {boolean} skuDeficient - Whether the current SKU differs from required
 * @property {string} osDiskType   - OS disk type (e.g., "P6 Premium SSD")
 * @property {number} osDiskSnapshots - Number of OS disk snapshots
 * @property {Object} tags         - Required tags
 * @property {VolumeGroup[]} [volumeGroups] - Volume groups (ODB servers only)
 * @property {DiskGroup[]} [diskGroups]     - Disk groups (SQL servers only)
 * @property {string[]} [notes]    - Additional notes
 * @property {Object[]} [deficiencies] - Known deficiencies
 * @property {string} sourceFile   - Path to the source spec markdown file
 * @property {string} parsedAt     - ISO timestamp when parsed
 */

// ---------------------------------------------------------------------------
// Helper: derive region code from hostname
// ---------------------------------------------------------------------------
export function getRegionCode(hostname) {
  if (hostname.startsWith('EUS2')) return 'eus2';
  if (hostname.startsWith('WUS2')) return 'wus2';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Helper: determine server type from OS
// ---------------------------------------------------------------------------
export function getServerType(os) {
  if (!os) return 'unknown';
  const lower = os.toLowerCase();
  if (lower.includes('rhel') || lower.includes('linux')) return 'odb';
  if (lower.includes('windows')) return 'sql';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Helper: count total data disks from spec
// ---------------------------------------------------------------------------
export function getTotalDiskCount(spec) {
  if (spec.volumeGroups) {
    return spec.volumeGroups.reduce((sum, vg) => sum + (vg.diskCount || 0), 0);
  }
  if (spec.diskGroups) {
    return spec.diskGroups.reduce((sum, dg) => {
      const count = typeof dg.diskCount === 'number' ? dg.diskCount : 0;
      return sum + count;
    }, 0);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Helper: get LUN assignments for a spec's disks
// ---------------------------------------------------------------------------
export function getLunAssignments(spec) {
  const assignments = [];
  let lun = 0; // LUN 0 = first data disk (OS disk is separate)

  if (spec.volumeGroups) {
    for (const vg of spec.volumeGroups) {
      for (let i = 0; i < vg.diskCount; i++) {
        assignments.push({
          lun,
          vgName: vg.name,
          diskIndex: i + 1,
          diskName: `${spec.hostname}-${vg.name}-disk${String(i + 1).padStart(2, '0')}`,
          sizeGB: vg.sizeGB,
          iops: vg.iops,
          throughputMBs: vg.throughputMBs,
        });
        lun++;
      }
    }
  }

  if (spec.diskGroups) {
    for (const dg of spec.diskGroups) {
      const count = typeof dg.diskCount === 'number' ? dg.diskCount : 0;
      // Create a sanitized purpose slug for the disk name
      const purposeSlug = dg.purpose
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/files?$/i, '');
      for (let i = 0; i < count; i++) {
        assignments.push({
          lun,
          purpose: dg.purpose,
          diskIndex: i + 1,
          diskName: `${spec.hostname}-${purposeSlug}-disk${String(i + 1).padStart(2, '0')}`,
          sizeGB: dg.sizeGB,
          iops: dg.iops,
          throughputMBs: dg.throughputMBs,
        });
        lun++;
      }
    }
  }

  return assignments;
}

// ---------------------------------------------------------------------------
// Helper: get LUN-to-device mapping (Linux /dev/sd* for LVM scripts)
// ---------------------------------------------------------------------------
export function getLunDeviceMap(startLun, count) {
  // Azure Linux: LUN 0 → /dev/sdc, LUN 1 → /dev/sdd, etc.
  // (sda = OS disk, sdb = temporary/resource disk)
  const devices = [];
  for (let i = 0; i < count; i++) {
    const charCode = 'c'.charCodeAt(0) + startLun + i;
    devices.push(`/dev/sd${String.fromCharCode(charCode)}`);
  }
  return devices;
}

// ---------------------------------------------------------------------------
// Helper: create an empty spec template
// ---------------------------------------------------------------------------
export function createEmptySpec(hostname) {
  return {
    id: hostname,
    hostname,
    role: '',
    os: '',
    region: '',
    regionCode: getRegionCode(hostname),
    resourceGroup: '',
    serverType: 'unknown',
    sku: '',
    currentSku: null,
    skuDeficient: false,
    osDiskType: '',
    osDiskSnapshots: 0,
    tags: {},
    volumeGroups: [],
    diskGroups: [],
    notes: [],
    deficiencies: [],
    sourceFile: '',
    parsedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Shared disk purpose → slug mapping for Windows SQL servers
// Used by ARM generator and tag generator to produce consistent disk names
// ---------------------------------------------------------------------------
const diskPurposeSlugMap = {
  'Report Database Files': 'ReportDB',
  'Stage Database Files': 'StageDB',
  'Log Files': 'Log',
  'SlicerDicer': 'SlicerDicer',
  'Database Files': 'Database',
  'Test Database Files': 'TestDB',
  'Test': 'Test',
};

export function getDiskPurposeSlug(purpose) {
  return diskPurposeSlugMap[purpose] || purpose.replace(/\s+/g, '');
}

export default {
  getRegionCode,
  getServerType,
  getTotalDiskCount,
  getLunAssignments,
  getLunDeviceMap,
  createEmptySpec,
  getDiskPurposeSlug,
};
