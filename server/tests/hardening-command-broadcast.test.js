// Hardening (lag): a command's fresh snapshot goes to the player who sent it;
// everyone else gets the change on the next 200 ms tick. Before, every
// successful command rebroadcast the full snapshot (about 92 kB) to the whole
// world, so a full world could spend a quarter of each second serializing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { approvedWaitlist } from './waitlist-fixture.js';

test('a command refreshes the sender immediately and leaves the rest to the tick', {timeout: 5000}, async t => {
  const identities = [{userId: 'actor', sessionId: 'a', name: 'Actor', expiresAt: Date.now() + 60_000}, {userId: 'bystander', sessionId: 'b', name: 'Bystander', expiresAt: Date.now() + 60_000}];
  let next = 0;
  const active = [];
  const room = {
    async request(command) { if (command.type === 'join') active.push({userId: command.identity.userId, connectionId: command.connectionId});return {ok: true}; },
    async read() { return {snapshot: {type: 'snapshot', players: []}, connections: active}; },
    async tick() { return null; },
  };
  const app = createDistributedServer({auth: {authenticate: async () => identities[Math.min(next++, 1)], handle: async () => false},
    security: {allow: async () => true, isBanned: async () => false, consumeTicket: async () => true}, room, waitlist: approvedWaitlist, origin: 'http://localhost'});
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=3&ticket=test`, {headers: {Origin: 'http://localhost'}});
    t.after(() => ws.terminate());
    const first = once(ws, 'message');
    await first;
    const snapshots = [];
    ws.on('message', raw => { const value = JSON.parse(raw);if (value.type === 'snapshot') snapshots.push(value); });
    return {ws, snapshots};
  };
  const actor = await connect(), bystander = await connect();
  actor.ws.send(JSON.stringify({type: 'chat', text: 'hello', requestId: 'r1'}));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(actor.snapshots.length, 1, 'the sender sees the result of its command at once');
  assert.equal(bystander.snapshots.length, 0, 'the others wait for the tick instead of a full rebroadcast');
});
