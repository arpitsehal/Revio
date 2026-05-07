import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Settings({ onFolderChange }) {
  const [settings, setSettings] = useState(null);
  const [watchPath, setWatchPath] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get('/api/settings').then(({ data }) => {
      setSettings(data);
      setWatchPath(data.watchPath || '');
    }).catch(() => {});
  }, []);

  const pickFolder = async () => {
    if (window.electronAPI) {
      const p = await window.electronAPI.openFolderDialog();
      if (p) setWatchPath(p);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      await axios.put('/api/settings', { ...settings, watchPath, autoStart: true });
      if (watchPath !== settings?.watchPath) {
        await axios.post('/api/watch', { watchPath });
        onFolderChange?.(watchPath);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Failed to save: ' + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  };

  const updateSetting = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  if (!settings) return <div className="flex-center" style={{ height: 200 }}><div className="spinner" /></div>;

  return (
    <div className="panel">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure folder paths, version limits, and auto-start behavior.</p>
      </div>

      <div className="settings-grid">
        {/* Watch Folder */}
        <div className="setting-group">
          <div className="setting-group-header">Watch Folder</div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Monitored Directory</div>
              <div className="setting-desc">The folder Revio will track in real-time</div>
            </div>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <div className="path-pick">
              <input
                className="path-input"
                value={watchPath}
                onChange={e => setWatchPath(e.target.value)}
                placeholder="C:\Users\…\MyProject"
                style={{ flex: 1 }}
              />
              {window.electronAPI && (
                <button className="btn btn-ghost" onClick={pickFolder}>Browse…</button>
              )}
            </div>
          </div>
        </div>

        {/* Version Control */}
        <div className="setting-group">
          <div className="setting-group-header">Version Control</div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Max Versions Per File</div>
              <div className="setting-desc">Older versions are deleted when limit is reached</div>
            </div>
            <div className="setting-control">
              <input
                type="number" min="5" max="500"
                value={settings.maxVersions || 50}
                onChange={e => updateSetting('maxVersions', parseInt(e.target.value) || 50)}
              />
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Auto-start Syncing</div>
              <div className="setting-desc">Begin watching automatically on app launch</div>
            </div>
            <div
              className={`toggle ${settings.autoStart !== false ? 'on' : ''}`}
              onClick={() => updateSetting('autoStart', settings.autoStart === false ? true : false)}
            />
          </div>
        </div>

        {/* Ignored Patterns */}
        <div className="setting-group">
          <div className="setting-group-header">Ignored Patterns</div>
          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div className="setting-label">Default ignored</div>
              <div className="setting-desc">These are always excluded from tracking</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['.tmp', '.log', '.cache', 'node_modules', '.git', '__pycache__', 'dist', '.next'].map(p => (
                <span key={p} className="tag">{p}</span>
              ))}
            </div>
          </div>
        </div>

        {/* About */}
        <div className="setting-group">
          <div className="setting-group-header">About</div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Revio</div>
              <div className="setting-desc">Git-like file recovery and versioning · v1.0.0</div>
            </div>
            <span className="tag">Offline-first</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={saveSettings} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Save Settings'}
          </button>
          {saved && <span style={{ color: 'var(--green)', fontSize: 13, alignSelf: 'center' }}>✅ Saved!</span>}
        </div>
      </div>
    </div>
  );
}
