import { useState, useEffect, useRef, useMemo } from 'react';
import {
  getNetworkingConfig,
  saveNetworkingConfig,
  validateNetworkingTopology,
  generateNetworkingBicep,
  generateNetworkingArm,
  importNetworkingArm,
} from '../lib/api';
import SubnetEditor from './networking/SubnetEditor';
import CidrInput from './networking/CidrInput';
import ConnectivityCard from './networking/ConnectivityCard';

// ---------------------------------------------------------------------------
// Main NetworkingConfig Component
// ---------------------------------------------------------------------------
export default function NetworkingConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [activeTab, setActiveTab] = useState('topology');

  // Template generation state
  const [templateFormat, setTemplateFormat] = useState('bicep');
  const [templateContent, setTemplateContent] = useState(null);
  const [templateSummary, setTemplateSummary] = useState(null);
  const [generating, setGenerating] = useState(false);

  // ARM import
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const data = await getNetworkingConfig();
      setConfig(data.config);
      setValidationResults(data.validation);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(updates) {
    setConfig(prev => ({ ...prev, ...updates }));
    setDirty(true);
  }

  function updateConnectivity(key, updates) {
    setConfig(prev => ({
      ...prev,
      connectivity: {
        ...prev.connectivity,
        [key]: { ...prev.connectivity[key], ...updates },
      },
    }));
    setDirty(true);
  }

  function updateIpPlan(updates) {
    setConfig(prev => ({
      ...prev,
      ipAddressPlan: { ...prev.ipAddressPlan, ...updates },
    }));
    setDirty(true);
  }

  function updateSubnet(id, updated) {
    setConfig(prev => ({
      ...prev,
      subnets: prev.subnets.map(s => s.id === id ? updated : s),
    }));
    setDirty(true);
  }

  function addSubnet() {
    const newSubnet = {
      id: crypto.randomUUID(),
      purpose: 'custom',
      name: '',
      cidr: '',
      autoName: false,
      nsg: true,
      routeTable: true,
    };
    setConfig(prev => ({
      ...prev,
      subnets: [...prev.subnets, newSubnet],
    }));
    setDirty(true);
  }

  function removeSubnet(id) {
    setConfig(prev => ({
      ...prev,
      subnets: prev.subnets.filter(s => s.id !== id),
    }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const result = await saveNetworkingConfig(config);
      setValidationResults(result.validation);
      setSaveStatus('saved');
      setDirty(false);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateTemplate() {
    setGenerating(true);
    try {
      // Save first if dirty
      if (dirty) await saveNetworkingConfig(config);

      const result = templateFormat === 'bicep'
        ? await generateNetworkingBicep()
        : await generateNetworkingArm();

      if (templateFormat === 'bicep') {
        setTemplateContent(result.bicep);
      } else {
        setTemplateContent(JSON.stringify(result.template, null, 2));
      }
      setTemplateSummary(result.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleArmImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const armJson = JSON.parse(text);
      const result = await importNetworkingArm(armJson);
      setConfig(result.config);
      setValidationResults(result.validation);
      setDirty(false);
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDownload() {
    if (!templateContent) return;
    const ext = templateFormat === 'bicep' ? '.bicep' : '.json';
    const mime = templateFormat === 'bicep' ? 'text/plain' : 'application/json';
    const blob = new Blob([templateContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `networking-hub${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy() {
    if (templateContent) navigator.clipboard.writeText(templateContent);
  }

  // Utilization bar data
  const utilization = validationResults?.utilization;

  if (loading) {
    return <div className="text-gray-500 text-sm py-4">Loading networking configuration...</div>;
  }

  if (!config) {
    return <div className="text-red-500 text-sm py-4">Failed to load networking configuration</div>;
  }

  const tabs = [
    { id: 'topology', label: 'Topology' },
    { id: 'ipplan', label: 'IP Plan' },
    { id: 'connectivity', label: 'Connectivity' },
    { id: 'templates', label: 'Templates' },
  ];

  const errorCount = validationResults?.errors?.length || 0;
  const warnCount = validationResults?.warnings?.length || 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* Header: Region, Save, Import */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-700">Region:</label>
          <select
            value={config.region || 'eastus2'}
            onChange={(e) => updateConfig({ region: e.target.value })}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="eastus2">East US 2</option>
            <option value="westus2">West US 2</option>
            <option value="centralus">Central US</option>
            <option value="eastus">East US</option>
            <option value="westus3">West US 3</option>
            <option value="southcentralus">South Central US</option>
          </select>
          {errorCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleArmImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : 'Import ARM Export'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'topology' && (
        <TopologyTab
          config={config}
          updateConfig={updateConfig}
          updateSubnet={updateSubnet}
          addSubnet={addSubnet}
          removeSubnet={removeSubnet}
          utilization={utilization}
          validationResults={validationResults}
        />
      )}
      {activeTab === 'ipplan' && (
        <IpPlanTab
          ipPlan={config.ipAddressPlan || {}}
          hubVnetSpace={config.hubVnet?.addressSpaces?.[0]}
          updateIpPlan={updateIpPlan}
          validationResults={validationResults}
        />
      )}
      {activeTab === 'connectivity' && (
        <ConnectivityTab
          connectivity={config.connectivity || {}}
          updateConnectivity={updateConnectivity}
        />
      )}
      {activeTab === 'templates' && (
        <TemplatesTab
          templateFormat={templateFormat}
          setTemplateFormat={setTemplateFormat}
          templateContent={templateContent}
          templateSummary={templateSummary}
          generating={generating}
          validationResults={validationResults}
          onGenerate={handleGenerateTemplate}
          onDownload={handleDownload}
          onCopy={handleCopy}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topology Tab
// ---------------------------------------------------------------------------
function TopologyTab({ config, updateConfig, updateSubnet, addSubnet, removeSubnet, utilization, validationResults }) {
  return (
    <div className="space-y-4">
      {/* Hub VNet Card */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Hub Virtual Network</h3>
          {config.hubVnet?.autoName && (
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">auto-name</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">VNet Name</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={config.hubVnet?.name || ''}
                onChange={(e) => updateConfig({ hubVnet: { ...config.hubVnet, name: e.target.value, autoName: false } })}
                placeholder="hub-vnet"
                disabled={config.hubVnet?.autoName}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 font-mono disabled:opacity-50 disabled:bg-gray-100"
              />
              <label className="flex items-center space-x-1 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={config.hubVnet?.autoName || false}
                  onChange={(e) => updateConfig({ hubVnet: { ...config.hubVnet, autoName: e.target.checked } })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Auto</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Address Space</label>
            {(config.hubVnet?.addressSpaces || []).map((space, i) => (
              <div key={i} className="flex items-center space-x-2 mb-1">
                <CidrInput
                  value={space}
                  onChange={(v) => {
                    const spaces = [...(config.hubVnet?.addressSpaces || [])];
                    spaces[i] = v;
                    updateConfig({ hubVnet: { ...config.hubVnet, addressSpaces: spaces } });
                  }}
                />
                {config.hubVnet?.addressSpaces?.length > 1 && (
                  <button
                    onClick={() => {
                      const spaces = config.hubVnet.addressSpaces.filter((_, j) => j !== i);
                      updateConfig({ hubVnet: { ...config.hubVnet, addressSpaces: spaces } });
                    }}
                    className="text-gray-400 hover:text-red-500 text-sm"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => {
                const spaces = [...(config.hubVnet?.addressSpaces || []), ''];
                updateConfig({ hubVnet: { ...config.hubVnet, addressSpaces: spaces } });
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
            >
              + Add Address Space
            </button>
          </div>
        </div>
      </div>

      {/* Utilization Bar */}
      {utilization && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">Address Space Utilization</span>
            <span className="text-xs text-gray-500">
              {utilization.allocated.toLocaleString()} / {utilization.total.toLocaleString()} addresses ({utilization.percentUsed}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                utilization.percentUsed > 80 ? 'bg-red-500' :
                utilization.percentUsed > 60 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(utilization.percentUsed, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Subnets */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Subnets</h3>
          <button
            onClick={addSubnet}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Subnet
          </button>
        </div>

        <div className="space-y-2">
          {(config.subnets || []).map(subnet => (
            <SubnetEditor
              key={subnet.id}
              subnet={subnet}
              onChange={(updated) => updateSubnet(subnet.id, updated)}
              onDelete={subnet.fixedName ? null : () => removeSubnet(subnet.id)}
            />
          ))}
        </div>
      </div>

      {/* Validation Issues */}
      {validationResults && (validationResults.errors?.length > 0 || validationResults.warnings?.length > 0) && (
        <ValidationPanel errors={validationResults.errors} warnings={validationResults.warnings} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IP Plan Tab
// ---------------------------------------------------------------------------
function IpPlanTab({ ipPlan, hubVnetSpace, updateIpPlan, validationResults }) {
  function updateList(key, index, value) {
    const list = [...(ipPlan[key] || [])];
    list[index] = value;
    updateIpPlan({ [key]: list });
  }

  function addToList(key) {
    updateIpPlan({ [key]: [...(ipPlan[key] || []), ''] });
  }

  function removeFromList(key, index) {
    updateIpPlan({ [key]: (ipPlan[key] || []).filter((_, i) => i !== index) });
  }

  // Build overlap matrix
  const allRanges = [];
  const labels = [];
  if (hubVnetSpace) { allRanges.push(hubVnetSpace); labels.push('Hub VNet'); }
  if (ipPlan.avsBlock) { allRanges.push(ipPlan.avsBlock); labels.push('AVS /22'); }
  (ipPlan.onPremRanges || []).forEach((r, i) => { if (r) { allRanges.push(r); labels.push(`On-Prem ${i + 1}`); } });
  (ipPlan.workloadVnetRanges || []).forEach((r, i) => { if (r) { allRanges.push(r); labels.push(`Workload ${i + 1}`); } });

  return (
    <div className="space-y-6">
      {/* AVS Block */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">AVS /22 Address Block</label>
        <p className="text-xs text-gray-500 mb-2">Azure VMware Solution requires a dedicated /22 CIDR block that does not overlap with any other range.</p>
        <div className="w-64">
          <CidrInput
            value={ipPlan.avsBlock || ''}
            onChange={(v) => updateIpPlan({ avsBlock: v })}
            placeholder="10.100.0.0/22"
          />
        </div>
      </div>

      {/* On-Prem Ranges */}
      <RangeList
        title="On-Premises Ranges"
        description="Existing on-premises address ranges (for overlap checking)"
        items={ipPlan.onPremRanges || []}
        onUpdate={(i, v) => updateList('onPremRanges', i, v)}
        onAdd={() => addToList('onPremRanges')}
        onRemove={(i) => removeFromList('onPremRanges', i)}
      />

      {/* Workload VNet Ranges */}
      <RangeList
        title="Workload VNet Ranges"
        description="Spoke VNet address ranges for workloads"
        items={ipPlan.workloadVnetRanges || []}
        onUpdate={(i, v) => updateList('workloadVnetRanges', i, v)}
        onAdd={() => addToList('workloadVnetRanges')}
        onRemove={(i) => removeFromList('workloadVnetRanges', i)}
      />

      {/* Reserved Ranges */}
      <RangeList
        title="Reserved Ranges"
        description="Address ranges reserved for future use"
        items={ipPlan.reservedRanges || []}
        onUpdate={(i, v) => updateList('reservedRanges', i, v)}
        onAdd={() => addToList('reservedRanges')}
        onRemove={(i) => removeFromList('reservedRanges', i)}
      />

      {/* Overlap Matrix */}
      {allRanges.length > 1 && (
        <OverlapMatrix ranges={allRanges} labels={labels} />
      )}

      {/* Validation */}
      {validationResults && (validationResults.errors?.length > 0 || validationResults.warnings?.length > 0) && (
        <ValidationPanel errors={validationResults.errors} warnings={validationResults.warnings} />
      )}
    </div>
  );
}

function RangeList({ title, description, items, onUpdate, onAdd, onRemove }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">{title}</label>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center space-x-2">
            <div className="w-64">
              <CidrInput
                value={item}
                onChange={(v) => onUpdate(i, v)}
              />
            </div>
            <button
              onClick={() => onRemove(i)}
              className="text-gray-400 hover:text-red-500 text-lg"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-2"
      >
        + Add Range
      </button>
    </div>
  );
}

// Simple pairwise overlap check for the matrix (client-side)
function checkOverlap(a, b) {
  const pa = parseCidrSimple(a);
  const pb = parseCidrSimple(b);
  if (!pa || !pb) return null; // can't determine
  return pa.networkLong <= pb.broadcastLong && pa.broadcastLong >= pb.networkLong;
}

function parseCidrSimple(cidr) {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  const octets = match[1].split('.').map(Number);
  const prefix = parseInt(match[2], 10);
  if (octets.some(o => o < 0 || o > 255) || prefix < 0 || prefix > 32) return null;
  const ipLong = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ipLong & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { networkLong: network, broadcastLong: broadcast };
}

function OverlapMatrix({ ranges, labels }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Overlap Validation Matrix</h3>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1"></th>
              {labels.map((l, i) => (
                <th key={i} className="px-2 py-1 text-gray-600 font-medium text-left">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((rowLabel, i) => (
              <tr key={i}>
                <td className="px-2 py-1 text-gray-600 font-medium whitespace-nowrap">{rowLabel}</td>
                {labels.map((_, j) => {
                  if (i === j) {
                    return <td key={j} className="px-2 py-1 text-center bg-gray-100">-</td>;
                  }
                  if (j < i) {
                    return <td key={j} className="px-2 py-1"></td>;
                  }
                  const overlaps = checkOverlap(ranges[i], ranges[j]);
                  return (
                    <td key={j} className="px-2 py-1 text-center">
                      {overlaps === null ? (
                        <span className="text-gray-400">?</span>
                      ) : overlaps ? (
                        <span className="inline-block w-5 h-5 rounded-full bg-red-100 text-red-600 leading-5 font-bold">!</span>
                      ) : (
                        <span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-600 leading-5">&#10003;</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connectivity Tab
// ---------------------------------------------------------------------------
function ConnectivityTab({ connectivity, updateConnectivity }) {
  const conn = connectivity;

  return (
    <div className="space-y-3">
      {/* ExpressRoute Gateway */}
      <ConnectivityCard
        title="ExpressRoute Gateway"
        icon={<svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        enabled={conn.expressRouteGateway?.enabled || false}
        onToggle={(v) => updateConnectivity('expressRouteGateway', { enabled: v })}
      >
        <div>
          <label className="text-xs text-gray-500 block mb-1">SKU</label>
          <select
            value={conn.expressRouteGateway?.sku || 'ErGw3AZ'}
            onChange={(e) => updateConnectivity('expressRouteGateway', { sku: e.target.value })}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
          >
            <option value="ErGw1AZ">ErGw1AZ (1 Gbps)</option>
            <option value="ErGw2AZ">ErGw2AZ (2 Gbps)</option>
            <option value="ErGw3AZ">ErGw3AZ (10 Gbps)</option>
            <option value="UltraPerformance">UltraPerformance (10+ Gbps)</option>
          </select>
        </div>
      </ConnectivityCard>

      {/* ExpressRoute Connection */}
      <ConnectivityCard
        title="ExpressRoute Connection"
        icon={<svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
        enabled={conn.expressRouteConnection?.enabled || false}
        onToggle={(v) => updateConnectivity('expressRouteConnection', { enabled: v })}
      >
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Circuit Resource ID</label>
            <input
              type="text"
              value={conn.expressRouteConnection?.circuitResourceId || ''}
              onChange={(e) => updateConnectivity('expressRouteConnection', { circuitResourceId: e.target.value })}
              placeholder="/subscriptions/.../expressRouteCircuits/..."
              className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Authorization Key</label>
            <input
              type="text"
              value={conn.expressRouteConnection?.authorizationKey || ''}
              onChange={(e) => updateConnectivity('expressRouteConnection', { authorizationKey: e.target.value })}
              placeholder="Authorization key (if required)"
              className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
        </div>
      </ConnectivityCard>

      {/* ExpressRoute Circuit (Plan New) */}
      <ConnectivityCard
        title="ExpressRoute Circuit (Plan New)"
        icon={<svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>}
        enabled={conn.expressRouteCircuit?.planNew || false}
        onToggle={(v) => updateConnectivity('expressRouteCircuit', { planNew: v })}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Provider</label>
            <input
              type="text"
              value={conn.expressRouteCircuit?.provider || ''}
              onChange={(e) => updateConnectivity('expressRouteCircuit', { provider: e.target.value })}
              placeholder="e.g., Equinix"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Bandwidth (Mbps)</label>
            <input
              type="text"
              value={conn.expressRouteCircuit?.bandwidth || ''}
              onChange={(e) => updateConnectivity('expressRouteCircuit', { bandwidth: e.target.value })}
              placeholder="e.g., 1000"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Peering Location</label>
            <input
              type="text"
              value={conn.expressRouteCircuit?.peeringLocation || ''}
              onChange={(e) => updateConnectivity('expressRouteCircuit', { peeringLocation: e.target.value })}
              placeholder="e.g., Dallas"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">SKU</label>
            <select
              value={conn.expressRouteCircuit?.sku || 'Standard'}
              onChange={(e) => updateConnectivity('expressRouteCircuit', { sku: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="Standard">Standard</option>
              <option value="Premium">Premium</option>
            </select>
          </div>
        </div>
      </ConnectivityCard>

      {/* Global Reach */}
      <ConnectivityCard
        title="ExpressRoute Global Reach"
        icon={<svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>}
        enabled={conn.globalReach?.enabled || false}
        onToggle={(v) => updateConnectivity('globalReach', { enabled: v })}
      >
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">On-Prem Circuit Resource ID</label>
            <input
              type="text"
              value={conn.globalReach?.onPremCircuitResourceId || ''}
              onChange={(e) => updateConnectivity('globalReach', { onPremCircuitResourceId: e.target.value })}
              placeholder="/subscriptions/.../expressRouteCircuits/..."
              className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">AVS Circuit Resource ID</label>
            <input
              type="text"
              value={conn.globalReach?.avsCircuitResourceId || ''}
              onChange={(e) => updateConnectivity('globalReach', { avsCircuitResourceId: e.target.value })}
              placeholder="/subscriptions/.../expressRouteCircuits/..."
              className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
        </div>
      </ConnectivityCard>

      {/* Bastion */}
      <ConnectivityCard
        title="Azure Bastion"
        icon={<svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
        enabled={conn.bastion?.enabled || false}
        onToggle={(v) => updateConnectivity('bastion', { enabled: v })}
      >
        <div>
          <label className="text-xs text-gray-500 block mb-1">SKU</label>
          <select
            value={conn.bastion?.sku || 'Standard'}
            onChange={(e) => updateConnectivity('bastion', { sku: e.target.value })}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
          >
            <option value="Basic">Basic</option>
            <option value="Standard">Standard</option>
          </select>
        </div>
      </ConnectivityCard>

      {/* Firewall */}
      <ConnectivityCard
        title="Azure Firewall"
        icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>}
        enabled={conn.firewall?.enabled || false}
        onToggle={(v) => updateConnectivity('firewall', { enabled: v })}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">SKU</label>
            <select
              value={conn.firewall?.sku || 'Standard'}
              onChange={(e) => updateConnectivity('firewall', { sku: e.target.value })}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
            >
              <option value="Standard">Standard</option>
              <option value="Premium">Premium</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Threat Intel Mode</label>
            <select
              value={conn.firewall?.threatIntelMode || 'Alert'}
              onChange={(e) => updateConnectivity('firewall', { threatIntelMode: e.target.value })}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
            >
              <option value="Off">Off</option>
              <option value="Alert">Alert</option>
              <option value="Deny">Deny</option>
            </select>
          </div>
        </div>
      </ConnectivityCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates Tab
// ---------------------------------------------------------------------------
function TemplatesTab({ templateFormat, setTemplateFormat, templateContent, templateSummary, generating, validationResults, onGenerate, onDownload, onCopy }) {
  const hasErrors = validationResults?.errors?.length > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-700">Format:</label>
          <select
            value={templateFormat}
            onChange={(e) => setTemplateFormat(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="bicep">Bicep</option>
            <option value="arm">ARM JSON</option>
          </select>
          <button
            onClick={onGenerate}
            disabled={generating || hasErrors}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
        {templateContent && (
          <div className="flex items-center space-x-2">
            <button
              onClick={onCopy}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Copy
            </button>
            <button
              onClick={onDownload}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Download
            </button>
          </div>
        )}
      </div>

      {hasErrors && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg text-sm">
          Fix validation errors before generating templates.
        </div>
      )}

      {/* Template Summary */}
      {templateSummary && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <h4 className="text-sm font-medium text-blue-800 mb-1">Resources</h4>
          <div className="flex flex-wrap gap-2">
            {(templateSummary.resources || []).map((r, i) => (
              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* Template Content */}
      {templateContent ? (
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <pre className="text-green-400 font-mono text-xs p-4 overflow-x-auto max-h-[600px] overflow-y-auto leading-relaxed">
            {templateContent}
          </pre>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 text-sm">
          Click "Generate" to preview the {templateFormat === 'bicep' ? 'Bicep' : 'ARM JSON'} template.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation Panel (reused across tabs)
// ---------------------------------------------------------------------------
function ValidationPanel({ errors = [], warnings = [] }) {
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-red-700 mb-1">Errors</h4>
          <ul className="text-xs text-red-600 space-y-0.5">
            {errors.map((e, i) => <li key={i}>&#8226; {e}</li>)}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-yellow-700 mb-1">Warnings</h4>
          <ul className="text-xs text-yellow-600 space-y-0.5">
            {warnings.map((w, i) => <li key={i}>&#8226; {w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
