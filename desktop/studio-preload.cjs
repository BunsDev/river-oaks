const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('worldDesigner', Object.freeze({
  catalog: () => ipcRenderer.invoke('studio-designer:catalog'),
  connect: input => ipcRenderer.invoke('studio-designer:connect', input),
  request: input => ipcRenderer.invoke('studio-designer:request', input),
  cancel: input => ipcRenderer.invoke('studio-designer:cancel', input),
  disconnect: input => ipcRenderer.invoke('studio-designer:disconnect', input),
}));
