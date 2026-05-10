import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import { useStats } from './hooks';
import { invoke } from '@tauri-apps/api/core';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings',  label: 'Settings'  },
];


function SetupScreen({ onSetup }) {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickFolder = async () => {
    // Tauri folder picker logic will go here if needed, 
    // for now we use the manual input or handle it via a tauri dialog plugin if installed.
  };

  const handleStart = async () => {
    if (!path.trim()) return setError('Please enter or select a folder');
    setLoading(true); setError('');
    try {
      await invoke('watch_folder', { watchPath: path.trim() });
      onSetup(path.trim());
    } catch (e) {
      setError(e || 'Failed to start syncing');
    } finally { setLoading(false); }
  };

  return (
    <div className="setup-screen">
      <Toaster position="bottom-right" toastOptions={{ duration: 4000, style: { background: '#1e1e1e', color: '#fff', fontSize: '14px', borderRadius: '8px', border: '1px solid #333' } }} />
      <img src="/logo.png" alt="Revio" style={{ width: 80, height: 80, marginBottom: 16, objectFit: 'contain' }} />
      <div className="setup-title">Revio</div>
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
            placeholder="Paste a folder path"
            onKeyDown={e => e.key === 'Enter' && handleStart()}
          />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>❌ {error}</div>}
        <button
          className="btn btn-primary"
          style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : ''} {loading ? 'Starting…' : 'Start Syncing'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
        Versions are stored in a hidden <span className="tag">.restorex</span> folder inside your selected directory. No cloud, no accounts.
      </div>
    </div>
  );
}

function TitleBar() {
  const closeApp = () => {};
  const minApp = () => {};
  const maxApp = () => {};

  return (
    <div className="titlebar">
      <div className="titlebar-title">
        <img src="/logo.png" alt="Revio" style={{ width: 18, height: 18, objectFit: 'contain' }} />
        <span>Revio</span>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [isSetup, setIsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const { stats, refresh } = useStats(2500);

  // Check if already configured
  useEffect(() => {
    invoke('get_stats').then((data) => {
      if (data.watch_path) setIsSetup(true);
    }).catch(() => {}).finally(() => setCheckingStatus(false));
  }, []);

  const handleSetup = (watchPath) => {
    setIsSetup(true);
    refresh();
  };

  if (checkingStatus) {
    return (
      <div className="app">
        <Toaster position="bottom-right" toastOptions={{ duration: 4000, style: { background: '#1e1e1e', color: '#fff', fontSize: '14px', borderRadius: '8px', border: '1px solid #333' } }} />
        <TitleBar />
        <div className="flex-center" style={{ flex: 1 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!isSetup) {
    return (
      <div className="app">
        <TitleBar />
        <SetupScreen onSetup={handleSetup} />
      </div>
    );
  }

  const watchPath = stats?.watchPath || '';
  const watching  = stats?.watching  || false;
  const syncing   = stats?.syncing   || false;

  const toggleWatch = async () => {
    try {
      if (watching) {
        await invoke('stop_watching');
      } else {
        await invoke('watch_folder', { watchPath });
      }
      refresh();
    } catch (e) {
      alert('Failed to toggle syncing');
    }
  };

  return (
    <div className="app">
      <Toaster position="bottom-right" toastOptions={{ duration: 4000, style: { background: '#1e1e1e', color: '#fff', fontSize: '14px', borderRadius: '8px', border: '1px solid #333' } }} />
      <TitleBar />
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
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11 }}>
                      <div className="nav-section-label" style={{ fontSize: 9, marginBottom: 6, opacity: 0.6, letterSpacing: '0.05em' }}>FILE TYPES</div>
                      <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 4, opacity: 0.8 }} className="custom-scroll">
                        {stats.topExtensions.map(e => <div key={e} style={{ padding: '2px 0' }}>{e}</div>)}
                      </div>
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
              {syncing ? (
                <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              ) : (
                <div className={`watch-dot ${watching ? 'on' : 'off'}`} />
              )}
              <div style={{ flex: 1 }}>
                <div className="watch-label" style={{ fontWeight: 600, fontSize: 11 }}>
                  {watching ? (syncing ? 'Syncing...' : 'All files are synced') : 'Paused'}
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
