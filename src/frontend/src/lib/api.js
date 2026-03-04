// ============================================================================
// Infrastructure Deployment Generator — API Client
// ============================================================================

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Auth token management (localStorage)
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'epic_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Fetch wrapper with auth header
// ---------------------------------------------------------------------------
async function fetchJSON(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  // Add auth token if available
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  // Handle 401 — clear token and signal logout
  if (res.status === 401) {
    clearToken();
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || 'Session expired. Please log in again.');
    err.status = 401;
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

// Raw fetch for multipart uploads (no JSON content-type)
async function fetchRaw(url, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || 'Session expired. Please log in again.');
    err.status = 401;
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function login(username, password) {
  // Login doesn't need auth token — call directly
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Login failed');
  }

  setToken(data.token);
  return data;
}

export async function logout() {
  try {
    await fetchJSON('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors — we're logging out anyway
  }
  clearToken();
}

export async function getMe() {
  return fetchJSON('/auth/me');
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export const getHealth = () => fetchJSON('/health');

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------
export const getServers = () => fetchJSON('/servers');
export const getServer = (hostname) => fetchJSON(`/servers/${hostname}`);
export const generateArm = (hostname) => fetchJSON(`/servers/${hostname}/arm`, { method: 'POST' });
export const generateLvm = (hostname) => fetchJSON(`/servers/${hostname}/lvm`, { method: 'POST' });
export const generateNsg = (hostname) => fetchJSON(`/servers/${hostname}/nsg`, { method: 'POST' });
export const generateTags = (hostname) => fetchJSON(`/servers/${hostname}/tags`, { method: 'POST' });

// ---------------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------------
export const sendMessage = (sessionId, message) =>
  fetchJSON('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message }),
  });

export const getChatHistory = () => fetchJSON('/ai/history');
export const getSessionHistory = (sessionId) => fetchJSON(`/ai/history/${sessionId}`);
export const deleteSession = (sessionId) => fetchJSON(`/ai/history/${sessionId}`, { method: 'DELETE' });

// Approvals
export const getApprovals = () => fetchJSON('/ai/approvals');
export const approveRequest = (id) => fetchJSON(`/ai/approvals/${id}/approve`, { method: 'POST' });
export const rejectRequest = (id) => fetchJSON(`/ai/approvals/${id}/reject`, { method: 'POST' });

// ---------------------------------------------------------------------------
// Excel Import
// ---------------------------------------------------------------------------
export async function uploadExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetchRaw('/import/preview', {
    method: 'POST',
    body: formData,
  });
}

export const applyImport = (changes) =>
  fetchJSON('/import/apply', {
    method: 'POST',
    body: JSON.stringify({ changes }),
  });
