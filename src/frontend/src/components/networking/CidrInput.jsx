import { useState, useMemo } from 'react';

// Client-side CIDR parsing (subset of backend cidr-utils for instant feedback)
function parseCidr(cidr) {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  const octets = match[1].split('.').map(Number);
  const prefix = parseInt(match[2], 10);
  if (octets.some(o => o < 0 || o > 255) || prefix < 0 || prefix > 32) return null;
  const ipLong = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ipLong & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const longToIp = n => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF].join('.');
  return {
    network: longToIp(network),
    broadcast: longToIp(broadcast),
    prefix,
    hostCount: prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.pow(2, 32 - prefix) - 2,
    totalAddresses: Math.pow(2, 32 - prefix),
    aligned: ipLong === network,
    ip: match[1],
  };
}

export default function CidrInput({ value, onChange, minPrefix, placeholder, disabled }) {
  const [focused, setFocused] = useState(false);

  const validation = useMemo(() => {
    if (!value) return { status: 'empty' };
    const parsed = parseCidr(value);
    if (!parsed) return { status: 'error', message: 'Invalid CIDR format' };
    if (!parsed.aligned) {
      return {
        status: 'error',
        message: `Not aligned. Use ${parsed.network}/${parsed.prefix}`,
        parsed,
      };
    }
    if (minPrefix && parsed.prefix > minPrefix) {
      return {
        status: 'error',
        message: `Minimum /${minPrefix} required (${Math.pow(2, 32 - minPrefix)} addresses)`,
        parsed,
      };
    }
    return { status: 'valid', parsed };
  }, [value, minPrefix]);

  const borderColor =
    validation.status === 'error' ? 'border-red-400 focus:ring-red-500' :
    validation.status === 'valid' ? 'border-green-400 focus:ring-green-500' :
    'border-gray-300 focus:ring-blue-500';

  return (
    <div className="relative">
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder || '10.0.0.0/24'}
        disabled={disabled}
        className={`w-full text-sm font-mono border rounded px-2 py-1.5 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:bg-gray-100 ${borderColor}`}
      />
      {focused && validation.parsed && (
        <div className="absolute z-10 top-full mt-1 left-0 bg-gray-900 text-xs text-gray-200 rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
          <div>Network: <span className="text-green-400 font-mono">{validation.parsed.network}/{validation.parsed.prefix}</span></div>
          <div>Broadcast: <span className="text-green-400 font-mono">{validation.parsed.broadcast}</span></div>
          <div>Hosts: <span className="text-blue-400">{validation.parsed.hostCount.toLocaleString()}</span></div>
          <div>Total: <span className="text-blue-400">{validation.parsed.totalAddresses.toLocaleString()} addresses</span></div>
        </div>
      )}
      {validation.status === 'error' && value && (
        <div className="text-xs text-red-500 mt-0.5">{validation.message}</div>
      )}
    </div>
  );
}
