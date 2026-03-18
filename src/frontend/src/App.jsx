import { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AiChat from './pages/AiChat';
import Login from './pages/Login';
import { getMe, logout, getToken, clearToken } from './lib/api';

const APP_VERSION = '0.2.0';

function Nav({ username, onLogout }) {
  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  return (
    <nav className="bg-gray-900 shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <span className="text-white text-lg font-bold tracking-tight">
              Inf-Dep-Gen
            </span>
            <span className="text-gray-500 text-xs font-mono">v{APP_VERSION}</span>
          </div>
          <div className="flex items-center space-x-2">
            <NavLink to="/" className={linkClass} end>
              Deployment
            </NavLink>
            <NavLink to="/chat" className={linkClass}>
              AI Assistant
            </NavLink>
            <div className="ml-4 flex items-center space-x-3 border-l border-gray-700 pl-4">
              <span className="text-gray-400 text-xs">{username}</span>
              <button
                onClick={onLogout}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(true);

  // On mount, check if existing token is valid
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        setChecking(false);
        return;
      }

      try {
        const result = await getMe();
        if (result.authenticated) {
          setIsAuthenticated(true);
          setUsername(result.username);
        }
      } catch {
        clearToken();
      }
      setChecking(false);
    }
    checkAuth();
  }, []);

  function handleLogin(result) {
    setIsAuthenticated(true);
    setUsername(result.username);
  }

  async function handleLogout() {
    await logout();
    setIsAuthenticated(false);
    setUsername('');
  }

  // Show nothing while checking auth
  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  // Not authenticated → show login
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Authenticated → show app
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav username={username} onLogout={handleLogout} />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<AiChat />} />
        </Routes>
      </main>
    </div>
  );
}
