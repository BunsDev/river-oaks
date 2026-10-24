// The merge guard refuses unverified commits, so sign-branch rebuilds a branch as one
// GitHub-signed commit. These tests use real local repositories: a bare "origin" and a
// clone. The fake GitHub writes its commit into the bare repository itself, so the tree,
// parent and lease checks run against real Git objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localGit, signBranch } from '../sign-branch.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'river-sign-')), origin = join(root, 'origin.git'), work = join(root, 'work');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  run(root, 'init', '-q', '--bare', '-b', 'main', origin);
  run(root, 'clone', '-q', origin, work);
  for (const [key, value] of [['user.name', 'Test'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false']]) run(work, 'config', key, value);
  const commit = (files, message) => {
    for (const [path, text] of Object.entries(files)) text === null ? unlinkSync(join(work, path)) : writeFileSync(join(work, path), text);
    run(work, 'add', '-A'); run(work, 'commit', '-q', '-m', message);
  };
  commit({ 'a.txt': 'a\n', 'b.txt': 'b\n' }, 'base');
  run(work, 'push', '-q', 'origin', 'main');
  run(work, 'switch', '-q', '-c', 'feat');
  commit({ 'a.txt': 'a changed\n', 'new.txt': 'new\n' }, 'first change');
  commit({ 'b.txt': null }, 'remove b');
  run(work, 'push', '-q', 'origin', 'feat');
  // main moves on after the branch was cut.
  run(work, 'switch', '-q', 'main'); commit({ 'c.txt': 'c\n' }, 'main moves'); run(work, 'push', '-q', 'origin', 'main');
  run(work, 'switch', '-q', 'feat');
  return { root, origin, work, commit };
}

// GitHub as the tool sees it: signed commits are the ones it created.
function fakeGitHub({ origin, root }, { tamper = false, onCommit } = {}) {
  const signed = new Set(), refs = [], calls = { created: 0, deleted: [] };
  return {
    calls, refs, signed,
    async verified(sha) { return signed.has(sha); },
    async createRef(ref, sha) { run(origin, 'update-ref', `refs/heads/${ref}`, sha); refs.push(ref); },
    async deleteRef(ref) { calls.deleted.push(ref); try { run(origin, 'update-ref', '-d', `refs/heads/${ref}`); } catch { /* gone */ } },
    async createCommit({ branch, expectedHead, headline, additions, deletions }) {
      calls.created++;
      assert.equal(run(origin, 'rev-parse', `refs/heads/${branch}`), expectedHead);
      const scratch = join(root, `gh-${calls.created}`);
      run(root, 'clone', '-q', '-b', branch, origin, scratch);
      for (const [key, value] of [['user.name', 'GitHub'], ['user.email', 'noreply@github.com']]) run(scratch, 'config', key, value);
      for (const { path, contents } of additions) writeFileSync(join(scratch, path), Buffer.from(contents, 'base64'));
      for (const { path } of deletions) unlinkSync(join(scratch, path));
      if (tamper) writeFileSync(join(scratch, 'a.txt'), 'tampered\n');
      run(scratch, 'add', '-A'); run(scratch, 'commit', '-q', '-m', headline);
      run(scratch, 'push', '-q', 'origin', branch);
      const oid = run(scratch, 'rev-parse', 'HEAD');
      signed.add(oid);
      onCommit?.();
      return oid;
    },
  };
}

test('a dry run plans the rebuild and changes nothing', async t => {
  const repo = repository(t), github = fakeGitHub(repo), before = run(repo.origin, 'rev-parse', 'feat');
  const plan = await signBranch({ branch: 'feat', git: localGit(repo.work), github });
  assert.equal(plan.status, 'planned');
  assert.equal(plan.unsigned.length, 2);
  assert.equal(plan.files, 3);
  assert.equal(run(repo.origin, 'rev-parse', 'feat'), before);
  assert.equal(github.calls.created, 0);
  assert.deepEqual(github.refs, []);
});

test('apply replaces the branch with one signed commit whose tree is main merged with the old head', async t => {
  const repo = repository(t), github = fakeGitHub(repo), git = localGit(repo.work);
  const oldHead = run(repo.origin, 'rev-parse', 'feat'), main = run(repo.origin, 'rev-parse', 'main');
  const expected = run(repo.work, 'merge-tree', '--write-tree', main, oldHead);
  const result = await signBranch({ branch: 'feat', git, github, apply: true });
  const newHead = run(repo.origin, 'rev-parse', 'feat');
  assert.equal(result.status, 'signed');
  assert.equal(newHead, result.newHead);
  assert.equal(run(repo.origin, 'rev-parse', `${newHead}^{tree}`), expected);
  assert.equal(run(repo.origin, 'rev-list', '--parents', '-n', '1', newHead), `${newHead} ${main}`);
  assert.ok(github.signed.has(newHead));
  // The old history stays reachable locally, and the temporary branch is gone.
  assert.equal(run(repo.work, 'rev-parse', `refs/sign-branch-backup/feat/${oldHead}`), oldHead);
  assert.equal(run(repo.origin, 'for-each-ref', 'refs/heads/sign-branch'), '');
  // A second run finds nothing to do.
  assert.equal((await signBranch({ branch: 'feat', git, github, apply: true })).status, 'already-signed');
});

test('a rebuilt tree that differs from the expected merge leaves the branch alone', async t => {
  const repo = repository(t), github = fakeGitHub(repo, { tamper: true }), before = run(repo.origin, 'rev-parse', 'feat');
  await assert.rejects(signBranch({ branch: 'feat', git: localGit(repo.work), github, apply: true }), /differs from the expected/);
  assert.equal(run(repo.origin, 'rev-parse', 'feat'), before);
  assert.equal(run(repo.origin, 'for-each-ref', 'refs/heads/sign-branch'), '');
});

test('a branch that moved during signing is not overwritten', async t => {
  const repo = repository(t);
  let theirs;
  const github = fakeGitHub(repo, { onCommit: () => { repo.commit({ 'late.txt': 'late\n' }, 'pushed meanwhile'); run(repo.work, 'push', '-q', 'origin', 'feat'); theirs = run(repo.work, 'rev-parse', 'HEAD'); } });
  await assert.rejects(signBranch({ branch: 'feat', git: localGit(repo.work), github, apply: true }), /stale info|rejected/);
  assert.equal(run(repo.origin, 'rev-parse', 'feat'), theirs);
  assert.equal(run(repo.origin, 'for-each-ref', 'refs/heads/sign-branch'), '');
});

test('a branch that conflicts with main stops before anything is created', async t => {
  const repo = repository(t);
  run(repo.work, 'switch', '-q', 'main'); repo.commit({ 'a.txt': 'main edit\n' }, 'conflict'); run(repo.work, 'push', '-q', 'origin', 'main');
  const github = fakeGitHub(repo);
  await assert.rejects(signBranch({ branch: 'feat', git: localGit(repo.work), github, apply: true }), /conflicts with main/);
  assert.deepEqual(github.refs, []);
});

test('an executable or symlink change is refused rather than silently rewritten', async t => {
  const repo = repository(t);
  writeFileSync(join(repo.work, 'run.sh'), '#!/bin/sh\n'); chmodSync(join(repo.work, 'run.sh'), 0o755);
  run(repo.work, 'add', '-A'); run(repo.work, 'commit', '-q', '-m', 'script'); run(repo.work, 'push', '-q', 'origin', 'feat');
  const github = fakeGitHub(repo);
  await assert.rejects(signBranch({ branch: 'feat', git: localGit(repo.work), github, apply: true }), /run\.sh has mode 100755/);
  assert.deepEqual(github.refs, []);
});
