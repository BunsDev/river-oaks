import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isSquirrelInstall, runSquirrelEvent, shortcutOptions, shortcutPaths, squirrelEvent, startUninstallCleanup, uninstallCleanupScript } from '../squirrel.js';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

test('only a real Squirrel install is cleaned after uninstall', () => {
  const has = (...paths) => path => paths.includes(path);
  assert.equal(isSquirrelInstall(EXE, has(`${ROOT}\\Update.exe`)), true);
  assert.equal(isSquirrelInstall(EXE, has()), false, 'no Update.exe beside the version folder');
  assert.equal(isSquirrelInstall('C:\\Users\\resident\\Downloads\\TypeSafe Place-win32-x64\\TypeSafe Place.exe', () => true), false, 'the zip build is not a Squirrel install');
  assert.equal(isSquirrelInstall('C:\\Users\\resident\\AppData\\Local\\Other\\app-0.1.6\\TypeSafe Place.exe', () => true), false, 'another install folder');
});

test('the cleanup waits for the uninstaller, then removes only Squirrel\'s names once .dead exists, .dead last', () => {
  const script = uninstallCleanupScript("C:\\Users\\O'Brien\\AppData\\Local\\TypeSafePlace");
  const lines = script.split('\n');
  assert.equal(lines[1], "$root = 'C:\\Users\\O''Brien\\AppData\\Local\\TypeSafePlace'", 'single quotes are doubled');
  assert.match(script, /\} while \(\(\$busy\.Count -gt 0 -or -not \(Test-Path -LiteralPath \$dead\)\) -and \(Get-Date\) -lt \$deadline\)/, 'it waits until nothing runs from the folder and .dead exists');
  assert.ok(lines.findIndex(line => line.includes('no .dead')) < lines.findIndex(line => line.includes('Remove-Item')), 'nothing is removed without .dead');
  assert.match(script, /-Filter 'app-\*'/);
  assert.match(script, /foreach \(\$name in 'packages', 'Update\.exe', 'app\.ico', 'TypeSafe Place\.exe', 'SquirrelSetup\.log'\)/);
  assert.match(script, /\$left = @\(Get-ChildItem -LiteralPath \$root -Force \| Where-Object Name -ne '\.dead'\)\n.*if \(\$left\.Count -eq 0\) \{ Remove-Item -LiteralPath \$root/, 'the folder goes only when nothing but .dead is left');
  assert.ok(!script.includes('$root:'), 'no drive-qualified variable by accident');
});

test('uninstall starts the cleanup through a hidden launcher, only in a Squirrel install', () => {
  const runs = [];
  const spawnSync = (command, args, options) => { runs.push({ command, args, options }); return { status: 0 }; };
  const decode = text => Buffer.from(text, 'base64').toString('utf16le');
  const shell = fakeShell();
  const exists = path => path === `${ROOT}\\Update.exe` || shell.exists(path);
  assert.deepEqual(runSquirrelEvent('uninstall', { execPath: EXE, ...DIRS, shell, exists, remove: shell.remove, spawnSync }), [`cleanup ${ROOT}`]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].command, 'powershell.exe');
  assert.deepEqual(runs[0].args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.deepEqual(runs[0].options, { stdio: 'ignore', windowsHide: true, timeout: 8000 }, 'the hook waits for the short launcher, never for the cleanup');
  const launcher = decode(runs[0].args[3]);
  const inner = launcher.match(/^Start-Process -FilePath powershell\.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','([A-Za-z0-9+/=]+)'$/);
  assert.ok(inner, launcher);
  assert.equal(decode(inner[1]), uninstallCleanupScript(ROOT), 'the scripts travel encoded, so no quoting can alter them');
  for (const event of ['install', 'updated', 'obsolete']) runSquirrelEvent(event, { execPath: EXE, ...DIRS, shell: fakeShell(), exists, spawnSync });
  runSquirrelEvent('uninstall', { execPath: EXE, ...DIRS, shell: fakeShell(), exists: () => false, spawnSync });
  assert.equal(runs.length, 1, 'no other event, and no non-Squirrel layout, starts it');
});

// The script itself, run by Windows PowerShell on a fake install folder.
async function fakeInstall(t, { dead = true, extra = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'typesafe-cleanup-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'TypeSafePlace');
  await mkdir(join(root, 'app-0.1.6'), { recursive: true });
  await mkdir(join(root, 'packages'));
  for (const file of ['Update.exe', 'app.ico', 'TypeSafe Place.exe', join('app-0.1.6', 'squirrel.exe'), join('packages', 'RELEASES')]) await writeFile(join(root, file), 'x');
  if (dead) await writeFile(join(root, '.dead'), ' ');
  if (extra) await writeFile(join(root, 'notes.txt'), 'not Squirrel\'s');
  return { root, base, env: { ...process.env, TEMP: base } };
}
const windows = process.platform === 'win32' ? false : 'runs Windows PowerShell';
const powershell = (script, env) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, timeout: 60_000 });

test('PowerShell removes a .dead Squirrel install folder completely and logs it', { skip: windows }, async t => {
  const { root, base, env } = await fakeInstall(t);
  powershell(uninstallCleanupScript(root, { waitSeconds: 20 }), env);
  assert.deepEqual(await readdir(base).then(names => names.filter(name => name === 'TypeSafePlace')), []);
  assert.match(await readFile(join(base, 'TypeSafePlace-uninstall.log'), 'utf8'), /removed .*TypeSafePlace/);
});

test('PowerShell leaves a folder without .dead alone, and keeps files that are not Squirrel\'s', { skip: windows }, async t => {
  const alive = await fakeInstall(t, { dead: false });
  powershell(uninstallCleanupScript(alive.root, { waitSeconds: 3 }), alive.env);
  assert.deepEqual((await readdir(alive.root)).sort(), ['TypeSafe Place.exe', 'Update.exe', 'app-0.1.6', 'app.ico', 'packages']);
  assert.match(await readFile(join(alive.base, 'TypeSafePlace-uninstall.log'), 'utf8'), /no \.dead in .*left alone/);
  const mixed = await fakeInstall(t, { extra: true });
  powershell(uninstallCleanupScript(mixed.root, { waitSeconds: 5 }), mixed.env);
  assert.deepEqual((await readdir(mixed.root)).sort(), ['.dead', 'notes.txt'], 'only Squirrel\'s names go, and .dead stays while anything else is left');
});

test('the cleanup the hook starts outlives its launcher and removes the folder', { skip: windows }, async t => {
  const { root, env } = await fakeInstall(t);
  const saved = process.env.TEMP;
  process.env.TEMP = env.TEMP;
  t.after(() => { process.env.TEMP = saved; });
  startUninstallCleanup(root, { waitSeconds: 20 });
  for (let waited = 0; waited < 60 && await readdir(root).then(() => true, () => false); waited += 1) await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await readdir(root).then(() => true, () => false), false, 'the install folder is gone');
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
