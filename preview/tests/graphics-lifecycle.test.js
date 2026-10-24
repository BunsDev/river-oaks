import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsRecovery } from '../src/graphics-recovery.js';
import { bindGraphicsRecovery } from '../src/graphics-lifecycle.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('real context events pause immediately and resume only after GPU rebuild', async () => {
  const canvas = new EventTarget(), job = deferred(), changes = [];
  const recovery = createGraphicsRecovery({ onChange: value => changes.push(value.state) });
  const binding = bindGraphicsRecovery({ canvas, recovery, rebuild: () => job.promise });
  const loss = new Event('webglcontextlost', { cancelable: true }); canvas.dispatchEvent(loss);
  assert.equal(loss.defaultPrevented, true); assert.equal(recovery.state, 'lost');
  canvas.dispatchEvent(new Event('webglcontextrestored')); await flush();
  assert.equal(recovery.state, 'lost'); job.resolve(); await flush();
  assert.equal(recovery.state, 'ok'); assert.deepEqual(changes, ['lost', 'ok']);
  binding.dispose();
});

test('a second loss fences an earlier asynchronous rebuild and queued frame', async () => {
  const canvas = new EventTarget(), jobs = [], commits = [];
  const recovery = createGraphicsRecovery();
  const binding = bindGraphicsRecovery({ canvas, recovery, rebuild: async isCurrent => {
    const job = deferred(); jobs.push(job); await job.promise;
    if (isCurrent()) commits.push('rebuilt');
  } });
  let frames = 0; const staleFrame = binding.frame(() => frames++);
  canvas.dispatchEvent(new Event('webglcontextlost')); canvas.dispatchEvent(new Event('webglcontextrestored')); await flush();
  canvas.dispatchEvent(new Event('webglcontextlost')); jobs[0].resolve(); await flush(); staleFrame();
  assert.equal(frames, 0); assert.deepEqual(commits, []); assert.equal(recovery.state, 'lost');
  canvas.dispatchEvent(new Event('webglcontextrestored')); await flush(); jobs[1].resolve(); await flush();
  binding.frame(() => frames++)(); assert.equal(frames, 1); assert.deepEqual(commits, ['rebuilt']);
  binding.dispose();
});

test('failed or disposed restoration never commits a late rebuild', async () => {
  for (const action of ['timeout', 'dispose']) {
    const canvas = new EventTarget(), job = deferred(); let timer;
    const recovery = createGraphicsRecovery({ setTimer: callback => { timer = callback; return 1; }, clearTimer() {} });
    let current;
    const binding = bindGraphicsRecovery({ canvas, recovery, rebuild: isCurrent => { current = isCurrent; return job.promise; } });
    canvas.dispatchEvent(new Event('webglcontextlost')); canvas.dispatchEvent(new Event('webglcontextrestored')); await flush();
    if (action === 'timeout') timer(); else binding.dispose();
    assert.equal(current(), false); job.resolve(); await flush(); assert.notEqual(recovery.state, 'ok');
    binding.dispose();
  }
});

test('a rebuild exception becomes a visible retry failure', async () => {
  const canvas = new EventTarget(), recovery = createGraphicsRecovery();
  const binding = bindGraphicsRecovery({ canvas, recovery, rebuild: () => { throw new Error('GPU refused'); } });
  canvas.dispatchEvent(new Event('webglcontextlost')); canvas.dispatchEvent(new Event('webglcontextrestored')); await flush();
  assert.equal(recovery.state, 'failed'); binding.dispose();
});

test('retry cannot revive a timed-out rebuild before the native loss event arrives', async () => {
  const canvas = new EventTarget(), job = deferred(); let timeout, current, commits = 0;
  const recovery = createGraphicsRecovery({ setTimer: callback => { timeout = callback; return 1; }, clearTimer() {} });
  const extension = { loseContext() {}, restoreContext() {} };
  const binding = bindGraphicsRecovery({ canvas, recovery, getContext: () => ({ getExtension: () => extension, isContextLost: () => false }),
    rebuild: async isCurrent => { current = isCurrent; await job.promise; if (isCurrent()) commits++; } });
  canvas.dispatchEvent(new Event('webglcontextlost')); canvas.dispatchEvent(new Event('webglcontextrestored')); await flush();
  timeout(); assert.equal(current(), false);
  binding.retry(() => assert.fail('extension exists'));
  assert.equal(current(), false); job.resolve(); await flush();
  assert.equal(commits, 0); assert.equal(recovery.state, 'restoring'); binding.dispose();
});

test('retry uses the extension acquired before loss when getExtension is unavailable on a lost context', () => {
  const canvas = new EventTarget(); let lost = false, restored = 0, fallback = 0;
  const extension = { restoreContext() { restored++; }, loseContext() {} };
  const gl = { isContextLost: () => lost, getExtension: () => lost ? null : extension };
  canvas.getContext = () => gl;
  const recovery = createGraphicsRecovery();
  const binding = bindGraphicsRecovery({ canvas, recovery, getContext: () => gl, rebuild() {} });
  lost = true; canvas.dispatchEvent(new Event('webglcontextlost')); recovery.failed('timeout');
  binding.retry(() => fallback++);
  assert.equal(restored, 1); assert.equal(fallback, 0); assert.equal(recovery.state, 'restoring'); binding.dispose();
});

test('once a deliberate retry also times out, retry offers the guarded reload instead of retrying forever', () => {
  const canvas = new EventTarget(); let restores = 0, fallbacks = 0, timeout;
  const extension = { restoreContext() { restores++; }, loseContext() {} };
  const gl = { isContextLost: () => true, getExtension: () => extension };
  const recovery = createGraphicsRecovery({ setTimer: callback => { timeout = callback; return 1; }, clearTimer() {} });
  const binding = bindGraphicsRecovery({ canvas, recovery, getContext: () => gl, rebuild() {} });
  canvas.dispatchEvent(new Event('webglcontextlost')); timeout(); assert.equal(recovery.state, 'failed');
  // The first failure is the browser's own restore missing its deadline: retry in place.
  binding.retry(() => fallbacks++); assert.deepEqual([restores, fallbacks, recovery.state], [1, 0, 'restoring']);
  timeout(); assert.equal(recovery.state, 'failed');
  binding.retry(() => fallbacks++); assert.deepEqual([restores, fallbacks, recovery.state], [1, 1, 'failed']);
  // A reload the page refused (e.g. a retained photo) can be offered again.
  binding.retry(() => fallbacks++); assert.deepEqual([restores, fallbacks], [1, 2]);
  binding.dispose();
});
