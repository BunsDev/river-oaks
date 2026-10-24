// Landing is serial because main requires up-to-date branches. Sessions on this
// machine share one queue in the common Git directory instead of coordinating
// merge order by message. These tests use a fake GitHub; nothing is merged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createQueue, gitHubApi, land } from '../land-pr.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'river-land-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const queueAt = (dir, pid, alive = () => true) => createQueue({ file: join(dir, 'queue.json'), lock: join(dir, 'queue.lock'), pid, host: 'here', alive });
const instant = () => Promise.resolve();

// A pull request that moves as the lander acts on it. `runs` maps a head to the
// Verify conclusions of its attempts; `onGuard` decides what the guard does.
function fakeGitHub({ mergeable = 'clean', head = 'a', runs = {}, onGuard, onDefault = true, branchGone = false } = {}) {
  const pull = { state: 'open', merged: false, mergeable_state: mergeable, head, ref: 'feat/thing', merge_commit_sha: null };
  const calls = { pull: 0, updateBranch: [], rerun: [], guard: 0, deleted: [] };
  const attempt = {};
  let heads = 0;
  const github = {
    async pull() { calls.pull++; return { ...pull }; },
    async mergedOnDefault() { return onDefault; },
    async deleteBranch(ref) { calls.deleted.push(ref); return !branchGone; },
    async updateBranch(_, expected) { calls.updateBranch.push(expected); pull.head = `updated-${++heads}`; pull.mergeable_state = 'clean'; },
    async verifyRun(sha) {
      const results = runs[sha] ?? ['success'], index = attempt[sha] ?? 0;
      return { id: `run-${sha}`, status: 'completed', conclusion: results[Math.min(index, results.length - 1)], attempt: index + 1 };
    },
    async failedJobs() { return ['preview shared (development)']; },
    async rerunFailed(id) { calls.rerun.push(id); const sha = id.slice(4); attempt[sha] = (attempt[sha] ?? 0) + 1; },
  };
  const guard = async () => {
    calls.guard++;
    if (onGuard) return onGuard(pull, calls.guard);
    pull.merged = true; pull.state = 'closed'; pull.merge_commit_sha = `merge-of-${pull.head}`;
    return { code: 0, output: 'merged' };
  };
  return { github, guard, calls, pull };
}

test('sessions take turns in the order they queued', t => {
  const dir = scratch(t), first = queueAt(dir, 1), second = queueAt(dir, 2);
  first.enqueue(10); second.enqueue(11);
  assert.equal(first.position(10), 0);
  assert.equal(second.position(11), 1);
  first.dequeue(10);
  assert.equal(second.position(11), 0);
});

test('an entry left by a process that has died is dropped', t => {
  const dir = scratch(t);
  queueAt(dir, 1).enqueue(10);
  const survivor = queueAt(dir, 2, pid => pid !== 1);
  survivor.enqueue(11);
  assert.equal(survivor.position(11), 0);
  assert.deepEqual(survivor.list().map(entry => entry.id), [11]);
});

test('a pull request already queued by a live session is not queued twice', t => {
  const dir = scratch(t);
  queueAt(dir, 1).enqueue(10);
  assert.throws(() => queueAt(dir, 2).enqueue(10), /already queued/);
});

test('a branch behind main is updated, verified, and merged only by the guard', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ mergeable: 'behind', head: 'a' });
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant });
  assert.deepEqual(fake.calls.updateBranch, ['a']);
  assert.equal(fake.calls.guard, 1);
  assert.deepEqual([result.status, result.merge], ['merged', 'merge-of-updated-1']);
  assert.deepEqual(queue.list(), []);
});

test('a failed run is rerun once, and lands if the rerun passes', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ runs: { a: ['failure', 'success'] } });
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant });
  assert.deepEqual(fake.calls.rerun, ['run-a']);
  assert.equal(result.status, 'merged');
});

test('a run that still fails after one rerun stops without merging', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ runs: { a: ['failure', 'failure'] } });
  await assert.rejects(land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant }), /still failing after one rerun.*preview shared/);
  assert.equal(fake.calls.guard, 0);
  assert.deepEqual(queue.list(), [], 'a stopped landing leaves the queue');
});

test('a conflict with main stops the landing before anything changes', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ mergeable: 'dirty' });
  await assert.rejects(land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant }), /conflicts with main/);
  assert.deepEqual([fake.calls.updateBranch.length, fake.calls.guard], [0, 0]);
});

test('when main moves under the guard, the branch is updated and tried again', async t => {
  const queue = queueAt(scratch(t), 1);
  const fake = fakeGitHub({ onGuard: (pull, call) => {
    if (call === 1) { pull.mergeable_state = 'behind'; return { code: 0, output: 'NOT MERGING: BEHIND' }; }
    pull.merged = true; pull.state = 'closed'; pull.merge_commit_sha = 'merged-second-time'; return { code: 0, output: 'merged' };
  } });
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant });
  assert.deepEqual([fake.calls.guard, fake.calls.updateBranch.length, result.merge], [2, 1, 'merged-second-time']);
});

test('a refusal for any other reason fails closed', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ onGuard: () => ({ code: 1, output: 'NOT MERGING: unverified commit' }) });
  await assert.rejects(land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant }), /merge guard refused.*unverified commit/);
});

test('a session waits for its turn before touching the pull request', async t => {
  const dir = scratch(t), other = queueAt(dir, 2), mine = queueAt(dir, 1), fake = fakeGitHub();
  other.enqueue(99);
  let waited = 0;
  const sleep = async () => { waited++; assert.equal(fake.calls.pull, 0, 'no GitHub call while waiting'); other.dequeue(99); };
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue: mine, sleep, waitForQueue: (_id, ms) => sleep(ms) });
  assert.equal(waited, 1);
  assert.equal(result.status, 'merged');
});

test('a queued lander wakes on release without waiting for the fallback or touching GitHub early', async t => {
  const dir = scratch(t), first = queueAt(dir, 2), mine = queueAt(dir, 1), fake = fakeGitHub();
  assert.equal(typeof mine.waitForTurn, 'function');
  first.enqueue(99);
  let waiting;
  const enteredWait = new Promise(done => { waiting = done; });
  const pending = land({ pr: 7, github: fake.github, guard: fake.guard, queue: mine, sleep: instant,
    waitForQueue: (id, ms) => { const wait = mine.waitForTurn(id, ms); waiting(); return wait; }, poll: 120000 });
  await enteredWait;
  assert.equal(fake.calls.pull, 0);
  first.dequeue(99);
  // Waking well inside the 120 s fallback proves the watcher did it; the margin
  // absorbs a loaded machine, where the notification and resume can take seconds.
  const timeout = setTimeout(() => assert.fail('queue release did not wake the lander'), 30000);
  t.after(() => clearTimeout(timeout));
  assert.equal((await pending).status, 'merged');
  clearTimeout(timeout);
  assert.equal(fake.calls.guard, 1);
});

test('release before the queue watcher is attached is observed immediately', async t => {
  const dir = scratch(t), first = queueAt(dir, 2), mine = queueAt(dir, 1);
  first.enqueue(99); mine.enqueue(7); first.dequeue(99);
  await mine.waitForTurn(7, 30000);
  assert.equal(mine.position(7), 0);
});

test('a failed queue watcher falls back to a timer without granting an early turn', async t => {
  const dir = scratch(t), first = queueAt(dir, 2);
  const mine = createQueue({ file: join(dir, 'queue.json'), lock: join(dir, 'queue.lock'), pid: 1, host: 'here', alive: () => true,
    watchDirectory: () => { throw new Error('watch unavailable'); } });
  first.enqueue(99); mine.enqueue(7);
  await mine.waitForTurn(7, 10);
  assert.equal(mine.position(7), 1, 'timeout only requests a fresh queue check');
  first.dequeue(99);
  await mine.waitForTurn(7, 30000);
  assert.equal(mine.position(7), 0);
});

test('losing the owned queue entry during a wait fails closed', async t => {
  const dir = scratch(t), first = queueAt(dir, 2), mine = queueAt(dir, 1);
  first.enqueue(99); mine.enqueue(7);
  const pending = mine.waitForTurn(7, 30000);
  mine.dequeue(7);
  await assert.rejects(pending, /no longer queued/);
});

test('a lost queue entry is rejected at the fallback even when notifications are unavailable', async t => {
  const dir = scratch(t), first = queueAt(dir, 2);
  const mine = createQueue({ file: join(dir, 'queue.json'), lock: join(dir, 'queue.lock'), pid: 1, host: 'here', alive: () => true,
    watchDirectory: () => { throw new Error('watch unavailable'); } });
  first.enqueue(99); mine.enqueue(7);
  const pending = mine.waitForTurn(7, 10);
  mine.dequeue(7);
  await assert.rejects(pending, /no longer queued/);
});

test('a missing entry after the timer fallback cannot reach GitHub or the merge guard', async t => {
  const dir = scratch(t), first = queueAt(dir, 2), mine = queueAt(dir, 1), fake = fakeGitHub();
  first.enqueue(99);
  await assert.rejects(land({ pr: 7, github: fake.github, guard: fake.guard, queue: mine, sleep: instant,
    waitForQueue: async () => mine.dequeue(7) }), /no longer queued/);
  assert.equal(fake.calls.pull, 0);
  assert.equal(fake.calls.guard, 0);
});

test('other queue changes do not grant a turn before the preceding entry leaves', async t => {
  const dir = scratch(t), first = queueAt(dir, 2), mine = queueAt(dir, 1), third = queueAt(dir, 3);
  first.enqueue(99); mine.enqueue(7);
  const pending = mine.waitForTurn(7, 20);
  third.enqueue(8); third.dequeue(8);
  await pending;
  assert.equal(mine.position(7), 1);
});

test('an asynchronous watcher error retains the timer and closes its watcher', async t => {
  const dir = scratch(t), first = queueAt(dir, 2);
  let closed = false;
  const mine = createQueue({ file: join(dir, 'queue.json'), lock: join(dir, 'queue.lock'), pid: 1, host: 'here', alive: () => true,
    watchDirectory: () => { const watcher = new EventEmitter(); watcher.close = () => { closed = true; }; setImmediate(() => watcher.emit('error', new Error('watch failed'))); return watcher; } });
  first.enqueue(99); mine.enqueue(7);
  await mine.waitForTurn(7, 20);
  assert.equal(closed, true);
  assert.equal(mine.position(7), 1);
});

test('the fallback detects a dead preceding process without a filesystem notification', async t => {
  const dir = scratch(t), first = queueAt(dir, 2);
  let firstAlive = true;
  const mine = queueAt(dir, 1, pid => pid !== 2 || firstAlive);
  first.enqueue(99); mine.enqueue(7);
  const pending = mine.waitForTurn(7, 10);
  firstAlive = false;
  await pending;
  assert.equal(mine.position(7), 0);
});

// Remote branch deletion is opt-in, and even then only after the merge commit
// is confirmed on the default branch. Nothing here changes the default.
test('the source branch stays unless --delete-remote-branch is given', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub();
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant });
  assert.deepEqual([result.status, result.deletedBranch, fake.calls.deleted], ['merged', null, []]);
});

test('with --delete-remote-branch the branch is deleted once the merge is on the default branch', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub();
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant, deleteRemoteBranch: true });
  assert.deepEqual([result.merge, result.deletedBranch, fake.calls.deleted], ['merge-of-a', 'feat/thing', ['feat/thing']]);
});

test('a merge not yet on the default branch leaves the remote branch in place', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ onDefault: false });
  const lines = [];
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant, deleteRemoteBranch: true, log: line => lines.push(line) });
  assert.deepEqual([result.status, result.deletedBranch, fake.calls.deleted], ['merged', null, []]);
  assert.ok(lines.some(line => line.includes('leaving feat/thing in place')));
});

test('a pull request found already merged is still eligible for the opt-in delete', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub();
  fake.pull.merged = true; fake.pull.state = 'closed'; fake.pull.merge_commit_sha = 'earlier';
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant, deleteRemoteBranch: true });
  assert.deepEqual([result.merge, result.deletedBranch, fake.calls.guard], ['earlier', 'feat/thing', 0]);
});

// A repository that deletes head branches on merge has removed the branch
// before the lander asks; the landing still succeeds.
test('a branch GitHub already deleted on merge is reported, not an error', async t => {
  const queue = queueAt(scratch(t), 1), fake = fakeGitHub({ branchGone: true });
  const lines = [];
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue, sleep: instant, deleteRemoteBranch: true, log: line => lines.push(line) });
  assert.deepEqual([result.status, result.merge, result.deletedBranch], ['merged', 'merge-of-a', null]);
  assert.ok(lines.some(line => line.includes('GitHub had already deleted feat/thing')));
});

// The real client over a fake gh: each request is answered from `routes` by its
// "<method> <path>", and anything else fails the way gh does on a 404.
function fakeGh(routes) {
  const requests = [];
  const run = (command, args) => {
    if (command === 'git') return 'git@github.com:BunsDev/river-oaks.git\n';
    const path = args.at(-1), method = args.includes('-X') ? args[args.indexOf('-X') + 1] : 'GET', key = `${method} ${path}`;
    requests.push(key);
    const answer = routes[key];
    if (answer === undefined) throw new Error(`Command failed: gh api ${path}\ngh: Not Found (HTTP 404)`);
    if (answer instanceof Error) throw answer;
    const body = answer === null ? '' : JSON.stringify(answer);
    return args.includes('-i') ? `HTTP/2.0 200 OK\nEtag: "e-${key}"\n\n${body}` : body;
  };
  return { github: gitHubApi('.', run), requests };
}

test('the default-branch lookup reads the repository, not a 404ing path with a trailing slash', async () => {
  const { github, requests } = fakeGh({ 'GET repos/BunsDev/river-oaks': { default_branch: 'main' }, 'GET repos/BunsDev/river-oaks/compare/main...m1': { status: 'behind' } });
  assert.equal(await github.mergedOnDefault('m1'), true);
  assert.deepEqual(requests, ['GET repos/BunsDev/river-oaks', 'GET repos/BunsDev/river-oaks/compare/main...m1']);
});

test('deleting a branch that is already gone returns false, even beside a longer name', async () => {
  const { github, requests } = fakeGh({
    'DELETE repos/BunsDev/river-oaks/git/refs/heads/feat/thing': new Error('gh: Reference does not exist (HTTP 422)'),
    'GET repos/BunsDev/river-oaks/git/matching-refs/heads/feat/thing': [{ ref: 'refs/heads/feat/thing-2' }],
  });
  assert.equal(await github.deleteBranch('feat/thing'), false);
  assert.equal(requests.length, 2);
});

test('a delete that fails while the branch still exists is an error', async () => {
  const { github } = fakeGh({
    'DELETE repos/BunsDev/river-oaks/git/refs/heads/feat/thing': new Error('gh: Resource not accessible by integration (HTTP 403)'),
    'GET repos/BunsDev/river-oaks/git/matching-refs/heads/feat/thing': [{ ref: 'refs/heads/feat/thing' }],
  });
  await assert.rejects(github.deleteBranch('feat/thing'), /HTTP 403/);
});

test('a successful delete returns true', async () => {
  const { github } = fakeGh({ 'DELETE repos/BunsDev/river-oaks/git/refs/heads/feat/thing': null });
  assert.equal(await github.deleteBranch('feat/thing'), true);
});

// Checkouts update at different times, so the lander from #272 (which keys
// entries by "pr") and this one share a queue file during the change-over.
test('landing entries stay readable by the earlier lander, and its entries by this one', async t => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const dir = scratch(t), file = join(dir, 'queue.json');
  queueAt(dir, 1).enqueue(10);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map(entry => [entry.id, entry.pr]), [[10, 10]]);
  writeFileSync(file, JSON.stringify([{ pr: 12, pid: 3, host: 'here', owner: 'older lander', queuedAt: 'then' }]));
  const mine = queueAt(dir, 4);
  assert.throws(() => mine.enqueue(12), /already queued by older lander/);
  assert.deepEqual(mine.list().map(entry => entry.id), [12]);
});
