const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const { versionEngine } = require('./versionEngine');

const WATCHER_EXE = path.join(__dirname, '../../watcher/watcher.exe');

class WatcherBridge {
  constructor() {
    this._proc = null;      // C++ process
    this._watcher = null;   // chokidar fallback
    this._watchPath = null;
    this._useCpp = false;
  }

  isWatching() {
    return this._proc !== null || this._watcher !== null;
  }

  async startWatching(watchPath) {
    if (this.isWatching()) this.stopWatching();
    this._watchPath = watchPath;

    // Try C++ watcher first (DISABLED FOR DEBUGGING)
    // const fs = require('fs-extra');
    // if (await fs.pathExists(WATCHER_EXE)) {
    //   console.log('[WatcherBridge] Using C++ native watcher');
    //   this._startCppWatcher(watchPath);
    //   this._useCpp = true;
    // } else {
      console.log('[WatcherBridge] Using Chokidar engine');
      this._startChokidar(watchPath);
      this._useCpp = false;
    // }
  }

  _startCppWatcher(watchPath) {
    this._proc = spawn(WATCHER_EXE, [watchPath], { stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    this._proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.action && event.path) {
            versionEngine.handleEvent(event.action, event.path, watchPath);
          }
        } catch (e) {}
      }
    });

    this._proc.stderr.on('data', (d) => console.error('[C++ Watcher]', d.toString()));
    this._proc.on('exit', (code) => {
      console.log('[C++ Watcher] exited with code', code);
      this._proc = null;
    });
  }

  _startChokidar(watchPath) {
    this._watcher = chokidar.watch(watchPath, {
      ignored: /(^|[/\\])\..restorex|node_modules|\.git/,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this._watcher
      .on('add',    p => versionEngine.handleEvent('created',  path.relative(watchPath, p), watchPath))
      .on('change', p => versionEngine.handleEvent('modified', path.relative(watchPath, p), watchPath))
      .on('unlink', p => versionEngine.handleEvent('deleted',  path.relative(watchPath, p), watchPath))
      .on('error',  err => console.error('[Chokidar]', err));
  }

  stopWatching() {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
    }
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    this._watchPath = null;
    console.log('[WatcherBridge] Stopped watching');
  }

  getWatchPath() { return this._watchPath; }
  usingCpp() { return this._useCpp; }
}

const watcherBridge = new WatcherBridge();
module.exports = { watcherBridge };
