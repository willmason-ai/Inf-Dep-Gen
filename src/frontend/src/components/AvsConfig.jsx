import { useState, useEffect } from 'react';
import {
  getAvsConfig, saveAvsConfig, generateAvsBicep, generateAvsArm,
} from '../lib/api';
import { randomUUID } from '../lib/uuid';
import ClusterSizer from './avs/ClusterSizer';
import SegmentEditor from './avs/SegmentEditor';
import HcxConfig from './avs/HcxConfig';
import ConnectivityCard from './networking/ConnectivityCard';
import CidrInput from './networking/CidrInput';

export default function AvsConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [activeTab, setActiveTab] = useState('privatecloud');
  const [templateFormat, setTemplateFormat] = useState('bicep');
  const [templateContent, setTemplateContent] = useState(null);
  const [templateSummary, setTemplateSummary] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const data = await getAvsConfig();
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

  function updatePrivateCloud(updates) {
    setConfig(prev => ({
      ...prev,
      privateCloud: { ...prev.privateCloud, ...updates },
    }));
    setDirty(true);
  }

  function updateConnectivity(key, updates) {
    setConfig(prev => ({
      ...prev,
      connectivity: { ...prev.connectivity, [key]: { ...prev.connectivity[key], ...updates } },
    }));
    setDirty(true);
  }

  function updateSegment(id, updated) {
    setConfig(prev => ({
      ...prev,
      nsxtSegments: prev.nsxtSegments.map(s => s.id === id ? updated : s),
    }));
    setDirty(true);
  }

  function addSegment() {
    setConfig(prev => ({
      ...prev,
      nsxtSegments: [...prev.nsxtSegments, {
        id: randomUUID(), name: '', autoName: false, cidr: '',
        gatewayAddress: '', dhcpEnabled: false, dhcpRange: '',
        dnsServers: [], tier1Gateway: 'default',
      }],
    }));
    setDirty(true);
  }

  function removeSegment(id) {
    setConfig(prev => ({ ...prev, nsxtSegments: prev.nsxtSegments.filter(s => s.id !== id) }));
    setDirty(true);
  }

  function updateHcx(hcx) {
    setConfig(prev => ({ ...prev, hcx }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const result = await saveAvsConfig(config);
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

  async function handleGenerate() {
    setGenerating(true);
    try {
      if (dirty) await saveAvsConfig(config);
      const result = templateFormat === 'bicep' ? await generateAvsBicep() : await generateAvsArm();
      setTemplateContent(templateFormat === 'bicep' ? result.bicep : JSON.stringify(result.template, null, 2));
      setTemplateSummary(result.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload() {
    if (!templateContent) return;
    const ext = templateFormat === 'bicep' ? '.bicep' : '.json';
    const blob = new Blob([templateContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avs-private-cloud${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-gray-500 text-sm py-4">Loading AVS configuration...</div>;
  if (!config) return <div className="text-red-500 text-sm py-4">Failed to load AVS configuration</div>;

  const tabs = [
    { id: 'privatecloud', label: 'Private Cloud' },
    { id: 'nsxt', label: 'NSX-T Segments' },
    { id: 'hcx', label: 'HCX' },
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-700">Region:</label>
          <select value={config.region || 'eastus2'} onChange={(e) => updateConfig({ region: e.target.value })}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="eastus2">East US 2</option>
            <option value="westus2">West US 2</option>
            <option value="centralus">Central US</option>
            <option value="southcentralus">South Central US</option>
          </select>
          {errorCount > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
          {warnCount > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>}
        </div>
        <button onClick={handleSave} disabled={saving || !dirty}
          className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Private Cloud Tab */}
      {activeTab === 'privatecloud' && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">AVS /22 Address Block</h3>
            <p className="text-xs text-gray-500 mb-2">Azure VMware Solution requires a dedicated /22 CIDR block. This must not overlap with any other network range.</p>
            <div className="w-64">
              <CidrInput value={config.privateCloud?.addressBlock || ''} onChange={(v) => updatePrivateCloud({ addressBlock: v })} placeholder="10.100.0.0/22" />
            </div>
          </div>

          <ClusterSizer
            sku={config.privateCloud?.sku || 'AV36P'}
            nodeCount={config.privateCloud?.nodeCount || 3}
            clusterName={config.privateCloud?.clusterName || 'cluster-1'}
            onChange={(u) => updatePrivateCloud(u)}
          />

          {/* Secondary clusters */}
          {(config.privateCloud?.secondaryClusters || []).map((cluster, i) => (
            <ClusterSizer
              key={i}
              sku={cluster.sku || config.privateCloud?.sku}
              nodeCount={cluster.nodeCount || 3}
              clusterName={cluster.name}
              showRemove
              onRemove={() => updatePrivateCloud({
                secondaryClusters: config.privateCloud.secondaryClusters.filter((_, j) => j !== i),
              })}
              onChange={(u) => {
                const clusters = [...config.privateCloud.secondaryClusters];
                clusters[i] = { ...clusters[i], ...u, name: u.clusterName ?? clusters[i].name, sku: u.sku ?? clusters[i].sku, nodeCount: u.nodeCount ?? clusters[i].nodeCount };
                updatePrivateCloud({ secondaryClusters: clusters });
              }}
            />
          ))}
          <button onClick={() => updatePrivateCloud({
            secondaryClusters: [...(config.privateCloud?.secondaryClusters || []), { name: `cluster-${(config.privateCloud?.secondaryClusters?.length || 0) + 2}`, sku: config.privateCloud?.sku || 'AV36P', nodeCount: 3 }],
          })} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Secondary Cluster</button>

          {/* Capacity summary */}
          {validationResults?.capacity && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <h4 className="text-sm font-medium text-blue-800 mb-1">Total Capacity (Primary Cluster)</h4>
              <div className="text-xs text-blue-700">
                {validationResults.capacity.totalCores} vCPUs | {validationResults.capacity.totalRamGB} GB RAM | {validationResults.capacity.vsanUsableTB} TB vSAN Usable
              </div>
            </div>
          )}

          <ValidationPanel errors={validationResults?.errors} warnings={validationResults?.warnings} />
        </div>
      )}

      {/* NSX-T Segments Tab */}
      {activeTab === 'nsxt' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">NSX-T Workload Segments</h3>
            <button onClick={addSegment} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Segment</button>
          </div>
          <div className="space-y-2">
            {(config.nsxtSegments || []).map(seg => (
              <SegmentEditor key={seg.id} segment={seg}
                onChange={(u) => updateSegment(seg.id, u)}
                onDelete={() => removeSegment(seg.id)} />
            ))}
          </div>
          <ValidationPanel errors={validationResults?.errors} warnings={validationResults?.warnings} />
        </div>
      )}

      {/* HCX Tab */}
      {activeTab === 'hcx' && (
        <div className="space-y-4">
          <label className="flex items-center space-x-2 text-sm text-gray-700">
            <input type="checkbox" checked={config.hcx?.enabled || false}
              onChange={(e) => updateConfig({ hcx: { ...config.hcx, enabled: e.target.checked } })}
              className="rounded text-blue-600 focus:ring-blue-500" />
            <span className="font-medium">Enable HCX</span>
          </label>
          {config.hcx?.enabled && (
            <HcxConfig hcx={config.hcx} segments={config.nsxtSegments} onChange={updateHcx} />
          )}
        </div>
      )}

      {/* Connectivity Tab */}
      {activeTab === 'connectivity' && (
        <div className="space-y-3">
          <ConnectivityCard title="AVS ExpressRoute Authorization"
            icon={<svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            enabled={config.connectivity?.avsExpressRoute?.enabled || false}
            onToggle={(v) => updateConnectivity('avsExpressRoute', { enabled: v })}>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Authorization Key Name</label>
              <input type="text" value={config.connectivity?.avsExpressRoute?.authorizationKeyName || ''}
                onChange={(e) => updateConnectivity('avsExpressRoute', { authorizationKeyName: e.target.value })}
                placeholder="avs-er-auth" className="w-full text-sm font-mono border border-gray-300 rounded px-2 py-1.5" />
            </div>
          </ConnectivityCard>

          <ConnectivityCard title="Hub VNet Connection"
            icon={<svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
            enabled={config.connectivity?.hubConnection?.enabled || false}
            onToggle={(v) => updateConnectivity('hubConnection', { enabled: v })}>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Hub ER Gateway Resource ID</label>
              <input type="text" value={config.connectivity?.hubConnection?.hubGatewayResourceId || ''}
                onChange={(e) => updateConnectivity('hubConnection', { hubGatewayResourceId: e.target.value })}
                placeholder="/subscriptions/.../virtualNetworkGateways/..."
                className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5" />
            </div>
          </ConnectivityCard>

          <ConnectivityCard title="ExpressRoute Global Reach"
            icon={<svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>}
            enabled={config.connectivity?.globalReach?.enabled || false}
            onToggle={(v) => updateConnectivity('globalReach', { enabled: v })}>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">On-Prem Circuit Resource ID</label>
                <input type="text" value={config.connectivity?.globalReach?.onPremCircuitResourceId || ''}
                  onChange={(e) => updateConnectivity('globalReach', { onPremCircuitResourceId: e.target.value })}
                  placeholder="/subscriptions/.../expressRouteCircuits/..."
                  className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Peering Address Prefix</label>
                <input type="text" value={config.connectivity?.globalReach?.peeringAddressPrefix || ''}
                  onChange={(e) => updateConnectivity('globalReach', { peeringAddressPrefix: e.target.value })}
                  placeholder="10.1.0.0/29" className="w-full text-sm font-mono border border-gray-300 rounded px-2 py-1.5" />
              </div>
            </div>
          </ConnectivityCard>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <select value={templateFormat} onChange={(e) => setTemplateFormat(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-3 py-1.5">
                <option value="bicep">Bicep</option>
                <option value="arm">ARM JSON</option>
              </select>
              <button onClick={handleGenerate} disabled={generating || errorCount > 0}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
            {templateContent && (
              <div className="flex items-center space-x-2">
                <button onClick={() => navigator.clipboard.writeText(templateContent)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Copy</button>
                <button onClick={handleDownload}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">Download</button>
              </div>
            )}
          </div>
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
          {templateContent ? (
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <pre className="text-green-400 font-mono text-xs p-4 overflow-x-auto max-h-[600px] overflow-y-auto leading-relaxed">{templateContent}</pre>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 text-sm">Click "Generate" to preview the template.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ValidationPanel({ errors = [], warnings = [] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-red-700 mb-1">Errors</h4>
          <ul className="text-xs text-red-600 space-y-0.5">{errors.map((e, i) => <li key={i}>&#8226; {e}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-yellow-700 mb-1">Warnings</h4>
          <ul className="text-xs text-yellow-600 space-y-0.5">{warnings.map((w, i) => <li key={i}>&#8226; {w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
