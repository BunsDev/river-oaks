import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideMemory } from '../src/salon-guide-content.js';
import { createThrowSounds } from '../src/throw-sounds.js';

// With site data blocked, reading `window.localStorage` itself throws a SecurityError. The
// salon guide builds its memory while main.js is evaluated, so an unguarded default parameter
// rejected the game import, and the access gate (reloadAfterFailedCheck) reloaded the page in a
// loop that never reached the district (#837 startup evidence). The defaults must read as no
// storage instead.
function withBlockedStorage(run) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Storage is blocked for this document', 'SecurityError'); } });
  try { return run(); } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before); else delete globalThis.localStorage;
  }
}

test('the stand-in really throws on read, as a blocked browser does', () => {
  withBlockedStorage(() => assert.throws(() => globalThis.localStorage, { name: 'SecurityError' }));
});

test('guide memory starts empty and still remembers this visit when storage is blocked', () => {
  withBlockedStorage(() => {
    const memory = createGuideMemory();
    assert.equal(memory.has('chess'), false);
    memory.add('chess');
    assert.equal(memory.has('chess'), true);
  });
});

test('throw sounds build and toggle when storage is blocked', () => {
  withBlockedStorage(() => {
    const sounds = createThrowSounds({ AudioContextClass: null });
    assert.equal(typeof sounds, 'object');
  });
});

test('an explicit storage is still used when the default is unavailable', () => {
  const saved = new Map([['river-oaks-salon-guide-seen', '["reversi"]']]);
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  withBlockedStorage(() => {
    const memory = createGuideMemory(storage);
    assert.equal(memory.has('reversi'), true);
    memory.add('morris');
    assert.deepEqual(JSON.parse(saved.get('river-oaks-salon-guide-seen')), ['reversi', 'morris']);
  });
});
