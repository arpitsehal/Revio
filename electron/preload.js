const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolderDialog: ()     => ipcRenderer.invoke('dialog:openFolder'),
  getApiPort:       ()     => ipcRenderer.invoke('get:apiPort'),
  windowMinimize:   ()     => ipcRenderer.send('window:minimize'),
  windowMaximize:   ()     => ipcRenderer.send('window:maximize'),
  windowClose:      ()     => ipcRenderer.send('window:close'),
  platform: process.platform,
});
