// The sweep plans from the same inventory project:prune reads, retires only what the
// guard accepts, and turns everything else into an owner action. Fixtures are real
// repositories; GitHub is a canned list of pull requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildInventory, buildRemoteInventory } from '../project-inventory.mjs';
import { inspectGit } from '../project-status.mjs';
import { planSweep, applyRetirements, formatSweep, rotateReceipts, parseSweepArgs, classifyRemote } from '../project-sweep.mjs';
import { renderPlist, renderRunner, parseAgentArgs, pickNode } from '../project-sweep-agent.mjs';

const HOUR = 3600e3;

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'river-sweep-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo'); mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', 'git@github.com:acme/repo.git');
  writeFileSync(join(root, 'file'), 'base'); writeFileSync(join(root, '.gitignore'), '.runtime/\n'); git('add', '.'); git('commit', '-m', 'base');
  // released: delivered at the exact merged head and released by its owner.
  const released = join(base, 'released'); git('worktree', 'add', '-b', 'released', released);
  writeFileSync(join(released, 'file'), 'released'); git('-C', released, 'commit', '-am', 'released');
  const releasedHead = git('rev-parse', 'released'); git('merge', '--squash', 'released'); git('commit', '-m', 'squash released');
  const releasedMerge = git('rev-parse', 'main');
  // unreleased: delivered at the exact head, owner never released.
  const unreleased = join(base, 'unreleased'); git('worktree', 'add', '-b', 'unreleased', unreleased);
  writeFileSync(join(unreleased, 'other'), 'u'); git('-C', unreleased, 'add', '.'); git('-C', unreleased, 'commit', '-m', 'unreleased');
  const unreleasedHead = git('rev-parse', 'unreleased'); git('merge', '--squash', 'unreleased'); git('commit', '-m', 'squash unreleased');
  const unreleasedMerge = git('rev-parse', 'main');
  git('update-ref', 'refs/remotes/origin/main', unreleasedMerge);
  // stale: active claim whose lease ran out three days ago, with its own commit.
  const stale = join(base, 'stale'); git('worktree', 'add', '-b', 'stale', stale, 'main');
  writeFileSync(join(stale, 'file'), 'stale'); git('-C', stale, 'commit', '-am', 'stale');
  // fresh: active claim with a live lease.
  const fresh = join(base, 'fresh'); git('worktree', 'add', '-b', 'fresh', fresh, 'main');
  writeFileSync(join(fresh, 'file'), 'fresh'); git('-C', fresh, 'commit', '-am', 'fresh');
  // orphan: nothing records it.
  git('worktree', 'add', '-b', 'orphan', join(base, 'orphan'), 'main');
  git('update-ref', 'refs/remotes/origin/unproven', git('rev-parse', 'stale'));
  const now = Date.now(), iso = ms => new Date(ms).toISOString();
  const register = { schemaVersion: 1, tasks: [
    { id: 'released-task', title: 'r', status: 'delivered', branches: ['released'], owner: null, pr: 1, updatedAt: iso(now), nextAction: 'x',
      retirement: { head: releasedHead, releasedAt: iso(now), sessionsReviewedAt: iso(now) } },
    { id: 'unreleased-task', title: 'u', status: 'delivered', branches: ['unreleased'], owner: 'gone-session', pr: 2, updatedAt: iso(now), nextAction: 'x' },
    { id: 'stale-task', title: 's', status: 'active', branches: ['stale'], owner: 'old-session', leaseUntil: iso(now - 72 * HOUR), updatedAt: iso(now - 80 * HOUR), nextAction: 'x' },
    { id: 'fresh-task', title: 'f', status: 'active', branches: ['fresh'], owner: 'live-session', leaseUntil: iso(now + HOUR), updatedAt: iso(now), nextAction: 'x' },
  ] };
  const pulls = [
    { number: 1, state: 'closed', merged_at: iso(now), merge_commit_sha: releasedMerge, head: { ref: 'released', sha: releasedHead } },
    { number: 2, state: 'closed', merged_at: iso(now), merge_commit_sha: unreleasedMerge, head: { ref: 'unreleased', sha: unreleasedHead } },
  ];
  const activity = { available: true, paths: [] };
  const inventory = () => buildInventory({ root, snapshot: inspectGit(root), register, pulls, activity, archives: { entries: [] }, now });
  return { base, root, git, register, pulls, activity, now, releasedHead, inventory, archiveRoot: join(base, 'archives') };
}

test('plans retire, release, stale-claim and orphan actions and leaves live claims alone', t => {
  const f = fixture(t);
  const plan = planSweep({ inventory: f.inventory(), register: f.register, now: f.now });
  const by = Object.fromEntries(plan.actions.map(a => [a.branch ?? a.ref, a]));
  assert.equal(by.main.action, 'none');
  assert.equal(by.released.action, 'retire');
  assert.match(by.released.command, new RegExp(`--expected-head ${f.releasedHead} --apply`));
  assert.equal(by.unreleased.action, 'release-needed', 'merged at the exact head; only the owner release is missing');
  assert.equal(by.unreleased.who, 'gone-session');
  assert.match(by.unreleased.command, /register patch unreleased-task --unset leaseUntil/);
  assert.equal(by.stale.action, 'stale-claim');
  assert.equal(by.stale.leaseExpiredHours, 72);
  assert.equal(by.fresh.action, 'none', 'a live lease is not debt');
  assert.equal(by.orphan.action, 'orphan');
  assert.match(by.orphan.command, /project:cancel --branch 'orphan'/);
  assert.equal(plan.actionable, 4);
  const md = formatSweep(plan);
  for (const heading of ['## retire (1)', '## release-needed (1)', '## stale-claim (1)', '## orphan (1)']) assert.ok(md.includes(heading), heading);
});

test('the stale threshold is a parameter, not a hard-coded age', t => {
  const f = fixture(t);
  const plan = planSweep({ inventory: f.inventory(), register: f.register, now: f.now, staleLeaseHours: 100 });
  assert.equal(plan.actions.find(a => a.branch === 'stale').action, 'none');
});

test('apply retires only the eligible branch through the guard and records the archive', t => {
  const f = fixture(t);
  const tasksPath = join(f.base, 'tasks.json'); writeFileSync(tasksPath, JSON.stringify(f.register, null, 2) + '\n');
  const plan = planSweep({ inventory: f.inventory(), register: f.register, now: f.now });
  const loadEvidence = () => ({ register: JSON.parse(readFileSync(tasksPath, 'utf8')), pulls: f.pulls, activity: f.activity });
  const applied = applyRetirements(plan, { root: f.root, tasksPath, archiveRoot: f.archiveRoot, loadEvidence });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].ok, true, applied[0].error);
  assert.ok(existsSync(applied[0].manifest));
  assert.equal(f.git('branch', '--list', 'released'), '', 'retired ref removed');
  assert.ok(!existsSync(join(f.base, 'released')), 'retired worktree removed');
  for (const branch of ['unreleased', 'stale', 'fresh', 'orphan']) assert.notEqual(f.git('branch', '--list', branch), '', `${branch} preserved`);
  const task = JSON.parse(readFileSync(tasksPath, 'utf8')).tasks.find(x => x.id === 'released-task');
  assert.deepEqual(task.retiredBranches, ['released']);
  assert.equal(task.status, 'retired');
});

test('a refusal between plan and apply is recorded and the sweep continues', t => {
  const f = fixture(t);
  const plan = planSweep({ inventory: f.inventory(), register: f.register, now: f.now });
  plan.actions.push({ ...plan.actions.find(a => a.action === 'retire'), branch: 'second' });
  const calls = [];
  const applied = applyRetirements(plan, { root: f.root, tasksPath: 'unused', archiveRoot: f.archiveRoot, loadEvidence: () => ({}),
    retireBranch: ({ branch }) => { calls.push(branch); if (branch === 'released') throw new Error('head-changed'); return { manifest: '/m.json' }; } });
  assert.deepEqual(calls, ['released', 'second']);
  assert.deepEqual(applied.map(a => [a.branch, a.ok]), [['released', false], ['second', true]]);
  assert.equal(applied[0].error, 'head-changed');
  assert.equal(f.git('rev-parse', 'refs/heads/released'), f.releasedHead, 'refused branch untouched');
});

test('remote branches are reported for review and never deleted', t => {
  const f = fixture(t);
  const remote = buildRemoteInventory({ root: f.root, pulls: f.pulls, snapshot: inspectGit(f.root) });
  const unproven = remote.rows.map(classifyRemote).find(a => a.branch === 'unproven');
  assert.equal(unproven.action, 'remote-review');
  assert.equal(classifyRemote({ branch: 'x', tip: 'a', cls: 'merged-exact', pr: 3, deleteCommand: 'gh api -X DELETE repos/acme/repo/git/refs/heads/x' }).action, 'remote-delete-review');
  assert.notEqual(f.git('rev-parse', '--verify', 'refs/remotes/origin/unproven'), '');
});

test('receipt rotation keeps the newest runs and ignores other files', t => {
  const dir = mkdtempSync(join(tmpdir(), 'river-sweep-receipts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const stamp of ['20261101T010000Z', '20261101T020000Z', '20261101T030000Z']) for (const ext of ['json', 'md']) writeFileSync(join(dir, `sweep-${stamp}.${ext}`), '');
  writeFileSync(join(dir, 'latest.md'), ''); writeFileSync(join(dir, 'notes.txt'), '');
  rotateReceipts(dir, 2);
  assert.deepEqual(readdirSync(dir).sort(), ['latest.md', 'notes.txt', 'sweep-20261101T020000Z.json', 'sweep-20261101T020000Z.md', 'sweep-20261101T030000Z.json', 'sweep-20261101T030000Z.md']);
});

test('argument parsing rejects unknown flags and bad numbers', () => {
  assert.equal(parseSweepArgs(['--apply', '--stale-lease-hours', '48']).staleLeaseHours, 48);
  assert.throws(() => parseSweepArgs(['--force']), /Usage/);
  assert.throws(() => parseSweepArgs(['--stale-lease-hours', '0']), /positive/);
  assert.throws(() => parseSweepArgs(['--keep', '1.5']), /positive integer/);
});

test('the runner stages the fallback branch only until main carries the sweep', t => {
  const base = mkdtempSync(join(tmpdir(), 'river-sweep-runner-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const origin = join(base, 'origin.git'); run(base, 'init', '--bare', '-b', 'main', origin);
  const work = join(base, 'work'); mkdirSync(work);
  run(work, 'init', '-b', 'main'); run(work, 'config', 'user.name', 'Fixture'); run(work, 'config', 'user.email', 'fixture@example.invalid');
  run(work, 'remote', 'add', 'origin', origin);
  mkdirSync(join(work, 'scripts')); writeFileSync(join(work, 'scripts', 'other.mjs'), ''); run(work, 'add', '.'); run(work, 'commit', '-m', 'main');
  run(work, 'push', '-q', 'origin', 'main');
  // The stub stands in for the sweep: it records which ref it came from and its arguments.
  const stub = from => `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(base, 'ran.json'))}, JSON.stringify({ from: ${JSON.stringify(from)}, args: process.argv.slice(2) }));\n`;
  run(work, 'checkout', '-q', '-b', 'feature'); writeFileSync(join(work, 'scripts', 'project-sweep.mjs'), stub('feature'));
  run(work, 'add', '.'); run(work, 'commit', '-m', 'sweep'); run(work, 'push', '-q', 'origin', 'feature');
  const runner = join(base, 'run.sh');
  writeFileSync(runner, renderRunner({ root: work, stateDir: join(base, 'state'), node: process.execPath, path: process.env.PATH, apply: false, fallbackRef: 'refs/remotes/origin/feature' }));
  const ran = () => JSON.parse(readFileSync(join(base, 'ran.json'), 'utf8'));
  // The stub exits 0; a sweep with work to do would exit 1, which the runner passes through.
  assert.match(execFileSync('sh', [runner], { encoding: 'utf8' }), /staging refs\/remotes\/origin\/feature/);
  assert.equal(ran().from, 'feature');
  assert.deepEqual(ran().args, ['--repo', work, '--no-fetch', '--notify', '--stale-lease-hours', '24']);
  run(work, 'checkout', '-q', 'main'); writeFileSync(join(work, 'scripts', 'project-sweep.mjs'), stub('main'));
  run(work, 'add', '.'); run(work, 'commit', '-m', 'merged'); run(work, 'push', '-q', 'origin', 'main');
  assert.doesNotMatch(execFileSync('sh', [runner], { encoding: 'utf8' }), /staging/);
  assert.equal(ran().from, 'main', 'main wins once it has the sweep');
  assert.ok(!existsSync(join(base, 'state', 'stage.next')), 'staging directory swapped into place');
  // A failure before the sweep starts (here: the repository is unreadable) still ends
  // the log with one exit line, as the 2026-11-01 launchd privacy denial did not.
  const broken = join(base, 'broken.sh');
  writeFileSync(broken, renderRunner({ root: join(base, 'missing'), stateDir: join(base, 'state2'), node: process.execPath, path: process.env.PATH, apply: false }));
  const failure = (() => { try { execFileSync('sh', [broken], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, RIVER_OAKS_SWEEP_NO_NOTIFY: '1' } }); } catch (error) { return error; } })();
  assert.ok(failure && failure.status >= 2, 'failure exit status preserved');
  assert.match(failure.stdout, new RegExp(`^exit ${failure.status}: run failed`, 'm'));
  assert.throws(() => parseAgentArgs(['install', '--fallback-ref', 'main']), /refs\/remotes\/origin/);
});

test('the launch agent runs main tooling from a staged copy outside every worktree', t => {
  const dir = mkdtempSync(join(tmpdir(), 'river-sweep-agent-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const options = { label: 'dev.example.sweep', root: "/repo with 'quote", stateDir: join(dir, 'state'), node: '/usr/local/bin/node', path: '/usr/bin:/bin', intervalMinutes: 60, apply: false };
  const runner = renderRunner(options);
  assert.match(runner, /^REF=refs\/remotes\/origin\/main$/m);
  assert.match(runner, /archive "\$REF" scripts/);
  assert.doesNotMatch(runner, /cat-file/, 'no fallback unless one is installed');
  assert.match(runner, /--no-fetch --notify/);
  assert.doesNotMatch(runner, /--apply/, 'report-only unless installed with --apply');
  assert.match(renderRunner({ ...options, apply: true }), /--apply/);
  const runnerPath = join(dir, 'run.sh'); writeFileSync(runnerPath, runner);
  execFileSync('sh', ['-n', runnerPath]);
  assert.ok(runner.includes(`ROOT='/repo with '\\''quote'`), 'root is shell-quoted');
  const plist = renderPlist({ ...options, stateDir: join(dir, "logs & <o'brien>"), runner: runnerPath });
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>3600<\/integer>/);
  assert.ok(plist.includes('logs &amp; &lt;o&apos;brien&gt;/sweep.log'), 'paths are XML-escaped');
  if (process.platform === 'darwin') { const p = join(dir, 'agent.plist'); writeFileSync(p, plist); execFileSync('plutil', ['-lint', p]); }
  assert.equal(parseAgentArgs(['install', '--interval-minutes', '30']).intervalMinutes, 30);
  assert.throws(() => parseAgentArgs(['install', '--interval-minutes', '5']), /at least 15/);
  assert.throws(() => parseAgentArgs(['explode']), /Usage/);
  assert.equal(pickNode(undefined, [join(dir, 'missing'), runnerPath], '/fallback'), runnerPath, 'first existing stable node wins');
  assert.equal(pickNode(undefined, [join(dir, 'missing')], '/fallback'), '/fallback');
  assert.equal(pickNode('/explicit/node', [runnerPath]), '/explicit/node');
});
