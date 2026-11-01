import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FINISH, DEFAULT_QUALITY, readFinishPreference, normalizeQuality, createRenderScaleGovernor } from '../src/render-quality.js';

const storageWith = value => ({ getItem(key) { assert.equal(key, 'river-oaks-finish'); return value; }, setItem() { assert.fail('reading the finish must not persist or reset preferences'); } });
const withGlobal = (key, descriptor, run) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, ...descriptor });
  try { return run(); }
  finally { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; }
};

test('the visual foundation is Pink Jet-Age by default without a URL flag', () => {
  assert.equal(DEFAULT_FINISH, 'pink-jet-age');
  assert.equal(readFinishPreference({ search: '', storage: storageWith(null) }), 'pink-jet-age');
});

test('unrelated URL options do not require an activation flag', () => {
  assert.equal(readFinishPreference({ search: '?quality=smooth&time=15', storage: storageWith(null) }), 'pink-jet-age');
});

test('an unavailable storage object still uses the new default', () => {
  assert.equal(readFinishPreference({ search: '', storage: null }), 'pink-jet-age');
});

test('a storage read error still uses the new default', () => {
  assert.equal(readFinishPreference({ search: '', storage: { getItem() { throw new Error('blocked'); } } }), 'pink-jet-age');
});

test('a blocked global localStorage getter cannot abort startup', () => {
  withGlobal('localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }, () => {
    assert.equal(readFinishPreference({ search: '' }), 'pink-jet-age');
  });
});

test('ordinary browser startup reads the actual location without a finish option', () => {
  withGlobal('location', { value: { search: '?time=15' } }, () => {
    withGlobal('localStorage', { value: storageWith(null) }, () => {
      assert.equal(readFinishPreference(), 'pink-jet-age');
    });
  });
});

test('an explicit Classic URL remains a reversible comparison override', () => {
  assert.equal(readFinishPreference({ search: '?finish=classic', storage: storageWith('pink-jet-age') }), 'classic');
});

test('an explicit Pink Jet-Age URL overrides stored Classic', () => {
  assert.equal(readFinishPreference({ search: '?finish=pink-jet-age', storage: storageWith('classic') }), 'pink-jet-age');
});

test('a saved explicit Classic preference is not silently destroyed', () => {
  assert.equal(readFinishPreference({ search: '', storage: storageWith('classic') }), 'classic');
});

test('a saved Pink Jet-Age preference survives a new reader invocation', () => {
  const storage = storageWith('pink-jet-age');
  assert.equal(readFinishPreference({ search: '', storage }), 'pink-jet-age');
  assert.equal(readFinishPreference({ search: '', storage }), 'pink-jet-age');
});

test('malformed stored finish values use the new default', () => {
  for (const value of ['', null, undefined, 7, {}, 'Pink Jet Age', '../classic', 'x'.repeat(33)]) {
    assert.equal(readFinishPreference({ search: '', storage: storageWith(value) }), 'pink-jet-age');
  }
});

test('malformed explicit finish values use the new default', () => {
  for (const search of ['?finish=', '?finish=Pink%20Jet%20Age', '?finish=..%2Fclassic']) {
    assert.equal(readFinishPreference({ search, storage: storageWith('classic') }), 'pink-jet-age');
  }
});

test('unknown well-formed finish names keep the existing downstream validation contract', () => {
  assert.equal(readFinishPreference({ search: '?finish=future-finish', storage: null }), 'future-finish');
});

test('an unreadable address falls back to the stored choice', () => {
  const search = { toString() { throw new Error('unreadable address'); } };
  assert.equal(readFinishPreference({ search, storage: storageWith('classic') }), 'classic');
});

test('query precedence does not access blocked storage', () => {
  const options = { search: '?finish=classic', storage: { getItem() { assert.fail('query already selected the finish'); } } };
  assert.equal(readFinishPreference(options), 'classic');
});

test('finish selection does not change the graphics quality default', () => {
  assert.equal(DEFAULT_QUALITY, 'auto');
  assert.equal(normalizeQuality(null), 'auto');
  assert.equal(normalizeQuality('smooth'), 'smooth');
});

test('the existing governor still reduces resolution under sustained load', () => {
  const governor = createRenderScaleGovernor();
  for (let i = 0; i < 45; i++) governor.sample(33.3);
  assert.equal(governor.scale, .85);
  for (let i = 0; i < 45 * 20; i++) governor.sample(33.3);
  assert.equal(governor.scale, .6);
  assert.equal(governor.occlusion, false);
});

test('the existing governor still keeps full resolution for a steady frame cadence', () => {
  const governor = createRenderScaleGovernor();
  for (let i = 0; i < 45 * 20; i++) governor.sample(16.7);
  assert.equal(governor.scale, 1);
  assert.equal(governor.occlusion, true);
});
