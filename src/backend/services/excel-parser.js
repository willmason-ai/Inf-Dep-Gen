// ============================================================================
// Infrastructure Deployment Generator — Excel Parser Service
// ============================================================================
// Parses the Epic Azure Cloud Specifications Guide (.xlsx) into structured
// server spec objects that can be compared against existing Cosmos DB specs.
//
// Key sheets:
//   - "Compute Bill of Materials" (sheet 3): SKU, OS, region, hostnames
//   - "Storage Bill of Materials" (sheet 4): Disk/VG configs per server
// ============================================================================

import XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Hostname normalization — the Excel uses USE2/USW2 prefixes while the app
// uses EUS2/WUS2. Normalize both directions.
// ---------------------------------------------------------------------------
function normalizeHostname(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let h = raw.trim().toUpperCase();
  // Excel format → App format
  h = h.replace(/^USE2-/, 'EUS2-');
  h = h.replace(/^USW2-/, 'WUS2-');
  return h || null;
}

function parseNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim().replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function cleanString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ---------------------------------------------------------------------------
// Region mapping
// ---------------------------------------------------------------------------
function resolveRegion(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s.includes('primary') || s.includes('east')) return 'East US 2';
  if (s.includes('alternate') || s.includes('west') || s.includes('dr')) return 'West US 2';
  return raw;
}

function resolveRegionCode(region) {
  if (!region) return null;
  return region.includes('East') ? 'eus2' : 'wus2';
}

// ---------------------------------------------------------------------------
// Parse Compute Bill of Materials sheet
// ---------------------------------------------------------------------------
function parseComputeSheet(workbook) {
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('compute')
  );
  if (!sheetName) return {};

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find the header row (contains "Epic Tier" or "Epic Resource")
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (row && row.some(cell => String(cell).toLowerCase().includes('epic tier'))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return {};

  const servers = {};

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    // Column mapping (0-indexed):
    // A(0)=Epic Tier, B(1)=Stamp, C(2)=Epic Resource, D(3)=Planned SKU,
    // E(4)=Planned Qty, F(5)=Future SKU, G(6)=Future Qty,
    // H(7)=OS Disk Type, I(8)=OS Disk Snapshot Qty, J(9)=Region,
    // K(10)=Hostname, L(11)=blank, M(12)=OS

    const hostname = normalizeHostname(row[10]);
    if (!hostname) continue;  // Skip rows without a hostname

    const epicTier = cleanString(row[0]);
    const stamp = cleanString(row[1]);
    const resource = cleanString(row[2]);
    const plannedSku = cleanString(row[3]);
    const futureSku = cleanString(row[5]);
    const osDiskType = cleanString(row[7]);
    const osDiskSnapshots = parseNumber(row[8]);
    const region = resolveRegion(cleanString(row[9]));
    const os = cleanString(row[12]);

    // Determine server type from Epic Tier
    let serverType = 'unknown';
    if (epicTier.toLowerCase().includes('operational database')) serverType = 'odb';
    else if (epicTier.toLowerCase().includes('relational database')) serverType = 'sql';
    else if (epicTier.toLowerCase().includes('presentation')) serverType = 'presentation';
    else if (epicTier.toLowerCase().includes('web')) serverType = 'web';

    // Epic Resource is the server role (e.g., "Production ODB Server", "Clarity Server")
    const role = resource || `${stamp} Server`;

    servers[hostname] = {
      hostname,
      epicTier,       // e.g., "Operational Database", "Relational Database"
      stamp,          // e.g., "Production", "Build", "Training", "Alt Prod"
      epicResource: resource,  // e.g., "Production ODB Server", "Clarity Server"
      role,           // Same as epicResource (for backward compat with spec schema)
      serverType,
      plannedSku,
      futureSku,
      sku: futureSku || plannedSku,  // Prefer future (target) SKU
      currentSku: plannedSku !== futureSku ? plannedSku : null,
      skuDeficient: plannedSku !== futureSku,
      os: os || (serverType === 'odb' ? 'RHEL-8' : serverType === 'sql' ? 'Windows Server 2022' : ''),
      region,
      regionCode: resolveRegionCode(region),
      osDiskType: osDiskType || null,
      osDiskSnapshots: osDiskSnapshots,
    };
  }

  return servers;
}

// ---------------------------------------------------------------------------
// Parse Storage Bill of Materials sheet
// ---------------------------------------------------------------------------
function parseStorageSheet(workbook) {
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('storage')
  );
  if (!sheetName) return {};

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find header row
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (row && row.some(cell => String(cell).toLowerCase().includes('volume description'))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return {};

  // Group storage entries by server hostname
  const storageByServer = {};

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 8) continue;

    // Column mapping (0-indexed):
    // A(0)=Epic Tier, B(1)=Stamp, C(2)=Epic Resource, D(3)=Region,
    // E(4)=Volume Description, F(5)=Disk Type, G(6)=Quantity,
    // H(7)=IOPS, I(8)=Throughput (MB/s), J(9)=Capacity (GB),
    // K(10)=Snapshot Quantity, L(11)=Server Name

    const serverName = normalizeHostname(row[11]);
    if (!serverName) continue;

    const volumeDesc = cleanString(row[4]);
    if (!volumeDesc) continue;

    const diskType = cleanString(row[5]) || 'Premium SSD v2';
    const quantity = parseNumber(row[6]);
    const iops = parseNumber(row[7]);
    const throughput = parseNumber(row[8]);
    const capacityGB = parseNumber(row[9]);
    const snapshots = parseNumber(row[10]);

    if (!storageByServer[serverName]) {
      storageByServer[serverName] = [];
    }

    storageByServer[serverName].push({
      name: volumeDesc,
      diskType,
      diskCount: quantity || 1,
      iops: iops || 3000,
      throughputMBs: throughput || 125,
      sizeGB: capacityGB || 0,
      totalSizeGB: (quantity || 1) * (capacityGB || 0),
      snapshots: snapshots || 0,
    });
  }

  return storageByServer;
}

// ---------------------------------------------------------------------------
// Merge compute + storage into complete server specs
// ---------------------------------------------------------------------------
function mergeComputeAndStorage(computeServers, storageByServer) {
  const result = [];

  for (const [hostname, server] of Object.entries(computeServers)) {
    const storage = storageByServer[hostname] || [];

    // Classify storage as volumeGroups (ODB) or diskGroups (SQL)
    if (server.serverType === 'odb') {
      server.volumeGroups = storage.map(s => ({
        name: s.name,
        diskType: s.diskType,
        diskCount: s.diskCount,
        iops: s.iops,
        throughputMBs: s.throughputMBs,
        sizeGB: s.sizeGB,
        totalSizeGB: s.totalSizeGB,
        snapshots: s.snapshots,
      }));
    } else if (server.serverType === 'sql') {
      server.diskGroups = storage.map(s => ({
        purpose: s.name,
        diskType: s.diskType,
        diskCount: s.diskCount,
        iops: s.iops,
        throughputMBs: s.throughputMBs,
        sizeGB: s.sizeGB,
        totalSizeGB: s.totalSizeGB,
        snapshots: s.snapshots,
      }));
    }

    result.push(server);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export — parse the full EPIC CSG Excel file
// ---------------------------------------------------------------------------
export function parseExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const computeServers = parseComputeSheet(workbook);
  const storageByServer = parseStorageSheet(workbook);
  const servers = mergeComputeAndStorage(computeServers, storageByServer);

  return {
    sheetNames: workbook.SheetNames,
    serverCount: servers.length,
    servers,
    parseWarnings: validateParsedData(servers),
  };
}

// ---------------------------------------------------------------------------
// Basic validation of parsed data
// ---------------------------------------------------------------------------
function validateParsedData(servers) {
  const warnings = [];

  for (const s of servers) {
    if (!s.sku) {
      warnings.push(`${s.hostname}: No SKU found`);
    }
    const storage = s.volumeGroups || s.diskGroups || [];
    if (storage.length === 0) {
      warnings.push(`${s.hostname}: No storage configuration found`);
    }
    for (const disk of storage) {
      if (!disk.iops || disk.iops === 0) {
        warnings.push(`${s.hostname}: IOPS missing for ${disk.name || disk.purpose}`);
      }
      if (!disk.sizeGB || disk.sizeGB === 0) {
        warnings.push(`${s.hostname}: Capacity missing for ${disk.name || disk.purpose}`);
      }
    }
  }

  return warnings;
}

export default { parseExcelFile };
