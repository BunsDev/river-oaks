import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runSquirrelEvent, shortcutOptions, shortcutPaths, squirrelEvent } from '../squirrel.js';
import { APP_USER_MODEL_ID } from '../identity.js';

const run = promisify(execFile);
const ROOT = 'C:\\Users\\resident\\AppData\\Local\\TypeSafePlace';
const EXE = `${ROOT}\\app-0.1.6\\TypeSafe Place.exe`;
const DIRS = { appData: 'C:\\Users\\resident\\AppData\\Roaming', desktop: 'C:\\Users\\resident\\Desktop' };
const [START_MENU, DESKTOP] = shortcutPaths(DIRS);

// Electron's shell.writeShortcutLink/readShortcutLink over an in-memory set of .lnk files.
function fakeShell(existing = {}) {
  const links = new Map(Object.entries(existing));
  return {
    links,
    writeShortcutLink(path, operation, options) {
      if (operation !== 'create' && !links.has(path)) return false;
      links.set(path, operation === 'update' ? { ...links.get(path), ...options } : { ...options });
      return true;
    },
    readShortcutLink(path) { if (!links.has(path)) throw new Error('Failed to read shortcut link'); return links.get(path); },
    exists: path => links.has(path),
    remove: path => links.delete(path),
  };
}
const runEvent = (event, shell) => runSquirrelEvent(event, { execPath: EXE, ...DIRS, shell, exists: shell.exists, remove: shell.remove });

test('only a Squirrel event as the first argument on Windows is handled; first run is an ordinary launch', () => {
  for (const [flag, event] of [['--squirrel-install', 'install'], ['--squirrel-updated', 'updated'], ['--squirrel-uninstall', 'uninstall'], ['--squirrel-obsolete', 'obsolete']]) {
    assert.equal(squirrelEvent([EXE, flag, '0.1.6'], 'win32'), event);
    assert.equal(squirrelEvent([EXE, flag, '0.1.6'], 'linux'), null, `${flag} means nothing off Windows`);
  }
  assert.equal(squirrelEvent([EXE, '--squirrel-firstrun'], 'win32'), null);
  assert.equal(squirrelEvent([EXE], 'win32'), null);
  assert.equal(squirrelEvent([EXE, '--proxy-server=x', '--squirrel-install'], 'win32'), null);
});

test('shortcuts start the app through Update.exe and carry the window\'s AppUserModelID', () => {
  assert.equal(START_MENU, 'C:\\Users\\resident\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\TypeSafe Place.lnk');
  assert.equal(DESKTOP, 'C:\\Users\\resident\\Desktop\\TypeSafe Place.lnk');
  assert.deepEqual(shortcutOptions(EXE), {
    target: `${ROOT}\\Update.exe`, args: '--processStart "TypeSafe Place.exe"', cwd: ROOT,
    icon: EXE, iconIndex: 0, appUserModelId: 'works.jev.river-oaks', description: 'TypeSafe Place',
  });
  assert.equal(shortcutOptions(EXE).appUserModelId, APP_USER_MODEL_ID, 'main.js sets the same ID on the process');
});

test('install creates the Start menu and desktop shortcuts', () => {
  const shell = fakeShell();
  assert.deepEqual(runEvent('install', shell), [START_MENU, DESKTOP]);
  for (const path of [START_MENU, DESKTOP]) assert.deepEqual(shell.links.get(path), shortcutOptions(EXE));
});

test('an update refreshes this install\'s shortcuts, leaves a deleted one deleted and another app\'s alone', () => {
  const old = shortcutOptions(`${ROOT}\\app-0.1.5\\TypeSafe Place.exe`);
  const foreign = { target: 'C:\\Other\\Update.exe', args: '--processStart "TypeSafe Place.exe"' };
  const shell = fakeShell({ [START_MENU]: { ...old, hotkey: 'Ctrl+Alt+T' } });
  assert.deepEqual(runEvent('updated', shell), [START_MENU]);
  assert.equal(shell.links.get(START_MENU).icon, EXE, 'the icon follows the new version folder');
  assert.equal(shell.links.get(START_MENU).hotkey, 'Ctrl+Alt+T', 'an update keeps what the resident set');
  assert.equal(shell.links.has(DESKTOP), false);
  const other = fakeShell({ [DESKTOP]: foreign });
  assert.deepEqual(runEvent('updated', other), []);
  assert.deepEqual(other.links.get(DESKTOP), foreign);
});

test('uninstall removes only shortcuts that start this install; obsolete changes nothing', () => {
  const foreign = { target: 'C:\\Other\\Update.exe' };
  const shell = fakeShell({ [START_MENU]: { ...shortcutOptions(EXE), target: `${ROOT.toUpperCase()}\\UPDATE.EXE` }, [DESKTOP]: foreign });
  assert.deepEqual(runEvent('obsolete', shell), []);
  assert.equal(shell.links.size, 2);
  assert.deepEqual(runEvent('uninstall', shell), [START_MENU], 'Windows paths compare without case');
  assert.deepEqual([...shell.links.keys()], [DESKTOP]);
  assert.deepEqual(runEvent('uninstall', fakeShell()), []);
});

// desktop/main.js itself, loaded against a recording Electron stub, in a child
// process so the stubbed platform and arguments cannot leak into other tests.
async function startMain(platform, args) {
  const stub = fileURLToPath(new URL('./fixtures/electron-stub/', import.meta.url));
  // --import takes a URL: a bare Windows path (D:\…) would read as the scheme "d:".
  const { stdout } = await run(process.execPath, ['--import', pathToFileURL(join(stub, 'register.mjs')).href, join(stub, 'start-main.mjs')], { env: { ...process.env, STUB_PLATFORM: platform, STUB_ARGV: JSON.stringify([EXE, ...args]) } });
  const { exited, calls } = JSON.parse(stdout);
  return { exited, calls, names: calls.map(([name]) => name) };
}

test('main.js handles each Squirrel event and exits before the single-instance lock or any window', async () => {
  for (const event of ['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete']) {
    const { exited, calls, names } = await startMain('win32', [event, '0.1.6']);
    assert.ok(exited, `${event} exits`);
    assert.deepEqual(calls.at(-1), ['exit', 0], `${event} exits with 0 and nothing runs after`);
    for (const later of ['requestSingleInstanceLock', 'BrowserWindow', 'whenReady', 'on']) assert.ok(!names.includes(later), `${event} reached ${later}`);
    if (event === '--squirrel-install') {
      const writes = calls.filter(([name]) => name === 'writeShortcutLink');
      assert.deepEqual(writes.map(([, path, operation]) => [path, operation]), [[START_MENU, 'create'], [DESKTOP, 'create']]);
      assert.equal(writes[0][3].appUserModelId, APP_USER_MODEL_ID);
    }
  }
});

test('an ordinary launch, first run included, takes the single-instance lock on every platform', async () => {
  for (const [platform, args] of [['win32', []], ['win32', ['--squirrel-firstrun']], ['linux', ['--squirrel-install', '0.1.6']], ['darwin', []]]) {
    const { exited, names } = await startMain(platform, args);
    assert.equal(exited, false, `${platform} ${args} does not exit early`);
    assert.ok(names.includes('requestSingleInstanceLock'), `${platform} ${args} takes the lock`);
    assert.ok(!names.includes('writeShortcutLink'), `${platform} ${args} writes no shortcut`);
    assert.equal(names.includes('setAppUserModelId'), platform === 'win32');
  }
});
