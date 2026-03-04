// ============================================================================
// Infrastructure Deployment Generator — Server Spec Markdown Parser
// ============================================================================
// Parses server spec markdown files into structured JSON.
// Handles both ODB (RHEL-8, volume groups) and SQL (Windows, disk groups).
// ============================================================================

import { readFile, readdir } from 'fs/promises';
import { resolve, basename } from 'path';
import { getRegionCode, getServerType, createEmptySpec } from '../models/server-spec.js';
import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Parse a markdown table into an array of { key, value } pairs
// ---------------------------------------------------------------------------
function parseMarkdownTable(lines) {
  const rows = [];
  let isFirstRow = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      // Reset first-row tracking when we leave a table
      if (rows.length > 0) isFirstRow = true;
      continue;
    }
    // Skip separator rows (e.g., |---|---|)
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split('|')
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
      .map(cell => cell.trim());

    // Skip common header rows
    if (cells.length >= 2) {
      const firstCell = cells[0].toLowerCase();
      if (firstCell === 'field' || firstCell === 'tag' ||
          firstCell === 'date' || firstCell === 'issue id' ||
          firstCell === 'check id') {
        isFirstRow = false;
        continue;
      }
    }

    if (cells.length >= 2) {
      rows.push(cells);
      isFirstRow = false;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Clean markdown formatting from a value (bold, etc.)
// ---------------------------------------------------------------------------
function cleanValue(val) {
  if (!val) return '';
  return val.replace(/\*\*/g, '').trim();
}

// ---------------------------------------------------------------------------
// Parse a number, returning null if not a valid number
// ---------------------------------------------------------------------------
function parseNumber(val) {
  if (!val) return null;
  const cleaned = cleanValue(val).replace(/,/g, '').replace(/\s*(GB|MB\/s|MB|IOPS)\s*/gi, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Extract sections from markdown by heading level
// ---------------------------------------------------------------------------
function extractSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);

    if (h2Match) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        level: 2,
        title: h2Match[1].trim(),
        lines: [],
        subsections: [],
      };
    } else if (h3Match && currentSection) {
      currentSection.subsections.push({
        level: 3,
        title: h3Match[1].trim(),
        lines: [],
      });
    } else if (currentSection) {
      if (currentSection.subsections.length > 0) {
        currentSection.subsections[currentSection.subsections.length - 1].lines.push(line);
      } else {
        currentSection.lines.push(line);
      }
    }
  }
  if (currentSection) sections.push(currentSection);

  return sections;
}

// ---------------------------------------------------------------------------
// Parse Server Identity section
// ---------------------------------------------------------------------------
function parseServerIdentity(section) {
  const rows = parseMarkdownTable(section.lines);
  const identity = {};
  for (const [key, value] of rows) {
    const k = cleanValue(key).toLowerCase();
    const v = cleanValue(value);
    if (k === 'hostname') identity.hostname = v;
    else if (k === 'role') identity.role = v;
    else if (k === 'os') identity.os = v;
    else if (k.includes('region')) identity.region = v;
    else if (k.includes('resource group')) identity.resourceGroup = v;
  }
  return identity;
}

// ---------------------------------------------------------------------------
// Parse Compute Configuration section
// ---------------------------------------------------------------------------
function parseComputeConfig(section) {
  const rows = parseMarkdownTable(section.lines);
  const compute = {};
  for (const [key, value] of rows) {
    const k = cleanValue(key).toLowerCase();
    const v = cleanValue(value);
    if (k.includes('required sku') || k === 'sku') {
      compute.sku = v;
    } else if (k.includes('current') && k.includes('sku')) {
      compute.currentSku = v;
    } else if (k.includes('sku status')) {
      compute.skuStatus = v;
    } else if (k === 'os') {
      // OS field sometimes appears in Compute Configuration (SQL servers)
      compute.os = v;
    } else if (k.includes('os disk type') || k === 'os disk') {
      compute.osDiskType = v;
    } else if (k.includes('os disk snapshot') || k.includes('snapshot')) {
      compute.osDiskSnapshots = parseNumber(v) || 0;
    }
  }
  return compute;
}

// ---------------------------------------------------------------------------
// Parse Tags section
// ---------------------------------------------------------------------------
function parseTags(section) {
  const rows = parseMarkdownTable(section.lines);
  const tags = {};
  for (const cells of rows) {
    if (cells.length >= 2) {
      const key = cleanValue(cells[0]);
      const value = cleanValue(cells[1]);
      if (key && value) tags[key] = value;
    }
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Parse Volume Groups section (ODB servers)
// ---------------------------------------------------------------------------
function parseVolumeGroups(section) {
  const volumeGroups = [];

  for (const sub of section.subsections) {
    const vgName = cleanValue(sub.title);
    const rows = parseMarkdownTable(sub.lines);
    const vg = { name: vgName };

    for (const [key, value] of rows) {
      const k = cleanValue(key).toLowerCase();
      const v = cleanValue(value);
      if (k.includes('disk type') || k.includes('type')) vg.diskType = v;
      else if (k.includes('number of disk') || k.includes('quantity')) vg.diskCount = parseNumber(v) || 0;
      else if (k === 'iops' || k.includes('iops')) vg.iops = parseNumber(v) || 0;
      else if (k.includes('throughput')) vg.throughputMBs = parseNumber(v) || 0;
      else if (k.includes('size per disk') || k.includes('capacity (per disk)')) vg.sizeGB = parseNumber(v) || 0;
      else if (k.includes('total')) vg.totalSizeGB = parseNumber(v) || 0;
      else if (k.includes('snapshot')) vg.snapshots = parseNumber(v) || 0;
    }

    // Calculate total if not provided
    if (!vg.totalSizeGB && vg.sizeGB && vg.diskCount) {
      vg.totalSizeGB = vg.sizeGB * vg.diskCount;
    }

    volumeGroups.push(vg);
  }

  return volumeGroups;
}

// ---------------------------------------------------------------------------
// Parse Data Disk Configuration section (SQL servers)
// ---------------------------------------------------------------------------
function parseDiskGroups(section) {
  const diskGroups = [];

  for (const sub of section.subsections) {
    const purpose = cleanValue(sub.title);
    const rows = parseMarkdownTable(sub.lines);
    const dg = { purpose };

    for (const [key, value] of rows) {
      const k = cleanValue(key).toLowerCase();
      const v = cleanValue(value);
      if (k.includes('disk type') || k.includes('type')) dg.diskType = v;
      else if (k.includes('quantity') || k.includes('number')) {
        const num = parseNumber(v);
        dg.diskCount = num !== null ? num : v; // Keep as string if "TBD"
      }
      else if (k === 'iops' || k.includes('iops')) dg.iops = parseNumber(v) || 0;
      else if (k.includes('throughput')) dg.throughputMBs = parseNumber(v) || 0;
      else if (k.includes('capacity (per disk)') || k.includes('size per disk')) dg.sizeGB = parseNumber(v) || 0;
      else if (k.includes('total')) {
        const num = parseNumber(v);
        dg.totalSizeGB = num !== null ? num : v;
      }
      else if (k.includes('snapshot')) dg.snapshots = parseNumber(v) || 0;
    }

    // Calculate total if not provided and both values are numbers
    if (!dg.totalSizeGB && typeof dg.diskCount === 'number' && dg.sizeGB) {
      dg.totalSizeGB = dg.sizeGB * dg.diskCount;
    }

    diskGroups.push(dg);
  }

  return diskGroups;
}

// ---------------------------------------------------------------------------
// Parse Known Deficiencies section
// ---------------------------------------------------------------------------
function parseDeficiencies(section) {
  const rows = parseMarkdownTable(section.lines);
  const deficiencies = [];
  for (const cells of rows) {
    if (cells.length >= 2) {
      // Can be [Date, Description] or [Issue ID, Description, Status]
      const entry = {};
      if (cells.length === 3) {
        entry.issueId = cleanValue(cells[0]);
        entry.description = cleanValue(cells[1]);
        entry.status = cleanValue(cells[2]);
      } else {
        entry.date = cleanValue(cells[0]);
        entry.description = cleanValue(cells[1]);
      }
      if (entry.description) deficiencies.push(entry);
    }
  }
  return deficiencies;
}

// ---------------------------------------------------------------------------
// Parse notes sections (SQL Server Notes, etc.)
// ---------------------------------------------------------------------------
function parseNotes(section) {
  const notes = [];
  for (const line of section.lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      notes.push(trimmed.slice(2).trim());
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Parse LVM Configuration Reference section to extract actual VG names
// This resolves [env]vg patterns like "epicvg" → actual name from the script
// ---------------------------------------------------------------------------
function extractVgNamesFromLvmBlock(content) {
  const vgNames = {};
  const vgCreateRegex = /vgcreate\s+(\S+)/g;
  let match;
  while ((match = vgCreateRegex.exec(content)) !== null) {
    vgNames[match[1]] = true;
  }
  return Object.keys(vgNames);
}

// ---------------------------------------------------------------------------
// Resolve [env]vg patterns using LVM reference block
// ---------------------------------------------------------------------------
function resolveEnvVgNames(volumeGroups, lvmVgNames) {
  // Collect names already explicitly defined in headings
  const explicitNames = new Set(
    volumeGroups
      .filter(vg => !vg.name.includes('[env]') && !vg.name.startsWith('['))
      .map(vg => vg.name.toLowerCase())
  );

  for (const vg of volumeGroups) {
    if (vg.name.includes('[env]') || (vg.name.startsWith('[') && vg.name.endsWith('vg'))) {
      // Find a VG name from the LVM block that:
      // 1. Ends with "vg"
      // 2. Is NOT already used as an explicit heading name
      const resolved = lvmVgNames.find(name =>
        name.toLowerCase().endsWith('vg') &&
        !explicitNames.has(name.toLowerCase())
      );
      if (resolved) {
        vg.name = resolved;
      }
    }
  }
  return volumeGroups;
}

// ---------------------------------------------------------------------------
// Main parser: parse a single spec file
// ---------------------------------------------------------------------------
export async function parseSpecFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const fileName = basename(filePath, '.md');

  // Skip non-server files
  if (fileName === 'SPEC-TEMPLATE' || fileName === 'WEB-SERVICE-SERVERS') {
    return null;
  }

  const sections = extractSections(content);
  const spec = createEmptySpec(fileName);
  spec.sourceFile = filePath;

  // Extract LVM VG names from code block (if present)
  const lvmBlockMatch = content.match(/```bash\n([\s\S]*?)```/);
  const lvmVgNames = lvmBlockMatch ? extractVgNamesFromLvmBlock(lvmBlockMatch[1]) : [];

  for (const section of sections) {
    const title = section.title.toLowerCase();

    if (title.includes('server identity')) {
      const identity = parseServerIdentity(section);
      Object.assign(spec, {
        hostname: identity.hostname || spec.hostname,
        role: identity.role || spec.role,
        os: identity.os || spec.os,
        region: identity.region || spec.region,
        resourceGroup: identity.resourceGroup || spec.resourceGroup,
      });
    }

    else if (title.includes('compute configuration')) {
      const compute = parseComputeConfig(section);
      spec.sku = compute.sku || spec.sku;
      spec.currentSku = compute.currentSku || null;
      spec.skuDeficient = !!(compute.currentSku && compute.currentSku !== compute.sku);
      spec.osDiskType = compute.osDiskType || spec.osDiskType;
      spec.osDiskSnapshots = compute.osDiskSnapshots || spec.osDiskSnapshots;
      // OS may appear in Compute Configuration (SQL servers) rather than Server Identity
      if (compute.os && !spec.os) {
        spec.os = compute.os;
      }
    }

    else if (title === 'tags') {
      spec.tags = parseTags(section);
    }

    else if (title.includes('volume groups')) {
      spec.volumeGroups = parseVolumeGroups(section);
      // Resolve [env]vg patterns
      if (lvmVgNames.length > 0) {
        spec.volumeGroups = resolveEnvVgNames(spec.volumeGroups, lvmVgNames);
      }
    }

    else if (title.includes('data disk configuration')) {
      spec.diskGroups = parseDiskGroups(section);
    }

    else if (title.includes('notes')) {
      spec.notes = parseNotes(section);
    }

    else if (title.includes('known deficiencies') || title.includes('deficiencies')) {
      spec.deficiencies = parseDeficiencies(section);
    }
  }

  // Derive computed fields
  spec.regionCode = getRegionCode(spec.hostname);
  spec.serverType = getServerType(spec.os);
  spec.parsedAt = new Date().toISOString();

  // Clean up: ODB servers shouldn't have diskGroups, SQL shouldn't have volumeGroups
  if (spec.serverType === 'odb') {
    delete spec.diskGroups;
  } else if (spec.serverType === 'sql') {
    delete spec.volumeGroups;
  }

  return spec;
}

// ---------------------------------------------------------------------------
// Parse all spec files in the server-specs directory
// ---------------------------------------------------------------------------
export async function parseAllSpecs(specsDir) {
  const dir = specsDir || config.paths.serverSpecs;
  const files = await readdir(dir);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  const specs = [];
  for (const file of mdFiles) {
    const filePath = resolve(dir, file);
    const spec = await parseSpecFile(filePath);
    if (spec) {
      specs.push(spec);
    }
  }

  console.log(`[SpecParser] Parsed ${specs.length} server specifications`);
  return specs;
}

export default { parseSpecFile, parseAllSpecs };
