const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const API_PORT = 3847;

let mainWindow = null;
let backendProcess = null;
let tray = null;

// ── Spawn Backend ─────────────────────────────────────
function startBackend() {
  const backendPath = isDev
    ? path.join(__dirname, '../backend/src/server.js')
    : path.join(process.resourcesPath, 'backend/src/server.js');

  console.log('[Electron] Starting backend:', backendPath);

  backendProcess = spawn(process.execPath, [backendPath], {
    env: { ...process.env, PORT: API_PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', d => console.log('[Backend]', d.toString().trim()));
  backendProcess.stderr.on('data', d => console.error('[Backend ERR]', d.toString().trim()));
  backendProcess.on('exit', code => console.log('[Backend] exited', code));
}

// ── Wait for backend to be ready ─────────────────────
function waitForBackend(retries = 20) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://localhost:${API_PORT}/api/stats`, (res) => {
        if (res.statusCode === 200) resolve();
        else if (retries-- > 0) setTimeout(attempt, 500);
        else reject(new Error('Backend never responded'));
      }).on('error', () => {
        if (retries-- > 0) setTimeout(attempt, 500);
        else reject(new Error('Backend failed to start'));
      });
    };
    attempt();
  });
}

// ── Create Window ─────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f14',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── IPC Handlers ─────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder to Monitor',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get:apiPort', () => API_PORT);

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => {
  app.isQuiting = true;
  app.quit();
});

// ── App Lifecycle ─────────────────────────────────────
app.whenReady().then(async () => {
  startBackend();

  try {
    await waitForBackend();
    console.log('[Electron] Backend ready');
  } catch (err) {
    console.warn('[Electron] Backend timeout:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (backendProcess) backendProcess.kill();
});
