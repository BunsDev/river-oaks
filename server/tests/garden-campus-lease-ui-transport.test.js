// The campus dialog's own commands (#510 garden-campus-model.js) through the real ticket and
// WebSocket gates: a request becomes an offer linked to it, a resident withdraws a request,
// an operator declines one. The socket envelope's requestId routes replies, so the lease
// request travels as leaseRequestId; a test that only calls world.command cannot see that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { createSharedWorld } from '../world.js';
import { createGameServer } from '../app.js';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { loadDistrictData } from '../district-data.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { campusDefaultTerm, campusDirectory, createCampusCommands } from '../../preview/src/garden-campus-model.js';

const gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });

for (const mode of ['memory', 'redis']) test(`${mode}: the dialog's lease commands cross the real socket intact`, { skip: mode === 'redis' && !process.env.REDIS_URL }, async t => {
  const origin = 'http://127.0.0.1', ids = { alice: 'alice', bob: 'bob' };
  const auth = { handle: async () => false, close() {}, isSessionActive: async () => true,
    authenticate: async req => { const id = req.headers.cookie?.match(/fixture=(\w+)/)?.[1];return ids[id] ? { userId: ids[id], name: id, sessionId: id, csrfToken: 'test-csrf', expiresAt: Date.now() + 600000 } : null; } };
  let redis, security;const namespace = `river-oaks:campus-ui-test:${randomUUID()}`;
  if (mode === 'redis') { redis = new Redis(process.env.REDIS_URL);security = createRedisSecurity({ redis, prefix: `{${namespace}}` }); }
  const app = mode === 'redis' ? createWorldGateway({ redis, namespace, worldData: gardens, auth, security, waitlist: approvedWaitlist, origin, campusOperators: ['bob'] })
    : createGameServer({ world: createSharedWorld(gardens, { campusOperators: ['bob'] }), auth, waitlist: approvedWaitlist, origin, staticRoot: '/nonexistent' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate();await app.close();security?.close();if (redis) { const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); } });
  const join = async id => {
    const response = await fetch(`${base}/api/multiplayer/ticket`, { method: 'POST', headers: { Origin: origin, Cookie: `fixture=${id}`, 'X-CSRF-Token': 'test-csrf' } });
    assert.equal(response.status, 200);const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}&world=river-oaks&protocol=3`, { headers: { Origin: origin, Cookie: `fixture=${id}` } });sockets.push(ws);
    const pending = new Map();let seq = 0;
    await new Promise((resolve, reject) => { ws.once('error', reject);ws.on('message', raw => { const v = JSON.parse(raw);if (v.type === 'snapshot') resolve();if (v.type === 'result' && pending.has(v.requestId)) { pending.get(v.requestId)(v);pending.delete(v.requestId); } }); });
    // The page's transport: its own requestId on the envelope, exactly as multiplayer-client.js sends.
    const send = message => new Promise((resolve, reject) => { const requestId = String(++seq), timer = setTimeout(() => { pending.delete(requestId);reject(new Error(`${message.type}/${message.action} timed out`)); }, 8000);
      pending.set(requestId, v => { clearTimeout(timer);assert.equal(v.requestId, requestId, 'replies route by the envelope id');resolve(v); });ws.send(JSON.stringify({ ...message, requestId })); });
    return { commands: createCampusCommands({ worldId: 'river-oaks', send }), list: async () => campusDirectory((await send({ type: 'campus', action: 'list' })).campus) };
  };
  const alice = await join('alice'), bob = await join('bob'), term = () => campusDefaultTerm(Date.now() + 1000);
  // A request becomes an offer linked to it.
  assert.equal((await alice.commands.request('T1-F2-W-S', term())).ok, true);
  const asked = (await bob.list()).manage.requests.find(item => item.unitId === 'T1-F2-W-S');
  const offered = await bob.commands.issue({ unitId: asked.unitId, tenantId: asked.userId, startsAt: Math.max(asked.startsAt, Date.now() + 1000), endsAt: asked.endsAt, requestId: asked.id });
  assert.equal(offered.ok, true, offered.message);
  assert.equal(offered.lease.requestId, asked.id, 'the offer names the request it answers');
  assert.deepEqual((await alice.list()).requests.map(item => [item.unitId, item.status]), [['T1-F2-W-S', 'offered']]);
  // A resident withdraws a request; an operator declines another.
  assert.equal((await alice.commands.request('T2-F2-W-S', term())).ok, true);
  const mine = (await alice.list()).requests.find(item => item.unitId === 'T2-F2-W-S');
  const cancelled = await alice.commands.cancel(mine);assert.equal(cancelled.ok, true, cancelled.message);
  assert.equal((await alice.commands.request('T3-F2-W-S', term())).ok, true);
  const third = (await bob.list()).manage.requests.find(item => item.unitId === 'T3-F2-W-S');
  const declined = await bob.commands.decline(third);assert.equal(declined.ok, true, declined.message);
  assert.deepEqual((await alice.list()).requests.map(item => [item.unitId, item.status]).sort(), [['T1-F2-W-S', 'offered'], ['T2-F2-W-S', 'cancelled'], ['T3-F2-W-S', 'declined']]);
});
