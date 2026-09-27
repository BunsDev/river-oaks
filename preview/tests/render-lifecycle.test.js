import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRenderVisibility } from '../src/render-lifecycle.js';

test('hidden windows stop rendering, resume with a fresh clock, and release their listener', () => {
  const document = new EventTarget(); document.hidden = false;
  const calls = [];
  const dispose = bindRenderVisibility({ document, setLoop: value => calls.push(value), render: 'render', resetTime: () => calls.push('reset') });
  assert.deepEqual(calls, ['reset', 'render']);
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(calls.slice(-1), [null]);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(calls.slice(-2), ['reset', 'render']);
  dispose();
  const count = calls.length;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls.length, count);
  assert.equal(calls.at(-1), null);
});

test('starting hidden never draws a scene or advances the clock', () => {
  const document = new EventTarget(); document.hidden = true;
  const calls = [];
  bindRenderVisibility({ document, setLoop: value => calls.push(value), render: 'render', resetTime: () => assert.fail('clock advanced while hidden') });
  assert.deepEqual(calls, [null]);
});
