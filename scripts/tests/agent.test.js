import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProfile, selectTasks } from '../agent.mjs';

const task = (id, code, extra = {}) => ({ id, command: [process.execPath, '-e', code], ...extra });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'river-agent-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, receipt: join(root, 'receipt.json'), quiet: true };
}
test('unknown profiles and task references fail closed', () => {
  const config = { profiles: { core: ['missing'] }, tasks: [] };
  assert.throws(() => selectTasks(config, 'typo'), /Unknown profile/);
  assert.throws(() => selectTasks(config, 'core'), /Unknown task/);
});
test('a real failure stops later commands and writes a failed receipt', async t => {
  const options = fixture(t);
  const result = await runProfile('fixture', [task('fail', 'process.exit(7)'), task('later', 'process.exit(0)')], options);
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].exitCode, 7);
  assert.equal(result.results[1].status, 'not_run');
  assert.equal(JSON.parse(readFileSync(options.receipt)).status, 'failed');
});
test('expected nonzero domain exit is explicit, other exits fail', async t => {
  const options = fixture(t);
  assert.equal((await runProfile('fixture', [task('blocked-demo', 'process.exit(2)', { expectedExit: 2 })], options)).status, 'passed');
  assert.equal((await runProfile('fixture', [task('bad-demo', 'process.exit(0)', { expectedExit: 2 })], options)).status, 'failed');
});
test('missing executable is blocked, never a passing task', async t => {
  const result = await runProfile('fixture', [{ id: 'missing', command: ['river-oaks-nonexistent-executable'] }], fixture(t));
  assert.equal(result.status, 'blocked');
});
test('missing required environment blocks execution and never serializes values', async t => {
  const options = fixture(t);
  const result = await runProfile('fixture', [task('redis', 'process.exit(0)', { requiresEnv: ['TEST_REDIS_URL'] })], { ...options, env: {} });
  assert.equal(result.status, 'blocked');
  assert.match(readFileSync(options.receipt, 'utf8'), /TEST_REDIS_URL/);
  const secret = 'private-credential-value';
  await runProfile('fixture', [task('redis', 'process.exit(0)', { requiresEnv: ['TEST_REDIS_URL'] })], { ...options, env: { TEST_REDIS_URL: secret } });
  assert.ok(!readFileSync(options.receipt, 'utf8').includes(secret));
});
test('a timed out process fails rather than hanging verification', async t => {
  const result = await runProfile('fixture', [task('hang', 'setInterval(() => {}, 1000)', { timeoutMs: 100 })], fixture(t));
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].error, 'ETIMEDOUT');
});

test('catalog profiles resolve and npm commands refer to real scripts', () => {
  const config = JSON.parse(readFileSync(new URL('../../config/agent-workflow.json', import.meta.url)));
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.equal(new Set(config.tasks.map(t => t.id)).size, config.tasks.length);
  for (const profile of Object.keys(config.profiles)) {
    const tasks = selectTasks(config, profile);
    assert.ok(tasks.length > 0);
    for (const task of tasks) {
      assert.ok(task.command.length > 0);
      // Built-in npm commands (for example audit) do not need package scripts.
      if (task.command[0] === 'npm' && ['run', 'test'].includes(task.command[1])) {
        const script = task.command[1] === 'run' ? task.command[2] : task.command[1];
        assert.ok(Object.hasOwn(pkg.scripts, script), `Missing npm script: ${script}`);
      }
    }
  }
  assert.ok(selectTasks(config, 'full').some(t => t.requiresEnv?.includes('REDIS_URL')));
});

test('empty verification cannot produce a passing receipt', async t => {
  await assert.rejects(runProfile('empty', [], fixture(t)), /must contain tasks/);
});

test('interruption ends an active check and prevents subsequent work', async t => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150);
  t.after(() => clearTimeout(timer));
  const result = await runProfile('fixture', [task('wait', 'setInterval(() => {}, 1000)'), task('later', 'process.exit(0)')], { ...fixture(t), signal: controller.signal });
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].error, 'ABORT_ERR');
  assert.equal(result.results[1].status, 'not_run');
});


test('CLI discovery is JSON and invalid profiles exit nonzero before execution', () => {
  const cli = fileURLToPath(new URL('../agent.mjs', import.meta.url));
  const list = spawnSync(process.execPath, [cli, 'list'], { encoding: 'utf8' });
  assert.equal(list.status, 0);
  assert.ok(JSON.parse(list.stdout).profiles.core.length > 0);
  const invalid = spawnSync(process.execPath, [cli, 'verify', 'does-not-exist'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown profile/);
});
