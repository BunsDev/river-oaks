import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisSocial } from '../social.js';
import { createRedisBlocks } from '../blocks.js';
import { createRedisLandmarks } from '../landmarks.js';
import { createWorldGateway } from '../world-gateway.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';

// Blocking on the hosted path: two gateways share one Redis room and block store. A block
// made through one gateway reaches sockets on the other, survives a gateway restart, and
// refuses office invitations either way, until it is lifted.
const origin = 'https://sim.jev.works';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const live = { skip: !process.env.REDIS_URL, timeout: 40_000 };
const settle = (ms = 1100) => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const sessions = new Map(['alice', 'bob', 'carol', 'dana'].map(userId => [userId, { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 120_000 }]));
  const nodes = new Set();
  t.after(async () => {
    for (const node of nodes) { await node.app.close();await node.room.close(); }
    const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  // Gateways sync every 100 ms unless a test asks for the production default.
  const start = async ({ blockSyncMs = 100 } = {}) => {
    const security = createRedisSecurity({ redis, prefix });
    const auth = { authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null, handle: async () => false };
    const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, isAdmin: id => id === 'alice',
      authorize: async identity => sessions.get(identity.userId)?.sessionId === identity.sessionId });
    const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, landmarks: createRedisLandmarks({ redis, prefix }),
      social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), ...(blockSyncMs ? { blockSyncMs } : {}), isAdmin: id => id === 'alice', origin, moderators: [] });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const node = { app, room, url: `http://127.0.0.1:${app.server.address().port}` };nodes.add(node);
    return node;
  };
  const post = (node, user, path, body = {}) => fetch(node.url + path, { method: 'POST',
    headers: { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const connect = async (node, user) => {
    const { ticket } = await (await post(node, user, '/api/multiplayer/ticket?world=river-oaks')).json();
    const ws = new WebSocket(`${node.url.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket, protocol: String(WORLD_PROTOCOL_VERSION) })}`, { headers: { Origin: origin, Cookie: `test_session=${user}` } });
    ws.on('error', () => {});t.after(() => ws.terminate());
    const seen = new Set(), results = [];
    const joined = new Promise(resolve => ws.on('message', raw => {
      const message = JSON.parse(raw);
      if (Array.isArray(message.chat)) { for (const entry of message.chat) seen.add(entry.text); if (message.selfId === user) resolve(); }
      if (message.type === 'result') results.push(message);
    }));
    await joined;
    const command = async message => { const requestId = randomUUID();ws.send(JSON.stringify({ ...message, requestId }));
      for (let i = 0; i < 100 && !results.some(item => item.requestId === requestId); i++) await settle(50);
      return results.find(item => item.requestId === requestId); };
    return { ws, seen, command, say: text => ws.send(JSON.stringify({ type: 'chat', text })) };
  };
  return { start, post, connect, nodes };
}

test('a block made through one gateway reaches the other, survives a restart and lifts cleanly', live, async t => {
  const { start, post, connect, nodes } = await fixture(t);
  // The second gateway keeps the production five-second sync.
  const first = await start(), second = await start({ blockSyncMs: null });
  // Dana watches from the gateway that stays up, so every line has a witness.
  const bob = await connect(first, 'bob'), carol = await connect(second, 'carol'), dana = await connect(first, 'dana');
  assert.equal((await post(first, 'bob', '/api/blocks/add', { peerId: 'bob' })).status, 400);
  assert.equal((await post(first, 'bob', '/api/blocks/add', { peerId: 'nobody-here' })).status, 404);
  assert.equal((await post(first, 'bob', '/api/blocks/add', { peerId: 'carol' })).status, 200);
  await settle(5200);
  carol.say('carol-line');bob.say('bob-line');
  await settle();
  assert.equal(bob.seen.has('carol-line'), false, 'the blocker no longer hears the blocked');
  assert.equal(carol.seen.has('bob-line'), false, 'the other gateway caught up');
  assert.ok(dana.seen.has('carol-line') && dana.seen.has('bob-line'), 'both lines were sent and everyone else hears them');
  const blockedRequest = await post(second, 'carol', '/api/social/request', { peerId: 'bob' });
  assert.equal(blockedRequest.status, 409);
  assert.deepEqual(await blockedRequest.json(), { error: 'Meet this resident in the same world first.' });

  // A gateway restart: Carol comes back through a new one, and the block is still there.
  carol.ws.close();
  await second.app.close();await second.room.close();nodes.delete(second);
  const third = await start();
  const back = await connect(third, 'carol');
  bob.say('bob-after-restart');await settle();
  assert.equal(back.seen.has('bob-after-restart'), false);
  assert.ok(dana.seen.has('bob-after-restart'), 'the line was sent');

  assert.equal((await post(first, 'bob', '/api/blocks/remove', { peerId: 'carol' })).status, 200);
  await settle(300);
  bob.say('bob-after-unblock');await settle();
  assert.ok(back.seen.has('bob-after-unblock'), 'lifting the block restores chat on the other gateway');
});

test('a resident’s block ends Jevica’s office invitation and refuses new ones until it is lifted', live, async t => {
  const { start, post, connect } = await fixture(t);
  const node = await start();
  const alice = await connect(node, 'alice');await connect(node, 'bob');
  const invite = () => alice.command({ type: 'office', action: 'invite', officeId: 'jevica-office', peerId: 'bob' });
  assert.equal((await invite()).ok, true);
  assert.equal((await post(node, 'bob', '/api/blocks/add', { peerId: 'alice' })).status, 200);
  const list = await alice.command({ type: 'office', action: 'list', officeId: 'jevica-office' });
  assert.deepEqual(list.offices[0].guests, [], 'the block ended the invitation');
  const refused = await invite();
  assert.deepEqual([refused.ok, refused.error, refused.message], [false, 'invalid_office_guest', 'invalid_office_guest']);
  assert.equal((await post(node, 'bob', '/api/blocks/remove', { peerId: 'alice' })).status, 200);
  assert.equal((await invite()).ok, true);
});

test('blocking keeps its own write limit', live, async t => {
  const { start, post, connect } = await fixture(t);
  const node = await start();
  await connect(node, 'bob');await connect(node, 'carol');
  const statuses = [];
  for (let i = 0; i < 13; i++) statuses.push((await post(node, 'bob', `/api/blocks/${i % 2 ? 'remove' : 'add'}`, { peerId: 'carol' })).status);
  assert.deepEqual(statuses.slice(0, 12), Array(12).fill(200));
  assert.equal(statuses[12], 429);
});

test('a block between Jevica and a resident ends invitations in a stored world no gateway has loaded', live, async t => {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const namespace = `river-oaks:test-blocks:${randomUUID()}`, open = new Set();
  const auth = { handle: async () => false, isSessionActive: async () => true, close() {}, authenticate: async req => {
    const userId = req.headers.cookie?.match(/test_session=(\w+)/)?.[1];
    return userId ? { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 120_000 } : null;
  } };
  const security = createRedisSecurity({ redis, prefix: `{${namespace}}` });
  t.after(async () => { for (const gateway of open) await gateway.close();security.close();const keys = await redis.keys(`*${namespace}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const start = async () => {
    const gateway = createWorldGateway({ redis, namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, isAdmin: id => id === 'alice', moderators: [] });
    await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));open.add(gateway);
    return { gateway, url: `http://127.0.0.1:${gateway.server.address().port}`, room: { worldId: 'river-oaks' } };
  };
  const { post, connect } = await fixture(t);
  const office = (alice, action, more = {}) => alice.command({ type: 'office', action, officeId: 'jevica-office', ...more });
  const first = await start();
  const alice = await connect(first, 'alice');await connect(first, 'bob');
  assert.equal((await office(alice, 'invite', { peerId: 'bob' })).ok, true);
  alice.ws.close();await first.gateway.close();open.delete(first.gateway);
  // Nothing is loaded on the second gateway; the world is only stored.
  const second = await start();
  await second.gateway.separateAccounts('bob', 'alice', true);
  const back = await connect(second, 'alice');
  assert.deepEqual((await office(back, 'list')).offices[0].guests, [], 'the stored world was reached');
  assert.equal((await post(second, 'bob', '/api/blocks/list')).status, 200);
});
