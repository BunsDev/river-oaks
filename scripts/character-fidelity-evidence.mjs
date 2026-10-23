import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
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
