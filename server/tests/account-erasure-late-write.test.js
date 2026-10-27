import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createWorldRouter } from '../world-router.js';
import { createSharedWorld } from '../world.js';
import { createMemoryProfiles } from '../profiles.js';
import { createAccountErasure, createMemoryPendingErasures, ERASURE_SETTLE_MS } from '../account-erasure.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// A request the account sent before its sessions ended can finish sending its body after
// the account is erased (#292). The server waits up to its request timeout for that body;
// the second pass erases whatever such a request wrote.
const origin = 'https://sim.jev.works';
const small = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], collisionPolygons: [], stores: [], buildings: [],
  communityLocations: [{ id: 'a', name: 'Garden', position: [-12, 0, 0] }] };

test('a profile write let in before erasure and sent after it is gone after the second pass', async t => {
  let revoked = false, letIn;
  const admitted = new Promise(resolve => { letIn = resolve; });
  const identity = { userId: 'user_erin', name: 'Erin', sessionId: 'erin-session', csrfToken: 'csrf', expiresAt: Date.now() + 600_000 };
  const auth = { handle: async () => false, async authenticate(req) {
    const signedIn = !revoked && /test_session=erin/.test(req.headers.cookie ?? '');
    if (signedIn && req.url.startsWith('/api/profile/save')) letIn();
    return signedIn ? identity : null;
  } };
  const profiles = createMemoryProfiles();
  const app = createGameServer({ auth, world: createSharedWorld(small), waitlist: approvedWaitlist, origin, profiles });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const eraseAccount = createAccountErasure({ tombstone: async () => {}, revoke: async () => { revoked = true; },
    steps: { world: id => app.forgetAccount(id), profiles: id => profiles.eraseUser(id) }, pending: createMemoryPendingErasures(), settleMs: 0 });

  const body = JSON.stringify({ tagline: 'written-after-erasure', bio: '', pronouns: '', interests: [], expectedVersion: 0 });
  const held = request(`http://127.0.0.1:${app.server.address().port}/api/profile/save`, { method: 'POST', headers: {
    Origin: origin, Cookie: 'test_session=erin', 'X-CSRF-Token': 'csrf', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
  const answered = new Promise((resolve, reject) => { held.on('response', response => { response.resume();resolve(response.statusCode); });held.on('error', reject); });
  held.flushHeaders();
  await admitted;
  await eraseAccount('user_erin', { eventId: 'event_late' });
  held.end(body);
  assert.equal(await answered, 200, 'the request was let in while the session lived');
  assert.equal((await profiles.get('user_erin')).tagline, 'written-after-erasure', 'and wrote after the first pass');
  assert.deepEqual(await eraseAccount.sweep(), { finished: 1, failed: 0, waiting: 0 });
  assert.equal((await profiles.get('user_erin')).tagline, '', 'the second pass erased it');
});

test('the second pass waits longer than any server lets a request body take', async t => {
  const { default: entry } = await import('../../api/server.js');
  const auth = { handle: async () => false, authenticate: async () => null };
  const app = createGameServer({ auth, world: createSharedWorld(small), waitlist: approvedWaitlist, origin });
  const security = { allow: async () => true, isBanned: async () => false, consumeTicket: async () => false, issueTicket: async () => null };
  const room = { worldId: 'river-oaks', read: async () => null, tick: async () => null, request: async () => ({ ok: true }) };
  const hosted = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, origin });
  // The town and long-lived gateways listen through the world router.
  const router = createWorldRouter({ worldFor: async () => null });
  t.after(async () => { app.close();await hosted.close();await router.close().catch(() => {}); });
  // Node checks the request timeout only every connectionsCheckingInterval.
  for (const [name, server] of [['Vercel entry', entry], ['town world', app.server], ['hosted world', hosted.server], ['world router', router.server]])
    assert.ok(ERASURE_SETTLE_MS > server.requestTimeout + server.connectionsCheckingInterval, `${name}: ${server.requestTimeout} + ${server.connectionsCheckingInterval}`);
});
