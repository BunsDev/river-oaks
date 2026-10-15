import { win32 } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { spawnSync as spawnSyncProcess } from 'node:child_process';
import { APP_NAME, APP_USER_MODEL_ID, WINDOWS_EXECUTABLE, WINDOWS_INSTALL_ID } from './identity.js';

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

// A Squirrel install: <root>\app-<version>\<exe>, <root> named WINDOWS_INSTALL_ID
// and holding Update.exe. Anything else (the zip build, a development run) is not one.
export function isSquirrelInstall(execPath, exists = existsSync) {
  const app = win32.dirname(execPath), root = win32.dirname(app);
  return /^app-\d+\.\d+\.\d+/.test(win32.basename(app)) && win32.basename(root).toLowerCase() === WINDOWS_INSTALL_ID.toLowerCase() && exists(win32.join(root, 'Update.exe'));
}

// Squirrel's uninstaller (Update.exe) deletes the install in one pass of parallel
// batches. A file still held aborts the rest of its batch: on windows-latest that
// left squirrel.exe (held by Squirrel's own scan) and whatever shared its batch, up
// to the 246 MB app executable. Squirrel then writes .dead and exits. This hidden
// PowerShell waits until nothing runs from the install folder and .dead exists,
// then removes Squirrel's own names from the folder, and the folder itself once only
// .dead is left, retrying while files are released. It never touches other names,
// does nothing without .dead, removes .dead last, and logs to
// %TEMP%\TypeSafePlace-uninstall.log.
export function uninstallCleanupScript(root, { waitSeconds = 300 } = {}) {
  const quote = text => `'${String(text).replaceAll("'", "''")}'`;
  return [
    // No console exists for progress bars in a detached process.
    "$ProgressPreference = 'SilentlyContinue'",
    `$root = ${quote(root)}`,
    `$log = Join-Path $env:TEMP ${quote(`${WINDOWS_INSTALL_ID}-uninstall.log`)}`,
    "function Note($text) { Add-Content -LiteralPath $log -Value \"$(Get-Date -Format o) $text\" -ErrorAction SilentlyContinue }",
    "$dead = Join-Path $root '.dead'",
    "Note \"waiting for ${root}\"",
    `$deadline = (Get-Date).AddSeconds(${Number(waitSeconds)})`,
    '$tick = 0',
    'do {',
    '  Start-Sleep -Seconds 1',
    "  $busy = @(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($root + '\\', [StringComparison]::OrdinalIgnoreCase) })",
    "  if ((++$tick % 10) -eq 0) { Note \"still waiting: $($busy.Count) running ($($busy.Name -join ', ')), .dead $(Test-Path -LiteralPath $dead)\" }",
    '} while (($busy.Count -gt 0 -or -not (Test-Path -LiteralPath $dead)) -and (Get-Date) -lt $deadline)',
    "if (-not (Test-Path -LiteralPath $dead)) { Note \"no .dead in $root; left alone\"; exit }",
    'foreach ($attempt in 1..10) {',
    "  Get-ChildItem -LiteralPath $root -Directory -Filter 'app-*' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue",
    `  foreach ($name in 'packages', 'Update.exe', 'app.ico', ${quote(WINDOWS_EXECUTABLE)}, 'SquirrelSetup.log') { Remove-Item -LiteralPath (Join-Path $root $name) -Recurse -Force -ErrorAction SilentlyContinue }`,
    "  $left = @(Get-ChildItem -LiteralPath $root -Force | Where-Object Name -ne '.dead')",
    '  if ($left.Count -eq 0) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue; Note "removed $root"; exit }',
    '  Start-Sleep -Seconds 2',
    '}',
    // ${root}: PowerShell would read "$root:" as a drive-qualified variable.
    "Note \"left in ${root}: $($left.Name -join ', ')\"",
  ].join('\n');
}

// Starts the cleanup so that it outlives this process. A detached spawn has no
// console on Windows, and powershell.exe never runs its script without one; a
// plain child sits in libuv's job object, which ends with the app. So a short-lived
// hidden PowerShell starts the real one with Start-Process (a new hidden console,
// out of the job, which allows silent breakaway) and exits; the hook waits for it,
// well inside Squirrel's ten-second hook budget. Scripts travel as -EncodedCommand
// (UTF-16LE base64), so no command-line quoting can alter them.
const encode = script => Buffer.from(script, 'utf16le').toString('base64');
export function startUninstallCleanup(root, { spawnSync = spawnSyncProcess, waitSeconds } = {}) {
  const launch = `Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encode(uninstallCleanupScript(root, { waitSeconds }))}'`;
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(launch)], { stdio: 'ignore', windowsHide: true, timeout: 8000 });
}

// Install writes both shortcuts. Update rewrites only shortcuts that still exist
// and start this install, so a shortcut the user deleted stays deleted and the
// icon follows the new version's folder. Uninstall removes only this install's
// shortcuts, never a same-named one that starts something else, and in a Squirrel
// install starts the cleanup above. Obsolete (the version being replaced) has
// nothing to do. `shell` is Electron's.
export function runSquirrelEvent(event, { execPath, appData, desktop, shell, exists = existsSync, remove = path => rmSync(path, { force: true }), spawnSync = spawnSyncProcess }) {
  const options = shortcutOptions(execPath);
  const ours = path => { try { return samePath(shell.readShortcutLink(path).target, options.target); } catch { return false; } };
  const done = [];
  for (const path of shortcutPaths({ appData, desktop })) {
    if (event === 'install' && shell.writeShortcutLink(path, 'create', options)) done.push(path);
    else if (event === 'updated' && exists(path) && ours(path) && shell.writeShortcutLink(path, 'update', options)) done.push(path);
    else if (event === 'uninstall' && exists(path) && ours(path)) { remove(path); done.push(path); }
  }
  if (event === 'uninstall' && isSquirrelInstall(execPath, exists)) {
    const root = win32.dirname(win32.dirname(execPath));
    startUninstallCleanup(root, { spawnSync });
    done.push(`cleanup ${root}`);
  }
  return done;
}
