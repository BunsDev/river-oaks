// Hardening: a single slow or failed Redis call must not disconnect every
// player on an instance. Ticks close everyone only after repeated failures, and
// one connection's failing heartbeat closes only that connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { approvedWaitlist } from './waitlist-fixture.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function serve(t, room, identities, options = {}) {
  let next = 0;
  const auth = {authenticate: async () => identities[Math.min(next++, identities.length - 1)], handle: async () => false};
  const security = {allow: async () => true, isBanned: async () => false, consumeTicket: async () => true};
  const app = createDistributedServer({auth, security, room, waitlist: approvedWaitlist, origin: 'http://localhost', ...options});
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`, {headers: {Origin: 'http://localhost'}});
    t.after(() => ws.terminate());
    await once(ws, 'message');
    return ws;
  };
  return {connect};
}
const identity = userId => ({userId, sessionId: `${userId}-session`, name: userId, expiresAt: Date.now() + 60_000});

test('a couple of failed ticks keep players connected; sustained failure closes them', {timeout: 5000}, async t => {
  let failing = 2;
  const active = [];
  const room = {
    async request(command) { if (command.type === 'join') active.push({userId: command.identity.userId, connectionId: command.connectionId});return {ok: true}; },
    async read() { return {snapshot: {type: 'snapshot', players: []}, connections: active}; },
    async tick() { if (failing > 0) { failing--;throw new Error('Redis timeout'); }return null; },
  };
  const {connect} = await serve(t, room, [identity('resident')]);
  const ws = await connect();
  await delay(1000);
  assert.equal(ws.readyState, WebSocket.OPEN, 'two failed ticks in a row are not an outage');
  failing = Infinity;
  const [code] = await once(ws, 'close');
  assert.equal(code, 1013, 'a sustained failure still tells clients to reconnect');
});

test('one connection\'s failing heartbeat closes only that connection', {timeout: 5000}, async t => {
  const active = [];
  const room = {
    async request(command) {
      if (command.type === 'join') active.push({userId: command.identity.userId, connectionId: command.connectionId});
      if (command.type === 'heartbeat' && command.userId === 'flaky') throw new Error('heartbeat failed');
      return {ok: true};
    },
    async read() { return {snapshot: {type: 'snapshot', players: []}, connections: active}; },
    async tick() { return null; },
  };
  const {connect} = await serve(t, room, [identity('steady'), identity('flaky')], {heartbeatMs: 100});
  const steady = await connect(), flaky = await connect();
  const [code] = await once(flaky, 'close');
  assert.equal(code, 1013);
  await delay(300);
  assert.equal(steady.readyState, WebSocket.OPEN, 'the steady player stays connected');
});
