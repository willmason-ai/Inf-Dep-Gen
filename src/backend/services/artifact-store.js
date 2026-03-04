// ============================================================================
// Infrastructure Deployment Generator — Artifact Store
// ============================================================================
// Saves and retrieves generated artifacts (ARM templates, LVM scripts, etc.)
// to/from the Cosmos DB generatedArtifacts container.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Save an artifact
// ---------------------------------------------------------------------------
export async function saveArtifact(hostname, type, content, summary) {
  const container = getContainer(config.cosmos.containers.generatedArtifacts);
  if (!container) {
    console.warn('[ArtifactStore] Cosmos DB offline — artifact not saved');
    return null;
  }

  const artifact = {
    id: uuidv4(),
    hostname,
    type,           // 'arm', 'lvm', 'nsg', 'tag'
    content,        // The full template/script content
    summary,        // Human-readable summary
    environment: config.environment,
    generatedAt: new Date().toISOString(),
    generatedBy: 'inf-dep-gen',
  };

  try {
    const { resource } = await container.items.create(artifact);
    console.log(`[ArtifactStore] Saved ${type} artifact for ${hostname}: ${resource.id}`);
    return resource;
  } catch (error) {
    console.error(`[ArtifactStore] Failed to save ${type} artifact for ${hostname}:`, error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Get latest artifact by hostname and type
// ---------------------------------------------------------------------------
export async function getLatestArtifact(hostname, type) {
  const container = getContainer(config.cosmos.containers.generatedArtifacts);
  if (!container) return null;

  try {
    const query = {
      query: 'SELECT TOP 1 * FROM c WHERE c.hostname = @hostname AND c.type = @type ORDER BY c.generatedAt DESC',
      parameters: [
        { name: '@hostname', value: hostname },
        { name: '@type', value: type },
      ],
    };

    const { resources } = await container.items.query(query).fetchAll();
    return resources[0] || null;
  } catch (error) {
    console.error(`[ArtifactStore] Failed to retrieve ${type} artifact for ${hostname}:`, error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Get all artifacts for a hostname
// ---------------------------------------------------------------------------
export async function getArtifactsByHostname(hostname) {
  const container = getContainer(config.cosmos.containers.generatedArtifacts);
  if (!container) return [];

  try {
    const query = {
      query: 'SELECT * FROM c WHERE c.hostname = @hostname ORDER BY c.generatedAt DESC',
      parameters: [{ name: '@hostname', value: hostname }],
    };

    const { resources } = await container.items.query(query).fetchAll();
    return resources;
  } catch (error) {
    console.error(`[ArtifactStore] Failed to retrieve artifacts for ${hostname}:`, error.message);
    return [];
  }
}

export default { saveArtifact, getLatestArtifact, getArtifactsByHostname };
