import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScaleGovernor, normalizeQuality, DEFAULT_QUALITY, QUALITY_MODES } from '../src/render-quality.js';

const feed = (governor, ms, windows, size = 45) => { for (let i = 0; i < windows * size; i++) governor.sample(ms); return governor.scale; };
const tailWindow = (governor, missed = 7) => {
  for (let frame = 0; frame < 45; frame++) governor.sample(frame < missed ? 33.3 : 16.7);
};

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

test('by default Auto keeps AO through fast-median tails, and still sheds it under steady overload', () => {
  const governor = createRenderScaleGovernor();
  for (let window = 0; window < 10; window++) tailWindow(governor);
  assert.equal(governor.occlusion, true, 'no device has accepted the tail rule yet');
  assert.equal(governor.scale, 1);
  feed(governor, 33.3, 4);
  assert.equal(governor.scale, 0.6, 'steady overload still reduces resolution to the floor');
  assert.equal(governor.occlusion, true);
  feed(governor, 33.3, 2);
  assert.equal(governor.occlusion, false, 'the floor rule still drops AO when pixel scaling cannot meet the budget');
});

test('with the opt-in tail rule, two sustained tail-heavy windows shed AO without reducing the beauty resolution', () => {
  const governor = createRenderScaleGovernor({ tailShedding: true });
  tailWindow(governor);
  assert.equal(governor.occlusion, true, 'one tail-heavy window may be transient');
  tailWindow(governor);
  assert.equal(governor.occlusion, false, 'repeated missed refreshes need a response even with a fast median');
  assert.equal(governor.scale, 1, 'the beauty image stays at native resolution');
  feed(governor, 16.7, 120);
  assert.equal(governor.occlusion, false, 'short calm periods do not restore expensive AO between visits');
  feed(governor, 16.7, 12);
  assert.equal(governor.occlusion, true, 'sustained calm eventually restores AO');
});

test('isolated tails and ordinary single-frame hitches do not disable AO', () => {
  const governor = createRenderScaleGovernor({ tailShedding: true });
  tailWindow(governor);
  feed(governor, 16.7, 1);
  tailWindow(governor);
  assert.equal(governor.occlusion, true, 'a calm window separates unrelated tails');
  for (let window = 0; window < 10; window++) tailWindow(governor, 4);
  assert.equal(governor.occlusion, true, 'four misses per window stay below the sustained threshold');
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

test('blocked storage falls back to Auto instead of aborting the graphics control', async () => {
  const { createQualityControl } = await import('../src/render-quality.js');
  const element = () => ({ dataset: {}, style: {}, setAttribute() {}, append() {}, addEventListener() {}, set textContent(v) {}, set hidden(v) {} });
  const previousDocument = globalThis.document, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.document = { createElement: element };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Access is denied', 'SecurityError'); } });
  try {
    let applied = null;
    const control = createQualityControl({ apply: value => { applied = value; } });
    assert.ok(control, 'the control is created');
    assert.equal(applied?.mode ?? control.mode ?? 'auto', 'auto');
  } finally {
    globalThis.document = previousDocument;
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});

test('manual quality choices keep their AO policy and returning to Auto resets the tail state', async () => {
  const { createQualityControl } = await import('../src/render-quality.js');
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ dataset: {}, setAttribute() {}, append() {}, addEventListener() {}, set textContent(value) {} }) };
  try {
    const applied = [];
    const control = createQualityControl({ storage: { getItem: () => null, setItem() {} }, apply: value => applied.push(value), tailShedding: true });
    control.select('sharp');
    tailWindow(control); tailWindow(control);
    assert.equal(control.mode, 'sharp');
    assert.equal(control.stats.scale, 1);
    assert.equal(control.stats.occlusion, true);
    control.select('smooth');
    tailWindow(control); tailWindow(control);
    assert.deepEqual(applied.at(-1), { mode: 'smooth', scale: 0.75, occlusion: false });
    control.select('auto');
    tailWindow(control); tailWindow(control);
    assert.deepEqual(applied.at(-1), { mode: 'auto', scale: 1, occlusion: false });
    control.select('sharp');
    control.select('auto');
    assert.equal(control.mode, 'auto');
    assert.equal(control.stats.scale, 1);
    assert.equal(control.stats.occlusion, true);
  } finally { globalThis.document = previousDocument; }
});

test('the default Settings control keeps Auto AO through moving-frame tails and reports the policy', async () => {
  const { createQualityControl } = await import('../src/render-quality.js');
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ dataset: {}, setAttribute() {}, append() {}, addEventListener() {}, set textContent(value) {} }) };
  try {
    const applied = [];
    const control = createQualityControl({ storage: { getItem: () => null, setItem() {} }, apply: value => applied.push(value) });
    for (let window = 0; window < 10; window++) tailWindow(control);
    assert.equal(control.mode, 'auto');
    assert.deepEqual(applied.at(-1), { mode: 'auto', scale: 1, occlusion: true });
    assert.equal(control.stats.tailShedding, false, 'receipts record that the tail rule was off');
  } finally { globalThis.document = previousDocument; }
});
