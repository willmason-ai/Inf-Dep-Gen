import { useState, useRef, useEffect } from 'react';
import { sendMessage, getChatHistory, getSessionHistory, deleteSession } from '../lib/api';
import ChatMessage from '../components/ChatMessage';
import ChatSidebar from '../components/ChatSidebar';

export default function AiChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);

  // Sidebar state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load session list on mount
  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setSessionsLoading(true);
      const result = await getChatHistory();
      setSessions(result.sessions || []);
    } catch {
      // Silently fail — sidebar just shows empty
    } finally {
      setSessionsLoading(false);
    }
  }

  async function handleSelectSession(selectedSessionId) {
    if (selectedSessionId === sessionId) return;

    try {
      const session = await getSessionHistory(selectedSessionId);
      if (session && session.messages) {
        setSessionId(session.sessionId);
        // Filter out tool result messages for display
        const displayMessages = session.messages.filter(m =>
          !m.isToolResult && (m.content || (m.toolCalls && m.toolCalls.length > 0))
        );
        setMessages(displayMessages);
        setError(null);
        inputRef.current?.focus();
      }
    } catch (err) {
      setError(`Failed to load session: ${err.message}`);
    }
  }

  async function handleDeleteSession(deletedSessionId) {
    try {
      await deleteSession(deletedSessionId);
      setSessions(prev => prev.filter(s => s.sessionId !== deletedSessionId));
      // If we deleted the active session, clear the chat
      if (deletedSessionId === sessionId) {
        handleNewSession();
      }
    } catch (err) {
      setError(`Failed to delete session: ${err.message}`);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const result = await sendMessage(sessionId, msg);
      setSessionId(result.sessionId);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.response,
          toolCalls: result.toolCalls,
        },
      ]);
      // Refresh session list to show updated/new session
      loadSessions();
    } catch (err) {
      setError(err.message);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // Handle approval/rejection via chat message to AI
  async function handleApproval(approvalId) {
    const msg = `I approve the operation. Please execute approval ${approvalId}.`;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setError(null);

    try {
      const result = await sendMessage(sessionId, msg);
      setSessionId(result.sessionId);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.response,
          toolCalls: result.toolCalls,
        },
      ]);
      loadSessions();
    } catch (err) {
      setError(err.message);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRejection(approvalId) {
    const msg = `I reject approval ${approvalId}. Do not execute this operation.`;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setError(null);

    try {
      const result = await sendMessage(sessionId, msg);
      setSessionId(result.sessionId);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.response,
          toolCalls: result.toolCalls,
        },
      ]);
      loadSessions();
    } catch (err) {
      setError(err.message);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleNewSession() {
    setMessages([]);
    setSessionId(null);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-72 flex-shrink-0 hidden md:block">
          <ChatSidebar
            sessions={sessions}
            activeSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            loading={sessionsLoading}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors hidden md:block"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">AI Assistant</h1>
              <p className="text-xs text-gray-500">
                AI-powered infrastructure assistant &middot; Claude with tool calling
              </p>
            </div>
          </div>
          <button
            onClick={handleNewSession}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            New Session
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-gray-400 mb-2">AI Assistant</h2>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Ask about servers, generate ARM templates, compare spec vs. actual, or review deficiencies.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What servers do you manage?',
                  'Discover the Azure environment',
                  'Generate ARM template for a server',
                  'Validate all servers',
                  'List all deficiencies',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-gray-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              message={msg}
              onApprove={!loading ? handleApproval : undefined}
              onReject={!loading ? handleRejection : undefined}
            />
          ))}

          {loading && (
            <div className="flex items-center space-x-2 text-gray-500">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm">AI is thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t bg-white px-4 py-3">
          {error && (
            <div className="mb-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </div>
          )}
          <form onSubmit={handleSend} className="flex space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your servers..."
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
