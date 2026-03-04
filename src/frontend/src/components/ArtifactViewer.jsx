import { useState } from 'react';

export default function ArtifactViewer({ artifact, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!artifact) return null;

  const content = artifact.template
    ? JSON.stringify(artifact.template, null, 2)
    : artifact.script || '';

  const language = artifact.type === 'arm' || artifact.type === 'nsg' ? 'json' :
                   artifact.type === 'lvm' ? 'bash' : 'powershell';

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const ext = artifact.type === 'arm' || artifact.type === 'nsg' ? 'json' :
                artifact.type === 'lvm' ? 'sh' : 'ps1';
    const filename = `${artifact.hostname}-${artifact.type}.${ext}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const typeLabels = {
    arm: 'ARM Template',
    lvm: 'LVM Script',
    nsg: 'NSG Rules',
    tag: 'Tag Script',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {typeLabels[artifact.type] || artifact.type} — {artifact.hostname}
            </h2>
            {artifact.summary && (
              <p className="text-sm text-gray-500 mt-0.5">
                {artifact.summary.totalDataDisks !== undefined && `${artifact.summary.totalDataDisks} data disks`}
                {artifact.summary.ruleCount !== undefined && `${artifact.summary.ruleCount} security rules`}
                {artifact.summary.totalResourcesTagged !== undefined && `${artifact.summary.totalResourcesTagged} resources tagged`}
                {artifact.summary.vmSize && ` \u00b7 ${artifact.summary.vmSize}`}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md transition-colors"
            >
              Download
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs leading-relaxed whitespace-pre-wrap">
            <code>{content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
