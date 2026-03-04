import ReactMarkdown from 'react-markdown';

// ---------------------------------------------------------------------------
// Parse approval blocks from assistant messages
// ---------------------------------------------------------------------------
function extractApprovalInfo(content) {
  if (!content || typeof content !== 'string') return null;

  // Look for approval IDs in the text
  const approvalMatch = content.match(/approval[_ ]?(?:id|ID|Id)[:\s]*["`']?(apr-[a-z0-9]+)["`']?/i);
  if (!approvalMatch) return null;

  const approvalId = approvalMatch[1];

  // Try to extract the operation type
  let operationType = 'infrastructure operation';
  if (content.toLowerCase().includes('arm template')) operationType = 'ARM template deployment';
  else if (content.toLowerCase().includes('tag')) operationType = 'tag application';
  else if (content.toLowerCase().includes('resize')) operationType = 'VM resize';

  return { approvalId, operationType };
}

export default function ChatMessage({ message, onApprove, onReject }) {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const isToolResult = message.isToolResult;

  // Don't render tool result messages in UI
  if (isToolResult) return null;

  // Skip messages with null/empty content and no tool calls
  if (!message.content && (!message.toolCalls || message.toolCalls.length === 0)) return null;

  const approvalInfo = !isUser ? extractApprovalInfo(message.content) : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolCalls.map((tc, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono"
              >
                {tc.tool}
                {tc.input?.hostname && ` (${tc.input.hostname})`}
              </span>
            ))}
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-code:text-blue-700 prose-code:bg-blue-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100">
            <ReactMarkdown>{message.content || ''}</ReactMarkdown>
          </div>
        )}

        {/* Approval card */}
        {approvalInfo && onApprove && onReject && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm font-semibold text-amber-800">Approval Required</span>
            </div>
            <p className="text-xs text-amber-700 mb-3">
              <span className="font-mono bg-amber-100 px-1 rounded">{approvalInfo.approvalId}</span>
              {' — '}
              {approvalInfo.operationType}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(approvalInfo.approvalId)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(approvalInfo.approvalId)}
                className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
