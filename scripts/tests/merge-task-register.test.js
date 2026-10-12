// The task register is uncommitted shared state in the primary checkout, and
// branches edit it too. Git's line merge turns concurrent edits into conflict
// markers (invalid JSON) on a branch merge or a GUI client's stash pop. The
// installed merge driver merges the register by task id instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeRegisters } from '../merge-task-register.mjs';

const task = (id, updatedAt, extra = {}) => ({id, title: id, status: 'queued', branches: [], owner: null, updatedAt, nextAction: 'Inspect', ...extra});
const register = (...tasks) => ({schemaVersion: 1, scope: 'fixture', tasks});
const ids = r => r.tasks.map(t => t.id);
const T0 = '2026-10-11T00:00:00Z', T1 = '2026-10-11T01:00:00Z', T2 = '2026-10-11T02:00:00Z';

test('additions on both sides are kept: current order first, then the other side', () => {
  const base = register(task('a', T0));
  const {register: r} = mergeRegisters(base, register(task('a', T0), task('mine', T1)), register(task('a', T0), task('theirs', T2)));
  assert.deepEqual(ids(r), ['a', 'mine', 'theirs']);
  assert.equal(r.schemaVersion, 1);
});

test('an edit on one side wins over the unchanged other side, whatever its timestamp', () => {
  const base = register(task('a', T1));
  const edited = task('a', T0, {status: 'blocked'});
  assert.equal(mergeRegisters(base, register(edited), base).register.tasks[0].status, 'blocked');
  assert.equal(mergeRegisters(base, base, register(edited)).register.tasks[0].status, 'blocked');
});

test('when both sides edit a task, the newer updatedAt wins', () => {
  const base = register(task('a', T0));
  const older = task('a', T1, {status: 'active'}), newer = task('a', T2, {status: 'retired'});
  assert.equal(mergeRegisters(base, register(older), register(newer)).register.tasks[0].status, 'retired');
  assert.equal(mergeRegisters(base, register(newer), register(older)).register.tasks[0].status, 'retired');
});

test('a deletion applies only when the other side left that task unchanged', () => {
  const base = register(task('a', T0), task('b', T0));
  assert.deepEqual(ids(mergeRegisters(base, register(task('a', T0)), base).register), ['a']);
  const kept = mergeRegisters(base, register(task('a', T0)), register(task('a', T0), task('b', T1, {status: 'active'})));
  assert.deepEqual(ids(kept.register), ['a', 'b']);
  assert.equal(kept.register.tasks[1].status, 'active');
});

test('duplicate ids left on one side collapse to their newest copy', () => {
  const base = register(task('a', T0));
  const ours = register(task('a', T1, {status: 'active'}), task('a', T2, {status: 'retired'}));
  const {register: r} = mergeRegisters(base, ours, base);
  assert.deepEqual(ids(r), ['a']);
  assert.equal(r.tasks[0].status, 'retired');
});

test('different edits with the same updatedAt keep the current side and report it', () => {
  const base = register(task('a', T0));
  const {register: r, notes} = mergeRegisters(base, register(task('a', T1, {status: 'active'})), register(task('a', T1, {status: 'blocked'})));
  assert.equal(r.tasks[0].status, 'active');
  assert.equal(notes.length, 1);
});

function fixtureRepo(t, {install}) {
  const base = mkdtempSync(join(tmpdir(), 'river-register-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, 'docs', 'project-management'), {recursive: true});
  const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const tryGit = (...args) => spawnSync('git', args, {cwd: repo, encoding: 'utf8'});
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  if (install) execFileSync(process.execPath, [new URL('../install-project-hooks.mjs', import.meta.url).pathname], {cwd: repo, stdio: 'pipe'});
  const file = join(repo, 'docs', 'project-management', 'tasks.json');
  const write = value => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  const read = () => JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(join(repo, '.gitattributes'), readFileSync(new URL('../../.gitattributes', import.meta.url)));
  write(register(task('a', T0)));
  git('add', '.');
  git('commit', '-q', '--no-verify', '-m', 'base');
  return {repo, git, tryGit, file, write, read};
}

test('a branch merge combines both sides\' register edits without conflict markers', t => {
  const {git, tryGit, write, read} = fixtureRepo(t, {install: true});
  git('switch', '-q', '-c', 'feature');
  write(register(task('a', T0), task('feature-task', T1)));
  git('commit', '-q', '--no-verify', '-am', 'feature task');
  git('switch', '-q', 'main');
  write(register(task('a', T2, {status: 'active', owner: 'main', leaseUntil: T2}), task('main-task', T1)));
  git('commit', '-q', '--no-verify', '-am', 'main task');
  const merge = tryGit('merge', '--no-edit', '--no-verify', 'feature');
  assert.equal(merge.status, 0, merge.stderr);
  assert.deepEqual(ids(read()), ['a', 'main-task', 'feature-task']);
  assert.equal(read().tasks[0].status, 'active');
});

test('a GUI-style stash, pull and pop keeps the live register and the pulled entries', t => {
  const {git, tryGit, write, read} = fixtureRepo(t, {install: true});
  git('switch', '-q', '-c', 'upstream');
  write(register(task('a', T2, {status: 'retired'}), task('swept', T2)));
  git('commit', '-q', '--no-verify', '-am', 'register sweep');
  git('switch', '-q', 'main');
  write(register(task('a', T0), task('live', T1)));
  git('stash', 'push', '-q', '-m', '!!GitHub_Desktop<main>');
  git('merge', '-q', '--ff-only', 'upstream');
  const pop = tryGit('stash', 'pop');
  assert.equal(pop.status, 0, pop.stderr);
  assert.deepEqual(ids(read()), ['a', 'swept', 'live']);
  assert.equal(read().tasks[0].status, 'retired');
  assert.equal(git('stash', 'list'), '', 'the stash is consumed, not left behind');
  assert.equal(git('status', '--porcelain'), 'M docs/project-management/tasks.json');
});

test('without the driver the same pop conflicts, which is the failure the driver removes', t => {
  const {git, tryGit, write} = fixtureRepo(t, {install: false});
  git('switch', '-q', '-c', 'upstream');
  write(register(task('a', T0), task('swept', T2)));
  git('commit', '-q', '--no-verify', '-am', 'register sweep');
  git('switch', '-q', 'main');
  write(register(task('a', T0), task('live', T1)));
  git('stash', 'push', '-q');
  git('merge', '-q', '--ff-only', 'upstream');
  assert.notEqual(tryGit('stash', 'pop').status, 0);
  assert.match(git('status', '--porcelain'), /^UU /m);
});

test('an unparseable side falls back to Git\'s line merge and reports a conflict', t => {
  const dir = mkdtempSync(join(tmpdir(), 'river-register-file-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const [base, current, other] = ['base', 'current', 'other'].map(name => join(dir, name));
  writeFileSync(base, '{\n  "tasks": []\n}\n');
  writeFileSync(current, '{\n<<<<<<< broken\n');
  writeFileSync(other, '{\n  "tasks": [1]\n}\n');
  const run = spawnSync(process.execPath, [new URL('../merge-task-register.mjs', import.meta.url).pathname, base, current, other, 'tasks.json'], {encoding: 'utf8'});
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /line merge/);
  assert.match(readFileSync(current, 'utf8'), /^<<<<<<< current$/m);
});

test('the installer registers the driver for every worktree', t => {
  const {git} = fixtureRepo(t, {install: true});
  const driver = git('config', 'merge.task-register.driver');
  assert.match(driver, /river-oaks-hooks\/merge-task-register' %O %A %B %P$/);
  assert.match(git('check-attr', 'merge', '--', 'docs/project-management/tasks.json'), /merge: task-register$/);
});
