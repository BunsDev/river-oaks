import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REGISTER, registerPaths, readLiveRegister, updateLiveRegister, patchTask, defaultRegisterText, withRegisterLock } from '../task-register.mjs';

const task = (id, fields = {}) => ({ id, title: `Task ${id}`, status: 'queued', branches: [], nextAction: 'next', updatedAt: '2026-10-18T10:00:00Z', ...fields });
const text = tasks => JSON.stringify({ schemaVersion: 1, tasks }, null, 2) + '\n';

// A primary checkout with a committed register snapshot, and one linked worktree.
function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'river-register-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const primary = join(base, 'primary'), git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  mkdirSync(join(primary, 'docs', 'project-management'), { recursive: true });
  git(primary, 'init', '-q', '-b', 'main'); git(primary, 'config', 'user.name', 'Fixture'); git(primary, 'config', 'user.email', 'fixture@example.invalid');
  const tracked = join(primary, REGISTER), committed = text([task('a'), task('b')]);
  writeFileSync(tracked, committed); git(primary, 'add', '.'); git(primary, 'commit', '-q', '-m', 'register snapshot');
  const worktree = join(base, 'feature'); git(primary, 'worktree', 'add', '-q', '-b', 'feature', worktree);
  return { primary, worktree, tracked, committed, git, live: registerPaths(primary).live };
}
const ids = register => register.tasks.map(item => `${item.id}:${item.status}`).sort();

test('the live register lives in the common Git directory and every worktree shares it', t => {
  const f = fixture(t);
  assert.equal(registerPaths(f.worktree).live, f.live);
  assert.ok(f.live.includes(`${join('.git', 'river-oaks-tasks.json')}`));
  assert.deepEqual(ids(readLiveRegister(f.worktree)), ['a:queued', 'b:queued'], 'a clean checkout seeds it from the snapshot');
  assert.equal(readFileSync(f.tracked, 'utf8'), f.committed, 'the tracked snapshot is untouched');
  updateLiveRegister(f.worktree, register => patchTask(register, 'b', { status: 'blocked' }));
  assert.deepEqual(ids(readLiveRegister(f.primary)), ['a:queued', 'b:blocked'], 'a change from the worktree is what the primary reads');
  assert.equal(f.git(f.primary, 'status', '--porcelain'), '', 'and the primary checkout stays clean');
});

test('an uncommitted live edit in the primary seeds the live register and the tracked file goes back to its snapshot', t => {
  const f = fixture(t);
  writeFileSync(f.tracked, text([task('a', { status: 'blocked', updatedAt: '2026-10-18T11:00:00Z' }), task('b'), task('c')]));
  assert.deepEqual(ids(readLiveRegister(f.primary)), ['a:blocked', 'b:queued', 'c:queued']);
  assert.equal(readFileSync(f.tracked, 'utf8'), f.committed);
  assert.equal(f.git(f.primary, 'status', '--porcelain'), '', 'a pull can no longer meet a modified register');
});

test('a later legacy edit to the tracked copy is absorbed by task id, the newer update winning', t => {
  const f = fixture(t);
  updateLiveRegister(f.primary, register => patchTask(register, 'a', { status: 'blocked', updatedAt: '2026-10-18T12:00:00Z' }));
  // An old-style writer edits the tracked snapshot: a stale copy of a, a newer b and a new d.
  writeFileSync(f.tracked, text([task('a', { status: 'delivered', updatedAt: '2026-10-18T11:00:00Z', evidence: [{ pr: 1 }] }),
    task('b', { status: 'blocked', updatedAt: '2026-10-18T13:00:00Z' }), task('d')]));
  const register = readLiveRegister(f.worktree);
  assert.deepEqual(ids(register), ['a:blocked', 'b:blocked', 'd:queued'], 'the live a is newer and stays; b and d come in');
  assert.equal(readFileSync(f.tracked, 'utf8'), f.committed);
});

test('a tracked copy with conflict markers is left for a person and named by project:status', t => {
  const f = fixture(t);
  readLiveRegister(f.primary);
  const markers = '{\n<<<<<<< Updated upstream\n  "tasks": []\n=======\n  "tasks": [1]\n>>>>>>> Stashed changes\n}\n';
  writeFileSync(f.tracked, markers);
  assert.deepEqual(ids(readLiveRegister(f.primary)), ['a:queued', 'b:queued'], 'the live register is unchanged');
  assert.equal(readFileSync(f.tracked, 'utf8'), markers, 'the markers are not overwritten');
  assert.equal(defaultRegisterText(f.primary), markers);
  const run = spawnSync(process.execPath, [new URL('../project-status.mjs', import.meta.url).pathname, '--repo', f.worktree], { encoding: 'utf8' });
  assert.equal(run.status, 2); assert.match(run.stderr, /conflict markers/);
});

test('a change that would make the register invalid is refused and nothing is written', t => {
  const f = fixture(t);
  readLiveRegister(f.primary);
  const before = readFileSync(f.live, 'utf8');
  assert.throws(() => updateLiveRegister(f.primary, register => patchTask(register, 'a', { status: 'active' })), /active owner and leaseUntil required/);
  assert.throws(() => updateLiveRegister(f.primary, register => patchTask(register, 'b', { branches: ['x'] }, {}) && patchTask(register, 'a', { branches: ['x'] })), /Duplicate branch ownership/);
  assert.equal(readFileSync(f.live, 'utf8'), before, 'the live file is byte for byte unchanged');
});

test('patch sets and unsets fields, stamps updatedAt, and creates only when asked', () => {
  const register = { schemaVersion: 1, tasks: [task('a', { leaseUntil: '2026-10-18T12:00:00Z' })] };
  patchTask(register, 'a', { owner: null }, { unset: ['leaseUntil'] });
  const a = register.tasks[0];
  assert.equal(a.owner, null); assert.equal('leaseUntil' in a, false); assert.notEqual(a.updatedAt, '2026-10-18T10:00:00Z');
  patchTask(register, 'a', { updatedAt: '2026-10-19T00:00:00Z' });
  assert.equal(register.tasks[0].updatedAt, '2026-10-19T00:00:00Z', 'an explicit updatedAt is kept');
  assert.throws(() => patchTask(register, 'z', {}), /pass --create/);
  patchTask(register, 'z', { title: 'New', status: 'queued', branches: [], nextAction: 'start' }, { create: true });
  assert.equal(register.tasks.at(-1).id, 'z');
});

test('the CLI prints the live path and patches a task from a worktree', t => {
  const f = fixture(t), cli = new URL('../task-register.mjs', import.meta.url).pathname;
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: f.worktree, encoding: 'utf8' });
  const path = run('path');
  assert.equal(path.status, 0); assert.equal(path.stdout.trim(), f.live);
  const patch = run('patch', 'a', '--json', JSON.stringify({ status: 'active', owner: 'fixture', leaseUntil: '2026-10-19T00:00:00Z' }));
  assert.equal(patch.status, 0, patch.stderr);
  assert.equal(JSON.parse(run('show', 'a').stdout).owner, 'fixture');
  const refused = run('patch', 'a', '--json', '{"id":"other"}');
  assert.equal(refused.status, 1); assert.match(refused.stderr, /without id/);
  const out = join(f.worktree, 'snapshot.json');
  assert.equal(run('snapshot', '--out', out).status, 0);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).tasks.find(item => item.id === 'a').status, 'active');
});

test('an abandoned lock is reclaimed; a fresh one is respected while it is held', t => {
  const f = fixture(t), lock = `${f.live}.lock`;
  mkdirSync(lock); const old = new Date(Date.now() - 60000); utimesSync(lock, old, old);
  assert.deepEqual(ids(readLiveRegister(f.primary)), ['a:queued', 'b:queued']);
  assert.equal(existsSync(lock), false);
  let inner = 0;
  withRegisterLock(lock, () => { inner++; assert.equal(existsSync(lock), true); });
  assert.equal(inner, 1); assert.equal(existsSync(lock), false);
});

test('a feature PR may not change the register snapshot; a register sweep may', async () => {
  const { snapshotChangeAllowed, SNAPSHOT } = await import('../check-register-snapshot.mjs');
  assert.equal(snapshotChangeAllowed({ changed: ['preview/src/main.js'], headBranch: 'feat/x' }), true);
  assert.equal(snapshotChangeAllowed({ changed: ['preview/src/main.js', SNAPSHOT], headBranch: 'feat/x' }), false);
  assert.equal(snapshotChangeAllowed({ changed: [SNAPSHOT], headBranch: 'docs/register-sweep-20261019' }), true);
  assert.equal(snapshotChangeAllowed({ changed: [SNAPSHOT], headBranch: undefined }), false);
});
