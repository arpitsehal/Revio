const express = require('express');
const cors = require('cors');
const { storageManager } = require('./storageManager');
const { versionEngine } = require('./versionEngine');
const { watcherBridge } = require('./watcherBridge');

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json());

// ── Watch Control ────────────────────────────────────
app.post('/api/watch', async (req, res) => {
  const { watchPath } = req.body;
  if (!watchPath) return res.status(400).json({ error: 'watchPath required' });
  try {
    await storageManager.setWatchPath(watchPath);
    await watcherBridge.startWatching(watchPath);
    res.json({ success: true, watchPath, usingCpp: watcherBridge.usingCpp() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/watch/scan', async (req, res) => {
  const config = storageManager.getConfig();
  if (!config.watchPath) return res.status(400).json({ error: 'No watch path set' });
  try {
    await storageManager.performInitialScan(config.watchPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/watch/stop', (req, res) => {
  watcherBridge.stopWatching();
  res.json({ success: true });
});

app.get('/api/watch/status', (req, res) => {
  const config = storageManager.getConfig();
  res.json({
    watching: watcherBridge.isWatching(),
    watchPath: config.watchPath || null,
    usingCpp: watcherBridge.usingCpp(),
    cacheKeys: Object.keys(storageManager.metaCache),
    filesInCache: storageManager.metaCache[config.watchPath?.toLowerCase()] ? Object.keys(storageManager.metaCache[config.watchPath.toLowerCase()].files).length : 0
  });
});

// ── Files ────────────────────────────────────────────
app.get('/api/files', (req, res) => {
  const { search, status, ext } = req.query;
  let files = storageManager.getAllFiles();
  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f => f.name.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q));
  }
  if (status) files = files.filter(f => f.currentStatus === status);
  if (ext) files = files.filter(f => f.name.endsWith(`.${ext}`));
  res.json({ files });
});

app.get('/api/files/:id', (req, res) => {
  const file = storageManager.getFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.json({ file });
});

// ── Versions ─────────────────────────────────────────
app.get('/api/files/:id/versions', (req, res) => {
  const { from, to } = req.query;
  const file = storageManager.getFile(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  let versions = [...file.versions].reverse();
  if (from) versions = versions.filter(v => new Date(v.timestamp) >= new Date(from));
  if (to)   versions = versions.filter(v => new Date(v.timestamp) <= new Date(to));
  res.json({ versions, file });
});

app.post('/api/folders/restore', async (req, res) => {
  const { folderPath } = req.body;
  if (folderPath === undefined) return res.status(400).json({ error: 'folderPath is required' });
  
  const files = storageManager.getAllFiles();
  const normalizedFolder = folderPath.replace(/\\/g, '/').toLowerCase();
  
  // Find deleted files in this folder
  const toRestore = files.filter(f => {
    const rel = f.relativePath.replace(/\\/g, '/').toLowerCase();
    const isInFolder = normalizedFolder === '' || rel.startsWith(normalizedFolder + '/');
    return isInFolder && f.currentStatus === 'deleted';
  });

  const results = [];
  for (const file of toRestore) {
    const latestValid = [...file.versions].reverse().find(v => v.storagePath);
    if (latestValid) {
      try {
        await versionEngine.restoreVersion(file.id, latestValid.versionId);
        results.push({ file: file.name, status: 'restored' });
      } catch (e) {
        results.push({ file: file.name, status: 'failed', error: e.message });
      }
    }
  }

  res.json({ restoredCount: results.filter(r => r.status === 'restored').length, details: results });
});

app.post('/api/files/:id/restore', async (req, res) => {
  const { versionId, asCopy, targetPath } = req.body;
  if (!versionId) return res.status(400).json({ error: 'versionId required' });
  try {
    const result = await versionEngine.restoreVersion(req.params.id, versionId, { asCopy, targetPath });
    res.json({ success: true, restoredTo: result.restoredTo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Settings ──────────────────────────────────────────
app.get('/api/settings', (req, res) => res.json(storageManager.getConfig()));

app.put('/api/settings', (req, res) => {
  storageManager.updateConfig(req.body);
  res.json({ success: true });
});

// ── Stats ─────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const files = storageManager.getAllFiles();
  const totalVersions = files.reduce((s, f) => s + f.versions.length, 0);
  const deleted = files.filter(f => f.currentStatus === 'deleted').length;
  const modified = files.filter(f => f.currentStatus === 'modified').length;
  
  // Folders and Extensions (only for active files)
  const folders = new Set();
  const extMap = {};
  files.forEach(f => {
    if (f.currentStatus === 'deleted') return;
    
    const parts = f.relativePath.split(/[/\\]/);
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    }
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext && ext !== f.name.toLowerCase()) {
      extMap[ext] = (extMap[ext] || 0) + 1;
    }
  });

  const topExts = Object.entries(extMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([ext, count]) => `${ext}: ${count}`);

  res.json({
    totalFiles: files.filter(f => f.currentStatus !== 'deleted').length,
    totalFolders: folders.size,
    totalVersions,
    deletedFiles: deleted,
    modifiedFiles: modified,
    topExtensions: topExts,
    watching: watcherBridge.isWatching(),
    watchPath: storageManager.getConfig().watchPath,
    usingCpp: watcherBridge.usingCpp(),
    syncing: versionEngine.isSyncing() || storageManager.isScanning,
  });
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[RestoreX] API running on port ${PORT}`);
  const config = storageManager.getConfig();
  if (config.watchPath && config.autoStart !== false) {
    console.log(`[RestoreX] Auto-starting watch on: ${config.watchPath}`);
    try {
      await storageManager.setWatchPath(config.watchPath);
      await storageManager.performInitialScan(config.watchPath);
      await watcherBridge.startWatching(config.watchPath);
    } catch (err) {
      console.warn('[RestoreX] Auto-start failed:', err.message);
    }
  }
});
