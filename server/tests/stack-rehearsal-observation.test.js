import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { waitForRehearsalSnapshot } from './helpers/stack-rehearsal-observation.js';

async function fixture(t, connect) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', connect);
  await once(server, 'listening');
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  t.after(async () => { ws.terminate(); for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); });
  return ws;
}

test('a terminal admission close fails immediately with its code instead of waiting for a snapshot timeout', async t => {
  const ws = await fixture(t, client => client.close(1013, 'Town temporarily unavailable.'));
  await assert.rejects(waitForRehearsalSnapshot(ws, { label: 'alice gardens@7', timeoutMs: 1000 }), error => {
    assert.equal(error.closeCode, 1013);
    assert.match(error.message, /alice gardens@7.*closed.*1013/);
    assert.ok(error.elapsedMs < 1000);
    return true;
  });
  assert.equal(ws.listenerCount('message'), 0);
});

test('only a snapshot completes admission; open and unrelated frames are insufficient', async t => {
  const ws = await fixture(t, client => { client.send(JSON.stringify({ type: 'result', ok: true })); client.send(JSON.stringify({ type: 'snapshot', selfId: 'alice' })); });
  assert.deepEqual(await waitForRehearsalSnapshot(ws, { label: 'alice', timeoutMs: 1000 }), { type: 'snapshot', selfId: 'alice' });
  assert.equal(ws.listenerCount('close'), 0);
});

test('an open connection without a snapshot still fails on the bounded deadline', async t => {
  const ws = await fixture(t, () => {});
  await assert.rejects(waitForRehearsalSnapshot(ws, { label: 'silent', timeoutMs: 30 }), /silent.*snapshot.*timed out/);
  assert.equal(ws.listenerCount('message'), 0);
  assert.equal(ws.listenerCount('close'), 0);
});
