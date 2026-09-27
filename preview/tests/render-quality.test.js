import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScaleGovernor, normalizeQuality, DEFAULT_QUALITY, QUALITY_MODES } from '../src/render-quality.js';

const feed = (governor, ms, windows, size = 45) => { for (let i = 0; i < windows * size; i++) governor.sample(ms); return governor.scale; };

test('a steady 60 Hz frame keeps native resolution', () => {
  const governor = createRenderScaleGovernor();
  assert.equal(feed(governor, 16.7, 20), 1);
});

test('missed refreshes step resolution down to a floor', () => {
  const governor = createRenderScaleGovernor();
  assert.equal(feed(governor, 33.3, 1), 0.85);
  assert.equal(feed(governor, 33.3, 20), 0.6, 'never below the floor');
});

test('recovery is gradual and never returns straight to a scale that just failed', () => {
  const governor = createRenderScaleGovernor();
  feed(governor, 33.3, 1);
  assert.equal(governor.scale, 0.85);
  assert.equal(feed(governor, 16.7, 3), 0.95, 'three calm windows earn one step');
  assert.equal(feed(governor, 16.7, 3), 0.95, 'the failed native scale waits out its ceiling');
  assert.equal(feed(governor, 16.7, 12), 1, 'the ceiling lifts after its wait');
});

test('a borderline GPU settles instead of oscillating', () => {
  // Frames are slow only at 0.95 and above.
  const governor = createRenderScaleGovernor(); let changes = 0, previous = governor.scale;
  for (let window = 0; window < 200; window++) {
    feed(governor, governor.scale >= 0.95 ? 33.3 : 16.7, 1);
    if (governor.scale !== previous) { changes++; previous = governor.scale; }
  }
  assert.ok(governor.scale < 0.95);
  assert.ok(changes < 20, `settled after ${changes} changes`);
});

test('tab switches and loading hitches are not a workload', () => {
  const governor = createRenderScaleGovernor();
  for (let i = 0; i < 500; i++) governor.sample(i % 2 ? 900 : NaN);
  assert.equal(governor.scale, 1);
});

test('unknown stored preferences fall back to Auto', () => {
  assert.equal(DEFAULT_QUALITY, 'auto');
  for (const key of Object.keys(QUALITY_MODES)) assert.equal(normalizeQuality(key), key);
  for (const value of [null, '', 'ultra', '__proto__', 'toString']) assert.equal(normalizeQuality(value), 'auto');
});

test('persistent overload at minimum resolution drops ambient occlusion, with gradual recovery', () => {
  const governor = createRenderScaleGovernor();
  assert.equal(governor.occlusion, true);
  feed(governor, 33.3, 6);
  assert.equal(governor.scale, 0.6);
  assert.equal(governor.occlusion, false, 'extra geometry pass is removed when resolution cannot help');
  feed(governor, 16.7, 3);
  assert.equal(governor.occlusion, false, 'a brief recovery must not reintroduce the expensive pass');
  feed(governor, 16.7, 100);
  assert.equal(governor.scale, 1);
  assert.equal(governor.occlusion, true, 'sustained native-resolution recovery restores detail');
  feed(governor, 33.3, 6);
  governor.reset();
  assert.equal(governor.occlusion, true, 'selecting Auto again retries full detail');
});
