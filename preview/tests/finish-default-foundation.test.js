import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FINISH, DEFAULT_QUALITY, readFinishPreference, normalizeQuality, createRenderScaleGovernor } from '../src/render-quality.js';

// Classic is retired (#913): the reader no longer consults a saved `river-oaks-finish` choice.
// This storage records every touch, so a test can prove the saved key is neither read, rewritten nor erased.
const storageWith = value => {
  const touched = [];
  return { touched, getItem(key) { touched.push(['getItem', key]); return value; }, setItem(key) { touched.push(['setItem', key]); }, removeItem(key) { touched.push(['removeItem', key]); } };
};
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

test('a storage that would throw is never read', () => {
  let read = false;
  assert.equal(readFinishPreference({ search: '', storage: { getItem() { read = true; throw new Error('blocked'); } } }), 'pink-jet-age');
  assert.equal(read, false);
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

// Until the hosted depth and Five Rooms baselines are re-pinned without Classic, the address
// still names a finish for one page load. It is a harness parameter, not a visitor setting.
test('an explicit Classic URL still selects Classic for one page load', () => {
  assert.equal(readFinishPreference({ search: '?finish=classic', storage: storageWith('pink-jet-age') }), 'classic');
});

test('an explicit Pink Jet-Age URL selects Pink Jet-Age', () => {
  assert.equal(readFinishPreference({ search: '?finish=pink-jet-age', storage: storageWith('classic') }), 'pink-jet-age');
});

test('a saved Classic preference no longer selects Classic, and is neither read nor erased', () => {
  const storage = storageWith('classic');
  assert.equal(readFinishPreference({ search: '', storage }), 'pink-jet-age');
  assert.equal(readFinishPreference({ search: '?time=15', storage }), 'pink-jet-age');
  assert.deepEqual(storage.touched, []);
});

test('a saved Classic preference in the real browser storage is ignored at ordinary startup', () => {
  const storage = storageWith('classic');
  withGlobal('location', { value: { search: '' } }, () => {
    withGlobal('localStorage', { value: storage }, () => {
      assert.equal(readFinishPreference(), 'pink-jet-age');
    });
  });
  assert.deepEqual(storage.touched, []);
});

test('no stored value of any shape changes the finish', () => {
  for (const value of ['classic', 'pink-jet-age', 'future-finish', '', null, undefined, 7, {}, 'Pink Jet Age', '../classic', 'x'.repeat(33)]) {
    const storage = storageWith(value);
    assert.equal(readFinishPreference({ search: '', storage }), 'pink-jet-age');
    assert.deepEqual(storage.touched, []);
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

test('an unreadable address falls back to the default, not to a stored choice', () => {
  const search = { toString() { throw new Error('unreadable address'); } };
  const storage = storageWith('classic');
  assert.equal(readFinishPreference({ search, storage }), 'pink-jet-age');
  assert.deepEqual(storage.touched, []);
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
