import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { sendFrame, SNAPSHOT_SKIP_BYTES, SLOW_CLOSE_BYTES } from '../backpressure.js';

test('a stalled browser skips snapshots instead of being disconnected', () => {
  const sent = [], closed = [];
  const socket = bufferedAmount => ({ readyState: WebSocket.OPEN, bufferedAmount, send: data => sent.push(data), close: (code) => closed.push(code) });
  assert.equal(sendFrame(socket(0), { type: 'snapshot' }, { snapshot: true }), 'sent');
  assert.equal(sendFrame(socket(SNAPSHOT_SKIP_BYTES + 1), '{}', { snapshot: true }), 'skipped');
  assert.equal(sendFrame(socket(SNAPSHOT_SKIP_BYTES + 1), { type: 'result' }), 'sent', 'command results are never skipped');
  assert.equal(closed.length, 0, 'a one-second stall no longer disconnects');
  assert.equal(sendFrame(socket(SLOW_CLOSE_BYTES + 1), '{}', { snapshot: true }), 'closed');
  assert.deepEqual(closed, [1013]);
  assert.equal(sendFrame({ readyState: WebSocket.CLOSED }, '{}'), 'closed');
});
