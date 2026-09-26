import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describeAssetProgress, trackAssetProgress } from '../src/asset-progress.js';

function harness() {
  const manager = new THREE.LoadingManager(), states = [], timers = [];
  const tracker = trackAssetProgress(manager, state => states.push(state), {
    schedule: (callback) => { timers.push(callback); return timers.length; },
    cancel: (id) => { if (id) timers[id - 1] = null; },
  });
  const flush = () => { const pending = timers.splice(0); pending.forEach(callback => callback?.()); };
  return { manager, states, tracker, flush };
}

test('progress counts finished files and never runs backwards', () => {
  const { manager, states } = harness();
  manager.itemStart('sky.hdr'); manager.itemStart('tree.glb');
  manager.itemEnd('sky.hdr');
  assert.deepEqual([states.at(-1).loaded, states.at(-1).total], [1, 2]);
  const before = states.at(-1).fraction;
  // Characters start while the trees are still arriving.
  for (const url of ['a.glb', 'b.glb', 'c.glb']) manager.itemStart(url);
  assert.equal(states.at(-1).total, 2, 'a running batch reports on the next finished file');
  manager.itemEnd('tree.glb');
  assert.deepEqual([states.at(-1).loaded, states.at(-1).total], [2, 5]);
  assert.ok(states.at(-1).fraction >= before, 'late loads never pull the bar back');
  assert.ok(states.at(-1).fraction < 1);
});

test('completion waits for a quiet moment so chained loads do not flash done', () => {
  const { manager, states, flush } = harness();
  manager.itemStart('district.glb'); manager.itemEnd('district.glb');
  assert.equal(states.at(-1).done, false);
  manager.itemStart('resident.glb'); // queued by the finished file
  flush();
  assert.equal(states.at(-1).done, false, 'the restarted batch cancelled the pending completion');
  manager.itemEnd('resident.glb'); flush();
  assert.equal(states.at(-1).done, true);
  assert.equal(states.at(-1).fraction, 1);
  assert.equal(states.at(-1).active, false);
});

test('failures are counted and named in the completion message', () => {
  const { manager, states, flush } = harness();
  manager.itemStart('a.jpg'); manager.itemStart('b.jpg');
  manager.itemError('a.jpg'); manager.itemEnd('a.jpg'); manager.itemEnd('b.jpg'); flush();
  assert.equal(states.at(-1).failed, 1);
  assert.equal(describeAssetProgress(states.at(-1)), 'District ready · 1 detail unavailable');
  assert.equal(describeAssetProgress({ loaded: 3, total: 9, failed: 0, done: false }), 'Bringing the district to life · 3 of 9');
  assert.equal(describeAssetProgress({ loaded: 9, total: 9, failed: 0, done: true }), 'District ready');
});

test('disposing releases the shared loading manager', () => {
  const { manager, tracker } = harness();
  tracker.dispose();
  for (const key of ['onStart', 'onProgress', 'onError', 'onLoad']) assert.equal(manager[key], undefined);
});

test('callers can wait for one kind of asset, with a timeout', async () => {
  const { manager, tracker, flush } = harness();
  manager.itemStart('/assets/materials/stone-color.jpg'); manager.itemStart('/assets/characters/jevica.glb');
  let surfaces = null;
  tracker.settled(url => url.includes('/materials/')).then(value => { surfaces = value; });
  await Promise.resolve();
  assert.equal(surfaces, null, 'the stone texture is still loading');
  manager.itemEnd('/assets/characters/jevica.glb'); await Promise.resolve();
  assert.equal(surfaces, null, 'unrelated files do not settle it');
  manager.itemEnd('/assets/materials/stone-color.jpg'); await Promise.resolve();
  assert.equal(surfaces, true);
  manager.itemStart('/assets/materials/sky.hdr');
  let stuck = null;
  tracker.settled(url => url.includes('/materials/')).then(value => { stuck = value; });
  flush(); await Promise.resolve();
  assert.equal(stuck, false, 'a slow file times out instead of blocking');
});
