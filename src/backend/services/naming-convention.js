// ============================================================================
// Infrastructure Deployment Generator — Naming Convention Service
// ============================================================================
// Manages naming convention configurations, generates resource names,
// and validates names against Azure naming rules.
// ============================================================================

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load reference data
let referenceData = null;

async function loadReferenceData() {
  if (referenceData) return referenceData;
  const filePath = resolve(__dirname, '../data/azure-resource-prefixes.json');
  const raw = await readFile(filePath, 'utf-8');
  referenceData = JSON.parse(raw);
  return referenceData;
}

// ---------------------------------------------------------------------------
// Convention CRUD (Cosmos DB appConfig container)
// ---------------------------------------------------------------------------

const CONVENTION_CONFIG_KEY = 'namingConvention';

export async function getConvention() {
  const container = getContainer(config.cosmos.containers.appConfig);
  const ref = await loadReferenceData();

  if (container) {
    try {
      const { resource } = await container.item(CONVENTION_CONFIG_KEY, CONVENTION_CONFIG_KEY).read();
      if (resource) {
        return { convention: resource.convention, referenceData: ref };
      }
    } catch (err) {
      // 404 or other — return default
    }
  }

  // Return default convention (Perry Standard)
  return {
    convention: {
      templateKey: 'mp-cloud',
      ...ref.templates['mp-cloud'],
      autoName: false,
    },
    referenceData: ref,
  };
}

export async function saveConvention(convention) {
  const container = getContainer(config.cosmos.containers.appConfig);
  const doc = {
    id: CONVENTION_CONFIG_KEY,
    configKey: CONVENTION_CONFIG_KEY,
    convention,
    updatedAt: new Date().toISOString(),
  };

  if (container) {
    try {
      await container.items.upsert(doc);
    } catch (err) {
      console.error('[NamingConvention] Failed to save convention:', err.message);
      throw new Error('Failed to save naming convention');
    }
  }

  return { convention };
}

// ---------------------------------------------------------------------------
// Name Generation
// ---------------------------------------------------------------------------

export async function generateName({ resourceType, values = {} }) {
  const { convention } = await getConvention();
  const ref = await loadReferenceData();

  // Find resource type definition
  const resourceDef = ref.resourceTypes.find(r => r.type === resourceType);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resourceType}`);
  }

  const delimiter = resourceDef.noDelimiter ? '' : (convention.delimiter || '-');
  const parts = [];

  for (const component of convention.components) {
    switch (component.type) {
      case 'prefix':
        parts.push(resourceDef.prefix);
        break;
      case 'custom':
        parts.push(values[component.label] || component.value || component.placeholder || '');
        break;
      case 'environment':
        parts.push(values.environment || component.value || config.environment || '');
        break;
      case 'scope':
        parts.push(values.scope || component.value || '');
        break;
      case 'region': {
        const regionCode = values.region || component.value || '';
        parts.push(regionCode);
        break;
      }
      case 'sequence': {
        const seq = values.sequence || component.value || '001';
        parts.push(seq);
        break;
      }
      default:
        if (component.value) parts.push(component.value);
    }
  }

  // Filter empty parts and join
  const filtered = parts.filter(p => p && p.trim());
  let name = filtered.join(delimiter);

  // Apply resource-specific rules
  if (resourceDef.noDelimiter) {
    name = name.replace(/-/g, '');
  }
  if (resourceDef.allowedChars === 'lowercase alphanumeric only') {
    name = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  } else if (resourceDef.allowedChars === 'alphanumeric only') {
    name = name.replace(/[^a-zA-Z0-9]/g, '');
  }

  // Truncate to max length
  if (resourceDef.maxLength && name.length > resourceDef.maxLength) {
    name = name.slice(0, resourceDef.maxLength);
  }

  return {
    name,
    resourceType: resourceDef.type,
    resourceLabel: resourceDef.label,
    prefix: resourceDef.prefix,
    maxLength: resourceDef.maxLength,
    valid: true,
    validationMessages: [],
  };
}

// ---------------------------------------------------------------------------
// Name Validation
// ---------------------------------------------------------------------------

export async function validateName({ name, resourceType }) {
  const ref = await loadReferenceData();
  const resourceDef = ref.resourceTypes.find(r => r.type === resourceType);

  const messages = [];
  let valid = true;

  if (!resourceDef) {
    return {
      valid: false,
      messages: [{ level: 'error', text: `Unknown resource type: ${resourceType}` }],
    };
  }

  // Length check
  if (resourceDef.maxLength && name.length > resourceDef.maxLength) {
    valid = false;
    messages.push({
      level: 'error',
      text: `Name exceeds maximum length of ${resourceDef.maxLength} characters (current: ${name.length})`,
    });
  }

  if (name.length === 0) {
    valid = false;
    messages.push({ level: 'error', text: 'Name cannot be empty' });
  }

  // Character restrictions
  if (resourceDef.allowedChars === 'lowercase alphanumeric only') {
    if (!/^[a-z0-9]+$/.test(name)) {
      valid = false;
      messages.push({
        level: 'error',
        text: 'Name must contain only lowercase letters and numbers (no hyphens, underscores, or special characters)',
      });
    }
  } else if (resourceDef.allowedChars === 'alphanumeric only') {
    if (!/^[a-zA-Z0-9]+$/.test(name)) {
      valid = false;
      messages.push({
        level: 'error',
        text: 'Name must contain only letters and numbers',
      });
    }
  } else {
    // General Azure naming: alphanumeric, hyphens, underscores
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-_]*[a-zA-Z0-9]$/.test(name) && name.length > 1) {
      if (/^-|^_|-$|_$/.test(name)) {
        valid = false;
        messages.push({
          level: 'error',
          text: 'Name cannot start or end with a hyphen or underscore',
        });
      }
      if (/[^a-zA-Z0-9\-_.]/.test(name)) {
        valid = false;
        messages.push({
          level: 'error',
          text: 'Name contains invalid characters. Only alphanumeric, hyphens, underscores, and periods are allowed.',
        });
      }
    }
    if (/--/.test(name)) {
      messages.push({
        level: 'warning',
        text: 'Name contains consecutive hyphens — this is valid but may indicate a missing segment',
      });
    }
  }

  // Prefix check
  const expectedPrefix = resourceDef.noDelimiter
    ? resourceDef.prefix
    : resourceDef.prefix + '-';
  const prefixNoDelim = resourceDef.prefix;

  if (!name.startsWith(expectedPrefix) && !name.startsWith(prefixNoDelim)) {
    messages.push({
      level: 'warning',
      text: `Name does not start with expected prefix "${resourceDef.prefix}" for ${resourceDef.label}`,
    });
  }

  return { valid, messages, maxLength: resourceDef.maxLength, prefix: resourceDef.prefix };
}

// ---------------------------------------------------------------------------
// Get reference data (for frontend)
// ---------------------------------------------------------------------------

export async function getReferenceData() {
  return loadReferenceData();
}

export default {
  getConvention,
  saveConvention,
  generateName,
  validateName,
  getReferenceData,
};
