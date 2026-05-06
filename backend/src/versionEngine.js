const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { storageManager } = require('./storageManager');

// File extensions to prioritize
const HIGH_PRIORITY_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.cpp', '.c', '.h', '.java', '.go', '.rs',
  '.json', '.yaml', '.yml', '.toml', '.env',
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.txt', '.md',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
  '.mp4', '.mp3', '.wav', '.zip', '.rar'
]);

// Patterns to ignore
const IGNORE_PATTERNS = [
  '.restorex', 'node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information',
  '.tmp', '.temp', '.log', '.cache', 'Thumbs.db', 'desktop.ini', '.DS_Store',
  '__pycache__', '.pytest_cache', 'dist', '.next', 'build', '.vscode', '.idea'
];

class VersionEngine {
  constructor() {
    this.debounceMap = new Map();
    this.DEBOUNCE_MS = 600;
    this.activeTasks = 0;
  }

  isSyncing() {
    return this.activeTasks > 0;
  }

  shouldIgnore(relPath) {
    const lower = relPath.toLowerCase().replace(/\\/g, '/');
    for (const pattern of IGNORE_PATTERNS) {
      if (lower.includes(pattern.toLowerCase())) return true;
    }
    const ext = path.extname(relPath).toLowerCase();
    // Only track files with known extensions or no extension (important docs)
    if (ext && !HIGH_PRIORITY_EXT.has(ext)) {
      // Allow tracking but don't prioritize
    }
    return false;
  }

  handleEvent(action, relPath, watchPath) {
    console.log(`[VersionEngine] Event: ${action} on ${relPath}`);
    if (this.shouldIgnore(relPath)) {
        console.log(`[VersionEngine] Ignored: ${relPath}`);
        return;
    }
    if (!relPath || relPath.trim() === '') return;

    const key = `${action}:${relPath}`;
    if (this.debounceMap.has(key)) {
      clearTimeout(this.debounceMap.get(key));
    } else {
      this.activeTasks++;
    }

    const timer = setTimeout(() => {
      this.debounceMap.delete(key);
      this._process(action, relPath, watchPath)
        .catch(err => {
          console.error('[VersionEngine] error:', err.message);
        })
        .finally(() => {
          this.activeTasks--;
        });
    }, this.DEBOUNCE_MS);

    this.debounceMap.set(key, timer);
  }

  async _process(action, relPath, watchPath) {
    const fullPath = path.join(watchPath, relPath);
    const storageDir = path.join(watchPath, '.restorex', 'versions', path.dirname(relPath));
    const timestamp = new Date().toISOString();
    const safeTs = timestamp.replace(/[:.]/g, '-');
    const basename = path.basename(relPath);
    const storageName = `${safeTs}__${basename}`;
    const storagePath = path.join(storageDir, storageName);

    const versionId = uuidv4();

    if (action === 'created' || action === 'modified') {
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) return;

        await fs.ensureDir(storageDir);
        await fs.copy(fullPath, storagePath);

        await storageManager.addVersion(relPath, {
          versionId,
          timestamp,
          size: stat.size,
          status: action,
          storagePath,
        });
        console.log(`[+] Versioned ${action}: ${relPath}`);
      } catch (err) {
        console.warn(`[VersionEngine] Could not version ${relPath}:`, err.message);
      }
    } else if (action === 'deleted') {
      // Mark as deleted — last known copy already saved
      const file = storageManager.getFileByPath(relPath);
      if (file) {
        await storageManager.addVersion(relPath, {
          versionId: uuidv4(),
          timestamp,
          size: file.size || (file.versions.length ? file.versions[file.versions.length - 1].size : 0),
          status: 'deleted',
          storagePath: null,
        });
        console.log(`[-] Marked deleted: ${relPath}`);
      }
    } else if (action === 'renamed_new') {
      // Treat renamed-to as a new file creation
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) return;
        await fs.ensureDir(storageDir);
        await fs.copy(fullPath, storagePath);
        await storageManager.addVersion(relPath, {
          versionId, timestamp, size: stat.size, status: 'created', storagePath,
        });
      } catch (e) {}
    }
  }

  async createBaseline(relPath, watchPath) {
    if (this.shouldIgnore(relPath)) return;
    const fullPath = path.join(watchPath, relPath);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) return;
      if (stat.size > 10 * 1024 * 1024) return; // Skip files > 10MB for baseline

      const storageDir = path.join(watchPath, '.restorex', 'versions', path.dirname(relPath));
      const timestamp = new Date().toISOString();
      const safeTs = timestamp.replace(/[:.]/g, '-');
      const storageName = `${safeTs}__${path.basename(relPath)}`;
      const storagePath = path.join(storageDir, storageName);

      await fs.ensureDir(storageDir);
      await fs.copy(fullPath, storagePath);

      await storageManager.addVersion(relPath, {
        versionId: uuidv4(),
        timestamp,
        size: stat.size,
        status: 'created',
        storagePath,
      });
      console.log(`[Baseline] Created for: ${relPath}`);
    } catch (e) {}
  }

  async restoreVersion(fileId, versionId, opts = {}) {
    const { asCopy = false, targetPath } = opts;
    const file = storageManager.getFile(fileId);
    if (!file) throw new Error('File not found');

    const version = file.versions.find(v => v.versionId === versionId);
    if (!version) throw new Error('Version not found');
    if (!version.storagePath) throw new Error('This version has no stored file (deletion marker)');

    const config = storageManager.getConfig();
    const watchPath = config.watchPath;
    const originalFull = path.join(watchPath, file.relativePath);

    let destination;
    if (targetPath) {
      destination = targetPath;
    } else if (asCopy) {
      const ext = path.extname(file.name);
      const base = path.basename(file.name, ext);
      const dir = path.dirname(originalFull);
      destination = path.join(dir, `${base}_restored_${Date.now()}${ext}`);
    } else {
      destination = originalFull;
    }

    await fs.ensureDir(path.dirname(destination));
    await fs.copy(version.storagePath, destination);

    // If restoring to original location, update status
    if (!asCopy && !targetPath) {
      await storageManager.upsertFile(file.relativePath, { currentStatus: 'active' });
    }

    return { restoredTo: destination };
  }
}

const versionEngine = new VersionEngine();
module.exports = { versionEngine };
