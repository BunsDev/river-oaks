import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadavg, platform} from 'node:os';
import {execFileSync} from 'node:child_process';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Hash executable inputs and public assets, including untracked additions.
// Private runtime state, environment files, reports and ledgers are not inputs.
export async function captureProvenance(root) {
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'});
  const paths = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))]
    .filter(path => !/(^|\/)(\.env[^/]*|\.runtime)(\/|$)/.test(path))
    .filter(path => /^(preview\/(src|e2e|audit|public)\/|scripts\/|server\/|shared\/|config\/)/.test(path) || /^[^/]+\.(js|mjs|json|yaml)$/.test(path))
    .sort();
  const files = [];
  for (const path of paths) {
    try { const bytes = await readFile(join(root, path)); files.push({path, bytes: bytes.length, sha256: sha(bytes)}); }
    catch (error) { if (error.code !== 'ENOENT') throw error; files.push({path, deleted: true}); }
  }
  return {dirty: git('status', '--porcelain', '--untracked-files=all').trim().length > 0,
    sha256: sha(JSON.stringify(files)), files};
}

export function assertLifecycle({count, before, after} = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Missing lifecycle cycles');
  for (const resource of ['geometries', 'textures', 'programs']) {
    if (![before?.[resource], after?.[resource]].every(value => Number.isInteger(value) && value >= 0)) throw new Error(`Invalid lifecycle measurement: ${resource}`);
    if (after[resource] > before[resource]) throw new Error(`Lifecycle growth: ${resource} ${before[resource]} -> ${after[resource]} after ${count} cycles`);
  }
}

export function timingAgreement(checks) {
  const timing = checks.filter(check => check.timing);
  return timing.length ? timing.every(check => check.agrees === true) : null;
}

// Host state beside each timing sample. On a shared Mac the GPU is shared with
// every other browser and agent, and GPU TIME_ELAPSED includes their work, so
// load average alone does not describe the conditions a timing was taken in.
export function parseGpuUtilization(ioreg) {
  const match = /"Device Utilization %"\s*=\s*(\d+)/.exec(ioreg ?? '');
  return match ? Number(match[1]) : null;
}

export function foreignBrowserProcesses(table, ownPid) {
  const rows = (table ?? '').split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(Boolean)
    .map(([, pid, ppid, command]) => ({pid: Number(pid), ppid: Number(ppid), command}));
  const own = new Set(Number.isInteger(ownPid) ? [ownPid] : []);
  for (let grew = true; grew;) { grew = false; for (const row of rows) if (own.has(row.ppid) && !own.has(row.pid)) { own.add(row.pid); grew = true; } }
  // Automation browsers only (other sessions' test runs), not a person's own browser.
  return rows.filter(row => /ms-playwright|chrome-headless-shell|Chromium\.app|Chrome for Testing/.test(row.command) && !own.has(row.pid)).length;
}

export function hostConditions({ownPid} = {}) {
  const read = (command, args) => { try { return execFileSync(command, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; } };
  return {at: new Date().toISOString(), loadavg: loadavg().map(value => +value.toFixed(2)),
    gpuUtilization: platform() === 'darwin' ? parseGpuUtilization(read('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator', '-w0'])) : null,
    foreignBrowsers: foreignBrowserProcesses(read('ps', ['-Ao', 'pid=,ppid=,comm=']), ownPid)};
}

// "gpu=10,load=8,browsers=0" -> limits. Unknown or missing readings are never quiet.
export function parseQuietLimits(text) {
  if (!text) return null;
  const limits = {};
  for (const part of text.split(',')) {
    const [name, value] = part.split('=');
    if (!['gpu', 'load', 'browsers'].includes(name) || !Number.isFinite(Number(value))) throw new Error(`Invalid --quiet limit: ${part}`);
    limits[name] = Number(value);
  }
  return limits;
}

export function isQuiet(conditions, limits) {
  if (!limits || !conditions) return false;
  if ('gpu' in limits && !(conditions.gpuUtilization !== null && conditions.gpuUtilization <= limits.gpu)) return false;
  if ('load' in limits && !(conditions.loadavg?.[0] <= limits.load)) return false;
  if ('browsers' in limits && !(conditions.foreignBrowsers <= limits.browsers)) return false;
  return true;
}

// Controlled comparisons are those whose samples in both runs were taken on a
// quiet host. The tolerance is unchanged; uncontrolled pairs are reported, not dropped.
export function controlledAgreement(checks) {
  const timing = checks.filter(check => check.timing), controlled = timing.filter(check => check.controlled === true);
  return {pairs: timing.length, agree: timing.filter(check => check.agrees).length,
    controlledPairs: controlled.length, controlledAgree: controlled.filter(check => check.agrees).length,
    controlledAgrees: controlled.length ? controlled.every(check => check.agrees) : null};
}
