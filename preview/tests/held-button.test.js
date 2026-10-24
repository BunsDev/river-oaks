import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHeldButton } from '../src/held-button.js';

const event = (type, fields) => Object.assign(new Event(type, { cancelable: true }), fields);
test('native Enter/Space holds require a fresh press after lifecycle release', () => {
  for (const code of ['Enter', 'Space']) {
    const button = new EventTarget(); let held = false;
    const clear = bindHeldButton(button, { press: () => { held = true; }, release: () => { held = false; } });
    assert.equal(button.dispatchEvent(event('keydown', { code, repeat: false })), false);
    assert.equal(held, true);
    clear(); assert.equal(held, false);
    assert.equal(button.dispatchEvent(event('keydown', { code, repeat: true })), false);
    assert.equal(held, false);
    assert.equal(button.dispatchEvent(event('keyup', { code })), false);
    assert.equal(held, false, 'Space keyup cannot generate a native click');
    button.dispatchEvent(event('keydown', { code, repeat: false })); assert.equal(held, true);
    clear(); button.dispatchEvent(event('keyup', { code })); assert.equal(held, false);
  }
});

test('a fresh quick keyboard tap retains the existing short movement pulse', () => {
  const button = new EventTarget(); let held = false, timer;
  const clear = bindHeldButton(button, { press: () => { held = true; }, release: () => { held = false; },
    schedule: fn => { timer = fn; return 1; }, cancel() {} });
  button.dispatchEvent(event('keydown', { code: 'Enter', repeat: false }));
  button.dispatchEvent(event('keyup', { code: 'Enter' }));
  assert.equal(held, true, 'a tap lasting less than one frame still moves');
  timer(); assert.equal(held, false);
  clear();
});
test('assistive activation still pulses, with stale timers cancelled on release', () => {
  const button = new EventTarget(); let held = false, timer, cancelled = false;
  const clear = bindHeldButton(button, { press: () => { held = true; }, release: () => { held = false; },
    schedule: fn => { timer = fn; return 1; }, cancel: () => { cancelled = true; } });
  button.dispatchEvent(event('click', { detail: 0 })); assert.equal(held, true);
  clear(); assert.equal(held, false); assert.equal(cancelled, true);
  button.dispatchEvent(event('click', { detail: 0 })); timer(); assert.equal(held, false);
});
