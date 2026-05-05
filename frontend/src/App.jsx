import { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import { useStats } from './hooks';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings',  label: 'Settings'  },
];


function SetupScreen({ onSetup }) {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickFolder = async () => {
    if (window.electronAPI) {
      const p = await window.electronAPI.openFolderDialog();
      if (p) setPath(p);
    }
  };

  const handleStart = async () => {
    if (!path.trim()) return setError('Please enter or select a folder');
    setLoading(true); setError('');
    try {
      await axios.post('/api/watch', { watchPath: path.trim() });
      onSetup(path.trim());
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to start monitoring');
    } finally { setLoading(false); }
  };

  return (
    <div className="setup-screen">
      <div className="setup-title">Let's Restore</div>
      <div className="setup-sub">
        Git-like file recovery for everyone. Select a folder to begin automatic versioning and protection.
      </div>

      <div className="setup-card">
        <label>Select Folder to Monitor</label>
        <div className="path-pick">
          <input
            className="path-input"
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="Paste a folder path or click Browse"
            onKeyDown={e => e.key === 'Enter' && handleStart()}
          />
          {window.electronAPI && (
            <button className="btn btn-ghost" onClick={pickFolder}>Browse</button>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>❌ {error}</div>}
        <button
          className="btn btn-primary"
          style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : '🚀'} {loading ? 'Starting…' : 'Start Monitoring'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
        Versions are stored in a hidden <span className="tag">.restorex</span> folder inside your selected directory. No cloud, no accounts.
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [isSetup, setIsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const { stats, refresh } = useStats(4000);

  // Check if already configured
  useEffect(() => {
    axios.get('/api/watch/status').then(({ data }) => {
      if (data.watchPath) setIsSetup(true);
    }).catch(() => {}).finally(() => setCheckingStatus(false));
  }, []);

  const handleSetup = (watchPath) => {
    setIsSetup(true);
    refresh();
  };

  if (checkingStatus) {
    return (
      <div className="app">
        <div className="flex-center" style={{ flex: 1 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!isSetup) {
    return (
      <div className="app">
        <SetupScreen onSetup={handleSetup} />
      </div>
    );
  }

  const watchPath = stats?.watchPath || '';
  const watching  = stats?.watching  || false;

  const toggleWatch = async () => {
    try {
      if (watching) {
        await axios.post('/api/watch/stop');
      } else {
        await axios.post('/api/watch', { watchPath });
      }
      refresh();
    } catch (e) {
      alert('Failed to toggle monitoring');
    }
  };

  return (
    <div className="app">
      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <div className="nav-section">
              {NAV.map(n => (
                <div
                  key={n.id}
                  className={`nav-item ${page === n.id ? 'active' : ''}`}
                  onClick={() => setPage(n.id)}
                >
                  {n.label}
                </div>
              ))}
            </div>

            {stats && (
              <div className="nav-section" style={{ marginTop: 16 }}>
                <div className="nav-section-label">Quick Stats</div>
                <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text2)', lineHeight: 2 }}>
                  <div>Files: {stats.totalFiles}</div>
                  <div>Folders: {stats.totalFolders}</div>
                  <div>Versions: {stats.totalVersions}</div>
                  <div style={{ color: 'var(--yellow)' }}>Modified: {stats.modifiedFiles}</div>
                  <div style={{ color: 'var(--red)' }}>Deleted: {stats.deletedFiles}</div>
                  
                  {stats.topExtensions?.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, opacity: 0.8 }}>
                      {stats.topExtensions.map(e => <div key={e}>{e}</div>)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <div
              className={`watch-badge ${watching ? 'on' : 'off'}`}
              onClick={toggleWatch}
              style={{ cursor: 'pointer' }}
              title={watching ? 'Click to pause' : 'Click to start'}
            >
              <div className={`watch-dot ${watching ? 'on' : 'off'}`} />
              <div style={{ flex: 1 }}>
                <div className="watch-label" style={{ fontWeight: 600, fontSize: 11 }}>
                  {watching ? 'Monitoring' : 'Paused'}
                </div>
                <div className="watch-label" style={{ opacity: 0.6, fontSize: 10 }}>
                  {watchPath ? watchPath.split(/[/\\]/).pop() : '—'}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.5 }}>
                {watching ? 'STOP' : 'START'}
              </div>
            </div>
          </div>
        </aside>

        {/* Page Content */}
        <div className="content">
          {page === 'dashboard' && <Dashboard />}
          {page === 'settings'  && <Settings onFolderChange={() => { refresh(); setPage('dashboard'); }} />}
        </div>
      </div>
    </div>
  );
}
