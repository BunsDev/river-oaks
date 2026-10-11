const { contextBridge, ipcRenderer } = require('electron');

// Bridges exist only in a document loaded at a Studio path. The main process
// separately checks the committed URL, since pushState can rewrite location later.
if (['/studio', '/studio.html'].includes(location.pathname)) {
  // Starting agent work needs a recent user gesture (a click or key press), so
  // page script alone cannot start it unattended.
  const gesture = (call, label) => input => navigator.userActivation?.isActive ? call(input)
    : Promise.reject(new Error(`${label} needs a click or key press in Studio.`));
  contextBridge.exposeInMainWorld('worldDesigner', Object.freeze({
    catalog: () => ipcRenderer.invoke('studio-designer:catalog'),
    connect: gesture(input => ipcRenderer.invoke('studio-designer:connect', input), 'Connecting a designer'),
    request: gesture(input => ipcRenderer.invoke('studio-designer:request', input), 'Sending a design task'),
    cancel: input => ipcRenderer.invoke('studio-designer:cancel', input),
    disconnect: input => ipcRenderer.invoke('studio-designer:disconnect', input),
  }));
  contextBridge.exposeInMainWorld('studioAgent', Object.freeze({
    catalog: () => ipcRenderer.invoke('studio-agent:catalog'),
    send: gesture(input => ipcRenderer.invoke('studio-agent:send', input), 'Messaging the agent'),
    cancel: input => ipcRenderer.invoke('studio-agent:cancel', input),
    reset: input => ipcRenderer.invoke('studio-agent:reset', input),
    // Only the request ID and text cross into the page; the IPC event object stays here.
    onDelta: listener => {
      const handler = (_event, value) => listener({ requestId: String(value?.requestId ?? ''), text: String(value?.text ?? '') });
      ipcRenderer.on('studio-agent:delta', handler);
      return () => ipcRenderer.removeListener('studio-agent:delta', handler);
    },
  }));
}
