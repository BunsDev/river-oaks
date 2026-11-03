// A gateway's tick can start before an account's new socket joins and finish after it. That
// tick's view still lists the account's previous connection, so publishing it to the new
// socket read as "This account joined in another tab" and closed it with 4009 before its
// first snapshot: hosted CI saw it once as "alice: socket closed (4009) before its first
// snapshot" (campus-leases-transport, redis, run 40681496315). A view older than the
// connection's own admission says nothing about it; a newer takeover still closes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { approvedWaitlist } from './waitlist-fixture.js';

test('a tick that started before a reconnect does not close the new socket as another tab', { timeout: 20_000 }, async t => {
  const identity = { userId: 'alice', sessionId: 'alice-session', name: 'Alice', expiresAt: Date.now() + 60_000 };
  let connections = [], revision = 1, held = null;
  const view = () => ({ snapshot: { type: 'snapshot', players: [] }, connections: connections.map(item => ({ ...item })), revision });
  const room = {
    async request(command) {
      if (command.type === 'join') { connections = [...connections.filter(item => item.userId !== command.identity.userId), { userId: command.identity.userId, connectionId: command.connectionId, sessionId: command.identity.sessionId, expiresAt: command.identity.expiresAt }]; revision++; }
      return { ok: true };
    },
    async read() { return view(); },
    // While armed, a tick takes its view when it starts and returns it only when released.
    async tick() {
      if (!held?.armed) return view();
      const stale = view();held.armed = false;held.started();
      await held.release;return stale;
    },
  };
  const app = createDistributedServer({ auth: { authenticate: async () => identity, handle: async () => false },
    security: { allow: async () => true, isBanned: async () => false, consumeTicket: async () => true },
    room, worldTitle: 'River Oaks', waitlist: approvedWaitlist, origin: 'http://localhost' });
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/multiplayer?protocol=3&ticket=test`, { headers: { Origin: 'http://localhost' } });
    t.after(() => ws.terminate());
    const closed = new Promise(resolve => ws.once('close', code => resolve(code)));
    await once(ws, 'message');
    return { ws, closed };
  };

  const first = await open();
  let started, release;
  held = { armed: true, started: null, release: new Promise(resolve => { release = resolve; }) };
  const ticking = new Promise(resolve => { held.started = resolve; });
  await ticking; // a tick is under way with a view of the first socket only
  const second = await open(); // the same account arrives on a new socket and is admitted
  release(); // the older tick lands

  const outcome = await Promise.race([second.closed.then(code => `closed ${code}`), new Promise(resolve => setTimeout(() => resolve('open'), 1500))]);
  assert.equal(outcome, 'open', 'the new socket outlives a view from before its own admission');
  assert.equal(await first.closed, 4009, 'the earlier socket is still closed as another tab once a current view lands');
});
