// Hardening: the installed pre-commit hook runs the secrets checker copied at
// install time, never the copy in whatever branch is checked out. Otherwise
// committing on a hostile branch (a fork PR checked out for review) would run
// that branch's code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the installed pre-commit hook ignores the checked-out secrets checker', t => {
  const base = mkdtempSync(join(tmpdir(), 'river-hooks-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const repo = join(base, 'repo');mkdirSync(repo);
  const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-b', 'main');
  execFileSync(process.execPath, [new URL('../install-project-hooks.mjs', import.meta.url).pathname], {cwd: repo, stdio: 'pipe'});
  const hooks = git('config', 'core.hooksPath');
  assert.ok(existsSync(join(hooks, 'scripts', 'check_secrets.py')), 'the checker is copied next to the hook');
  assert.ok(existsSync(join(hooks, '.gitleaks.toml')), 'with its configuration');
  // A hostile branch ships its own "checker" that leaves a marker when run.
  const marker = join(base, 'hostile-ran');
  mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'check_secrets.py'), `open(${JSON.stringify(marker)}, "w").write("ran")\n`);
  spawnSync(join(hooks, 'pre-commit'), [], {cwd: repo, stdio: 'pipe'});
  assert.equal(existsSync(marker), false, 'the branch copy never runs');
});
