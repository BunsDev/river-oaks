import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsRecovery } from '../src/graphics-recovery.js';

function fixture(options = {}) {
  let time = 0, nextId = 0;
  const timers = new Map(), changes = [];
  const recovery = createGraphicsRecovery({
    now: () => time, setTimer: (callback, ms) => { const id = ++nextId; timers.set(id, { callback, at: time + ms }); return id; },
    clearTimer: id => timers.delete(id), restoreTimeoutMs: 100, lossWindowMs: 1000, maxLosses: 3,
    onChange: change => changes.push(change), ...options,
  });
  const advance = ms => { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); } };
  return { recovery, changes, timers, advance };
}

test('a loss pauses until restore and cancels its deadline', () => {
  const { recovery, changes, timers, advance } = fixture();
  assert.equal(recovery.state, 'ok'); recovery.lost();
  assert.equal(recovery.state, 'lost'); recovery.restored();
  assert.equal(recovery.state, 'ok'); assert.equal(timers.size, 0);
  advance(101); assert.equal(recovery.state, 'ok');
  assert.deepEqual(changes.map(item => item.state), ['lost', 'ok']);
});

test('timeout fails once, requests a quality step-down and ignores an unsolicited late restore', () => {
  const { recovery, changes, advance } = fixture();
  recovery.lost(); advance(99); assert.equal(recovery.state, 'lost'); advance(1);
  assert.deepEqual(changes.at(-1), { state: 'failed', reason: 'timeout', stepDown: true });
  recovery.restored(); recovery.lost(); advance(1000);
  assert.equal(recovery.state, 'failed'); assert.equal(changes.length, 2);
});

test('three distinct losses within the window trip the loop limit', () => {
  const { recovery, changes } = fixture();
  recovery.lost(); recovery.restored(); recovery.lost(); recovery.restored(); recovery.lost();
  assert.deepEqual(changes.at(-1), { state: 'failed', reason: 'loop', stepDown: true });
});

test('expired losses do not count toward a new crash loop', () => {
  const { recovery, advance } = fixture();
  recovery.lost(); recovery.restored(); recovery.lost(); recovery.restored(); advance(1001); recovery.lost();
  assert.equal(recovery.state, 'lost');
});

test('duplicate loss does not extend the deadline or count twice', () => {
  const { recovery, changes, advance, timers } = fixture();
  recovery.lost(); advance(50); recovery.lost();
  assert.equal(timers.size, 1); assert.equal(changes.length, 1);
  advance(50); assert.equal(recovery.state, 'failed');
});

test('explicit retry arms a bounded restoration without stepping down twice', () => {
  const { recovery, changes, advance } = fixture();
  recovery.lost(); advance(100); recovery.retry();
  assert.deepEqual(changes.at(-1), { state: 'restoring', reason: 'retry', stepDown: false });
  recovery.restored(); assert.equal(recovery.state, 'ok');
  recovery.retry(); assert.equal(recovery.state, 'ok');
  recovery.lost(); advance(100); recovery.retry(); advance(100);
  assert.equal(recovery.state, 'failed');
});

test('retry resets the loop window for one deliberate user attempt', () => {
  const { recovery } = fixture();
  for (let index = 0; index < 3; index++) { recovery.lost(); recovery.restored(); }
  assert.equal(recovery.state, 'failed'); recovery.retry(); recovery.restored(); recovery.lost();
  assert.equal(recovery.state, 'lost');
});

test('dispose fences timers, restores and user callbacks', () => {
  const { recovery, changes, timers, advance } = fixture();
  recovery.lost(); const stale = [...timers.values()][0].callback;
  recovery.dispose(); const count = changes.length;
  stale(); advance(1000); recovery.restored(); recovery.retry(); recovery.lost(); recovery.dispose();
  assert.equal(changes.length, count); assert.equal(timers.size, 0);
});

test('a queued deadline from the previous loss cannot fail a later cycle', () => {
  const { recovery, changes, timers } = fixture();
  recovery.lost(); const stale = [...timers.values()][0].callback;
  recovery.restored(); recovery.lost(); stale();
  assert.equal(recovery.state, 'lost'); assert.equal(changes.length, 3);
});

test('a failed GPU rebuild exposes retry immediately and only once', () => {
  const { recovery, changes } = fixture();
  recovery.lost(); recovery.failed('rebuild'); recovery.failed('rebuild');
  assert.deepEqual(changes.at(-1), { state: 'failed', reason: 'rebuild', stepDown: true });
  assert.equal(changes.length, 2);
});
