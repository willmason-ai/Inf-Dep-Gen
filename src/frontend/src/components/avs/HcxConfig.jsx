import { randomUUID } from '../../lib/uuid';

export default function HcxConfig({ hcx, segments, onChange }) {
  function updateMesh(updates) {
    onChange({ ...hcx, serviceMesh: { ...hcx.serviceMesh, ...updates } });
  }

  function addWave() {
    const waves = [...(hcx.migrationWaves || [])];
    waves.push({
      id: randomUUID(),
      name: `Wave ${waves.length + 1}`,
      order: waves.length + 1,
      status: 'planned',
      vms: [],
    });
    onChange({ ...hcx, migrationWaves: waves });
  }

  function updateWave(id, updates) {
    onChange({
      ...hcx,
      migrationWaves: (hcx.migrationWaves || []).map(w => w.id === id ? { ...w, ...updates } : w),
    });
  }

  function removeWave(id) {
    onChange({
      ...hcx,
      migrationWaves: (hcx.migrationWaves || []).filter(w => w.id !== id),
    });
  }

  function addVmToWave(waveId) {
    const waves = (hcx.migrationWaves || []).map(w => {
      if (w.id !== waveId) return w;
      return {
        ...w,
        vms: [...(w.vms || []), {
          id: randomUUID(),
          sourceVm: '',
          sourceHost: '',
          targetSegment: '',
          migrationType: 'vMotion',
          notes: '',
        }],
      };
    });
    onChange({ ...hcx, migrationWaves: waves });
  }

  function updateVm(waveId, vmId, updates) {
    const waves = (hcx.migrationWaves || []).map(w => {
      if (w.id !== waveId) return w;
      return {
        ...w,
        vms: (w.vms || []).map(vm => vm.id === vmId ? { ...vm, ...updates } : vm),
      };
    });
    onChange({ ...hcx, migrationWaves: waves });
  }

  function removeVm(waveId, vmId) {
    const waves = (hcx.migrationWaves || []).map(w => {
      if (w.id !== waveId) return w;
      return { ...w, vms: (w.vms || []).filter(vm => vm.id !== vmId) };
    });
    onChange({ ...hcx, migrationWaves: waves });
  }

  const segmentNames = (segments || []).map(s => s.name).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Service Mesh */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">HCX Service Mesh</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source vCenter</label>
            <input
              type="text"
              value={hcx.serviceMesh?.sourceVCenter || ''}
              onChange={(e) => updateMesh({ sourceVCenter: e.target.value })}
              placeholder="vcenter.corp.local"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Uplink Profile</label>
            <input
              type="text"
              value={hcx.serviceMesh?.uplinkProfile || ''}
              onChange={(e) => updateMesh({ uplinkProfile: e.target.value })}
              placeholder="uplink-profile"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Compute Profile</label>
            <input
              type="text"
              value={hcx.serviceMesh?.computeProfile || ''}
              onChange={(e) => updateMesh({ computeProfile: e.target.value })}
              placeholder="compute-profile"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
        </div>
      </div>

      {/* Migration Waves */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Migration Waves</h3>
          <button onClick={addWave} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            + Add Wave
          </button>
        </div>

        <div className="space-y-4">
          {(hcx.migrationWaves || []).map(wave => (
            <div key={wave.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={wave.name}
                    onChange={(e) => updateWave(wave.id, { name: e.target.value })}
                    className="text-sm font-medium border border-gray-200 rounded px-2 py-1 w-40"
                  />
                  <select
                    value={wave.status}
                    onChange={(e) => updateWave(wave.id, { status: e.target.value })}
                    className="text-xs border border-gray-200 rounded px-2 py-1"
                  >
                    <option value="planned">Planned</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                  <span className="text-xs text-gray-400">{(wave.vms || []).length} VMs</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => addVmToWave(wave.id)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    + Add VM
                  </button>
                  <button
                    onClick={() => removeWave(wave.id)}
                    className="text-gray-400 hover:text-red-500 text-sm"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {(wave.vms || []).length > 0 && (
                <div className="px-4 py-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-1 font-medium">Source VM</th>
                        <th className="text-left py-1 font-medium">Source Host</th>
                        <th className="text-left py-1 font-medium">Target Segment</th>
                        <th className="text-left py-1 font-medium">Type</th>
                        <th className="text-left py-1 font-medium">Notes</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(wave.vms || []).map(vm => (
                        <tr key={vm.id}>
                          <td className="py-1 pr-2">
                            <input
                              type="text"
                              value={vm.sourceVm}
                              onChange={(e) => updateVm(wave.id, vm.id, { sourceVm: e.target.value })}
                              placeholder="vm-name"
                              className="w-full text-xs font-mono border border-gray-200 rounded px-1.5 py-1"
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="text"
                              value={vm.sourceHost}
                              onChange={(e) => updateVm(wave.id, vm.id, { sourceHost: e.target.value })}
                              placeholder="esx-host"
                              className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <select
                              value={vm.targetSegment}
                              onChange={(e) => updateVm(wave.id, vm.id, { targetSegment: e.target.value })}
                              className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                            >
                              <option value="">Select segment...</option>
                              {segmentNames.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="py-1 pr-2">
                            <select
                              value={vm.migrationType}
                              onChange={(e) => updateVm(wave.id, vm.id, { migrationType: e.target.value })}
                              className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                            >
                              <option value="vMotion">vMotion</option>
                              <option value="Bulk">Bulk</option>
                              <option value="Cold">Cold</option>
                              <option value="Rehost">Rehost</option>
                            </select>
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="text"
                              value={vm.notes}
                              onChange={(e) => updateVm(wave.id, vm.id, { notes: e.target.value })}
                              className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                            />
                          </td>
                          <td className="py-1">
                            <button
                              onClick={() => removeVm(wave.id, vm.id)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              &times;
                            </button>
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
      </div>
    </div>
  );
}
