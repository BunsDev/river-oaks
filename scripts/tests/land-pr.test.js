// Landing is serial because main requires up-to-date branches. Sessions on this
// machine share one queue in the common Git directory instead of coordinating
// merge order by message. These tests use a fake GitHub; nothing is merged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQueue, land } from '../land-pr.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'river-land-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const queueAt = (dir, pid, alive = () => true) => createQueue({ file: join(dir, 'queue.json'), lock: join(dir, 'queue.lock'), pid, host: 'here', alive });
const instant = () => Promise.resolve();

// A pull request that moves as the lander acts on it. `runs` maps a head to the
// Verify conclusions of its attempts; `onGuard` decides what the guard does.
function fakeGitHub({ mergeable = 'clean', head = 'a', runs = {}, onGuard, onDefault = true } = {}) {
  const pull = { state: 'open', merged: false, mergeable_state: mergeable, head, ref: 'feat/thing', merge_commit_sha: null };
  const calls = { pull: 0, updateBranch: [], rerun: [], guard: 0, deleted: [] };
  const attempt = {};
  let heads = 0;
  const github = {
    async pull() { calls.pull++; return { ...pull }; },
    async mergedOnDefault() { return onDefault; },
    async deleteBranch(ref) { calls.deleted.push(ref); },
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
  const result = await land({ pr: 7, github: fake.github, guard: fake.guard, queue: mine, sleep });
  assert.equal(waited, 1);
  assert.equal(result.status, 'merged');
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
