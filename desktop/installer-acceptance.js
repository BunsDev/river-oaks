import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, chmod, copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPaths, inspectBuild } from './package-check.js';
import { buildManifest, findSigntool, installerNames, sha256File } from './installers.js';
import { shortcutOptions, shortcutPaths } from './squirrel.js';
import { ICON_PNG_SIZES } from './package-options.js';
import { APP_USER_MODEL_ID, LINUX_EXECUTABLE, WINDOWS_EXECUTABLE, WINDOWS_INSTALL_ID } from './identity.js';

// Installs, checks, launches once and removes the installers desktop/installers.js
// built (#372). It changes the machine it runs on (installs software, writes an
// AppArmor profile, flips a sysctl), so it runs only on disposable CI runners:
//
//   node desktop/installer-acceptance.js --dir dist/installers [--signed] [--report <file>]
//   node desktop/installer-acceptance.js --dir dist/installers-test-signed --signatures
//
// Every launch passes OFFLINE, so the packaged app cannot reach the production game
// or WorkOS: its session check and device sign-in fail and it waits on its
// "could not open" dialog, which is enough to show it started, sandbox included.
export const OFFLINE = '--proxy-server=127.0.0.1:9';
const LAUNCH_SECONDS = 20;
const SANDBOX_FATAL = /No usable sandbox|SUID sandbox helper binary was found, but is not configured correctly|FATAL:.*sandbox/i;

export function parseSums(text) {
  const entries = new Map();
  for (const line of text.split('\n').filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (!match) throw new Error(`Malformed SHA256SUMS line: ${line}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

// Compares an installed copy with the build manifest: every packaged file present
// with the same bytes and (on Linux) mode. `modes` lists deliberate mode changes
// (the .deb's setuid chrome-sandbox), `allowExtra` files the installer adds, and
// `resigned` files whose bytes signing changed (checked by signature instead).
export function compareManifest(packaged, installed, { allowExtra = [], modes = {}, resigned = () => false, compareModes = true } = {}) {
  const have = new Map(installed.map(file => [file.path, file]));
  const missing = [], changed = [], signed = [];
  for (const file of packaged) {
    const copy = have.get(file.path);
    if (!copy) { missing.push(file.path); continue; }
    if (file.link !== undefined || copy.link !== undefined) { if (file.link !== copy.link) changed.push(`${file.path}: link ${copy.link} (expected ${file.link})`); continue; }
    if (copy.sha256 !== file.sha256) { if (resigned(file.path)) signed.push(file.path); else changed.push(`${file.path}: content differs`); }
    const mode = modes[file.path] ?? file.mode;
    if (compareModes && copy.mode !== mode) changed.push(`${file.path}: mode ${copy.mode} (expected ${mode})`);
  }
  const known = new Set(packaged.map(file => file.path));
  const allowed = path => allowExtra.some(rule => rule instanceof RegExp ? rule.test(path) : rule === path);
  const extra = installed.map(file => file.path).filter(path => !known.has(path) && !allowed(path));
  return { missing, changed, extra, signed, ok: !missing.length && !changed.length && !extra.length };
}

// Which sandbox Chromium's sandboxed zygote runs in, from /proc: a zygote in its
// own user namespace (uid_map is not the identity map) uses the namespace
// sandbox; one in a nested PID namespace without its own user namespace uses the
// setuid chrome-sandbox helper; neither means no sandbox. Chromium rewrites a
// child's command line into one string, so `cmd` is matched as text.
const IDENTITY_UID_MAP = '0 0 4294967295';
export function classifySandbox(processes) {
  const zygotes = processes.filter(({ cmd }) => /(^| )--type=zygote( |$)/.test(cmd) && !cmd.includes('--no-zygote-sandbox'));
  if (!zygotes.length) return 'unknown';
  if (zygotes.some(zygote => zygote.uidMap && zygote.uidMap !== IDENTITY_UID_MAP)) return 'userns';
  if (zygotes.some(zygote => zygote.nspid.length > 1)) return 'setuid';
  return 'none';
}

// The "Signing Certificate Chain" of `signtool verify /v`, root first, without
// the timestamp authority's chain that follows it.
export function parseSigningChain(text) {
  const section = text.split('Signing Certificate Chain:')[1]?.split(/The signature is timestamped|Timestamp Verified by|File is not timestamped|Successfully verified|Number of files/)[0] ?? '';
  return section.split(/(?=Issued to:)/).filter(part => part.includes('Issued to:')).map(part => ({
    issuedTo: part.match(/Issued to: (.+)/)[1].trim(), sha1: part.match(/SHA1 hash: ([0-9A-F]+)/i)?.[1] ?? null,
  }));
}

// --- helpers ---------------------------------------------------------------

const exists = path => access(path).then(() => true, () => false);
// Collects a child's output and exit; never throws.
function settle(child, { timeout = 600_000, input } = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    if (input !== undefined) child.stdin.end(input);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: `${stderr}${error.message}` }); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code: code ?? signal, stdout, stderr }); });
  });
}
const stdio = input => [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'];
// Programs with argument lists, never a shell: no command here is sh, cmd or PowerShell.
function sh(command, args, { timeout, env = process.env, cwd, input } = {}) {
  return settle(spawn(command, args, { env, cwd, shell: false, stdio: stdio(input) }), { timeout, input });
}
async function waitFor(predicate, seconds) {
  for (let elapsed = 0; elapsed <= seconds; elapsed += 1) { if (await predicate()) return true; await delay(1000); }
  return false;
}
const tail = (text, length = 3000) => text.length > length ? `…${text.slice(-length)}` : text;

const checks = [];
function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), ...detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
  return Boolean(ok);
}
function note(name, detail) {
  checks.push({ name, note: true, ...detail });
  console.log(`note ${name} ${JSON.stringify(detail)}`);
}

async function verifySums(dir, names) {
  const sums = parseSums(await readFile(join(dir, 'SHA256SUMS'), 'utf8'));
  for (const name of names) check(`SHA256SUMS lists ${name}`, sums.has(name));
  for (const [name, expected] of sums) {
    const actual = await sha256File(join(dir, name)).catch(error => error.message);
    check(`SHA-256 of ${name} matches SHA256SUMS`, actual === expected, { sha256: actual });
  }
}

async function checkInstalledCopy(label, dir, platform, arch, version, manifest, options) {
  const inspection = await inspectBuild(buildPaths(dir, platform), { platform, arch, version });
  check(`${label}: fuse wire, binary and asar pass the package check`, inspection.ok, { dir, problems: inspection.problems, fuses: inspection.fuses, binary: inspection.format, app: inspection.app });
  const installed = await buildManifest(dir).catch(() => []);
  const comparison = compareManifest(manifest.files, installed, options);
  check(`${label}: installed files match the build manifest`, comparison.ok, { missing: comparison.missing, changed: comparison.changed, extra: comparison.extra, resigned: comparison.signed.length });
  return inspection;
}

// --- Windows ---------------------------------------------------------------

// Scripts are constant text; values such as paths reach them only as environment
// variables ($env:…), never spliced into the command.
async function powershell(script, values = {}) {
  const result = await settle(spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...values }, shell: false, stdio: stdio() }));
  return result.stdout.trim();
}
async function windowsProcesses(dir) {
  const json = await powershell('@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:TYPESAFE_PLACE_DIR, [StringComparison]::OrdinalIgnoreCase) } | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress -Depth 2', { TYPESAFE_PLACE_DIR: dir });
  if (!json) return [];
  const parsed = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [parsed];
}
async function stopWindows(dir) {
  for (const proc of await windowsProcesses(dir)) await sh('taskkill.exe', ['/F', '/T', '/PID', String(proc.ProcessId)]);
  return waitFor(async () => (await windowsProcesses(dir)).length === 0, 30);
}
async function readShortcuts(paths) {
  const electron = createRequire(import.meta.url)('electron');
  const helper = fileURLToPath(new URL('./read-shortcuts.cjs', import.meta.url));
  const result = await sh(electron, [helper, ...paths], { timeout: 60_000 });
  const line = result.stdout.split('\n').reverse().find(text => text.startsWith('{'));
  return line ? JSON.parse(line) : Object.fromEntries(paths.map(path => [path, { error: `could not read: ${tail(result.stderr, 400)}` }]));
}
const UNINSTALL_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${WINDOWS_INSTALL_ID}`;
async function uninstallEntry() {
  const result = await sh('reg.exe', ['query', UNINSTALL_KEY]);
  if (result.code !== 0) return null;
  return Object.fromEntries([...result.stdout.matchAll(/^\s+(\w+)\s+REG_\w+\s+(.*)$/gm)].map(([, name, value]) => [name, value.trim()]));
}
async function signature(signtool, file) {
  const result = await sh(signtool, ['verify', '/pa', '/v', file]);
  const text = `${result.stdout}\n${result.stderr}`;
  // signtool lists the signing chain root first; the signer is its last entry.
  const chain = parseSigningChain(text);
  return { file, ok: result.code === 0, signer: chain.at(-1)?.issuedTo ?? null, sha1: chain.at(-1)?.sha1 ?? null, root: chain[0]?.issuedTo ?? null, timestamped: /The signature is timestamped/.test(text), detail: result.code === 0 ? undefined : tail(text, 600) };
}

// Every PE file Squirrel packed (the app, its DLLs, squirrel.exe that installs
// as Update.exe, the launcher stub) and Setup.exe must verify under signtool's
// default Authenticode policy. Artifact Signing must also be timestamped: its
// certificates live three days, so an untimestamped signature soon stops verifying.
async function verifyWindowsSignatures(dir, manifest) {
  const { version, arch } = manifest;
  const signtool = await findSigntool();
  const unpack = await mkdtemp(join(tmpdir(), 'typesafe-place-nupkg-'));
  try {
    // Windows' own bsdtar reads zips; Git Bash's GNU tar, first on a runner's PATH, does not.
    const unzip = await sh(join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', join(dir, `${WINDOWS_INSTALL_ID}-${version}-full.nupkg`), '-C', unpack]);
    check('the Squirrel package unpacks', unzip.code === 0, { log: unzip.code === 0 ? undefined : tail(unzip.stderr) });
    const packed = (await buildManifest(join(unpack, 'lib', 'net45'))).filter(file => /\.(exe|dll|node)$/i.test(file.path)).map(file => join(unpack, 'lib', 'net45', file.path));
    check('the package holds the app, squirrel.exe and its DLLs', packed.some(file => file.endsWith(WINDOWS_EXECUTABLE)) && packed.some(file => /squirrel\.exe$/i.test(file)), { files: packed.length });
    for (const file of [join(dir, installerNames(version, arch).setup), ...packed]) {
      const result = await signature(signtool, file);
      check(`signtool verify /pa /v ${file.startsWith(unpack) ? file.slice(unpack.length + 1) : basename(file)}`, result.ok && (manifest.signed !== 'artifact' || result.timestamped), { ...result, file: undefined });
    }
  } finally { await rm(unpack, { recursive: true, force: true }); }
}

async function acceptWindows({ dir, version, arch, manifest, signed }) {
  const setup = join(dir, installerNames(version, arch).setup);
  const root = join(process.env.LOCALAPPDATA, WINDOWS_INSTALL_ID);
  const app = join(root, `app-${version}`);
  const exe = join(app, WINDOWS_EXECUTABLE);
  const update = join(root, 'Update.exe');
  const desktop = await powershell("[Environment]::GetFolderPath('Desktop')");
  const shortcuts = shortcutPaths({ appData: process.env.APPDATA, desktop });
  const expected = shortcutOptions(exe);
  check('no earlier install is present', !(await exists(root)), { root });

  // Install: Setup.exe unpacks to %LocalAppData%\TypeSafePlace, then Update.exe runs the app with --squirrel-install.
  const install = async label => {
    const started = Date.now();
    const result = await sh(setup, ['--silent'], { timeout: 300_000 });
    check(`${label}: Setup.exe --silent exits 0`, result.code === 0, { code: result.code, seconds: Math.round((Date.now() - started) / 1000), log: result.code === 0 ? undefined : tail(`${result.stdout}${result.stderr}`) });
    const installed = await waitFor(async () => await exists(exe) && await exists(update) && (await Promise.all(shortcuts.map(exists))).every(Boolean), 120);
    check(`${label}: the app, Update.exe and both shortcuts appear`, installed, { root, entries: await readdir(root).catch(() => []) });
  };
  await install('install');
  const firstRun = await windowsProcesses(root);
  note('app processes running right after a silent install (Squirrel skips --squirrel-firstrun when silent)', { count: firstRun.length });
  if (firstRun.length) await stopWindows(root);

  await checkInstalledCopy('installed copy', app, 'win32', arch, version, manifest, {
    compareModes: false,
    // Squirrel's own updater, packed beside the app, the launcher stub it writes there, and its logs.
    allowExtra: ['squirrel.exe', `${WINDOWS_EXECUTABLE.replace(/\.exe$/, '')}_ExecutionStub.exe`, /^Squirrel-[\w-]+\.log$/],
    resigned: path => signed && /\.(exe|dll|node)$/i.test(path),
  });

  const links = await readShortcuts(shortcuts);
  for (const path of shortcuts) {
    const link = links[path] ?? {};
    check(`shortcut ${path} starts Update.exe --processStart with AppUserModelID ${APP_USER_MODEL_ID}`,
      link.target?.toLowerCase() === expected.target.toLowerCase() && link.args === expected.args && link.appUserModelId === APP_USER_MODEL_ID,
      { target: link.target, args: link.args, appUserModelId: link.appUserModelId, icon: link.icon, error: link.error });
  }
  const entry = await uninstallEntry();
  check('Installed apps lists the app', entry?.DisplayName === 'TypeSafe Place' && entry?.DisplayVersion === version, { entry });

  if (signed) {
    const signtool = await findSigntool();
    for (const file of [setup, exe, update, join(app, 'squirrel.exe')]) {
      const result = await signature(signtool, file);
      check(`signtool verify /pa /v ${file}`, result.ok && result.timestamped, result);
    }
  }

  // Launch once the way the shortcuts do, then stop it.
  await sh(update, ['--processStart', WINDOWS_EXECUTABLE, '--process-start-args', OFFLINE], { timeout: 60_000 });
  await delay(LAUNCH_SECONDS * 1000);
  const processes = await windowsProcesses(app);
  const browser = processes.find(proc => !/--type=/.test(proc.CommandLine ?? ''));
  const children = processes.filter(proc => /--type=/.test(proc.CommandLine ?? '')).map(proc => proc.CommandLine.match(/--type=([\w-]+)/)[1]);
  check(`the installed app is running ${LAUNCH_SECONDS} s after Update.exe --processStart`, Boolean(browser) && children.length > 0, { browser: browser?.CommandLine, children });
  check('the launched app has stopped', await stopWindows(root));

  // Squirrel's uninstall runs the app with --squirrel-uninstall, removes the
  // Installed apps entry, deletes what it can in one pass and marks the folder
  // .dead. The hook's cleanup (desktop/squirrel.js) removes the rest once Update.exe
  // exits, so the whole install folder must go, with no shortcut, entry or process.
  const uninstall = async label => {
    const result = await sh(update, ['--uninstall', '-s'], { timeout: 300_000 });
    check(`${label}: Update.exe --uninstall -s exits 0`, result.code === 0, { code: result.code, log: result.code === 0 ? undefined : tail(`${result.stdout}${result.stderr}`) });
    const removed = async () => !(await exists(root)) && !(await Promise.all(shortcuts.map(exists))).some(Boolean) && !(await uninstallEntry()) && !(await windowsProcesses(root)).length;
    const gone = await waitFor(removed, 120);
    check(`${label}: the install folder, both shortcuts and the Installed apps entry are gone`, gone, {
      left: (await readdir(root, { recursive: true }).catch(() => [])).sort(), shortcuts: await Promise.all(shortcuts.map(exists)), entry: Boolean(await uninstallEntry()), running: (await windowsProcesses(root)).map(proc => proc.CommandLine),
    });
    if (!gone) {
      // The hook's cleanup logs what it did; a PowerShell still waiting shows here too.
      const log = await readFile(join(process.env.TEMP ?? '', `${WINDOWS_INSTALL_ID}-uninstall.log`), 'utf8').catch(error => error.code);
      const cleanup = await powershell(`@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*-EncodedCommand*' } | Select-Object ProcessId,CreationDate) | ConvertTo-Json -Compress`);
      note(`${label}: uninstall cleanup`, { log: tail(String(log), 1500), running: cleanup || '[]' });
    }
  };
  await uninstall('uninstall');

  // Install and remove once more: a second round must behave the same.
  await install('reinstall');
  const again = await inspectBuild(buildPaths(app, 'win32'), { platform: 'win32', arch, version });
  check('reinstall: the installed copy passes the package check', again.ok, { problems: again.problems });
  await uninstall('second uninstall');
}

// --- Linux -----------------------------------------------------------------

async function linuxProcesses() {
  const list = [];
  for (const pid of (await readdir('/proc')).filter(name => /^\d+$/.test(name))) {
    try {
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      const field = name => status.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1] ?? '';
      const cmd = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean).join(' ');
      const uidMap = await readFile(`/proc/${pid}/uid_map`, 'utf8').then(text => text.trim().split(/\s+/).join(' '), () => null);
      list.push({ pid: Number(pid), ppid: Number(field('PPid')), uid: field('Uid').split(/\s+/)[0], nspid: field('NSpid').split(/\s+/).filter(Boolean).map(Number), seccomp: Number(field('Seccomp')), uidMap, cmd });
    } catch { /* The process ended while it was read. */ }
  }
  return list;
}
// The app's own processes, by executable: the AppImage runtime, AppRun, the
// binary (through /usr/bin or not) and chrome-sandbox. Not xvfb-run or Xvfb,
// whose command lines merely name the binary.
const executable = ({ cmd }) => cmd.split(' ')[0];
const ours = proc => /(\/typesafe-place|\/AppRun|\.AppImage|\/chrome-sandbox)$/.test(executable(proc));
const processType = ({ cmd }) => cmd.match(/(?:^| )--type=([\w-]+)/)?.[1] ?? null;

// The browser process is the untyped ancestor of the zygotes. Its first argument
// is not a reliable name: the AppImage runtime starts it with argv[0] set to
// the AppImage's own path.
export function findBrowser(processes, all = processes) {
  const byPid = new Map(all.map(proc => [proc.pid, proc]));
  const ancestors = pid => { const seen = []; for (let proc = byPid.get(pid); proc && !seen.includes(proc.ppid); proc = byPid.get(proc.ppid)) seen.push(proc.ppid); return seen; };
  const zygotes = processes.filter(proc => processType(proc) === 'zygote');
  return processes.find(proc => !processType(proc) && zygotes.some(zygote => ancestors(zygote.pid).includes(proc.pid))) ?? null;
}

// Renderers run under seccomp-bpf (Seccomp: 2) inside the zygote's PID namespace.
export function renderersSandboxed(processes) {
  const renderers = processes.filter(proc => processType(proc) === 'renderer');
  return { renderers: renderers.length, sandboxed: renderers.every(proc => proc.seccomp === 2 && proc.nspid.length > 1) };
}

async function sweepLinux() {
  for (const proc of (await linuxProcesses()).filter(ours)) {
    try { process.kill(proc.pid, 'SIGKILL'); } catch { await sh('sudo', ['kill', '-9', String(proc.pid)]); }
  }
  return waitFor(async () => !(await linuxProcesses()).some(ours), 15);
}

async function launchLinux(label, command, { env = process.env } = {}) {
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1280x800x24', command, OFFLINE], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  let log = '';
  const keep = chunk => { log = `${log}${chunk}`.slice(-40_000); };
  child.stdout.on('data', keep); child.stderr.on('data', keep);
  const exit = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
  const early = await Promise.race([exit, delay(LAUNCH_SECONDS * 1000).then(() => null)]);
  const all = await linuxProcesses();
  const tree = new Set([child.pid]);
  for (let grew = true; grew;) { grew = false; for (const proc of all) if (!tree.has(proc.pid) && tree.has(proc.ppid)) { tree.add(proc.pid); grew = true; } }
  const processes = all.filter(proc => tree.has(proc.pid) && ours(proc));
  const browser = findBrowser(processes, all);
  const renderers = renderersSandboxed(processes);
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already gone. */ }
  await Promise.race([exit, delay(10_000)]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already gone. */ }
  const stopped = await sweepLinux();
  return {
    label, started: !early && Boolean(browser), exited: early, sandbox: classifySandbox(processes), ...renderers, sandboxRefused: SANDBOX_FATAL.test(log), stopped,
    processes: processes.map(proc => ({ pid: proc.pid, uid: proc.uid, type: processType(proc) ?? (proc === browser ? 'browser' : 'launcher'), nspid: proc.nspid, seccomp: proc.seccomp, uidMap: proc.uidMap })),
    log: tail(log.split('\n').filter(line => line.trim()).join('\n'), 2500),
  };
}

const RESTRICT = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';
async function restrictUserns(value) { return (await sh('sudo', ['sysctl', '-w', `kernel.apparmor_restrict_unprivileged_userns=${value}`])).code === 0; }
async function loadedProfiles() { return (await sh('sudo', ['cat', '/sys/kernel/security/apparmor/profiles'])).stdout; }

// A user's profile for an AppImage they keep at a fixed path (docs/desktop.md).
export function appImageProfile(path) {
  return `abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile typesafe-place-appimage ${path} flags=(unconfined) {\n  userns,\n}\n`;
}

async function acceptLinux({ dir, version, arch, manifest }) {
  const names = installerNames(version, arch);
  const environment = {
    restrictUserns: await readFile(RESTRICT, 'utf8').then(text => text.trim(), () => 'absent'),
    unprivilegedUsernsClone: await readFile('/proc/sys/kernel/unprivileged_userns_clone', 'utf8').then(text => text.trim(), () => 'absent'),
    apparmor: await exists('/sys/kernel/security/apparmor'), abi4: await exists('/etc/apparmor.d/abi/4.0'),
    fusermount3: (await Promise.all(['/usr/bin/fusermount3', '/bin/fusermount3'].map(async path => await exists(path) && path))).find(Boolean) || null,
    os: (await readFile('/etc/os-release', 'utf8')).match(/^PRETTY_NAME="?([^"\n]+)/m)?.[1],
    kernel: (await sh('uname', ['-r'])).stdout.trim(),
  };
  note('runner sandbox environment', environment);
  const restrictable = environment.restrictUserns !== 'absent';
  const launches = [];

  // .deb
  const deb = join(dir, names.deb);
  const install = await sh('sudo', ['env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', '--no-install-recommends', deb], { timeout: 600_000 });
  check('apt-get install of the .deb exits 0', install.code === 0, { log: install.code === 0 ? undefined : tail(`${install.stdout}${install.stderr}`) });
  const status = await sh('dpkg-query', ['-W', '-f=${Status} ${Version}', LINUX_EXECUTABLE]);
  check('dpkg lists the package as installed at this version', status.stdout === `install ok installed ${version}`, { status: status.stdout });
  const lib = `/usr/lib/${LINUX_EXECUTABLE}`;
  const sandboxHelper = await stat(join(lib, 'chrome-sandbox')).catch(() => null);
  check('installed chrome-sandbox is owned by root with mode 4755', sandboxHelper && sandboxHelper.uid === 0 && sandboxHelper.gid === 0 && (sandboxHelper.mode & 0o7777) === 0o4755, { uid: sandboxHelper?.uid, gid: sandboxHelper?.gid, mode: sandboxHelper && (sandboxHelper.mode & 0o7777).toString(8) });
  await checkInstalledCopy('.deb install', lib, 'linux', arch, version, manifest, { modes: { 'chrome-sandbox': '4755' } });
  check(`/usr/bin/${LINUX_EXECUTABLE} resolves to the installed binary`, await realpath(`/usr/bin/${LINUX_EXECUTABLE}`).catch(() => null) === join(lib, LINUX_EXECUTABLE));
  const entry = `/usr/share/applications/${LINUX_EXECUTABLE}.desktop`;
  const validate = await sh('desktop-file-validate', [entry]);
  check('the desktop entry passes desktop-file-validate', validate.code === 0 && !validate.stdout.trim(), { output: `${validate.stdout}${validate.stderr}`.trim() || undefined });
  const icons = await Promise.all(ICON_PNG_SIZES.map(size => exists(`/usr/share/icons/hicolor/${size}x${size}/apps/${LINUX_EXECUTABLE}.png`)));
  check('hicolor icons are installed at every size', icons.every(Boolean), { sizes: ICON_PNG_SIZES });
  const profileInstalled = await exists(`/etc/apparmor.d/${LINUX_EXECUTABLE}`);
  const profileLoaded = (await loadedProfiles()).split('\n').some(line => line.startsWith(`${LINUX_EXECUTABLE} `));
  check('postinst installs and loads the AppArmor profile where AppArmor 4 is present', !environment.abi4 || (profileInstalled && profileLoaded), { profileInstalled, profileLoaded });

  // Launches. Ubuntu desktop restricts unprivileged user namespaces (sysctl 1); other distros do not (0).
  if (restrictable) await restrictUserns(1);
  const debRestricted = await launchLinux('.deb, user namespaces restricted, AppArmor profile loaded', `/usr/bin/${LINUX_EXECUTABLE}`);
  launches.push(debRestricted);
  check('.deb starts sandboxed on Ubuntu 24.04 defaults', debRestricted.started && ['userns', 'setuid'].includes(debRestricted.sandbox) && debRestricted.sandboxed && !debRestricted.sandboxRefused, { sandbox: debRestricted.sandbox, renderers: debRestricted.renderers });
  if (profileLoaded) {
    await sh('sudo', ['apparmor_parser', '--remove', `/etc/apparmor.d/${LINUX_EXECUTABLE}`]);
    const fallback = await launchLinux('.deb, user namespaces restricted, no AppArmor profile', `/usr/bin/${LINUX_EXECUTABLE}`);
    launches.push(fallback);
    check('without the profile the .deb falls back to the setuid chrome-sandbox', fallback.started && fallback.sandbox === 'setuid' && fallback.sandboxed && !fallback.sandboxRefused, { sandbox: fallback.sandbox, renderers: fallback.renderers });
    await sh('sudo', ['apparmor_parser', '--replace', `/etc/apparmor.d/${LINUX_EXECUTABLE}`]);
  }

  // AppImage: the extracted image must be the packaged build; then launch it as a user would.
  const extract = await mkdtemp(join(tmpdir(), 'typesafe-place-appimage-'));
  const appImage = join(dir, names.appImage);
  await chmod(appImage, 0o755);
  const extracted = await sh(appImage, ['--appimage-extract'], { cwd: extract, timeout: 300_000 });
  check('the AppImage extracts', extracted.code === 0, { log: extracted.code === 0 ? undefined : tail(extracted.stderr) });
  const squashfs = join(extract, 'squashfs-root');
  await checkInstalledCopy('AppImage contents', join(squashfs, 'usr/lib', LINUX_EXECUTABLE), 'linux', arch, version, manifest, {});
  const embedded = await sh('desktop-file-validate', [join(squashfs, `${LINUX_EXECUTABLE}.desktop`)]);
  check('the AppImage desktop entry passes desktop-file-validate', embedded.code === 0 && !embedded.stdout.trim(), { output: `${embedded.stdout}${embedded.stderr}`.trim() || undefined });
  await rm(extract, { recursive: true, force: true });

  const userCopy = join(homedir(), 'Applications', names.appImage);
  await mkdir(dirname(userCopy), { recursive: true });
  await copyFile(appImage, userCopy);
  await chmod(userCopy, 0o755);
  if (restrictable) {
    await restrictUserns(0);
    const open = await launchLinux('AppImage, user namespaces unrestricted', userCopy);
    launches.push(open);
    check('the AppImage starts with the namespace sandbox where user namespaces are allowed', open.started && open.sandbox === 'userns' && open.sandboxed && !open.sandboxRefused, { sandbox: open.sandbox, renderers: open.renderers });
    await restrictUserns(1);
  }
  const restricted = await launchLinux('AppImage, user namespaces restricted, no profile', userCopy);
  launches.push(restricted);
  note('AppImage under Ubuntu 24.04 defaults without a profile (a setuid helper cannot work inside the FUSE mount)', { started: restricted.started, sandbox: restricted.sandbox, refusedForSandbox: restricted.sandboxRefused });
  if (environment.abi4) {
    const profilePath = '/etc/apparmor.d/typesafe-place-appimage';
    await sh('sudo', ['tee', profilePath], { input: appImageProfile(userCopy) });
    const load = await sh('sudo', ['apparmor_parser', '--replace', profilePath]);
    const profiled = await launchLinux('AppImage, user namespaces restricted, user profile for its path', userCopy);
    launches.push(profiled);
    check('with the documented AppArmor profile the AppImage starts sandboxed under Ubuntu 24.04 defaults', load.code === 0 && profiled.started && profiled.sandbox === 'userns' && profiled.sandboxed && !profiled.sandboxRefused, { sandbox: profiled.sandbox, renderers: profiled.renderers, load: load.code === 0 ? 'ok' : tail(load.stderr, 400) });
    await sh('sudo', ['apparmor_parser', '--remove', profilePath]);
    await sh('sudo', ['rm', '-f', profilePath]);
  }
  if (restrictable) await restrictUserns(environment.restrictUserns);
  await rm(userCopy, { force: true });

  // Removal.
  const removal = await sh('sudo', ['env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'remove', '-y', LINUX_EXECUTABLE], { timeout: 300_000 });
  check('apt-get remove exits 0', removal.code === 0, { log: removal.code === 0 ? undefined : tail(`${removal.stdout}${removal.stderr}`) });
  const leftovers = [];
  for (const path of [lib, `/usr/bin/${LINUX_EXECUTABLE}`, entry, `/etc/apparmor.d/${LINUX_EXECUTABLE}`, `/usr/share/${LINUX_EXECUTABLE}`]) if (await exists(path)) leftovers.push(path);
  const stillLoaded = (await loadedProfiles()).split('\n').some(line => line.startsWith(`${LINUX_EXECUTABLE} `));
  check('removal leaves no files, desktop entry or AppArmor profile behind', !leftovers.length && !stillLoaded, { leftovers, profileLoaded: stillLoaded });
  return launches;
}

// `signatures` only verifies a Windows build's signatures (no install);
// otherwise the installers are verified against SHA256SUMS, installed, checked,
// launched and removed. `signed` adds signature checks on the installed copy.
export async function accept({ dir: folder, signed = false, signatures = false }) {
  // apt-get takes a .deb only by an absolute (or ./) path.
  const dir = resolve(folder);
  const [manifestName] = (await readdir(dir)).filter(name => /^build-manifest-.+\.json$/.test(name));
  if (!manifestName) throw new Error(`${dir} has no build-manifest-*.json from desktop/installers.js`);
  const manifest = JSON.parse(await readFile(join(dir, manifestName), 'utf8'));
  if (manifest.platform !== process.platform) throw new Error(`These installers are for ${manifest.platform}; this runner is ${process.platform}`);
  const { version, arch } = manifest;
  const names = installerNames(version, arch);
  await verifySums(dir, process.platform === 'win32' ? [names.setup] : [names.appImage, names.deb]);
  let launches = [];
  if (signatures) {
    if (process.platform !== 'win32' || manifest.signed === 'unsigned') throw new Error('--signatures checks a signed Windows build');
    await verifyWindowsSignatures(dir, manifest);
  } else if (process.platform === 'win32') await acceptWindows({ dir, version, arch, manifest, signed });
  else if (process.platform === 'linux') launches = await acceptLinux({ dir, version, arch, manifest });
  else throw new Error(`No installer acceptance for ${process.platform}`);
  const failed = checks.filter(entry => entry.ok === false);
  return { version, platform: process.platform, arch, signed: manifest.signed, ok: failed.length === 0, failed: failed.map(entry => entry.name), checks, launches };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { dir: { type: 'string' }, signed: { type: 'boolean', default: false }, signatures: { type: 'boolean', default: false }, report: { type: 'string' } } });
  if (!values.dir) { console.error('usage: node desktop/installer-acceptance.js --dir <installers folder> [--signed | --signatures] [--report <file>]'); process.exit(2); }
  const report = await accept(values).catch(error => ({ ok: false, error: error.stack, checks }));
  const path = values.report ?? `dist/installer-acceptance-${process.platform}${values.signatures ? '-signatures' : ''}.json`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: ${path}`);
  if (!report.ok) { console.error(report.error ?? `Failed:\n- ${report.failed.join('\n- ')}`); process.exit(1); }
}
