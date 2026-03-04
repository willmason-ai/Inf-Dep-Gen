// ============================================================================
// Infrastructure Deployment Generator — Spec Comparator Service
// ============================================================================
// Compares Excel-parsed server specs against current Cosmos DB specs.
// Produces a diff report showing changes per server, with field-level detail.
// ============================================================================

// ---------------------------------------------------------------------------
// Compare two values, returning null if equal or a change object if different
// ---------------------------------------------------------------------------
function compareField(fieldName, current, incoming) {
  // Normalize for comparison
  const a = current === undefined || current === null ? null : current;
  const b = incoming === undefined || incoming === null ? null : incoming;

  // Both null — no change
  if (a === null && b === null) return null;

  // String comparison (case-insensitive for SKUs, etc.)
  if (typeof a === 'string' && typeof b === 'string') {
    if (a.toLowerCase().trim() === b.toLowerCase().trim()) return null;
  } else if (a === b) {
    return null;
  }

  return {
    field: fieldName,
    current: a,
    incoming: b,
  };
}

// ---------------------------------------------------------------------------
// Compare storage arrays (volumeGroups or diskGroups)
// ---------------------------------------------------------------------------
function compareStorageArrays(type, currentArr, incomingArr) {
  const changes = [];
  const nameKey = type === 'odb' ? 'name' : 'purpose';

  const currentMap = new Map();
  for (const item of currentArr) {
    currentMap.set(item[nameKey], item);
  }

  const incomingMap = new Map();
  for (const item of incomingArr) {
    incomingMap.set(item[nameKey], item);
  }

  // Check each incoming item against current
  for (const [name, incoming] of incomingMap) {
    const current = currentMap.get(name);

    if (!current) {
      changes.push({
        field: `${type === 'odb' ? 'volumeGroup' : 'diskGroup'}:${name}`,
        current: null,
        incoming: {
          [nameKey]: name,
          diskCount: incoming.diskCount,
          iops: incoming.iops,
          throughputMBs: incoming.throughputMBs,
          sizeGB: incoming.sizeGB,
          snapshots: incoming.snapshots,
        },
        changeType: 'added',
      });
      continue;
    }

    // Compare individual fields within the storage group
    const prefix = `${type === 'odb' ? 'volumeGroup' : 'diskGroup'}:${name}`;
    const storageFields = [
      ['diskCount', current.diskCount, incoming.diskCount],
      ['iops', current.iops, incoming.iops],
      ['throughputMBs', current.throughputMBs, incoming.throughputMBs],
      ['sizeGB', current.sizeGB, incoming.sizeGB],
      ['snapshots', current.snapshots, incoming.snapshots],
    ];

    for (const [field, cur, inc] of storageFields) {
      // Only compare if incoming has a meaningful value
      if (inc === null || inc === undefined) continue;
      const diff = compareField(`${prefix}.${field}`, cur, inc);
      if (diff) changes.push(diff);
    }
  }

  // Check for items in current but not in incoming (removed)
  for (const [name] of currentMap) {
    if (!incomingMap.has(name)) {
      changes.push({
        field: `${type === 'odb' ? 'volumeGroup' : 'diskGroup'}:${name}`,
        current: currentMap.get(name),
        incoming: null,
        changeType: 'removed',
      });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Compare a single server: Excel spec vs current Cosmos DB spec
// ---------------------------------------------------------------------------
function compareServer(excelSpec, currentSpec) {
  const changes = [];

  // Top-level fields
  const topFields = [
    ['sku', currentSpec.sku, excelSpec.sku],
    ['os', currentSpec.os, excelSpec.os],
    ['osDiskSnapshots', currentSpec.osDiskSnapshots, excelSpec.osDiskSnapshots],
  ];

  // Only compare osDiskType if Excel has a value
  if (excelSpec.osDiskType) {
    topFields.push(['osDiskType', currentSpec.osDiskType, excelSpec.osDiskType]);
  }

  // SKU deficiency tracking
  if (excelSpec.currentSku && excelSpec.skuDeficient) {
    topFields.push(['currentSku', currentSpec.currentSku, excelSpec.currentSku]);
    topFields.push(['skuDeficient', currentSpec.skuDeficient, excelSpec.skuDeficient]);
  }

  for (const [field, cur, inc] of topFields) {
    if (inc === null || inc === undefined) continue;
    const diff = compareField(field, cur, inc);
    if (diff) changes.push(diff);
  }

  // Storage comparison
  if (excelSpec.volumeGroups && excelSpec.volumeGroups.length > 0) {
    const storageChanges = compareStorageArrays(
      'odb',
      currentSpec.volumeGroups || [],
      excelSpec.volumeGroups
    );
    changes.push(...storageChanges);
  }

  if (excelSpec.diskGroups && excelSpec.diskGroups.length > 0) {
    const storageChanges = compareStorageArrays(
      'sql',
      currentSpec.diskGroups || [],
      excelSpec.diskGroups
    );
    changes.push(...storageChanges);
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Main export — compare all Excel specs against current specs
// ---------------------------------------------------------------------------
export function compareSpecs(excelServers, currentSpecs) {
  const report = {
    timestamp: new Date().toISOString(),
    totalServersInExcel: excelServers.length,
    totalCurrentServers: currentSpecs.length,
    matched: 0,
    withChanges: 0,
    unmatched: [],
    servers: [],
  };

  // Build lookup map from current specs by hostname
  const currentMap = new Map();
  for (const spec of currentSpecs) {
    currentMap.set(spec.hostname, spec);
  }

  for (const excelSpec of excelServers) {
    const currentSpec = currentMap.get(excelSpec.hostname);

    if (!currentSpec) {
      report.unmatched.push({
        hostname: excelSpec.hostname,
        role: excelSpec.role,
        epicTier: excelSpec.epicTier,
        stamp: excelSpec.stamp,
        epicResource: excelSpec.epicResource,
        reason: 'No matching server found in current specs',
      });
      continue;
    }

    report.matched++;

    const changes = compareServer(excelSpec, currentSpec);

    const serverReport = {
      hostname: excelSpec.hostname,
      role: currentSpec.role,
      serverType: currentSpec.serverType,
      epicTier: excelSpec.epicTier || null,
      stamp: excelSpec.stamp || null,
      epicResource: excelSpec.epicResource || null,
      changeCount: changes.length,
      changes,
    };

    if (changes.length > 0) {
      report.withChanges++;
    }

    report.servers.push(serverReport);
  }

  return report;
}

// ---------------------------------------------------------------------------
// Apply changes to a spec (merge incoming values)
// ---------------------------------------------------------------------------
export function applyChangesToSpec(currentSpec, changes) {
  const updated = { ...currentSpec };

  for (const change of changes) {
    const { field, incoming } = change;

    // Top-level field
    if (!field.includes(':') && !field.includes('.')) {
      updated[field] = incoming;
      continue;
    }

    // Storage group field (e.g., "volumeGroup:prdvg.iops")
    if (field.includes(':')) {
      const [groupType, rest] = field.split(':');
      const isVg = groupType === 'volumeGroup';
      const arrayKey = isVg ? 'volumeGroups' : 'diskGroups';
      const nameKey = isVg ? 'name' : 'purpose';

      if (rest.includes('.')) {
        // Sub-field update (e.g., "prdvg.iops")
        const [groupName, subField] = rest.split('.');
        if (updated[arrayKey]) {
          const group = updated[arrayKey].find(g => g[nameKey] === groupName);
          if (group) {
            group[subField] = incoming;
            // Recalculate totalSizeGB if diskCount or sizeGB changed
            if (subField === 'diskCount' || subField === 'sizeGB') {
              group.totalSizeGB = (group.diskCount || 1) * (group.sizeGB || 0);
            }
          }
        }
      } else {
        // Whole group add/remove
        if (change.changeType === 'added' && incoming) {
          if (!updated[arrayKey]) updated[arrayKey] = [];
          updated[arrayKey].push(incoming);
        }
        // Don't auto-remove groups — flag for manual review
      }
    }
  }

  updated.parsedAt = new Date().toISOString();
  updated.sourceFile = 'Excel Import';

  return updated;
}

export default { compareSpecs, applyChangesToSpec };
