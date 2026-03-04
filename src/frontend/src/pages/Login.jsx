import { useState } from 'react';
import { login } from '../lib/api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const result = await login(username.trim(), password);
      onLogin(result);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Infrastructure Deployment Generator
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Azure VM Management &middot; AI-Powered Infrastructure Operations
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          Powered by Claude AI
        </p>
      </div>
    </div>
  );
}
