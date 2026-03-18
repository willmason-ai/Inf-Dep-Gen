import { useState, useEffect, useRef } from 'react';
import { getServers, getServer, generateArm, generateLvm, generateNsg, generateTags, uploadExcel } from '../lib/api';
import ServerDetail from '../components/ServerDetail';
import ArtifactViewer from '../components/ArtifactViewer';
import ImportReview from '../components/ImportReview';
import NamingConvention from '../components/NamingConvention';
import NetworkingConfig from '../components/NetworkingConfig';
import AvsConfig from '../components/AvsConfig';
import CompanionVMForm from '../components/CompanionVMForm';

// ---------------------------------------------------------------------------
// Collapsible Section wrapper
// ---------------------------------------------------------------------------
function Section({ id, title, subtitle, icon, expanded, onToggle, children, badge, headerActions }) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold text-gray-800">{title}</h2>
              {badge && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {expanded && headerActions && (
            <div onClick={e => e.stopPropagation()}>
              {headerActions}
            </div>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  // Section collapse state
  const [expandedSections, setExpandedSections] = useState(new Set(['naming']));

  // Server/compute state
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

  // Companion VM creation
  const [showCompanionForm, setShowCompanionForm] = useState(false);

  useEffect(() => {
    loadServers();
  }, []);

  function toggleSection(id) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- Server data ---
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

  // --- Excel import ---
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
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleImportApplied() {
    loadServers();
  }

  // --- Derived data ---
  const odbServers = servers.filter(s => s.serverType === 'odb');
  const sqlServers = servers.filter(s => s.serverType === 'sql');
  const companionServers = servers.filter(s => s.serverType === 'companion');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Infrastructure Deployment Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Plan and deploy AVS and supporting infrastructure across Networking, Shared Services, and AVS subscriptions.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      <div className="space-y-4">
        {/* ============================================================ */}
        {/* NAMING CONVENTION */}
        {/* ============================================================ */}
        <Section
          id="naming"
          title="Naming Convention"
          subtitle="Global naming rules applied across AVS, Networking, and Shared Services subscriptions"
          icon={<svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>}
          expanded={expandedSections.has('naming')}
          onToggle={toggleSection}
        >
          <NamingConvention />
        </Section>

        {/* ============================================================ */}
        {/* NETWORKING */}
        {/* ============================================================ */}
        <Section
          id="networking"
          title="Networking"
          subtitle="Hub VNet, ExpressRoute, Global Reach, Bastion, firewall — AVS connectivity foundation"
          icon={<svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>}
          expanded={expandedSections.has('networking')}
          onToggle={toggleSection}
        >
          <NetworkingConfig />
        </Section>

        {/* ============================================================ */}
        {/* COMPUTE */}
        {/* ============================================================ */}
        <Section
          id="compute"
          title="Compute"
          subtitle={loading ? 'Loading...' : `${servers.length} total \u00b7 ${companionServers.length} Companion \u00b7 ${odbServers.length} ODB \u00b7 ${sqlServers.length} SQL`}
          icon={<svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>}
          expanded={expandedSections.has('compute')}
          onToggle={toggleSection}
          headerActions={
            <button
              onClick={() => setShowCompanionForm(true)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-1.5"
            >
              <span>+ Companion VM</span>
            </button>
          }
        >
          {loading ? (
            <div className="text-gray-500 text-sm py-4">Loading servers...</div>
          ) : (
            <div className="space-y-6">
              {/* Companion VMs */}
              <ServerSection
                title="Companion VMs (Jumpboxes, DNS, Backup)"
                servers={companionServers}
                expandedServer={expandedServer}
                serverDetail={serverDetail}
                generating={generating}
                onToggle={toggleServer}
                onGenerate={handleGenerate}
              />
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
            </div>
          )}
        </Section>

        {/* ============================================================ */}
        {/* AVS */}
        {/* ============================================================ */}
        <Section
          id="avs"
          title="AVS (Azure VMware Solution)"
          subtitle="Private cloud provisioning, cluster sizing, NSX-T segments, HCX configuration"
          icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>}
          expanded={expandedSections.has('avs')}
          onToggle={toggleSection}
        >
          <AvsConfig />
        </Section>

        {/* ============================================================ */}
        {/* EXCEL UPLOAD */}
        {/* ============================================================ */}
        <Section
          id="excel"
          title="Excel Upload"
          subtitle="Import host sizing BOMs, IP planning sheets, and server specs"
          icon={<svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
          expanded={expandedSections.has('excel')}
          onToggle={toggleSection}
          headerActions={
            <>
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
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center space-x-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>{importing ? 'Parsing...' : 'Upload File'}</span>
              </button>
            </>
          }
        >
          <ExcelUploadSection
            fileInputRef={fileInputRef}
            importing={importing}
            onUpload={handleFileUpload}
          />
        </Section>
      </div>

      {/* Artifact Viewer Modal */}
      {artifact && (
        <ArtifactViewer
          artifact={artifact}
          onClose={() => setArtifact(null)}
        />
      )}

      {/* Companion VM Form Modal */}
      {showCompanionForm && (
        <CompanionVMForm
          onCreated={loadServers}
          onClose={() => setShowCompanionForm(false)}
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

// ---------------------------------------------------------------------------
// Server Section (ODB / SQL tables) — unchanged from before
// ---------------------------------------------------------------------------
function ServerSection({ title, servers, expandedServer, serverDetail, generating, onToggle, onGenerate }) {
  if (servers.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
  const isCompanion = server.serverType === 'companion';
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

// ---------------------------------------------------------------------------
// Excel Upload Section content
// ---------------------------------------------------------------------------
function ExcelUploadSection({ fileInputRef, importing, onUpload }) {
  return (
    <div className="text-center py-8">
      <svg className="mx-auto w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="mt-3 text-sm text-gray-600">
        Upload an Excel file (.xlsx) containing server specs, host sizing BOMs, or IP planning sheets.
      </p>
      <p className="text-xs text-gray-400 mt-1">
        Supports Compute BOM, Storage BOM, and infrastructure planning sheets. Data will be compared against existing specs.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={onUpload}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="mt-4 px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
      >
        {importing ? 'Parsing...' : 'Choose File to Upload'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder for future sections
// ---------------------------------------------------------------------------
function PlaceholderSection({ title, description, features }) {
  return (
    <div className="text-center py-6">
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium mb-3">
        Requires Planning Session
      </div>
      <p className="text-sm text-gray-600 max-w-lg mx-auto">{description}</p>
      {features && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {features.map((f, i) => (
            <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-50 border border-gray-200 text-xs text-gray-600">
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
