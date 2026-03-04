// ============================================================================
// Infrastructure Deployment Generator — AI Chat API
// ============================================================================

import { Router } from 'express';
import { chat, getChatHistory, getSessionHistory, deleteSessionHistory } from '../services/ai/chat-service.js';
import { listPendingApprovals, approveRequest, rejectRequest, getApprovalStatus } from '../services/ai/approval-manager.js';

const router = Router();

// POST /api/ai/chat — Send a message to AI Assistant
router.post('/chat', async (req, res, next) => {
  try {
    const { sessionId, message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'A non-empty "message" field is required',
      });
    }

    const result = await chat(sessionId, message.trim());
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/ai/history — List all chat sessions
router.get('/history', async (req, res, next) => {
  try {
    const sessions = await getChatHistory();
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

// GET /api/ai/history/:sessionId — Get a specific session's messages
router.get('/history/:sessionId', async (req, res, next) => {
  try {
    const session = await getSessionHistory(req.params.sessionId);
    if (!session || !session.messages || session.messages.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No chat session found with ID: ${req.params.sessionId}`,
      });
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/ai/history/:sessionId — Delete a chat session
router.delete('/history/:sessionId', async (req, res, next) => {
  try {
    const result = await deleteSessionHistory(req.params.sessionId);
    if (!result.deleted) {
      return res.status(404).json({
        error: 'Not Found',
        message: result.message || `No chat session found with ID: ${req.params.sessionId}`,
      });
    }
    res.json({ message: 'Session deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Approval API
// ============================================================================

// GET /api/ai/approvals — List pending approvals
router.get('/approvals', async (req, res, next) => {
  try {
    const approvals = await listPendingApprovals();
    res.json({ count: approvals.length, approvals });
  } catch (error) {
    next(error);
  }
});

// GET /api/ai/approvals/:id — Get approval status
router.get('/approvals/:id', async (req, res, next) => {
  try {
    const result = await getApprovalStatus(req.params.id);
    if (result.error) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/approvals/:id/approve — Approve a request
router.post('/approvals/:id/approve', async (req, res, next) => {
  try {
    const result = await approveRequest(req.params.id);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/approvals/:id/reject — Reject a request
router.post('/approvals/:id/reject', async (req, res, next) => {
  try {
    const result = await rejectRequest(req.params.id);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
