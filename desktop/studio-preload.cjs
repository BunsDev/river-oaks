const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('worldDesigner', Object.freeze({
  catalog: () => ipcRenderer.invoke('studio-designer:catalog'),
  connect: input => ipcRenderer.invoke('studio-designer:connect', input),
  request: input => ipcRenderer.invoke('studio-designer:request', input),
  cancel: input => ipcRenderer.invoke('studio-designer:cancel', input),
  disconnect: input => ipcRenderer.invoke('studio-designer:disconnect', input),
}));
contextBridge.exposeInMainWorld('studioAgent', Object.freeze({
  catalog: () => ipcRenderer.invoke('studio-agent:catalog'),
  send: input => ipcRenderer.invoke('studio-agent:send', input),
  cancel: input => ipcRenderer.invoke('studio-agent:cancel', input),
  reset: input => ipcRenderer.invoke('studio-agent:reset', input),
  // Only the request ID and text cross into the page; the IPC event object stays here.
  onDelta: listener => {
    const handler = (_event, value) => listener({ requestId: String(value?.requestId ?? ''), text: String(value?.text ?? '') });
    ipcRenderer.on('studio-agent:delta', handler);
    return () => ipcRenderer.removeListener('studio-agent:delta', handler);
  },
}));
