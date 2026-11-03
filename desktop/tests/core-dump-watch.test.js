import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { coreDumping, watchCoreDumps } from '../core-dump-watch.js';

const status = dumping => `Name:\tTypeSafe Place\nState:\tR (running)\nPid:\t4242\n${dumping === undefined ? '' : `CoreDumping:\t${dumping}\n`}Threads:\t1\n`;
const nextTick = () => new Promise(resolve => setTimeout(resolve, 30));

test('only a process the kernel is dumping counts', () => {
  assert.equal(coreDumping(status(1)), true);
  for (const text of [status(0), status(undefined), '', null, 'CoreDumping:\t10\n', 'XCoreDumping:\t1\n']) assert.equal(coreDumping(text), false, JSON.stringify(text));
});

test('a renderer seen dumping core is ended with SIGKILL, so render-process-gone and the recovery need not wait for the collector', async () => {
  // A real process stands in for the crashed renderer; only its /proc status is synthetic.
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const ended = [], read = new Set();
  let dumping = false;
  const stop = watchCoreDumps({ pid: () => child.pid, readStatus: async id => (read.add(id), status(dumping ? 1 : 0)), onEnd: id => ended.push(id), intervalMs: 10 });
  try {
    await nextTick();
    assert.equal(child.exitCode, null, 'a healthy renderer is left alone');
    assert.deepEqual([[...read], ended], [[child.pid], []]);
    dumping = true;
    const { code, signal } = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('the watched process was not ended within 5 s')), 5000))]);
    // Windows has no signals: process.kill ends the process and Node reports an exit code.
    if (process.platform === 'win32') assert.notEqual(code, null, 'the process was ended');
    else assert.equal(signal, 'SIGKILL');
    assert.deepEqual(ended, [child.pid]);
  } finally { stop(); child.kill('SIGKILL'); }
});

test('a renderer is ended once, even while it still reads as dumping before it exits', async () => {
  const kills = [], ended = [];
  let renderer = 4242;
  const stop = watchCoreDumps({ pid: () => renderer, readStatus: async () => status(1), kill: id => kills.push(id), onEnd: id => ended.push(id), intervalMs: 5 });
  await nextTick();
  assert.deepEqual([kills, ended], [[4242], [4242]], 'the dying process may linger for a tick; it is not signalled again');
  renderer = 4343;
  await nextTick(); stop();
  assert.deepEqual([kills, ended], [[4242, 4343], [4242, 4343]], 'the next renderer is watched as usual');
});

test('no renderer, an unreadable status or a process already gone ends nothing', async () => {
  const kills = [], ended = [];
  for (const options of [
    { pid: () => 0, readStatus: async () => status(1) },
    { pid: () => undefined, readStatus: async () => status(1) },
    { pid: () => 4242, readStatus: async () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); } },
  ]) {
    const stop = watchCoreDumps({ ...options, kill: id => kills.push(id), onEnd: id => ended.push(id), intervalMs: 5 });
    await nextTick(); stop();
  }
  assert.deepEqual([kills, ended], [[], []]);
  const stop = watchCoreDumps({ pid: () => 4242, readStatus: async () => status(1), kill: () => { throw Object.assign(new Error('no such process'), { code: 'ESRCH' }); }, onEnd: id => ended.push(id), intervalMs: 5 });
  await nextTick(); stop();
  assert.deepEqual(ended, [], 'a renderer that exited on its own is not reported as ended');
});

test('a renderer replaced while its status was being read, or a watch stopped meanwhile, ends nothing', async () => {
  const kills = [];
  let renderer = 4242, release;
  const pending = () => new Promise(resolve => { release = () => resolve(status(1)); });
  // The read resolves "dumping" only after the window has moved to a new renderer.
  let stop = watchCoreDumps({ pid: () => renderer, readStatus: pending, kill: id => kills.push(id), intervalMs: 5 });
  await nextTick(); renderer = 0; release(); await nextTick(); stop();
  assert.deepEqual(kills, [], 'the PID is checked again after the read, so a reused PID is never signalled');
  renderer = 4242;
  stop = watchCoreDumps({ pid: () => renderer, readStatus: pending, kill: id => kills.push(id), intervalMs: 5 });
  await nextTick(); stop(); release(); await nextTick();
  assert.deepEqual(kills, [], 'a read that finishes after stop() kills nothing');
});

test('a status the app may not read is reported once, not swallowed', async () => {
  const reports = [];
  const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  const stop = watchCoreDumps({ pid: () => 4242, readStatus: async () => { throw denied; }, kill: () => assert.fail('nothing to kill'), onUnreadable: (id, error) => reports.push([id, error.code]), intervalMs: 5 });
  await nextTick(); stop();
  assert.deepEqual(reports, [[4242, 'EACCES']], 'for example /proc mounted with hidepid: the watch cannot help and says so once');
  const gone = watchCoreDumps({ pid: () => 4242, readStatus: async () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); }, onUnreadable: () => reports.push('gone'), intervalMs: 5 });
  await nextTick(); gone();
  assert.equal(reports.length, 1, 'a renderer that has exited is not a problem to report');
});

test('stopping the watch stops the polling', async () => {
  let reads = 0;
  const stop = watchCoreDumps({ pid: () => 4242, readStatus: async () => { reads++; return status(0); }, intervalMs: 5 });
  await nextTick(); stop();
  const after = reads;
  await nextTick();
  assert.ok(after > 0);
  assert.equal(reads, after);
});

test('on Linux the real status of a live process parses as not dumping', { skip: process.platform !== 'linux' && 'needs /proc' }, async () => {
  const text = await readFile(`/proc/${process.pid}/status`, 'utf8');
  assert.match(text, /^CoreDumping:\s*0$/m, 'the kernel reports the field (Linux 4.15+)');
  assert.equal(coreDumping(text), false);
});

test('on Linux the watch reads a live process\'s real /proc status and leaves it alone', { skip: process.platform !== 'linux' && 'needs /proc' }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const kills = [], reports = [];
  const stop = watchCoreDumps({ pid: () => child.pid, kill: id => kills.push(id), onUnreadable: (id, error) => reports.push(error.code), intervalMs: 10 });
  try {
    await nextTick(); await nextTick();
    assert.deepEqual([kills, reports, child.exitCode], [[], [], null]);
  } finally { stop(); child.kill('SIGKILL'); }
});
