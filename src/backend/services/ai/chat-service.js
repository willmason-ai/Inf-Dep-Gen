// ============================================================================
// Infrastructure Deployment Generator — Chat Service
// ============================================================================
// Orchestrates Claude conversations with tool calling.
// Handles the message loop, tool execution, and chat history persistence.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { buildSystemPrompt } from './system-prompt.js';
import { tools } from './tool-definitions.js';
import { executeTool } from './tool-executor.js';
import { getContainer } from '../../config/cosmos.js';
import { parseAllSpecs } from '../spec-parser.js';
import config from '../../config/index.js';

const MAX_TOOL_ITERATIONS = 10;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// In-memory chat history (fallback when Cosmos DB is offline)
// ---------------------------------------------------------------------------
const inMemorySessions = new Map();

// ---------------------------------------------------------------------------
// Get or create a chat session
// ---------------------------------------------------------------------------
async function getSession(sessionId) {
  const container = getContainer(config.cosmos.containers.chatHistory);

  if (container) {
    try {
      const { resource } = await container.item(sessionId, sessionId).read();
      if (resource) return resource;
    } catch (error) {
      // Item not found — will create new session
    }
  }

  // Check in-memory fallback
  if (inMemorySessions.has(sessionId)) {
    return inMemorySessions.get(sessionId);
  }

  // Create new session
  const session = {
    id: sessionId,
    sessionId,
    messages: [],
    preview: '',
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  };

  return session;
}

// ---------------------------------------------------------------------------
// Save a chat session
// ---------------------------------------------------------------------------
async function saveSession(session) {
  session.lastMessageAt = new Date().toISOString();

  // Set preview from first user message if not already set
  if (!session.preview) {
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const content = typeof firstUserMsg.content === 'string'
        ? firstUserMsg.content
        : '';
      session.preview = content.substring(0, 80);
    }
  }

  const container = getContainer(config.cosmos.containers.chatHistory);
  if (container) {
    try {
      await container.items.upsert(session);
      return;
    } catch (error) {
      console.warn('[ChatService] Failed to save session to Cosmos DB:', error.message);
    }
  }

  // Fallback to in-memory
  inMemorySessions.set(session.sessionId, session);
}

// ---------------------------------------------------------------------------
// Build server list for system prompt (with TTL cache)
// ---------------------------------------------------------------------------
let cachedServerList = null;
let cachedServerListAt = 0;

async function getServerList() {
  const now = Date.now();
  if (!cachedServerList || (now - cachedServerListAt) > CACHE_TTL_MS) {
    const specs = await parseAllSpecs();
    cachedServerList = specs.map(s => ({
      hostname: s.hostname,
      role: s.role,
      serverType: s.serverType,
      sku: s.sku,
      currentSku: s.currentSku,
      skuDeficient: s.skuDeficient,
      region: s.region,
      totalDisks: s.volumeGroups
        ? s.volumeGroups.reduce((sum, vg) => sum + (vg.diskCount || 0), 0)
        : s.diskGroups
          ? s.diskGroups.reduce((sum, dg) => sum + (typeof dg.diskCount === 'number' ? dg.diskCount : 0), 0)
          : 0,
    }));
    cachedServerListAt = now;
  }
  return cachedServerList;
}

// ---------------------------------------------------------------------------
// Build API-compatible messages from session history
// Handles both new-format (with content arrays for tool_use/tool_result)
// and old-format (plain text strings) messages gracefully
// ---------------------------------------------------------------------------
function buildApiMessages(sessionMessages) {
  const apiMessages = [];
  for (const msg of sessionMessages) {
    // Skip messages with undefined/null content
    if (msg.content === undefined || msg.content === null) continue;

    // If the message has apiContent (full tool_use/tool_result blocks), use that
    if (msg.apiContent) {
      apiMessages.push({ role: msg.role, content: msg.apiContent });
    } else {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }
  return apiMessages;
}

// ---------------------------------------------------------------------------
// Send a chat message and get a response
// ---------------------------------------------------------------------------
export async function chat(sessionId, userMessage) {
  if (!config.anthropic.apiKey) {
    return {
      sessionId,
      response: 'AI Assistant is not configured — the Anthropic API key is missing. Please set ANTHROPIC_API_KEY in your environment variables.',
      toolCalls: [],
    };
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  // Load session
  const session = await getSession(sessionId || uuidv4());

  // Build system prompt with server list
  const serverList = await getServerList();
  const systemPrompt = buildSystemPrompt(serverList);

  // Add user message to history
  session.messages.push({
    role: 'user',
    content: userMessage,
  });

  // Build messages for Claude API from session history
  const apiMessages = buildApiMessages(session.messages);

  let response;
  let toolCalls = [];
  let iterations = 0;

  // Tool-calling loop
  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    try {
      response = await client.messages.create({
        model: config.anthropic.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: apiMessages,
      });
    } catch (error) {
      console.error('[ChatService] Claude API error:', error.message);
      const errorMessage = `I encountered an error communicating with the Claude API: ${error.message}`;
      session.messages.push({ role: 'assistant', content: errorMessage });
      await saveSession(session);
      return { sessionId: session.sessionId, response: errorMessage, toolCalls };
    }

    // Check if Claude wants to use tools
    if (response.stop_reason === 'tool_use') {
      // Add Claude's response (with tool_use blocks) to API messages AND session
      apiMessages.push({
        role: 'assistant',
        content: response.content,
      });

      // Store in session with both apiContent (for replay) and displayText (for UI)
      const textParts = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text);
      session.messages.push({
        role: 'assistant',
        apiContent: response.content,
        content: textParts.join('\n') || null,
        displayText: textParts.join('\n') || null,
      });

      // Execute each tool call
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`[ChatService] Tool call: ${block.name}(${JSON.stringify(block.input)})`);
          toolCalls.push({
            tool: block.name,
            input: block.input,
            id: block.id,
          });

          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Add tool results to API messages AND session
      apiMessages.push({
        role: 'user',
        content: toolResults,
      });

      session.messages.push({
        role: 'user',
        apiContent: toolResults,
        content: null, // tool results are not shown in UI directly
        isToolResult: true,
      });
    } else {
      // Claude is done — extract text response
      break;
    }
  }

  // Extract the final text response
  const textBlocks = (response?.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text);
  const assistantMessage = textBlocks.join('\n') || 'I completed the request but have no additional text to share.';

  // Check for approval requests in the response content
  const approvalBlocks = (response?.content || [])
    .filter(block => block.type === 'tool_use' && block.name === 'confirm_approval');

  // Save final assistant message to session history
  session.messages.push({
    role: 'assistant',
    content: assistantMessage,
    apiContent: response?.content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  });

  await saveSession(session);

  return {
    sessionId: session.sessionId,
    response: assistantMessage,
    toolCalls,
    model: config.anthropic.model,
  };
}

// ---------------------------------------------------------------------------
// Get chat history (session list with previews)
// ---------------------------------------------------------------------------
export async function getChatHistory() {
  const container = getContainer(config.cosmos.containers.chatHistory);

  if (container) {
    try {
      const { resources } = await container.items
        .query('SELECT c.id, c.sessionId, c.preview, c.createdAt, c.lastMessageAt, ARRAY_LENGTH(c.messages) AS messageCount FROM c ORDER BY c.lastMessageAt DESC')
        .fetchAll();
      return resources;
    } catch (error) {
      console.warn('[ChatService] Failed to query Cosmos DB:', error.message);
    }
  }

  // Fallback to in-memory
  return Array.from(inMemorySessions.values()).map(s => ({
    sessionId: s.sessionId,
    preview: s.preview || '',
    createdAt: s.createdAt,
    lastMessageAt: s.lastMessageAt,
    messageCount: s.messages.length,
  }));
}

// ---------------------------------------------------------------------------
// Get a specific chat session
// ---------------------------------------------------------------------------
export async function getSessionHistory(sessionId) {
  return getSession(sessionId);
}

// ---------------------------------------------------------------------------
// Delete a chat session
// ---------------------------------------------------------------------------
export async function deleteSessionHistory(sessionId) {
  const container = getContainer(config.cosmos.containers.chatHistory);

  if (container) {
    try {
      await container.item(sessionId, sessionId).delete();
      return { deleted: true };
    } catch (error) {
      if (error.code === 404) {
        return { deleted: false, message: 'Session not found' };
      }
      throw error;
    }
  }

  // Fallback to in-memory
  if (inMemorySessions.has(sessionId)) {
    inMemorySessions.delete(sessionId);
    return { deleted: true };
  }
  return { deleted: false, message: 'Session not found' };
}

// ---------------------------------------------------------------------------
// Clear server list cache (called by refresh_specs tool)
// ---------------------------------------------------------------------------
export function clearServerListCache() {
  cachedServerList = null;
  cachedServerListAt = 0;
}

// Register with tool-executor so refresh_specs can clear our cache without circular import
import { registerCacheClearer } from './tool-executor.js';
registerCacheClearer(clearServerListCache);

export default { chat, getChatHistory, getSessionHistory, deleteSessionHistory, clearServerListCache };
