import { useState, useEffect } from 'react';
import { getAvailableSubnets, createServer } from '../lib/api';

export default function CompanionVMForm({ onCreated, onClose }) {
  const [form, setForm] = useState({
    hostname: '',
    companionRole: 'jumpbox',
    os: 'Ubuntu 22.04',
    sku: 'Standard_D2s_v5',
    region: 'eastus2',
    subnetId: '',
    dependsOn: '',
    notes: '',
  });
  const [subnets, setSubnets] = useState([]);
  const [roles, setRoles] = useState([]);
  const [osOptions, setOsOptions] = useState([]);
  const [skuOptions, setSkuOptions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAvailableSubnets();
        setSubnets(data.subnets || []);
        setRoles(data.roles || ['jumpbox', 'dns-forwarder', 'backup-server', 'utility']);
        setOsOptions(data.osOptions || []);
        setSkuOptions(data.skuOptions || []);
      } catch { /* subnets not available */ }
    }
    load();
  }, []);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    if (!form.hostname.trim()) {
      setError('Hostname is required');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const spec = {
        ...form,
        dependsOn: form.dependsOn ? form.dependsOn.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      await createServer(spec);
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">New Companion VM</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Hostname *</label>
              <input type="text" value={form.hostname} onChange={(e) => update('hostname', e.target.value)}
                placeholder="e.g., JUMPBOX-EUS2-01"
                className="w-full text-sm font-mono border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role *</label>
              <select value={form.companionRole} onChange={(e) => update('companionRole', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                {roles.map(r => <option key={r} value={r}>{r.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Operating System</label>
              <select value={form.os} onChange={(e) => update('os', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                {osOptions.length > 0 ? osOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : (
                  <>
                    <option value="Ubuntu 22.04">Ubuntu 22.04 LTS</option>
                    <option value="RHEL-8">RHEL 8</option>
                    <option value="Windows Server 2022">Windows Server 2022</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">VM SKU</label>
              <select value={form.sku} onChange={(e) => update('sku', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                {skuOptions.length > 0 ? skuOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>) : (
                  <>
                    <option value="Standard_D2s_v5">D2s v5 (2 vCPU, 8 GB)</option>
                    <option value="Standard_D4s_v5">D4s v5 (4 vCPU, 16 GB)</option>
                    <option value="Standard_B2ms">B2ms (2 vCPU, burstable)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Subnet</label>
            {subnets.length > 0 ? (
              <select value={form.subnetId} onChange={(e) => update('subnetId', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                <option value="">No subnet assigned</option>
                {subnets.map(s => (
                  <option key={s.id} value={s.id}>{s.name || s.purpose} ({s.cidr})</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-400">No subnets available. Configure networking first.</p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Dependencies (comma-separated hostnames)</label>
            <input type="text" value={form.dependsOn} onChange={(e) => update('dependsOn', e.target.value)}
              placeholder="e.g., PROD-ODB-01, PROD-SQL-01"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
              rows={2} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={creating}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creating ? 'Creating...' : 'Create VM'}
          </button>
        </div>
      </div>
    </div>
  );
}
