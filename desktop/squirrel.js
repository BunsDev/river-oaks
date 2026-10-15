import { win32 } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { APP_NAME, APP_USER_MODEL_ID, WINDOWS_EXECUTABLE } from './identity.js';

// Squirrel.Windows (the per-user installer desktop/installers.js builds, #372)
// starts the installed app with one of these as its first argument after it
// installs, updates or removes a version, waits up to 15 seconds and expects the
// process to exit. --squirrel-firstrun is an ordinary launch and is not handled here.
const EVENTS = { '--squirrel-install': 'install', '--squirrel-updated': 'updated', '--squirrel-uninstall': 'uninstall', '--squirrel-obsolete': 'obsolete' };

export function squirrelEvent(argv, platform = process.platform) {
  return platform === 'win32' ? EVENTS[argv[1]] ?? null : null;
}

// The Start menu and desktop shortcuts, where Squirrel's own --createShortcut puts them.
export function shortcutPaths({ appData, desktop }) {
  return [win32.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${APP_NAME}.lnk`), win32.join(desktop, `${APP_NAME}.lnk`)];
}

// Squirrel installs each version to <root>\app-<version>\ and keeps Update.exe in
// <root>, so a shortcut that starts the app through Update.exe survives updates.
// The app writes its own shortcuts rather than asking Update.exe to: Squirrel
// would stamp them with its own AppUserModelID (com.squirrel.<id>.<exe>), which
// would split a pinned taskbar button from the window, whose ID main.js sets to
// APP_USER_MODEL_ID (#370).
export function shortcutOptions(execPath) {
  const root = win32.dirname(win32.dirname(execPath));
  return { target: win32.join(root, 'Update.exe'), args: `--processStart "${WINDOWS_EXECUTABLE}"`, cwd: root, icon: execPath, iconIndex: 0, appUserModelId: APP_USER_MODEL_ID, description: APP_NAME };
}

const samePath = (a, b) => typeof a === 'string' && win32.normalize(a).toLowerCase() === win32.normalize(b).toLowerCase();

// Install writes both shortcuts. Update rewrites only shortcuts that still exist
// and start this install, so a shortcut the user deleted stays deleted and the
// icon follows the new version's folder. Uninstall removes only this install's
// shortcuts, never a same-named one that starts something else. Obsolete (the
// version being replaced) has nothing to do. `shell` is Electron's.
export function runSquirrelEvent(event, { execPath, appData, desktop, shell, exists = existsSync, remove = path => rmSync(path, { force: true }) }) {
  const options = shortcutOptions(execPath);
  const ours = path => { try { return samePath(shell.readShortcutLink(path).target, options.target); } catch { return false; } };
  const done = [];
  for (const path of shortcutPaths({ appData, desktop })) {
    if (event === 'install' && shell.writeShortcutLink(path, 'create', options)) done.push(path);
    else if (event === 'updated' && exists(path) && ours(path) && shell.writeShortcutLink(path, 'update', options)) done.push(path);
    else if (event === 'uninstall' && exists(path) && ours(path)) { remove(path); done.push(path); }
  }
  return done;
}
