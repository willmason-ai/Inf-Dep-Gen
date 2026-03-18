export default function ConnectivityCard({ title, icon, enabled, onToggle, children }) {
  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${enabled ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-2">
          <span className={`text-lg ${enabled ? '' : 'opacity-40'}`}>{icon}</span>
          <span className={`text-sm font-medium ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{title}</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
      {enabled && children && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
