import CidrInput from './CidrInput';

const PURPOSE_OPTIONS = [
  { value: 'gateway', label: 'Gateway' },
  { value: 'bastion', label: 'Bastion' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'compute', label: 'Compute' },
  { value: 'management', label: 'Management' },
  { value: 'custom', label: 'Custom' },
];

const MIN_PREFIX_MAP = {
  gateway: 27,
  bastion: 26,
  firewall: 26,
  compute: 28,
  management: 28,
  custom: 29,
};

export default function SubnetEditor({ subnet, onChange, onDelete }) {
  const isFixed = subnet.fixedName;
  const minPrefix = subnet.minPrefix || MIN_PREFIX_MAP[subnet.purpose] || 29;

  function update(field, value) {
    onChange({ ...subnet, [field]: value });
  }

  return (
    <div className="flex items-center space-x-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
      {/* Purpose */}
      <select
        value={subnet.purpose}
        onChange={(e) => update('purpose', e.target.value)}
        disabled={isFixed}
        className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50 min-w-[100px] disabled:opacity-60"
      >
        {PURPOSE_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Name */}
      <div className="flex-1 min-w-[140px]">
        {isFixed ? (
          <div className="flex items-center space-x-1">
            <span className="text-sm font-mono text-gray-700">{subnet.name}</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">fixed</span>
          </div>
        ) : subnet.autoName ? (
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-500 italic">{subnet.name || 'auto-named'}</span>
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">auto</span>
          </div>
        ) : (
          <input
            type="text"
            value={subnet.name || ''}
            onChange={(e) => update('name', e.target.value)}
            placeholder="subnet name"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5"
          />
        )}
      </div>

      {/* CIDR */}
      <div className="w-40">
        <CidrInput
          value={subnet.cidr}
          onChange={(v) => update('cidr', v)}
          minPrefix={minPrefix}
        />
      </div>

      {/* Min prefix badge */}
      <span className="text-xs text-gray-400 whitespace-nowrap">min /{minPrefix}</span>

      {/* NSG toggle */}
      <label className="flex items-center space-x-1 text-xs text-gray-600" title="Network Security Group">
        <input
          type="checkbox"
          checked={subnet.nsg || false}
          onChange={(e) => update('nsg', e.target.checked)}
          disabled={isFixed && !subnet.nsg}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <span>NSG</span>
      </label>

      {/* Route Table toggle */}
      <label className="flex items-center space-x-1 text-xs text-gray-600" title="Route Table">
        <input
          type="checkbox"
          checked={subnet.routeTable || false}
          onChange={(e) => update('routeTable', e.target.checked)}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <span>RT</span>
      </label>

      {/* Enabled toggle for optional subnets */}
      {subnet.purpose === 'firewall' && (
        <label className="flex items-center space-x-1 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={subnet.enabled !== false}
            onChange={(e) => update('enabled', e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500"
          />
          <span>On</span>
        </label>
      )}

      {/* Delete (not for required subnets) */}
      {!isFixed && onDelete && (
        <button
          onClick={onDelete}
          className="text-gray-400 hover:text-red-500 text-lg leading-none"
          title="Remove subnet"
        >
          &times;
        </button>
      )}
    </div>
  );
}
