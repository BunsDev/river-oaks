import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPageLifecycle } from '../src/background-lifecycle.js';

function fixture() {
  const win = new EventTarget(), doc = new EventTarget(); doc.hidden = false;
  const events = [];
  const release = bindPageLifecycle({ window: win, document: doc, release: reason => events.push(`release:${reason}`), resume: () => events.push('resume') });
  return { win, doc, events, release };
}

test('blur, hidden and pagehide share one release path; visible changes do not resume held controls', () => {
  const { win, doc, events, release } = fixture();
  win.dispatchEvent(new Event('blur')); doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(events, ['release:blur', 'release:hidden', 'release:pagehide']);
  release(); win.dispatchEvent(new Event('blur')); assert.equal(events.length, 3);
});

test('a persisted pageshow releases stale input before resetting time and requesting fresh state', () => {
  const { win, events, release } = fixture();
  win.dispatchEvent(new Event('pageshow')); assert.deepEqual(events, []);
  const event = new Event('pageshow'); event.persisted = true; win.dispatchEvent(event);
  assert.deepEqual(events, ['release:pageshow', 'resume']); release();
});

test('shared subscriptions install one event source and release pointer captures before returning', () => {
  const { win, doc, events, release } = fixture();
  const controller = new AbortController(); let other = 0;
  bindPageLifecycle({ window: win, document: doc, release: () => other++, signal: controller.signal });
  const captures = new Set([7]), target = { hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  const event = new Event('gotpointercapture'); Object.defineProperties(event, { target: { value: target }, pointerId: { value: 7 } }); doc.dispatchEvent(event);
  win.dispatchEvent(new Event('pagehide')); assert.equal(captures.size, 0); assert.equal(other, 1); assert.equal(events.length, 1);
  controller.abort(); win.dispatchEvent(new Event('blur')); assert.equal(other, 1); assert.equal(events.length, 2); release();
});
