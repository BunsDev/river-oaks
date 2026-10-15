// A stand-in for the parts of Electron desktop/main.js touches while it starts.
// Every call is appended to globalThis.__electronCalls in order. app.exit()
// throws, like the real one ending the process, so nothing after it runs.
const calls = globalThis.__electronCalls ??= [];
const record = (name, ...args) => { calls.push([name, ...args]); };
export class ExitSignal extends Error {}

export const app = {
  isPackaged: true,
  commandLine: { getSwitchValue: name => { record('commandLine.getSwitchValue', name); return ''; } },
  getPath: name => { record('getPath', name); return { appData: 'C:\\Users\\resident\\AppData\\Roaming', desktop: 'C:\\Users\\resident\\Desktop' }[name] ?? `C:\\Users\\resident\\${name}`; },
  setPath: (name, path) => record('setPath', name, path),
  setName: name => record('setName', name),
  setAppUserModelId: id => record('setAppUserModelId', id),
  enableSandbox: () => record('enableSandbox'),
  requestSingleInstanceLock: () => { record('requestSingleInstanceLock'); return false; },
  quit: () => record('quit'),
  exit: code => { record('exit', code); throw new ExitSignal(`exit ${code}`); },
  on: event => record('on', event),
  whenReady: () => { record('whenReady'); return new Promise(() => {}); },
};
export class BrowserWindow { constructor() { record('BrowserWindow'); } }
export const shell = {
  writeShortcutLink: (path, operation, options) => { record('writeShortcutLink', path, operation, options); return true; },
  readShortcutLink: path => { record('readShortcutLink', path); throw new Error('no shortcut'); },
  openExternal: () => record('openExternal'),
};
const inert = name => new Proxy({}, { get: (_, key) => (...args) => record(`${name}.${String(key)}`, ...args) });
export const Menu = inert('Menu'), dialog = inert('dialog'), net = inert('net'), screen = inert('screen'), session = inert('session'), ipcMain = inert('ipcMain');
