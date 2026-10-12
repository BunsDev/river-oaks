// Hardening: one account cannot occupy every world at once. Each world holds
// 32 players and nothing stopped one account joining all of them, so a few
// dozen accounts could fill the town. Joining a world now removes the account
// from the world its presence last recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { createMemoryPresence } from '../presence.js';
import { approvedWaitlist } from './waitlist-fixture.js';

async function joinWith(t, presence, {admin = false} = {}) {
  const moves = [], active = [];
  const identity = {userId: 'resident', sessionId: 'resident-session', name: 'Resident', expiresAt: Date.now() + 60_000};
  const room = {
    async request(command) { if (command.type === 'join') active.push({userId: identity.userId, connectionId: command.connectionId});return {ok: true}; },
    async read() { return {snapshot: {type: 'snapshot', players: []}, connections: active}; },
    async tick() { return null; },
  };
  const app = createDistributedServer({auth: {authenticate: async () => identity, handle: async () => false},
    security: {allow: async () => true, isBanned: async () => false, consumeTicket: async () => true},
    room, presence, worldTitle: 'River Oaks', waitlist: approvedWaitlist, origin: 'http://localhost', isAdmin: () => admin,
    onMove: async (userId, fromWorldId) => { moves.push([userId, fromWorldId]); }});
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`, {headers: {Origin: 'http://localhost'}});
  t.after(() => ws.terminate());
  await once(ws, 'message');
  return moves;
}

test('joining a world removes the account from the world it was last in', async t => {
  const presence = createMemoryPresence();
  await presence.join('resident', {id: 'moon-garden', title: 'Moon Garden'}, 'earlier-socket');
  assert.deepEqual(await joinWith(t, presence), [['resident', 'moon-garden']]);
  assert.equal((await presence.getMany(['resident'])).get('resident').worldId, 'river-oaks', 'presence now records the new world');
});

test('the trusted owner accounts may stay in several worlds (editing one while playing another)', async t => {
  const presence = createMemoryPresence();
  await presence.join('resident', {id: 'moon-garden', title: 'Moon Garden'}, 'earlier-socket');
  assert.deepEqual(await joinWith(t, presence, {admin: true}), []);
});

test('reconnecting to the same world, or arriving fresh, removes nothing', async t => {
  const same = createMemoryPresence();
  await same.join('resident', {id: 'river-oaks', title: 'River Oaks'}, 'earlier-socket');
  assert.deepEqual(await joinWith(t, same), []);
  assert.deepEqual(await joinWith(t, createMemoryPresence()), []);
});

async function removedWhile(t, presenceWorld) {
  const presence = createMemoryPresence();
  const identity = {userId: 'resident', sessionId: 'resident-session', name: 'Resident', expiresAt: Date.now() + 60_000};
  let active = [], removed = false;
  const room = {
    async request(command) { if (command.type === 'join') active = [{userId: identity.userId, connectionId: command.connectionId}];return {ok: true}; },
    async read() { return {snapshot: {type: 'snapshot', players: []}, connections: active}; },
    // The room drops the account (it was removed by a later join elsewhere, or banned).
    async tick() { return removed ? {snapshot: {type: 'snapshot', players: []}, connections: []} : null; },
  };
  const app = createDistributedServer({auth: {authenticate: async () => identity, handle: async () => false},
    security: {allow: async () => true, isBanned: async () => false, consumeTicket: async () => true},
    room, presence, worldTitle: 'River Oaks', waitlist: approvedWaitlist, origin: 'http://localhost'});
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=2&ticket=test`, {headers: {Origin: 'http://localhost'}});
  t.after(() => ws.terminate());
  await once(ws, 'message');
  await presence.join('resident', {id: presenceWorld, title: 'Elsewhere'}, 'other-socket');
  removed = true;
  const [code] = await once(ws, 'close');
  return code;
}

test('a socket removed because its account joined another world closes as "another tab", not as a ban', async t => {
  assert.equal(await removedWhile(t, 'moon-garden'), 4009, 'terminal on the client, with the right message');
  assert.equal(await removedWhile(t, 'river-oaks'), 4003, 'a removal for any other reason keeps its meaning');
});
