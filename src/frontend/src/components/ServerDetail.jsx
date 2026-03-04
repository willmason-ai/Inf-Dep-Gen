export default function ServerDetail({ spec }) {
  if (!spec) return null;

  const isOdb = spec.serverType === 'odb';

  return (
    <div className="space-y-4">
      {/* Compute */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Compute Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard label="Required SKU" value={spec.sku} />
          {spec.currentSku && (
            <InfoCard label="Current SKU" value={spec.currentSku} warning={spec.skuDeficient} />
          )}
          <InfoCard label="OS" value={spec.os} />
          <InfoCard label="OS Disk" value={spec.osDiskType} />
        </div>
      </div>

      {/* Tags */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(spec.tags || {}).map(([key, value]) => (
            <span key={key} className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
              <span className="font-medium">{key}:</span>&nbsp;{value}
            </span>
          ))}
        </div>
      </div>

      {/* Volume Groups or Disk Groups */}
      {isOdb && spec.volumeGroups && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Volume Groups</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pr-4 py-1">VG Name</th>
                  <th className="pr-4 py-1">Disks</th>
                  <th className="pr-4 py-1">Size/Disk</th>
                  <th className="pr-4 py-1">IOPS</th>
                  <th className="pr-4 py-1">Throughput</th>
                  <th className="pr-4 py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {spec.volumeGroups.map(vg => (
                  <tr key={vg.name} className="border-t border-gray-100">
                    <td className="pr-4 py-1.5 font-mono font-medium">{vg.name}</td>
                    <td className="pr-4 py-1.5">{vg.diskCount}</td>
                    <td className="pr-4 py-1.5">{vg.sizeGB} GB</td>
                    <td className="pr-4 py-1.5">{vg.iops?.toLocaleString()}</td>
                    <td className="pr-4 py-1.5">{vg.throughputMBs} MB/s</td>
                    <td className="pr-4 py-1.5 font-medium">{vg.totalSizeGB?.toLocaleString()} GB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isOdb && spec.diskGroups && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Disk Groups</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pr-4 py-1">Purpose</th>
                  <th className="pr-4 py-1">Disks</th>
                  <th className="pr-4 py-1">Size/Disk</th>
                  <th className="pr-4 py-1">IOPS</th>
                  <th className="pr-4 py-1">Throughput</th>
                  <th className="pr-4 py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {spec.diskGroups.map(dg => (
                  <tr key={dg.purpose} className="border-t border-gray-100">
                    <td className="pr-4 py-1.5 font-medium">{dg.purpose}</td>
                    <td className="pr-4 py-1.5">{typeof dg.diskCount === 'number' ? dg.diskCount : <span className="text-yellow-600">{String(dg.diskCount)}</span>}</td>
                    <td className="pr-4 py-1.5">{dg.sizeGB} GB</td>
                    <td className="pr-4 py-1.5">{dg.iops?.toLocaleString()}</td>
                    <td className="pr-4 py-1.5">{dg.throughputMBs} MB/s</td>
                    <td className="pr-4 py-1.5 font-medium">{typeof dg.totalSizeGB === 'number' ? `${dg.totalSizeGB.toLocaleString()} GB` : dg.totalSizeGB}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deficiencies */}
      {spec.deficiencies && spec.deficiencies.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Known Deficiencies</h3>
          <div className="space-y-1">
            {spec.deficiencies.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-sm bg-yellow-50 rounded px-3 py-2">
                {d.issueId && <span className="font-mono text-xs text-yellow-700 font-medium whitespace-nowrap">{d.issueId}</span>}
                <span className="text-yellow-800">{d.description}</span>
                {d.status && <span className="ml-auto text-xs text-yellow-600 whitespace-nowrap">{d.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, warning }) {
  return (
    <div className={`px-3 py-2 rounded-lg ${warning ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-200'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-medium ${warning ? 'text-red-700' : 'text-gray-900'}`}>
        {value || '—'}
      </div>
    </div>
  );
}
