// ============================================================================
// Infrastructure Deployment Generator — Cosmos DB Client
// ============================================================================
// Singleton client for Azure Cosmos DB (NoSQL API).
// Handles database and container initialization.
// ============================================================================

import { CosmosClient } from '@azure/cosmos';
import config from './index.js';

let client = null;
let database = null;

// ---------------------------------------------------------------------------
// Container definitions with partition keys
// ---------------------------------------------------------------------------
const containerDefinitions = [
  { id: 'serverSpecs',         partitionKey: '/hostname' },
  { id: 'generatedArtifacts',  partitionKey: '/hostname' },
  { id: 'auditLog',            partitionKey: '/date' },
  { id: 'chatHistory',         partitionKey: '/sessionId' },
  { id: 'deficiencies',        partitionKey: '/issueId' },
  { id: 'guardrailRules',      partitionKey: '/ruleId' },
  { id: 'appConfig',           partitionKey: '/configKey' },
];

// ---------------------------------------------------------------------------
// Initialize client
// ---------------------------------------------------------------------------
function getClient() {
  if (!client) {
    if (!config.cosmos.endpoint || !config.cosmos.key) {
      console.warn('[Cosmos] No endpoint/key configured — running in offline mode');
      return null;
    }
    client = new CosmosClient({
      endpoint: config.cosmos.endpoint,
      key: config.cosmos.key,
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Initialize database and containers
// ---------------------------------------------------------------------------
export async function initializeDatabase() {
  const cosmosClient = getClient();
  if (!cosmosClient) {
    console.warn('[Cosmos] Skipping database initialization (offline mode)');
    return false;
  }

  try {
    // Create database if it doesn't exist
    const { database: db } = await cosmosClient.databases.createIfNotExists({
      id: config.cosmos.database,
    });
    database = db;
    console.log(`[Cosmos] Database "${config.cosmos.database}" ready`);

    // Create containers if they don't exist
    for (const containerDef of containerDefinitions) {
      await database.containers.createIfNotExists({
        id: containerDef.id,
        partitionKey: { paths: [containerDef.partitionKey] },
      });
      console.log(`[Cosmos]   Container "${containerDef.id}" ready`);
    }

    return true;
  } catch (error) {
    console.error('[Cosmos] Initialization failed:', error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Get a container reference
// ---------------------------------------------------------------------------
export function getContainer(containerName) {
  if (!database) {
    const cosmosClient = getClient();
    if (!cosmosClient) return null;
    database = cosmosClient.database(config.cosmos.database);
  }
  return database.container(containerName);
}

// ---------------------------------------------------------------------------
// Get the database reference
// ---------------------------------------------------------------------------
export function getDatabase() {
  return database;
}

// ---------------------------------------------------------------------------
// Health check — verify connectivity
// ---------------------------------------------------------------------------
export async function checkCosmosHealth() {
  const cosmosClient = getClient();
  if (!cosmosClient) {
    return { status: 'offline', message: 'No Cosmos DB credentials configured' };
  }

  try {
    const { resource } = await cosmosClient.getDatabaseAccount();
    return {
      status: 'connected',
      endpoint: config.cosmos.endpoint,
      consistencyLevel: resource.consistencyPolicy?.defaultConsistencyLevel,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
    };
  }
}

export default {
  initializeDatabase,
  getContainer,
  getDatabase,
  checkCosmosHealth,
};
