import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProfile, selectTasks } from '../agent.mjs';
import { holdBrowserLock } from '../browser-lock.mjs';
import { createQueue } from '../local-queue.mjs';

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
test('a task env applies to its own command only', async t => {
  const options = fixture(t), env = { ...process.env, RIVER_OAKS_AGENT_TEST_SETTING: '' };
  const result = await runProfile('fixture', [
    task('own', 'process.exit(process.env.RIVER_OAKS_AGENT_TEST_SETTING === "own" ? 0 : 3)', { env: { RIVER_OAKS_AGENT_TEST_SETTING: 'own' } }),
    task('later', 'process.exit(process.env.RIVER_OAKS_AGENT_TEST_SETTING === "" ? 0 : 4)'),
  ], { ...options, env });
  assert.deepEqual(result.results.map(r => r.status), ['passed', 'passed']);
  assert.equal(env.RIVER_OAKS_AGENT_TEST_SETTING, '');
});
test('a timed out process fails rather than hanging verification', async t => {
  const result = await runProfile('fixture', [task('hang', 'setInterval(() => {}, 1000)', { timeoutMs: 100 })], fixture(t));
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].error, 'ETIMEDOUT');
});

function browserFixture(t) {
  const options = fixture(t);
  const env = { ...process.env, CI: '', RIVER_OAKS_BROWSER_LOCK: '', RIVER_OAKS_BROWSER_LOCK_HELD: '',
    RIVER_OAKS_BROWSER_LOCK_DIR: options.root, RIVER_OAKS_BROWSER_LOCK_POLL: '20' };
  const queue = createQueue({ file: join(options.root, 'river-oaks-browser-runs.json'), lock: join(options.root, 'river-oaks-browser-runs.lock') });
  return { ...options, env, queue };
}

test('browser queue admission does not consume the command execution timeout', async t => {
  const options = browserFixture(t), marker = join(options.root, 'started');
  const release = await holdBrowserLock('other session', { env: { ...options.env }, log: () => {} });
  t.after(release);
  const wrapper = fileURLToPath(new URL('../browser-lock.mjs', import.meta.url));
  // The command waits longer in the queue (2.5 s) than its whole timeout (2 s), so it
  // passes only if queueing is not counted; the 2 s lets two Node processes start under load.
  const pending = runProfile('fixture', [{ id: 'browser', browser: true, timeoutMs: 2000,
    command: [process.execPath, wrapper, 'nested browser', '--', process.execPath, '-e', 'require("fs").writeFileSync(process.argv[1], "started")', marker] }], options);
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal(existsSync(marker), false, 'the queued command must not launch before admission');
  release();
  const result = await pending;
  assert.equal(result.status, 'passed');
  assert.equal(existsSync(marker), true);
  assert.ok(result.results[0].queueDurationMs >= 2400);
  assert.equal(options.env.RIVER_OAKS_BROWSER_LOCK_HELD, '', 'a released task must not leak a nesting token into later tasks');
  assert.deepEqual(options.queue.list(), []);
});

test('a browser command still times out after admission and releases its queue claim', async t => {
  const options = browserFixture(t);
  const result = await runProfile('fixture', [task('browser hang', 'setInterval(() => {}, 1000)', { browser: true, timeoutMs: 100 })], options);
  assert.equal(result.results[0].error, 'ETIMEDOUT');
  assert.deepEqual(options.queue.list(), []);
});

test('interrupting browser admission never starts the command or leaves a queue claim', async t => {
  const options = browserFixture(t), controller = new AbortController(), marker = join(options.root, 'started');
  const release = await holdBrowserLock('other session', { env: { ...options.env }, log: () => {} });
  t.after(release);
  const pending = runProfile('fixture', [task('queued', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'started')`, { browser: true }), task('later', 'process.exit(0)')], { ...options, signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 100));
  controller.abort();
  const result = await pending;
  assert.equal(result.results[0].error, 'ABORT_ERR');
  assert.equal(result.results[1].status, 'not_run');
  assert.equal(existsSync(marker), false);
  assert.equal(options.queue.list().length, 1, 'only the other session retains its claim');
});

test('catalog profiles resolve and pnpm commands refer to real scripts', () => {
  const config = JSON.parse(readFileSync(new URL('../../config/agent-workflow.json', import.meta.url)));
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.equal(new Set(config.tasks.map(t => t.id)).size, config.tasks.length);
  for (const profile of Object.keys(config.profiles)) {
    const tasks = selectTasks(config, profile);
    assert.ok(tasks.length > 0);
    for (const task of tasks) {
      assert.ok(task.command.length > 0);
      // Built-in pnpm commands (for example audit) do not need package scripts.
      if (task.command[0] === 'pnpm' && ['run', 'test'].includes(task.command[1])) {
        const script = task.command[1] === 'run' ? task.command[2] : task.command[1];
        assert.ok(Object.hasOwn(pkg.scripts, script), `Missing pnpm script: ${script}`);
      }
    }
  }
  assert.ok(selectTasks(config, 'full').some(t => t.requiresEnv?.includes('REDIS_URL')));
});

// The Commons journey ran last in the 17-journey experience stage and was the one its
// 20-minute deadline killed under load (D12, docs/acceptance/mvp-release-readiness-20261024.md).
test('the Commons journey runs in its own stage with its own report', () => {
  const config = JSON.parse(readFileSync(new URL('../../config/agent-workflow.json', import.meta.url)));
  for (const profile of ['browser', 'full']) {
    const stages = selectTasks(config, profile).filter(t => t.command.join(' ').startsWith('pnpm run test:experience '));
    const journeys = stages.flatMap(t => t.command.slice(3));
    assert.equal(new Set(journeys).size, journeys.length, `${profile} runs a journey twice`);
    assert.deepEqual(stages.filter(t => t.command.includes('east-garden-commons')).map(t => t.command.slice(3)), [['east-garden-commons']]);
    const reports = stages.map(t => t.env?.RIVER_OAKS_E2E_REPORT ?? 'experience.json');
    assert.equal(new Set(reports).size, stages.length, `${profile} stages overwrite each other's report`);
    assert.ok(stages.every(t => t.browser));
  }
  assert.equal(config.tasks.find(t => t.id === 'experience').timeoutMs, 1200000);
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
