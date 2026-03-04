// ============================================================================
// Infrastructure Deployment Generator — Configuration
// ============================================================================
// Loads environment variables and exports a structured config object.
// All resource groups, network defaults, and credentials are env-var driven.
// ============================================================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// ---------------------------------------------------------------------------
// Parse permitted resource groups from environment variable (comma-separated)
// ---------------------------------------------------------------------------
function parsePermittedResourceGroups() {
  const rgEnv = process.env.PERMITTED_RESOURCE_GROUPS || '';
  if (!rgEnv.trim()) return [];
  return rgEnv.split(',').map(rg => rg.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Build resource group mapping from environment variables
// ---------------------------------------------------------------------------
function buildResourceGroups() {
  const rgs = {};
  // Support named RG env vars (e.g., AZURE_RG_COMPUTE, AZURE_RG_NETWORK, etc.)
  const rgPrefix = 'AZURE_RG_';
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(rgPrefix) && value) {
      const name = key.slice(rgPrefix.length).toLowerCase();
      rgs[name] = value;
    }
  }
  return rgs;
}

// ---------------------------------------------------------------------------
// Build network defaults from environment variables
// ---------------------------------------------------------------------------
function buildNetworkDefaults() {
  const defaults = {};
  if (process.env.AZURE_VNET_PRIMARY) defaults.vnetPrimary = process.env.AZURE_VNET_PRIMARY;
  if (process.env.AZURE_SUBNET_PRIMARY) defaults.subnetPrimary = process.env.AZURE_SUBNET_PRIMARY;
  if (process.env.AZURE_VNET_SECONDARY) defaults.vnetSecondary = process.env.AZURE_VNET_SECONDARY;
  if (process.env.AZURE_SUBNET_SECONDARY) defaults.subnetSecondary = process.env.AZURE_SUBNET_SECONDARY;
  if (process.env.AZURE_BASTION_NAME) defaults.bastionName = process.env.AZURE_BASTION_NAME;
  return defaults;
}

// ---------------------------------------------------------------------------
// Main config export
// ---------------------------------------------------------------------------
const appEnvironment = process.env.APP_ENVIRONMENT || 'lab';

const config = {
  // App
  app: {
    port: parseInt(process.env.PORT || process.env.APP_PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'debug',
  },

  // Azure Service Principal
  azure: {
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
  },

  // Cosmos DB
  cosmos: {
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
    database: process.env.COSMOS_DB_DATABASE || 'infDepGen',
    containers: {
      serverSpecs: 'serverSpecs',
      generatedArtifacts: 'generatedArtifacts',
      auditLog: 'auditLog',
      chatHistory: 'chatHistory',
      deficiencies: 'deficiencies',
      guardrailRules: 'guardrailRules',
      appConfig: 'appConfig',
    },
  },

  // Claude AI
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-opus-4-6',
  },

  // Authentication
  auth: {
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'Admin2026!',
    sessionTtlHours: 24,
  },

  // Environment profile
  environment: appEnvironment,
  profile: {
    resourceGroups: buildResourceGroups(),
    diskDefaults: {
      osDiskType: 'Premium_LRS',
      dataDiskType: 'PremiumV2_LRS',
    },
    networkDefaults: buildNetworkDefaults(),
  },
  permittedResourceGroups: parsePermittedResourceGroups(),

  // Project paths
  paths: {
    root: resolve(__dirname, '../../..'),
    serverSpecs: process.env.SERVER_SPECS_DIR || resolve(__dirname, '../../../docs/server-specs'),
    templates: resolve(__dirname, '../../../templates'),
    scripts: resolve(__dirname, '../../../scripts'),
  },
};

export default config;
