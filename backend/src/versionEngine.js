const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { storageManager } = require('./storageManager');
const fossilDelta = require('fossil-delta');
const zlib = require('zlib');

const SKIP_GZIP_EXT = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.mp4', '.mkv', '.avi', '.mov',
  '.mp3', '.flac', '.aac',
  '.jpg', '.jpeg', '.png', '.gif', '.webp'
]);

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
    this.pendingRestores = new Map(); // path -> versionId
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

        let encoding = 'full';
        let parentVersionId = null;
        const fileRecord = storageManager.getFileByPath(relPath);

        const ext = path.extname(relPath).toLowerCase();
        const canGzip = stat.size <= 50 * 1024 * 1024 && !SKIP_GZIP_EXT.has(ext);

        const saveFullOrGzip = async (src, dst) => {
          if (canGzip) {
            const buffer = await fs.readFile(src);
            const gzipped = zlib.gzipSync(buffer);
            if (gzipped.length < buffer.length) {
              await fs.writeFile(dst, gzipped);
              return 'gzip';
            }
          }
          await fs.copy(src, dst);
          return 'full';
        };

        // Try to do delta compression if we have a previous version and size is <= 50MB
        if (fileRecord && fileRecord.versions.length > 0 && stat.size <= 50 * 1024 * 1024) {
          let lastActive = null;
          for (let i = fileRecord.versions.length - 1; i >= 0; i--) {
            if (fileRecord.versions[i].status !== 'deleted' && fileRecord.versions[i].storagePath) {
              lastActive = fileRecord.versions[i];
              break;
            }
          }

          if (lastActive) {
            try {
              const prevBuffer = await this._reconstructVersion(fileRecord, lastActive.versionId);
              const newBuffer = await fs.readFile(fullPath);
              const deltaArray = fossilDelta.createDelta(prevBuffer, newBuffer);
              
              // Only use delta if it's actually smaller than the full file
              if (deltaArray.length < newBuffer.length) {
                await fs.writeFile(storagePath, Buffer.from(deltaArray));
                encoding = 'delta';
                parentVersionId = lastActive.versionId;
                console.log(`[VersionEngine] Delta size: ${deltaArray.length} bytes (Full: ${newBuffer.length} bytes)`);
              } else {
                encoding = await saveFullOrGzip(fullPath, storagePath);
              }
            } catch (err) {
              console.warn('[VersionEngine] Delta creation failed, falling back to full copy:', err.message);
              encoding = await saveFullOrGzip(fullPath, storagePath);
            }
          } else {
            encoding = await saveFullOrGzip(fullPath, storagePath);
          }
        } else {
          encoding = await saveFullOrGzip(fullPath, storagePath);
        }

        const restoredFrom = this.pendingRestores.get(relPath);
        const finalStatus = restoredFrom ? 'restored' : action;
        this.pendingRestores.delete(relPath);

        await storageManager.addVersion(relPath, {
          versionId,
          timestamp,
          size: stat.size,
          status: finalStatus,
          storagePath,
          restoredFrom,
          encoding,
          parentVersionId
        });

        if (restoredFrom) {
          await storageManager.upsertFile(relPath, { lastRestoredVersionId: restoredFrom });
        }

        console.log(`[+] Versioned ${finalStatus} (${encoding}): ${relPath}`);
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
        const ext = path.extname(relPath).toLowerCase();
        let encoding = 'full';
        if (stat.size <= 50 * 1024 * 1024 && !SKIP_GZIP_EXT.has(ext)) {
          const buffer = await fs.readFile(fullPath);
          const gzipped = zlib.gzipSync(buffer);
          if (gzipped.length < buffer.length) {
            await fs.writeFile(storagePath, gzipped);
            encoding = 'gzip';
          } else {
            await fs.copy(fullPath, storagePath);
          }
        } else {
          await fs.copy(fullPath, storagePath);
        }
        await storageManager.addVersion(relPath, {
          versionId, timestamp, size: stat.size, status: 'created', storagePath, encoding
        });
      } catch (e) {}
    }
  }

  async _reconstructVersion(file, versionId) {
    const versionIdx = file.versions.findIndex(v => v.versionId === versionId);
    if (versionIdx === -1) throw new Error('Version not found');
    
    const version = file.versions[versionIdx];
    if (version.status === 'deleted' || !version.storagePath) throw new Error('Cannot reconstruct deleted version');

    if (version.encoding !== 'delta') {
      if (version.encoding === 'gzip') {
        return zlib.gunzipSync(await fs.readFile(version.storagePath));
      }
      return await fs.readFile(version.storagePath);
    }

    const chain = [];
    let currentIdx = versionIdx;
    while (currentIdx >= 0) {
      const v = file.versions[currentIdx];
      chain.unshift(v);
      if (v.encoding !== 'delta') break;
      currentIdx = file.versions.findIndex(parent => parent.versionId === v.parentVersionId);
      if (currentIdx === -1) throw new Error('Delta chain broken');
    }

    let buffer;
    if (chain[0].encoding === 'gzip') {
      const gzipped = await fs.readFile(chain[0].storagePath);
      buffer = zlib.gunzipSync(gzipped);
    } else {
      buffer = await fs.readFile(chain[0].storagePath);
    }
    for (let i = 1; i < chain.length; i++) {
      const deltaBuffer = await fs.readFile(chain[i].storagePath);
      try {
        const resultArray = fossilDelta.applyDelta(buffer, deltaBuffer);
        buffer = Buffer.from(resultArray);
      } catch (err) {
        throw new Error(`Failed to apply delta at version ${chain[i].versionId}: ${err.message}`);
      }
    }
    return buffer;
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
      const ext = path.extname(relPath).toLowerCase();
      let encoding = 'full';
      if (stat.size <= 50 * 1024 * 1024 && !SKIP_GZIP_EXT.has(ext)) {
        const buffer = await fs.readFile(fullPath);
        const gzipped = zlib.gzipSync(buffer);
        if (gzipped.length < buffer.length) {
          await fs.writeFile(storagePath, gzipped);
          encoding = 'gzip';
        } else {
          await fs.copy(fullPath, storagePath);
        }
      } else {
        await fs.copy(fullPath, storagePath);
      }

      await storageManager.addVersion(relPath, {
        versionId: uuidv4(),
        timestamp,
        size: stat.size,
        status: 'synced',
        storagePath,
        encoding
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
    if (!asCopy && !targetPath) {
      this.pendingRestores.set(file.relativePath, versionId);
    }
    
    if (version.encoding === 'delta') {
      const buffer = await this._reconstructVersion(file, versionId);
      await fs.writeFile(destination, buffer);
    } else if (version.encoding === 'gzip') {
      const gzipped = await fs.readFile(version.storagePath);
      await fs.writeFile(destination, zlib.gunzipSync(gzipped));
    } else {
      await fs.copy(version.storagePath, destination);
    }

    // If restoring to original location, update status
    if (!asCopy && !targetPath) {
      await storageManager.upsertFile(file.relativePath, { 
        currentStatus: 'active',
        lastRestoredVersionId: versionId 
      });
    }

    return { restoredTo: destination };
  }
}

const versionEngine = new VersionEngine();
module.exports = { versionEngine };
