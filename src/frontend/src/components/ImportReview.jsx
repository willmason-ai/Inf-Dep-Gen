import { useState } from 'react';
import { applyImport } from '../lib/api';

function ChangeValue({ label, value }) {
  if (value === null || value === undefined) return <span className="text-gray-400 italic">none</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'object') return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

function FieldLabel({ field }) {
  // Make field names human-readable
  const parts = field.split('.');
  const last = parts[parts.length - 1];
  const labels = {
    sku: 'VM SKU',
    currentSku: 'Current SKU',
    skuDeficient: 'SKU Deficient',
    os: 'Operating System',
    osDiskType: 'OS Disk Type',
    osDiskSnapshots: 'OS Disk Snapshots',
    diskCount: 'Disk Count',
    iops: 'IOPS',
    throughputMBs: 'Throughput (MB/s)',
    sizeGB: 'Size (GB)',
    snapshots: 'Snapshots',
  };
  return <span className="font-medium">{labels[last] || field}</span>;
}

export default function ImportReview({ data, onClose, onApplied }) {
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedServers, setSelectedServers] = useState(() => {
    // Pre-select all servers with changes
    const selected = new Set();
    if (data?.report?.servers) {
      for (const s of data.report.servers) {
        if (s.changeCount > 0) selected.add(s.hostname);
      }
    }
    return selected;
  });

  function toggleServer(hostname) {
    setSelectedServers(prev => {
      const next = new Set(prev);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      return next;
    });
  }

  async function handleApply() {
    const changes = data.report.servers
      .filter(s => selectedServers.has(s.hostname) && s.changeCount > 0)
      .map(s => ({ hostname: s.hostname, changes: s.changes }));

    if (changes.length === 0) return;

    setApplying(true);
    setError(null);

    try {
      const res = await applyImport(changes);
      setResult(res);
      if (onApplied) onApplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const report = data?.report;
  const serversWithChanges = report?.servers?.filter(s => s.changeCount > 0) || [];
  const serversNoChanges = report?.servers?.filter(s => s.changeCount === 0) || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Review</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {data?.fileName} &middot; {report?.matched || 0} servers matched &middot; {report?.withChanges || 0} with changes
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Parse Warnings */}
          {data?.parseWarnings?.length > 0 && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h3 className="text-sm font-medium text-yellow-800 mb-1">Parse Warnings</h3>
              <ul className="text-xs text-yellow-700 space-y-0.5">
                {data.parseWarnings.map((w, i) => <li key={i}>&bull; {w}</li>)}
              </ul>
            </div>
          )}

          {/* Unmatched servers */}
          {report?.unmatched?.length > 0 && (
            <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-1">
                Unmatched Servers ({report.unmatched.length})
              </h3>
              <p className="text-xs text-gray-500 mb-1">
                These servers were found in the Excel but don't exist in the application:
              </p>
              <div className="flex flex-wrap gap-1">
                {report.unmatched.map(u => (
                  <span key={u.hostname} className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-mono">
                    {u.hostname}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Result after apply */}
          {result && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <h3 className="text-sm font-medium text-green-800">
                Import Complete — {result.totalUpdated} server(s) updated
              </h3>
              {result.totalErrors > 0 && (
                <p className="text-xs text-red-600 mt-1">{result.totalErrors} error(s) occurred</p>
              )}
              <ul className="text-xs text-green-700 mt-1 space-y-0.5">
                {result.results.map(r => (
                  <li key={r.hostname}>
                    <span className="font-mono">{r.hostname}</span>: {r.status}
                    {r.changesApplied && ` (${r.changesApplied} changes)`}
                    {r.message && ` — ${r.message}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Servers with changes */}
          {serversWithChanges.length > 0 ? (
            <div className="space-y-3">
              {serversWithChanges.map(server => (
                <div key={server.hostname} className="border rounded-lg overflow-hidden">
                  <div
                    className={`px-4 py-2.5 flex items-center justify-between cursor-pointer ${
                      selectedServers.has(server.hostname) ? 'bg-blue-50 border-b border-blue-100' : 'bg-gray-50'
                    }`}
                    onClick={() => toggleServer(server.hostname)}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedServers.has(server.hostname)}
                        onChange={() => toggleServer(server.hostname)}
                        className="rounded text-blue-600"
                      />
                      <div>
                        <span className="font-mono text-sm font-medium text-blue-700">{server.hostname}</span>
                        <span className="text-xs text-gray-500 ml-2">{server.role}</span>
                        {(server.epicTier || server.stamp) && (
                          <div className="flex items-center space-x-1 mt-0.5">
                            {server.epicTier && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{server.epicTier}</span>
                            )}
                            {server.stamp && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{server.stamp}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                      {server.changeCount} change{server.changeCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {selectedServers.has(server.hostname) && (
                    <div className="px-4 py-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase">
                            <th className="text-left py-1 font-medium">Field</th>
                            <th className="text-left py-1 font-medium">Current</th>
                            <th className="text-center py-1 font-medium w-8"></th>
                            <th className="text-left py-1 font-medium">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {server.changes.map((change, i) => (
                            <tr key={i}>
                              <td className="py-1.5 text-gray-700">
                                <FieldLabel field={change.field} />
                              </td>
                              <td className="py-1.5 text-red-600 font-mono text-xs">
                                <ChangeValue label="current" value={change.current} />
                              </td>
                              <td className="py-1.5 text-center text-gray-400">&rarr;</td>
                              <td className="py-1.5 text-green-600 font-mono text-xs">
                                <ChangeValue label="incoming" value={change.incoming} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p className="text-lg font-medium">No Changes Detected</p>
              <p className="text-sm mt-1">The Excel file matches the current server specs.</p>
            </div>
          )}

          {/* Unchanged servers */}
          {serversNoChanges.length > 0 && (
            <div className="mt-4 text-xs text-gray-400">
              <p>{serversNoChanges.length} server(s) unchanged: {serversNoChanges.map(s => s.hostname).join(', ')}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {selectedServers.size} server(s) selected for update
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && serversWithChanges.length > 0 && (
              <button
                onClick={handleApply}
                disabled={applying || selectedServers.size === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {applying ? 'Applying...' : `Apply Changes (${selectedServers.size})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
