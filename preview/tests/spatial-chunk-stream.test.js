import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialChunkStream } from '../src/spatial-chunk-stream.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const chunk = (id, x = 0) => ({ id, bounds: [x, 0, x + 10, 10], estimatedBytes: 10 });
function harness(options = {}) {
  let time = 0, allocations = 0, disposals = 0;
  const attached = new Set(), loads = [];
  const resource = () => { allocations++; return { bytes: 10, dispose() { disposals++; } }; };
  const stream = createSpatialChunkStream({ chunks: [chunk('a')], prefetchDistance: 5, unloadDistance: 15,
    retryDelayMs: 100, loadTimeoutMs: 500, maxBytes: 100, maxResident: 1, maxConcurrent: 1,
    now: () => time, load: async (item, signal) => { loads.push({ item, signal }); return resource(); },
    attach: (item, value) => attached.add(value), detach: (item, value) => attached.delete(value), ...options });
  return { stream, attached, loads, resource, tick: ms => { time += ms; }, counts: () => ({ allocations, disposals }) };
}

test('prefetches before entry, deduplicates updates, retains hysteresis, unloads and disposes once', async () => {
  const h = harness();
  h.stream.update([[-6, 5]]); await flush(); assert.equal(h.loads.length, 0);
  for (let i = 0; i < 50; i++) h.stream.update([[-4, 5]]);
  await flush(); assert.equal(h.loads.length, 1); assert.equal(h.stream.ready('a'), true); assert.equal(h.attached.size, 1);
  h.stream.update([[-14, 5]]); await flush(); assert.equal(h.attached.size, 1);
  h.stream.update([[-16, 5]]); assert.equal(h.attached.size, 0); assert.equal(h.stream.ready('a'), false);
  h.stream.dispose(); h.stream.dispose(); assert.deepEqual(h.counts(), { allocations: 1, disposals: 1 });
});

test('prioritizes nearer chunks and enforces resident, byte and concurrent ceilings', async () => {
  const h = harness({ chunks: [chunk('far', 20), chunk('near')], prefetchDistance: 30, unloadDistance: 40 });
  h.stream.update([[5, 5]]); await flush(); assert.equal(h.loads[0].item.id, 'near'); assert.equal(h.loads.length, 1);
  h.stream.update([[25, 5]]); await flush(); assert.equal(h.stream.ready('near'), false); assert.equal(h.stream.ready('far'), true);
  assert.equal(h.attached.size, 1); assert.equal(h.stream.debug().residentBytes, 10);
  h.stream.dispose(); assert.deepEqual(h.counts(), { allocations: 2, disposals: 2 });
  const small = harness({ maxBytes: 5 }); small.stream.update([[5, 5]]); await flush();
  assert.equal(small.loads.length, 0); assert.equal(small.stream.ready('a'), false); small.stream.dispose();
});

test('failures back off, retry automatically and recover without duplicate attachments', async () => {
  let calls = 0;
  const h = harness({ load: async () => { if (++calls < 2) throw new Error('offline'); return h.resource(); } });
  h.stream.update([[5, 5]]); await flush(); assert.equal(h.stream.debug().chunks[0].state, 'failed');
  h.stream.update([[5, 5]]); await flush(); assert.equal(calls, 1);
  h.tick(100); h.stream.update([[5, 5]]); await flush(); assert.equal(calls, 2); assert.equal(h.attached.size, 1);
  h.stream.dispose();
});

test('late completion after leaving or teardown is disposed without attaching', async () => {
  let resolve, signal;
  const h = harness({ load: (_chunk, abort) => { signal = abort; return new Promise(done => { resolve = done; }); } });
  h.stream.update([[5, 5]]); await flush(); h.stream.update([[100, 100]]);
  assert.equal(signal.aborted, true); h.stream.dispose(); resolve(h.resource()); await flush();
  assert.equal(h.attached.size, 0); assert.deepEqual(h.counts(), { allocations: 1, disposals: 1 });
});

test('rapid exit and reentry keep one physical request and replace its stale result exactly once', async () => {
  const requests = [];
  const h = harness({ load: (_chunk, signal) => new Promise(resolve => requests.push({ signal, resolve })) });
  h.stream.update([[5, 5]]); await flush();
  for (let i = 0; i < 100; i++) {
    h.stream.update([[100, 100]]); h.stream.update([[5, 5]]);
  }
  await flush();
  assert.equal(requests.length, 1); assert.equal(requests[0].signal.aborted, true);
  assert.equal(h.stream.debug().pending, 1); assert.equal(h.attached.size, 0);
  requests[0].resolve(h.resource()); await flush();
  assert.deepEqual(h.counts(), { allocations: 1, disposals: 1 });
  h.stream.update([[5, 5]]); await flush();
  assert.equal(requests.length, 2);
  requests[1].resolve(h.resource()); await flush();
  assert.equal(h.stream.ready('a'), true); assert.equal(h.attached.size, 1);
  h.stream.dispose(); assert.deepEqual(h.counts(), { allocations: 2, disposals: 2 });
});

test('timeout aborts load and never accumulates promises if a loader ignores cancellation', async () => {
  let calls = 0, resolve, signal;
  const h = harness({ load: (_item, abort) => { calls++; signal = abort; return new Promise(done => { resolve = done; }); } });
  h.stream.update([[5, 5]]); await flush(); h.tick(501); h.stream.update([[5, 5]]);
  assert.equal(signal.aborted, true); assert.equal(h.stream.debug().chunks[0].state, 'stalled');
  for (let i = 0; i < 50; i++) { h.tick(1000); h.stream.retry('a'); h.stream.update([[5, 5]]); }
  await flush(); assert.equal(calls, 1); assert.equal(h.stream.debug().pending, 1);
  resolve(h.resource()); await flush(); assert.equal(h.attached.size, 0);
  h.stream.dispose(); assert.deepEqual(h.counts(), { allocations: 1, disposals: 1 });
});

test('a stalled load settling restores retry capacity without attaching cancelled content', async () => {
  const requests = [];
  const h = harness({ load: () => new Promise(resolve => requests.push(resolve)) });
  h.stream.update([[5, 5]]); await flush(); h.tick(501); h.stream.update([[5, 5]]);
  assert.equal(h.stream.debug().chunks[0].state, 'stalled');
  requests[0](h.resource()); await flush();
  assert.equal(h.stream.debug().pending, 0); assert.equal(h.attached.size, 0);
  assert.equal(h.stream.debug().chunks[0].state, 'failed');
  h.tick(100); h.stream.update([[5, 5]]); await flush();
  assert.equal(requests.length, 2);
  requests[1](h.resource()); await flush();
  assert.equal(h.stream.ready('a'), true); assert.equal(h.attached.size, 1);
  h.stream.dispose(); assert.deepEqual(h.counts(), { allocations: 2, disposals: 2 });
});

test('oversized resources and attachment errors release allocations and retry safely', async () => {
  const h = harness({ load: async () => ({ ...h.resource(), bytes: 101 }) });
  h.stream.update([[5, 5]]); await flush(); assert.equal(h.stream.ready('a'), false);
  assert.deepEqual(h.counts(), { allocations: 1, disposals: 1 }); h.stream.dispose();
  const broken = harness({ attach: () => { throw new Error('renderer unavailable'); } });
  broken.stream.update([[5, 5]]); await flush(); assert.equal(broken.stream.ready('a'), false);
  assert.deepEqual(broken.counts(), { allocations: 1, disposals: 1 }); broken.stream.dispose();
});

test('twenty round trips keep allocations bounded and preserve multiple view anchors', async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) {
    h.stream.update([[5, 5]]); await flush(); assert.equal(h.attached.size, 1);
    h.stream.update([[100, 5], [5, 5]]); assert.equal(h.attached.size, 1);
    h.stream.update([[100, 5]]); assert.equal(h.attached.size, 0);
    assert.deepEqual(h.counts(), { allocations: i + 1, disposals: i + 1 });
  }
  h.stream.dispose(); assert.equal(h.stream.debug().loads, 20); assert.equal(h.stream.debug().residentBytes, 0);
});

test('invalid positions do not evict a valid scene and invalid definitions fail closed', async () => {
  const h = harness(); h.stream.update([[5, 5]]); await flush(); h.stream.update([[NaN, 5]]);
  assert.equal(h.stream.ready('a'), true); h.stream.dispose();
  assert.throws(() => harness({ chunks: [chunk('a'), chunk('a')] }), /chunk/i);
  assert.throws(() => harness({ maxConcurrent: 0 }), /limit/i);
});

test('state(id) follows one chunk without building the debug picture: absent, loading, ready, failed, stalled, disposed', async () => {
  let offline = false, hanging = false;
  const h = harness({ load: async () => { if (offline) throw new Error('offline'); if (hanging) return new Promise(() => {}); return h.resource(); } });
  const agree = expected => { assert.equal(h.stream.state('a'), expected); assert.equal(h.stream.debug().chunks[0].state, expected); };
  agree('absent'); assert.equal(h.stream.state('nowhere'), null);
  h.stream.update([[5, 5]]); agree('loading');
  await flush(); agree('ready');
  h.stream.update([[100, 5]]); agree('absent');
  offline = true; h.stream.update([[5, 5]]); await flush(); agree('failed');
  offline = false; hanging = true; h.tick(100); h.stream.update([[5, 5]]); agree('loading');
  h.tick(500); h.stream.update([[5, 5]]); agree('stalled');
  h.stream.dispose(); assert.equal(h.stream.state('a'), 'absent');
});

test('the texture ceiling admits on estimate and refuses on measure, separately from the geometry one', async () => {
  // Two chunks of 10 geometry bytes, under a 100 byte ceiling; their textures, 60 each, cannot both sit under 100.
  const textured = bytes => ({ bytes: 10, textureBytes: bytes, dispose() {} });
  const chunks = [{ ...chunk('a'), estimatedTextureBytes: 60 }, { ...chunk('b', 12), estimatedTextureBytes: 60 }];
  const h = harness({ chunks, maxResident: 2, maxTextureBytes: 100, prefetchDistance: 30, unloadDistance: 40,
    load: async item => (h.loads.push({ item }), textured(60)) });
  h.stream.update([[5, 5]]); await flush(); await flush();
  assert.equal(h.stream.ready('a'), true); assert.equal(h.stream.ready('b'), false, 'b waits: its estimate would pass the texture ceiling');
  assert.equal(h.loads.length, 1); assert.deepEqual([h.stream.debug().residentBytes, h.stream.debug().residentTextureBytes], [10, 60]);
  h.stream.update([[17, 5]]); await flush(); await flush();
  assert.equal(h.stream.ready('b'), true); assert.equal(h.stream.ready('a'), false, 'nearer b takes the texture budget');
  h.stream.dispose(); assert.equal(h.stream.debug().residentTextureBytes, 0);
  // A loaded chunk measuring past the ceiling is disposed and marked failed; a flat estimate admits it, the measure refuses it.
  const over = harness({ chunks: [{ ...chunk('a'), estimatedTextureBytes: 0 }], maxTextureBytes: 50,
    load: async () => ({ bytes: 10, textureBytes: 70, dispose() { over.disposed = (over.disposed ?? 0) + 1; } }) });
  over.stream.update([[5, 5]]); await flush(); await flush();
  assert.equal(over.stream.state('a'), 'failed'); assert.equal(over.disposed, 1); assert.equal(over.stream.debug().residentTextureBytes, 0);
  over.stream.dispose();
  // Without a texture ceiling nothing changes: untextured resources count zero.
  const plain = harness(); plain.stream.update([[5, 5]]); await flush();
  assert.equal(plain.stream.ready('a'), true); assert.equal(plain.stream.debug().residentTextureBytes, 0); plain.stream.dispose();
  assert.throws(() => createSpatialChunkStream({ chunks: [{ ...chunk('a'), estimatedTextureBytes: -1 }], load() {}, attach() {}, detach() {} }), /Invalid chunk definition/);
  assert.throws(() => createSpatialChunkStream({ chunks: [chunk('a')], maxTextureBytes: 0, load() {}, attach() {}, detach() {} }), /Invalid/);
});
