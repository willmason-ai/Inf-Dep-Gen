import { useMemo } from 'react';

const HOST_SKU_DATA = {
  AV36:  { cores: 36, ramGB: 576,  vsanRawTB: 15.36, vsanUsableTB: 7.68,  label: 'AV36 (Standard)' },
  AV36P: { cores: 36, ramGB: 768,  vsanRawTB: 19.20, vsanUsableTB: 9.60,  label: 'AV36P (Performance)' },
  AV52:  { cores: 52, ramGB: 1536, vsanRawTB: 38.40, vsanUsableTB: 19.20, label: 'AV52 (Memory Optimized)' },
  AV64:  { cores: 64, ramGB: 1024, vsanRawTB: 30.72, vsanUsableTB: 15.36, label: 'AV64 (Storage Dense)' },
};

export default function ClusterSizer({ sku, nodeCount, clusterName, onChange, showRemove, onRemove }) {
  const capacity = useMemo(() => {
    const host = HOST_SKU_DATA[sku];
    if (!host || nodeCount < 3) return null;
    return {
      totalCores: host.cores * nodeCount,
      totalRamGB: host.ramGB * nodeCount,
      vsanRawTB: +(host.vsanRawTB * nodeCount).toFixed(2),
      vsanUsableTB: +(host.vsanUsableTB * nodeCount).toFixed(2),
    };
  }, [sku, nodeCount]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">{clusterName || 'Management Cluster'}</h4>
        {showRemove && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-lg">&times;</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Host SKU</label>
          <select
            value={sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            {Object.entries(HOST_SKU_DATA).map(([key, data]) => (
              <option key={key} value={key}>{data.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Node Count</label>
          <input
            type="number"
            min={3}
            max={16}
            value={nodeCount}
            onChange={(e) => onChange({ nodeCount: parseInt(e.target.value) || 3 })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          />
          {nodeCount < 3 && <div className="text-xs text-red-500 mt-0.5">Minimum 3 nodes</div>}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Cluster Name</label>
          <input
            type="text"
            value={clusterName || ''}
            onChange={(e) => onChange({ clusterName: e.target.value })}
            placeholder="cluster-1"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 font-mono"
          />
        </div>
      </div>

      {/* Capacity Display */}
      {capacity && (
        <div className="grid grid-cols-4 gap-2">
          <CapacityStat label="vCPUs" value={capacity.totalCores} />
          <CapacityStat label="RAM" value={`${capacity.totalRamGB} GB`} />
          <CapacityStat label="vSAN Raw" value={`${capacity.vsanRawTB} TB`} />
          <CapacityStat label="vSAN Usable" value={`${capacity.vsanUsableTB} TB`} highlight />
        </div>
      )}
    </div>
  );
}

function CapacityStat({ label, value, highlight }) {
  return (
    <div className={`text-center rounded-lg py-2 ${highlight ? 'bg-blue-50' : 'bg-gray-50'}`}>
      <div className={`text-lg font-bold ${highlight ? 'text-blue-600' : 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
