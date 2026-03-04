import { useState } from 'react';

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  loading,
}) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  function handleDelete(e, sessionId) {
    e.stopPropagation();
    if (confirmDelete === sessionId) {
      onDeleteSession(sessionId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(sessionId);
      // Auto-cancel confirm after 3 seconds
      setTimeout(() => setConfirmDelete(prev => prev === sessionId ? null : prev), 3000);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={onNewSession}
          className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Chat</span>
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-400 text-sm">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">No chat history yet</div>
        ) : (
          <div className="py-1">
            {sessions.map(session => {
              const isActive = session.sessionId === activeSessionId;
              return (
                <div
                  key={session.sessionId}
                  onClick={() => onSelectSession(session.sessionId)}
                  className={`group px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-blue-100 border border-blue-200'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'font-medium text-blue-900' : 'text-gray-800'}`}>
                        {session.preview || 'New conversation'}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {formatDate(session.lastMessageAt || session.createdAt)}
                        </span>
                        {session.messageCount > 0 && (
                          <span className="text-xs text-gray-400">
                            &middot; {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, session.sessionId)}
                      className={`ml-2 p-1 rounded transition-colors flex-shrink-0 ${
                        confirmDelete === session.sessionId
                          ? 'bg-red-100 text-red-600'
                          : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50'
                      }`}
                      title={confirmDelete === session.sessionId ? 'Click again to confirm' : 'Delete session'}
                    >
                      {confirmDelete === session.sessionId ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
