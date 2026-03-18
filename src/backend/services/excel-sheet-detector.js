// ============================================================================
// Infrastructure Deployment Generator — Excel Sheet Type Detector
// ============================================================================
// Scans sheet headers to auto-detect sheet types instead of relying on names.
// ============================================================================

import XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Signature headers for each sheet type
// ---------------------------------------------------------------------------

const SHEET_SIGNATURES = {
  'compute-bom': {
    headers: ['epic tier', 'planned sku', 'hostname', 'server name', 'vcpu', 'memory'],
    minMatch: 2,
  },
  'storage-bom': {
    headers: ['volume description', 'disk type', 'capacity (gb)', 'capacity(gb)', 'server name', 'volume group'],
    minMatch: 2,
  },
  'ip-plan': {
    headers: ['cidr', 'vnet', 'subnet', 'address space', 'address prefix', 'purpose', 'ip range'],
    required: ['cidr'],
    minMatch: 2,
  },
  'migration-wave': {
    headers: ['wave', 'source vm', 'vm name', 'target', 'destination', 'migration type'],
    required: ['wave'],
    minMatch: 2,
  },
  'host-sizing': {
    headers: ['host sku', 'av36', 'av36p', 'av52', 'av64', 'cluster', 'quantity', 'node count'],
    minMatch: 2,
  },
};

// ---------------------------------------------------------------------------
// Detect sheet types
// ---------------------------------------------------------------------------

export function detectSheetTypes(workbook) {
  const results = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Read first 15 rows to find headers
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z15');
    const headerRow = Math.min(range.e.r, 14);

    const foundHeaders = new Set();
    for (let r = range.s.r; r <= headerRow; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 25); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v) {
          foundHeaders.add(String(cell.v).toLowerCase().trim());
        }
      }
    }

    let bestMatch = { type: 'unknown', confidence: 0, matchedHeaders: [] };

    for (const [type, sig] of Object.entries(SHEET_SIGNATURES)) {
      const matched = sig.headers.filter(h => {
        for (const found of foundHeaders) {
          if (found.includes(h) || h.includes(found)) return true;
        }
        return false;
      });

      // Check required headers
      if (sig.required) {
        const hasRequired = sig.required.every(req => {
          for (const found of foundHeaders) {
            if (found.includes(req)) return true;
          }
          return false;
        });
        if (!hasRequired) continue;
      }

      if (matched.length >= sig.minMatch && matched.length > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence: matched.length,
          matchedHeaders: matched,
        };
      }
    }

    // Also check sheet name as a fallback hint
    const nameLower = sheetName.toLowerCase();
    if (bestMatch.type === 'unknown') {
      if (nameLower.includes('compute') || nameLower.includes('server')) {
        bestMatch = { type: 'compute-bom', confidence: 1, matchedHeaders: ['(name match)'] };
      } else if (nameLower.includes('storage') || nameLower.includes('disk')) {
        bestMatch = { type: 'storage-bom', confidence: 1, matchedHeaders: ['(name match)'] };
      } else if (nameLower.includes('ip') || nameLower.includes('network') || nameLower.includes('cidr')) {
        bestMatch = { type: 'ip-plan', confidence: 1, matchedHeaders: ['(name match)'] };
      } else if (nameLower.includes('migration') || nameLower.includes('wave')) {
        bestMatch = { type: 'migration-wave', confidence: 1, matchedHeaders: ['(name match)'] };
      } else if (nameLower.includes('host') || nameLower.includes('sizing') || nameLower.includes('avs')) {
        bestMatch = { type: 'host-sizing', confidence: 1, matchedHeaders: ['(name match)'] };
      }
    }

    results.push({
      sheetName,
      detectedType: bestMatch.type,
      confidence: bestMatch.confidence,
      matchedHeaders: bestMatch.matchedHeaders,
    });
  }

  return results;
}

export default { detectSheetTypes };
