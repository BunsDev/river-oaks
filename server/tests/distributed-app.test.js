import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';

const origin = 'https://sim.jev.works';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const live = { skip: !process.env.REDIS_URL, timeout: 30_000 };
async function fixture(t) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  const sessions = new Map(['alice', 'bob', 'moderator'].map(userId => [userId, {
    userId, name: userId, sessionId: userId + '-session', csrfToken: 'test-csrf', expiresAt: Date.now() + 60_000,
  }]));
  const nodes = [];
  t.after(async () => {
    for (const node of nodes) await node.app.close();
    for (const node of nodes) await node.room.close();
    const keys = await redis.keys(prefix + ':*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  for (let i = 0; i < 2; i++) {
    const security = createRedisSecurity({ redis, prefix });
    const auth = {
      authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null,
      handle: async () => false,
    };
    const room = createRedisRoom({ redis, prefix, worldData: data, isAdmin:id=>id==='alice', authorize: async identity =>
      sessions.get(identity.userId)?.sessionId === identity.sessionId && !(await security.isBanned(identity.userId)) });
    const app = createDistributedServer({ auth, security, room, origin, moderators: ['moderator'] });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    nodes.push({ app, room, security, url: `http://127.0.0.1:${app.server.address().port}` });
  }
  const post = (node, user, path, body, extra = {}) => fetch(node.url + path, {
    method: 'POST', headers: { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json', ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const ticket = async (node, user) => {
    const response = await post(node, user, '/api/multiplayer/ticket');
    assert.equal(response.status, 200);
    return (await response.json()).ticket;
  };
  return { nodes, sessions, post, ticket };
}
function client(node, user, ticket) {
  const ws = new WebSocket(`${node.url.replace('http:', 'ws:')}/multiplayer?ticket=${ticket}`, {
    headers: { Origin: origin, Cookie: `test_session=${user}` },
  });
  const messages = [], waiters = new Set();
  ws.on('error', () => {});
  ws.on('message', raw => {
    const message = JSON.parse(raw); messages.push(message);
    for (const waiter of [...waiters]) if (waiter.match(message)) {
      waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(message);
    }
  });
  function waitFor(match, after = 0) {
    const found = messages.slice(after).find(match);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: setTimeout(() => { waiters.delete(waiter); reject(new Error('No matching server message')); }, 8000) };
      waiters.add(waiter);
    });
  }
  return { ws, messages, waitFor, async command(command) {
    const requestId = randomUUID();
    const result = waitFor(message => message.type === 'result' && message.requestId === requestId);
    ws.send(JSON.stringify({ ...command, requestId }));
    return result;
  } };
}
const closed = ws => new Promise(resolve => ws.once('close', (code) => resolve(code)));

test('distributed HTTP authentication and CSRF gates reject invalid tickets', live, async t => {
  const f = await fixture(t), [a] = f.nodes;
  assert.equal((await f.post(a, 'nobody', '/api/multiplayer/ticket')).status, 401);
  assert.equal((await f.post(a, 'alice', '/api/multiplayer/ticket', null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.post(a, 'alice', '/api/multiplayer/ticket', null, { 'X-CSRF-Token': 'wrong' })).status, 403);
});

test('different server instances share tickets, players, wishes, and durable acknowledgments', live, async t => {
  const f = await fixture(t), [a, b] = f.nodes;
  const alice = client(b, 'alice', await f.ticket(a, 'alice'));
  await alice.waitFor(message => message.selfId === 'alice');
  const bob = client(a, 'bob', await f.ticket(b, 'bob'));
  await bob.waitFor(message => message.selfId === 'bob' && message.players.length === 2);
  assert.equal((await alice.command({ type: 'travel', localId: 'local-00' })).ok, true);
  const grant = await alice.command({ type: 'wish', localId: 'local-00', kind: 'dragon' });
  assert.equal(grant.ok, true);
  const snapshot = await alice.waitFor(message => message.locals?.some(local => local.id === 'local-00' && local.wish?.ownerId === 'alice'));
  assert.ok(alice.messages.indexOf(snapshot) < alice.messages.indexOf(grant));
  await bob.waitFor(message => message.locals?.some(local => local.id === 'local-00' && local.wish?.ownerId === 'alice'));
  assert.equal((await alice.command({ type: 'undoWish', localId: 'local-00' })).ok, true);
});

test('account replacement, ban, and logout cross instance boundaries', live, async t => {
  const f = await fixture(t), [a, b] = f.nodes;
  const first = client(a, 'alice', await f.ticket(b, 'alice'));
  await first.waitFor(message => message.selfId === 'alice');
  const replaced = closed(first.ws);
  const second = client(b, 'alice', await f.ticket(a, 'alice'));
  await second.waitFor(message => message.selfId === 'alice');
  assert.equal(await replaced, 4009);
  const ended = closed(second.ws);
  const response = await f.post(a, 'moderator', '/api/moderation/ban', { userId: 'alice', banned: true });
  assert.equal(response.status, 200);
  assert.equal(await ended, 4003);
  assert.equal((await f.post(b, 'alice', '/api/multiplayer/ticket')).status, 403);
  const bob = client(b, 'bob', await f.ticket(a, 'bob'));
  await bob.waitFor(message => message.selfId === 'bob');
  const logout = closed(bob.ws);
  f.sessions.delete('bob');
  await a.app.disconnectUser('bob', 'bob-session');
  assert.equal(await logout, 4003);
});
