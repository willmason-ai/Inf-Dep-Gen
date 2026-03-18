import CidrInput from '../networking/CidrInput';

export default function SegmentEditor({ segment, onChange, onDelete }) {
  function update(field, value) {
    onChange({ ...segment, [field]: value });
  }

  return (
    <div className="flex items-start space-x-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
      {/* Name */}
      <div className="flex-1 min-w-[120px]">
        <input
          type="text"
          value={segment.name || ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="segment name"
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 font-mono"
        />
      </div>

      {/* CIDR */}
      <div className="w-40">
        <CidrInput
          value={segment.cidr}
          onChange={(v) => update('cidr', v)}
          placeholder="10.10.0.0/24"
        />
      </div>

      {/* Gateway Address */}
      <div className="w-36">
        <input
          type="text"
          value={segment.gatewayAddress || ''}
          onChange={(e) => update('gatewayAddress', e.target.value)}
          placeholder="gateway IP"
          className="w-full text-sm font-mono border border-gray-200 rounded px-2 py-1.5"
        />
      </div>

      {/* DHCP */}
      <label className="flex items-center space-x-1 text-xs text-gray-600 pt-2">
        <input
          type="checkbox"
          checked={segment.dhcpEnabled || false}
          onChange={(e) => update('dhcpEnabled', e.target.checked)}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <span>DHCP</span>
      </label>

      {/* T1 Gateway */}
      <div className="w-24">
        <select
          value={segment.tier1Gateway || 'default'}
          onChange={(e) => update('tier1Gateway', e.target.value)}
          className="w-full text-xs border border-gray-200 rounded px-1 py-1.5"
        >
          <option value="default">Default T1</option>
          <option value="custom">Custom T1</option>
        </select>
      </div>

      {/* Delete */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-gray-400 hover:text-red-500 text-lg leading-none pt-1"
        >
          &times;
        </button>
      )}
    </div>
  );
}
