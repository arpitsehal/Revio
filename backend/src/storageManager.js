const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const APP_DATA = path.join(process.env.APPDATA || process.env.HOME, '.restorex');
const CONFIG_FILE = path.join(APP_DATA, 'config.json');

class StorageManager {
  constructor() {
    fs.ensureDirSync(APP_DATA);
    this.config = this._loadConfig();
    this.metaCache = {};
  }

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) return fs.readJsonSync(CONFIG_FILE);
    } catch (e) {}
    return { watchPath: null, maxVersions: 50, ignoredPatterns: [], autoStart: true };
  }

  _saveConfig() {
    fs.writeJsonSync(CONFIG_FILE, this.config, { spaces: 2 });
  }

  getConfig() { return { ...this.config }; }

  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    this._saveConfig();
  }

  async setWatchPath(watchPath) {
    const normalized = watchPath.toLowerCase();
    this.config.watchPath = normalized;
    this._saveConfig();
    await this._ensureMetadata(normalized);
    await this.performInitialScan(normalized);
  }

  async performInitialScan(watchPath) {
    const wp = watchPath.toLowerCase();
    console.log('[StorageManager] Starting initial scan of:', wp);
    const meta = await this._ensureMetadata(wp);
    const filesInDir = await this._scanDirRecursive(wp);
    const dirMap = new Map(filesInDir.map(item => [item.path, item.size]));
    
    let changed = false;
    const baselineTasks = [];
    for (const item of filesInDir) {
      const relPath = item.path;
      const size = item.size;
      if (!meta.files[relPath]) {
        meta.files[relPath] = {
          id: uuidv4(),
          name: path.basename(relPath),
          relativePath: relPath,
          currentStatus: 'active',
          size: size,
          versions: [],
          lastSeen: new Date().toISOString(),
        };
        changed = true;
        baselineTasks.push(relPath);
      } else {
        // Update size if active
        if (meta.files[relPath].currentStatus !== 'deleted' && meta.files[relPath].size !== size) {
            meta.files[relPath].size = size;
            changed = true;
        }
        if (meta.files[relPath].currentStatus === 'deleted') {
            meta.files[relPath].currentStatus = 'active';
            meta.files[relPath].size = size;
            changed = true;
        }
        if (meta.files[relPath].currentStatus === 'active' && meta.files[relPath].versions.length === 0) {
            baselineTasks.push(relPath);
        }
      }
    }

    // 2. Detect deleted files (was in meta, not in dir)
    for (const relPath in meta.files) {
      const file = meta.files[relPath];
      if (file.currentStatus !== 'deleted' && !dirMap.has(relPath)) {
        console.log(`[StorageManager] Detected missing file during scan: ${relPath}`);
        file.currentStatus = 'deleted';
        file.lastSeen = new Date().toISOString();
        // Add a deletion version marker
        file.versions.push({
            versionId: uuidv4(),
            timestamp: file.lastSeen,
            size: file.size || 0,
            status: 'deleted',
            storagePath: null
        });
        changed = true;
      }
    }

    if (changed) {
      await this._saveMeta();
    }

    // Perform baselines (in chunks to avoid overload)
    if (baselineTasks.length > 0) {
        console.log(`[StorageManager] Creating baselines for ${baselineTasks.length} files...`);
        const { versionEngine } = require('./versionEngine');
        for (let i = 0; i < baselineTasks.length; i += 5) {
            const chunk = baselineTasks.slice(i, i + 5);
            await Promise.all(chunk.map(p => versionEngine.createBaseline(p, wp)));
        }
        console.log(`[StorageManager] Baselines complete.`);
    }
    console.log(`[StorageManager] Scan complete. Metadata now has ${Object.keys(meta.files).length} files tracked.`);
  }

  async _scanDirRecursive(dir, relRoot = '') {
    const results = [];
    try {
      const items = await fs.readdir(dir);
      for (const item of items) {
        if (this._isIgnored(item)) continue;
        const fullPath = path.join(dir, item);
        const relPath = path.join(relRoot, item);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          results.push(...(await this._scanDirRecursive(fullPath, relPath)));
        } else {
          results.push({ path: relPath, size: stat.size });
        }
      }
    } catch (e) {}
    return results;
  }

  _isIgnored(item) {
    const ignored = ['.restorex', 'node_modules', '.git', 'dist', '.next', '__pycache__', '.tmp', '.log'];
    return ignored.includes(item);
  }

  _metaFile(watchPath) {
    return path.join(watchPath, '.restorex', 'metadata.json');
  }

  async _ensureMetadata(watchPath) {
    const wp = watchPath.toLowerCase();
    const mf = this._metaFile(wp);
    if (!this.metaCache[wp]) {
      try {
        if (await fs.pathExists(mf)) {
          this.metaCache[wp] = await fs.readJson(mf);
          console.log(`[StorageManager] Loaded metadata from ${mf} (${Object.keys(this.metaCache[wp].files).length} files)`);
        } else {
          this.metaCache[wp] = { files: {} };
          await fs.ensureDir(path.dirname(mf));
          await fs.writeJson(mf, this.metaCache[wp], { spaces: 2 });
          console.log(`[StorageManager] Created new metadata file at ${mf}`);
        }
      } catch (e) {
        console.error('[StorageManager] Error loading metadata:', e.message);
        this.metaCache[wp] = { files: {} };
      }
    }
    return this.metaCache[wp];
  }

  async _saveMeta() {
    const wp = this.config.watchPath ? this.config.watchPath.toLowerCase() : null;
    if (!wp || !this.metaCache[wp]) return;
    const mf = this._metaFile(wp);
    await fs.ensureDir(path.dirname(mf));
    await fs.writeJson(mf, this.metaCache[wp], { spaces: 2 });
  }

  _getMeta() {
    const wp = this.config.watchPath ? this.config.watchPath.toLowerCase() : null;
    if (!wp || !this.metaCache[wp]) return { files: {} };
    return this.metaCache[wp];
  }

  getAllFiles() {
    const meta = this._getMeta();
    return Object.values(meta.files).sort((a, b) => {
      const aT = a.lastSeen || 0;
      const bT = b.lastSeen || 0;
      return new Date(bT) - new Date(aT);
    });
  }

  getFile(id) {
    const meta = this._getMeta();
    return Object.values(meta.files).find(f => f.id === id) || null;
  }

  getFileByPath(relPath) {
    return this._getMeta().files[relPath] || null;
  }

  async upsertFile(relPath, updates) {
    const meta = this._getMeta();
    if (!meta.files[relPath]) {
      meta.files[relPath] = {
        id: uuidv4(),
        name: path.basename(relPath),
        relativePath: relPath,
        currentStatus: 'active',
        versions: [],
        lastSeen: new Date().toISOString(),
      };
    }
    Object.assign(meta.files[relPath], updates);
    await this._saveMeta();
    return meta.files[relPath];
  }

  async addVersion(relPath, versionData) {
    const meta = this._getMeta();
    if (!meta.files[relPath]) await this.upsertFile(relPath, {});
    const file = meta.files[relPath];
    file.versions.push(versionData);
    file.currentStatus = versionData.status;
    file.lastSeen = versionData.timestamp;

    const max = this.config.maxVersions || 50;
    if (file.versions.length > max) {
      const removed = file.versions.splice(0, file.versions.length - max);
      for (const v of removed) {
        if (v.storagePath) fs.remove(v.storagePath).catch(() => {});
      }
    }
    await this._saveMeta();
    return file;
  }
}

const storageManager = new StorageManager();
module.exports = { storageManager };
