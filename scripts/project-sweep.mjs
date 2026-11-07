#!/usr/bin/env node
// Scheduled project sweep: one pass of the lifecycle loop that project:inventory and
// project:prune already define. It classifies every local branch, worktree and remote
// branch, retires (only with --apply) the branches project:prune accepts right now,
// and writes an action queue naming who must act on everything else and how.
//
// It adds no new deletion authority. Retirement still runs through retire(), which
// re-plans from live evidence and needs the owner's fresh exact-head release; stale
// claims, cancellations, cache cleanup and remote deletion are reported, never done.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildInventory, buildRemoteInventory } from './project-inventory.mjs';
import { git, readActivity, defaultArchiveRoot, primaryRegisterPath, retire, liveEvidence } from './project-prune.mjs';
import { inspectGit, loadPulls, validateTasks } from './project-status.mjs';
import { indexArchives } from './project-archives.mjs';

const HOUR = 60 * 60 * 1000;
const RELEASE_BLOCKERS = new Set(['session-release-missing-or-stale', 'ownership-not-released']);
// Caches the retirement guard counts as ignored data. Only these are ever named as
// disposable; anything else ignored is evidence that must be archived first.
export const REGENERABLE = ['node_modules/', '.venv/', 'dist/', '.pnpm-store/', '.vite/', '__pycache__/', '.pytest_cache/', '.turbo/'];

const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const ref = row => row.branch ?? `(detached) ${row.worktree}`;

// One row of the inventory to one action. `who` is the party that must act; `command`
// is a starting point for that party, never something the sweep runs (except retire).
export function classifyRow(row, { task, now, staleLeaseHours }) {
  const pr = row.pr?.open?.[0] ?? row.pr?.mergedExact ?? null;
  const base = { ref: ref(row), branch: row.branch, head: row.head, worktree: row.worktree, cls: row.cls, task: row.task?.id ?? null, owner: row.task?.owner ?? null, pr, prOpen: Boolean(row.pr?.open?.length) };
  const leaseAge = row.task?.leaseUntil ? (now - Date.parse(row.task.leaseUntil)) / HOUR : null;
  const staleClaim = Boolean(row.task?.owner) && (leaseAge === null ? Boolean(task?.updatedAt) && (now - Date.parse(task.updatedAt)) / HOUR > staleLeaseHours : leaseAge > staleLeaseHours);
  if (row.cls === 'primary') return { ...base, action: 'none' };
  if (row.cls === 'retire-eligible')
    return { ...base, action: 'retire', who: 'sweep', command: `pnpm run project:prune --branch ${quote(row.branch)} --expected-head ${row.head} --apply` };
  if (row.cls === 'retire-candidate')
    return { ...base, action: 'release-needed', who: row.task.owner ?? 'last owner of ' + row.task.id,
      why: 'Delivered at the exact merged head; only the owner release is missing.',
      command: `pnpm run register patch ${row.task.id} --unset leaseUntil --json ${quote(JSON.stringify({ owner: null, retirement: { head: row.head, releasedAt: '<now>', sessionsReviewedAt: '<after checking running sessions>' } }))}` };
  if (row.cls.startsWith('blocked:') && row.task?.status === 'delivered') {
    const rest = row.blockers.filter(b => !RELEASE_BLOCKERS.has(b));
    if (rest.length && rest.every(b => b === 'ignored-data'))
      return { ...base, action: 'archive-ignored', who: row.task.owner ?? 'last owner of ' + row.task.id, blockers: row.blockers,
        why: `Delivered; ignored files remain. Archive evidence (.runtime, output/) externally, remove only regenerable caches (${REGENERABLE.join(' ')}), then release.`,
        command: row.worktree ? `git -C ${quote(row.worktree)} ls-files --others --ignored --exclude-standard --directory` : null };
    return { ...base, action: 'reconcile-delivered', who: row.task.owner ?? 'last owner of ' + row.task.id, blockers: row.blockers,
      why: 'Delivered but the guard found more than a missing release; inspect each blocker.' };
  }
  if (staleClaim)
    return { ...base, action: 'stale-claim', who: row.task.owner, leaseExpiredHours: leaseAge === null ? null : Math.round(leaseAge),
      why: `Claim ${leaseAge === null ? 'has no lease and was last updated' : 'lease expired'} more than ${staleLeaseHours} h ago. An expired lease is not a release: the owner renews, hands off or releases; Val may reassign.`,
      command: `pnpm run register show ${row.task.id}` };
  if (row.cls === 'orphan-no-task' || (row.cls === 'detached' && !row.task))
    return { ...base, action: 'orphan', who: 'Val or the session that created it',
      why: 'No register task records this ref; claim it, record it on a task, or cancel it with explicit authorization.',
      command: row.branch ? `pnpm run project:cancel --branch ${quote(row.branch)} --expected-head ${row.head}` : `pnpm run project:cancel --detached-path ${quote(row.worktree)} --expected-head ${row.head}` };
  if (row.cls === 'zero-commit' && !row.task?.owner)
    return { ...base, action: 'cancel-review', who: 'Val (cancellation authority)',
      why: 'No commits beyond the default branch and no owner. Git history loses nothing; the checkout may still hold files.',
      command: `pnpm run project:cancel --branch ${quote(row.branch)} --expected-head ${row.head}` };
  if (row.cls.startsWith('blocked:'))
    return { ...base, action: 'reconcile', who: row.task?.owner ?? 'Val', blockers: row.blockers, why: 'The guard reports blockers that need a decision.' };
  return { ...base, action: 'none' };
}

export function classifyRemote(row) {
  const base = { ref: `origin/${row.branch}`, branch: row.branch, head: row.tip, cls: row.cls, pr: row.pr };
  if (row.cls === 'open-pr' || row.cls === 'github-not-checked') return { ...base, action: 'none' };
  if (row.cls === 'merged-exact')
    return { ...base, action: 'remote-delete-review', who: 'Val (remote deletion authority)', why: 'Merged at this exact tip and on the default branch.', command: row.deleteCommand };
  return { ...base, action: 'remote-review', who: 'Val', why: row.cls === 'merged-ancestor-review' ? 'On the default branch without a merged PR at this tip.' : 'No merged PR proves this branch landed; it may hold unique work.' };
}

export function planSweep({ inventory, remote, register, now = Date.now(), staleLeaseHours = 24 }) {
  const tasks = register?.tasks ?? [];
  const actions = inventory.rows.map(row => classifyRow(row, { task: row.task ? tasks.find(t => t.id === row.task.id) : null, now, staleLeaseHours }));
  const remoteActions = (remote?.rows ?? []).map(classifyRemote);
  const all = [...actions, ...remoteActions];
  const byAction = Object.fromEntries([...new Set(all.map(a => a.action))].sort().map(k => [k, all.filter(a => a.action === k).length]));
  return { schemaVersion: 1, generatedAt: new Date(now).toISOString(), staleLeaseHours, counts: { ...inventory.counts, remote: remote?.counts ?? null, byAction },
    actionable: all.filter(a => a.action !== 'none').length, actions, remoteActions };
}

export function formatSweep(plan) {
  const out = [`# Project sweep ${plan.generatedAt}`, '',
    `worktrees ${plan.counts.worktrees}, branches ${plan.counts.branches}; ` + Object.entries(plan.counts.byAction).map(([k, v]) => `${k} ${v}`).join(', ')];
  if (plan.applied?.length) {
    out.push('', '## Retired this run', '');
    for (const r of plan.applied) out.push(`- ${r.branch} ${r.head.slice(0, 7)}: ${r.ok ? 'retired, manifest ' + r.manifest : 'refused: ' + r.error}`);
  }
  const order = ['retire', 'release-needed', 'archive-ignored', 'reconcile-delivered', 'stale-claim', 'orphan', 'cancel-review', 'reconcile', 'remote-delete-review', 'remote-review'];
  for (const action of order) {
    const rows = [...plan.actions, ...plan.remoteActions].filter(a => a.action === action);
    if (!rows.length) continue;
    out.push('', `## ${action} (${rows.length})`, '');
    for (const a of rows) {
      out.push(`- \`${a.ref}\` ${a.head?.slice(0, 7) ?? ''}${a.task ? ` task ${a.task}` : ''}${a.pr ? ` ${a.prOpen ? 'open' : 'merged'} #${a.pr}` : ''}${a.leaseExpiredHours != null ? `, lease expired ${a.leaseExpiredHours} h` : ''}${a.blockers?.length ? ` [${a.blockers.join(', ')}]` : ''}`);
      out.push(`  - who: ${a.who}${a.why ? ' - ' + a.why : ''}`);
      if (a.command) out.push(`  - \`${a.command}\``);
    }
  }
  out.push('', 'Read-only except `retire` rows under --apply. Stale claims, cancellation, cache removal and remote deletion need their owner or Val.');
  return out.join('\n') + '\n';
}

// Retire every retire-eligible branch through the existing guard. Each one re-plans
// from live evidence inside retire(); a refusal is recorded and the sweep moves on.
export function applyRetirements(plan, { root, tasksPath, archiveRoot, loadEvidence, retireBranch = retire }) {
  const applied = [];
  for (const a of plan.actions.filter(x => x.action === 'retire')) {
    try {
      const receipt = retireBranch({ root, branch: a.branch, expectedHead: a.head, tasksPath, archiveRoot, loadEvidence });
      applied.push({ branch: a.branch, head: a.head, ok: true, manifest: receipt.manifest });
    } catch (error) { applied.push({ branch: a.branch, head: a.head, ok: false, error: error.message }); }
  }
  return applied;
}

// Keep the newest `keep` receipts this tool wrote; never touches other files.
export function rotateReceipts(dir, keep) {
  const mine = readdirSync(dir).filter(name => /^sweep-\d{8}T\d{6}Z\.(json|md)$/.test(name)).sort();
  const stamps = [...new Set(mine.map(n => n.replace(/\.(json|md)$/, '')))];
  for (const stamp of stamps.slice(0, Math.max(0, stamps.length - keep))) for (const ext of ['json', 'md']) { const p = join(dir, `${stamp}.${ext}`); if (existsSync(p)) unlinkSync(p); }
}

function notify(title, message) {
  if (process.platform !== 'darwin') return;
  try { execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`], { stdio: 'ignore' }); } catch { /* best effort */ }
}

const USAGE = 'Usage: project:sweep [--apply] [--repo <dir>] [--out-dir <dir>] [--stale-lease-hours <h>] [--keep <n>] [--no-remote] [--no-fetch] [--notify] [--json]';

export function parseSweepArgs(args) {
  const flags = new Set(), values = {};
  for (let i = 0; i < args.length; i++) {
    if (['--apply', '--no-remote', '--no-fetch', '--notify', '--json'].includes(args[i])) { flags.add(args[i]); continue; }
    if (!['--repo', '--out-dir', '--stale-lease-hours', '--keep', '--archive-root'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(USAGE);
    values[args[i]] = args[++i];
  }
  const staleLeaseHours = Number(values['--stale-lease-hours'] ?? 24), keep = Number(values['--keep'] ?? 72);
  if (!(staleLeaseHours > 0)) throw new Error('--stale-lease-hours must be positive');
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a positive integer');
  return { flags, values, staleLeaseHours, keep };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { flags, values, staleLeaseHours, keep } = parseSweepArgs(process.argv.slice(2));
    const root = resolve(values['--repo'] ?? process.cwd());
    if (!flags.has('--no-fetch')) git(root, ['fetch', '--no-prune', 'origin']);
    const tasksPath = primaryRegisterPath(root);
    const text = readFileSync(tasksPath, 'utf8');
    if (/^(<{7}|>{7})( |$)/m.test(text)) throw new Error('Task register has conflict markers; merge it by task id first');
    const register = JSON.parse(text), errors = validateTasks(register);
    if (errors.length) throw new Error(errors.join('\n'));
    const snapshot = inspectGit(root), pulls = loadPulls(root), activity = readActivity();
    const archiveRoot = resolve(values['--archive-root'] ?? defaultArchiveRoot());
    const archives = existsSync(archiveRoot) ? indexArchives({ archiveRoot, register, root }) : { entries: [] };
    const inventory = buildInventory({ root, snapshot, register, pulls, activity, archives });
    const remote = flags.has('--no-remote') ? null : buildRemoteInventory({ root, pulls, snapshot });
    const plan = planSweep({ inventory, remote, register, staleLeaseHours });
    plan.mode = flags.has('--apply') ? 'apply' : 'report';
    if (flags.has('--apply')) {
      plan.applied = applyRetirements(plan, { root, tasksPath, archiveRoot, loadEvidence: liveEvidence(root, tasksPath) });
      plan.actionable -= plan.applied.filter(a => a.ok).length;
    }
    const outDir = resolve(values['--out-dir'] ?? join(root, '.runtime', 'project-sweep'));
    mkdirSync(outDir, { recursive: true });
    const stamp = 'sweep-' + plan.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const markdown = formatSweep(plan), json = JSON.stringify({ ...plan, root }, null, 2) + '\n';
    writeFileSync(join(outDir, `${stamp}.json`), json); writeFileSync(join(outDir, `${stamp}.md`), markdown);
    writeFileSync(join(outDir, 'latest.json'), json); writeFileSync(join(outDir, 'latest.md'), markdown);
    rotateReceipts(outDir, keep);
    if (flags.has('--notify')) {
      const retired = plan.applied?.filter(a => a.ok).length ?? 0;
      notify('River Oaks sweep', `${retired ? `${retired} retired; ` : ''}${plan.actionable} item(s) need an owner. See ${join(outDir, 'latest.md')}`);
    }
    process.stdout.write(flags.has('--json') ? json : markdown);
    // 0: nothing left to act on; 1: action queue non-empty (a refused retirement included); 2: error.
    process.exitCode = plan.actionable || plan.applied?.some(a => !a.ok) ? 1 : 0;
  } catch (error) { process.stderr.write(`project-sweep: ${error.message}\n`); process.exitCode = 2; }
}
