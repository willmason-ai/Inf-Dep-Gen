import { useState, useEffect, useRef } from 'react';
import { getServers, getServer, generateArm, generateLvm, generateNsg, generateTags, uploadExcel } from '../lib/api';
import ServerDetail from '../components/ServerDetail';
import ArtifactViewer from '../components/ArtifactViewer';
import ImportReview from '../components/ImportReview';

export default function Dashboard() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedServer, setExpandedServer] = useState(null);
  const [serverDetail, setServerDetail] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [generating, setGenerating] = useState(null);

  // Import state
  const [importData, setImportData] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    try {
      setLoading(true);
      const data = await getServers();
      setServers(data.servers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleServer(hostname) {
    if (expandedServer === hostname) {
      setExpandedServer(null);
      setServerDetail(null);
      return;
    }
    try {
      const detail = await getServer(hostname);
      setServerDetail(detail);
      setExpandedServer(hostname);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGenerate(hostname, type) {
    setGenerating(`${hostname}-${type}`);
    try {
      let result;
      switch (type) {
        case 'arm': result = await generateArm(hostname); break;
        case 'lvm': result = await generateLvm(hostname); break;
        case 'nsg': result = await generateNsg(hostname); break;
        case 'tags': result = await generateTags(hostname); break;
        default: return;
      }
      setArtifact({ hostname, type, ...result });
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(null);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const data = await uploadExcel(file);
      setImportData(data);
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleImportApplied() {
    // Reload servers after import
    loadServers();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading servers...</div>
      </div>
    );
  }

  const odbServers = servers.filter(s => s.serverType === 'odb');
  const sqlServers = servers.filter(s => s.serverType === 'sql');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Server Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {servers.length} managed servers &middot; {odbServers.length} ODB &middot; {sqlServers.length} SQL
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>{importing ? 'Parsing...' : 'Import Specs'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* ODB Servers */}
      <ServerSection
        title="ODB Servers (RHEL-8)"
        servers={odbServers}
        expandedServer={expandedServer}
        serverDetail={serverDetail}
        generating={generating}
        onToggle={toggleServer}
        onGenerate={handleGenerate}
      />

      {/* SQL Servers */}
      <ServerSection
        title="SQL Servers (Windows Server 2022)"
        servers={sqlServers}
        expandedServer={expandedServer}
        serverDetail={serverDetail}
        generating={generating}
        onToggle={toggleServer}
        onGenerate={handleGenerate}
      />

      {/* Artifact Viewer Modal */}
      {artifact && (
        <ArtifactViewer
          artifact={artifact}
          onClose={() => setArtifact(null)}
        />
      )}

      {/* Import Review Modal */}
      {importData && (
        <ImportReview
          data={importData}
          onClose={() => setImportData(null)}
          onApplied={handleImportApplied}
        />
      )}
    </div>
  );
}

function ServerSection({ title, servers, expandedServer, serverDetail, generating, onToggle, onGenerate }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hostname</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disks</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {servers.map(server => (
              <ServerRow
                key={server.hostname}
                server={server}
                isExpanded={expandedServer === server.hostname}
                detail={expandedServer === server.hostname ? serverDetail : null}
                generating={generating}
                onToggle={() => onToggle(server.hostname)}
                onGenerate={(type) => onGenerate(server.hostname, type)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServerRow({ server, isExpanded, detail, generating, onToggle, onGenerate }) {
  const isOdb = server.serverType === 'odb';
  const statusBadge = server.skuDeficient
    ? 'bg-red-100 text-red-700'
    : server.deficiencyCount > 0
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-green-100 text-green-700';

  const statusText = server.skuDeficient
    ? 'SKU Deficient'
    : server.deficiencyCount > 0
      ? `${server.deficiencyCount} Issue(s)`
      : 'Compliant';

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-sm font-mono font-medium text-blue-600">{server.hostname}</td>
        <td className="px-4 py-3 text-sm text-gray-700">{server.role}</td>
        <td className="px-4 py-3 text-sm">
          <span className="font-mono text-xs">{server.sku}</span>
          {server.skuDeficient && (
            <span className="block text-xs text-red-500">Built: {server.currentSku}</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {server.regionCode === 'eus2' ? 'East US 2' : 'West US 2'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{server.totalDisks}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadge}`}>
            {statusText}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex space-x-1" onClick={e => e.stopPropagation()}>
            <ActionBtn label="ARM" onClick={() => onGenerate('arm')} loading={generating === `${server.hostname}-arm`} />
            {isOdb && <ActionBtn label="LVM" onClick={() => onGenerate('lvm')} loading={generating === `${server.hostname}-lvm`} />}
            <ActionBtn label="NSG" onClick={() => onGenerate('nsg')} loading={generating === `${server.hostname}-nsg`} />
            <ActionBtn label="Tags" onClick={() => onGenerate('tags')} loading={generating === `${server.hostname}-tags`} />
          </div>
        </td>
      </tr>
      {isExpanded && detail && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-gray-50">
            <ServerDetail spec={detail} />
          </td>
        </tr>
      )}
    </>
  );
}

function ActionBtn({ label, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 transition-colors"
    >
      {loading ? '...' : label}
    </button>
  );
}
