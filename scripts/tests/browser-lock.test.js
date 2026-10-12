// Several sessions share this machine. Browser journeys that run at once starve
// each other (load averages of 285–384 on 2026-10-11 caused dropped town
// connections and timeouts that looked like code bugs), so local runs take turns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { holdBrowserLock } from '../browser-lock.mjs';
import { createQueue } from '../local-queue.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'river-browser-lock-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const options = (dir, pid, extra = {}) => ({ dir, pid, host: 'here', alive: () => true, env: {}, sleep: () => Promise.resolve(), log: () => {}, ...extra });
const script = new URL('../browser-lock.mjs', import.meta.url).pathname;

test('a second run waits until the first releases the lock', async t => {
  const dir = scratch(t), releaseFirst = await holdBrowserLock('shared-town', options(dir, 1));
  const waits = [];
  const releaseSecond = await holdBrowserLock('experience', options(dir, 2, {
    log: line => waits.push(line),
    sleep: async () => { releaseFirst(); },
  }));
  assert.equal(waits.length, 1);
  assert.match(waits[0], /shared-town/, 'the waiting run names who holds the lock');
  releaseSecond();
  assert.deepEqual(createQueue({ file: join(dir, 'river-oaks-browser-runs.json'), lock: join(dir, 'river-oaks-browser-runs.lock'), host: 'here' }).list(), []);
});

test('a run left by a process that has died does not block', async t => {
  const dir = scratch(t);
  const abandoned = await holdBrowserLock('shared-town', options(dir, 1));
  let waited = 0;
  const release = await holdBrowserLock('experience', options(dir, 2, { alive: pid => pid !== 1, sleep: async () => { waited++; } }));
  assert.equal(waited, 0);
  release(); abandoned();
});

test('a run started by a run that already holds the lock does not wait on it', async t => {
  const dir = scratch(t), env = {};
  const outer = await holdBrowserLock('verify full', options(dir, 1, { env }));
  assert.ok(env.RIVER_OAKS_BROWSER_LOCK_HELD, 'the holder marks its environment for child processes');
  let waited = 0;
  const release = await holdBrowserLock('experience', options(dir, 2, { env: { ...env }, sleep: async () => { waited++; } }));
  assert.equal(waited, 0);
  release(); outer();
});

test('hosted CI and an explicit opt-out skip the lock', async t => {
  const dir = scratch(t);
  for (const env of [{ CI: 'true' }, { RIVER_OAKS_BROWSER_LOCK: 'off' }]) {
    await holdBrowserLock('shared-town', options(dir, 1, { env }));
    assert.deepEqual(createQueue({ file: join(dir, 'river-oaks-browser-runs.json'), lock: join(dir, 'river-oaks-browser-runs.lock'), host: 'here' }).list(), []);
  }
});

// Two real processes run a command through the wrapper at the same time. Each
// writes when it starts and ends; with the lock, the two intervals never overlap.
test('two concurrent wrapped commands run one after the other', async t => {
  const dir = scratch(t), log = join(dir, 'log.txt');
  const step = `require('fs').appendFileSync(${JSON.stringify(log)}, 'start ' + process.pid + '\\n'); setTimeout(() => require('fs').appendFileSync(${JSON.stringify(log)}, 'end ' + process.pid + '\\n'), 600);`;
  const run = () => new Promise((done, fail) => {
    const child = spawn(process.execPath, [script, 'probe', '--', process.execPath, '-e', step], { env: { ...process.env, CI: '', RIVER_OAKS_BROWSER_LOCK: '', RIVER_OAKS_BROWSER_LOCK_HELD: '', RIVER_OAKS_BROWSER_LOCK_DIR: dir, RIVER_OAKS_BROWSER_LOCK_POLL: '50' }, stdio: 'ignore' });
    child.on('error', fail); child.on('close', done);
  });
  const codes = await Promise.all([run(), run()]);
  assert.deepEqual(codes, [0, 0]);
  const events = readFileSync(log, 'utf8').trim().split('\n').map(line => line.split(' ')[0]);
  assert.deepEqual(events, ['start', 'end', 'start', 'end']);
});

test('the wrapper passes the command exit code through and releases the lock', async t => {
  const dir = scratch(t);
  const code = await new Promise(done => spawn(process.execPath, [script, 'probe', '--', process.execPath, '-e', 'process.exit(3)'], { env: { ...process.env, CI: '', RIVER_OAKS_BROWSER_LOCK: '', RIVER_OAKS_BROWSER_LOCK_HELD: '', RIVER_OAKS_BROWSER_LOCK_DIR: dir }, stdio: 'ignore' }).on('close', done));
  assert.equal(code, 3);
  assert.deepEqual(createQueue({ file: join(dir, 'river-oaks-browser-runs.json'), lock: join(dir, 'river-oaks-browser-runs.lock'), host: 'here' }).list(), []);
});
