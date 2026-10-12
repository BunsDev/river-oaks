import test from 'node:test';
import assert from 'node:assert/strict';
import { watchConnection, CONNECT_BUDGETS } from '../src/connection-deadline.js';

// A virtual clock whose timers can be made to fire late, the way they do when
// the main thread is busy rendering.
function clock() {
  let time = 0, next = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (fn, ms) => { const id = ++next; timers.set(id, { at: time + ms, fn }); return id; },
    clearTimer: id => { timers.delete(id); },
    // Advance to `to`, firing each due timer `lateBy` ms after it was due.
    advance(to, lateBy = 0) {
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at + lateBy <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); time = due[1].at + lateBy; due[1].fn();
      }
      time = to;
    },
  };
}
const socket = (readyState = 0) => ({ readyState, OPEN: 1 });
function watch(ws, c) {
  const result = { expiredAt: null };
  result.watch = watchConnection(ws, { onExpire: () => { result.expiredAt = c.now(); }, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  return result;
}

test('a socket that never opens is abandoned after the open budget', () => {
  const c = clock(), w = watch(socket(), c);
  c.advance(11_999); assert.equal(w.expiredAt, null);
  c.advance(12_000); assert.equal(w.expiredAt, 12_000);
});

test('an open socket gets the longer first-snapshot budget', () => {
  const c = clock(), ws = socket(), w = watch(ws, c);
  c.advance(3_000); ws.readyState = 1; w.watch.opened();
  c.advance(40_000); assert.equal(w.expiredAt, null, 'the old 12 s deadline would have closed this connection');
  c.advance(48_000); assert.equal(w.expiredAt, 3_000 + CONNECT_BUDGETS.snapshotMs);
});

test('a socket that opened before its open handler could run is not closed', () => {
  const c = clock(), ws = socket(), w = watch(ws, c);
  c.advance(5_000); ws.readyState = 1; // opened, but the busy page has not dispatched the open event yet
  c.advance(12_000); assert.equal(w.expiredAt, null);
  c.advance(12_000 + CONNECT_BUDGETS.snapshotMs); assert.equal(w.expiredAt, 12_000 + CONNECT_BUDGETS.snapshotMs);
});

test('late timers restart the budget a bounded number of times', () => {
  const c = clock(), w = watch(socket(), c);
  // Each timer fires 5 s late: the page is starved, so the budget restarts.
  const late = 5_000, step = CONNECT_BUDGETS.openMs + late;
  c.advance(step * CONNECT_BUDGETS.maxRestarts, late);
  assert.equal(w.expiredAt, null);
  c.advance(step * (CONNECT_BUDGETS.maxRestarts + 1), late);
  assert.equal(w.expiredAt, step * (CONNECT_BUDGETS.maxRestarts + 1), 'a page that never recovers still retries eventually');
});

test('stopping (snapshot received, socket closed or client stopped) cancels expiry', () => {
  const c = clock(), w = watch(socket(), c);
  w.watch.stop(); c.advance(600_000);
  assert.equal(w.expiredAt, null);
  w.watch.opened(); c.advance(1_200_000);
  assert.equal(w.expiredAt, null, 'opened() after stop() does not re-arm');
});
