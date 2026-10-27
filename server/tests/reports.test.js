import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisSocial } from '../social.js';
import { createRedisBlocks } from '../blocks.js';
import { createRedisLandmarks } from '../landmarks.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';

// A report from the roster's Report button (preview/src/multiplayer-client.js) is the
// socket command {type:'report', playerId, reason}. In both architectures it reaches the
// moderation store, and the reporter is told only what is true: it was saved. Nobody is
// notified and nobody yet owns reading reports (docs/app-review-292.md), so it says no more.
const SAVED = 'Report saved.';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
async function freePort(){
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
// A joined socket that can send commands and wait for their results.
function socket(t, url, headers) {
  const ws = new WebSocket(url, { headers });ws.on('error', () => {});t.after(() => ws.terminate());
  const results = new Map();let joined;
  const ready = new Promise(resolve => { joined = resolve; });
  ws.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot' || Array.isArray(message.players)) joined(); if (message.type === 'result') results.get(message.requestId)?.(message); });
  const command = message => new Promise(resolve => { const requestId = randomUUID();results.set(requestId, resolve);ws.send(JSON.stringify({ ...message, requestId })); });
  return ready.then(() => ({ ws, command }));
}
const report = (from, playerId, reason = 'harassment') => from.command({ type: 'report', playerId, reason });

test('a report from the standalone town reaches its audit file, even about a blocked resident', { timeout: 30000 }, async t => {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-reports-'));
  const moderationFile = join(temporary, 'moderation.json');
  const town = await createTown({ origin, env: { RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1',
    MODERATION_FILE: moderationFile, WAITLIST_FILE: join(temporary, 'waitlist.json'), BLOCKS_FILE: join(temporary, 'blocks.json') }, devAuth: 'local', staticRoot: null });
  await new Promise(resolve => town.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await town.close();await rm(temporary, { recursive: true, force: true }); });
  const resident = async () => {
    const response = await fetch(origin + '/auth/session'), session = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
    const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const { ticket } = await (await post('/api/multiplayer/ticket')).json();
    return { id: session.user.id, post, ...await socket(t, `${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${ticket}`, { Origin: origin, Cookie: cookie }) };
  };
  const pat = await resident(), erin = await resident(), kim = await resident();
  const audit = async () => (await readFile(`${moderationFile}.audit.jsonl`, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));

  // Refusals write nothing. They count toward the reporter's limit, so Kim makes them.
  for (const [playerId, reason] of [[kim.id, 'harassment'], ['nobody-here', 'harassment'], [erin.id, 'spam']]) {
    const refused = await report(kim, playerId, reason);
    assert.deepEqual([refused.ok, refused.message], [false, 'Report could not be submitted.']);
  }
  assert.deepEqual(await audit(), []);
  assert.equal((await report(kim, erin.id)).ok, false, 'a fourth attempt in the minute is refused, valid or not');
  // Blocking doesn't stop a report: moderation works in both directions.
  assert.equal((await pat.post('/api/blocks/add', { peerId: erin.id })).status, 200);
  const saved = await report(pat, erin.id);
  assert.deepEqual([saved.ok, saved.message], [true, SAVED]);
  assert.deepEqual((await audit()).map(({ type, reporterId, userId, reason }) => ({ type, reporterId, userId, reason })),
    [{ type: 'report', reporterId: pat.id, userId: erin.id, reason: 'harassment' }]);
  assert.equal((await report(erin, pat.id, 'disruption')).ok, true, 'the blocked resident can report too');
  // Three a minute per reporter.
  assert.equal((await report(pat, erin.id, 'cheating')).ok, true);assert.equal((await report(pat, erin.id, 'disruption')).ok, true);
  assert.equal((await report(pat, erin.id)).ok, false);
  assert.equal((await audit()).length, 4);
});

test('a report on the hosted path reaches the shared Redis audit list', { skip: !process.env.REDIS_URL, timeout: 30000 }, async t => {
  const origin = 'https://sim.jev.works';
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });redis.on('error', () => {});
  const prefix = `{river-oaks:test-reports:${randomUUID()}}`;
  const sessions = new Map(['bob', 'carol'].map(userId => [userId, { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 120_000 }]));
  const security = createRedisSecurity({ redis, prefix });
  const auth = { authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null, handle: async () => false };
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async identity => sessions.get(identity.userId)?.sessionId === identity.sessionId });
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, landmarks: createRedisLandmarks({ redis, prefix }),
    social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), origin, moderators: [] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const resident = async user => {
    const headers = { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' };
    const { ticket } = await (await fetch(`${base}/api/multiplayer/ticket?world=river-oaks`, { method: 'POST', headers, body: '{}' })).json();
    return socket(t, `${base.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket, protocol: String(WORLD_PROTOCOL_VERSION) })}`, { Origin: origin, Cookie: `test_session=${user}` });
  };
  const bob = await resident('bob');await resident('carol');
  // Blocking doesn't stop a report here either.
  const blocked = await fetch(`${base}/api/blocks/add?world=river-oaks`, { method: 'POST', body: JSON.stringify({ peerId: 'carol' }),
    headers: { Origin: origin, Cookie: 'test_session=bob', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' } });
  assert.equal(blocked.status, 200);
  const refused = await report(bob, 'nobody-here');
  assert.deepEqual([refused.ok, refused.message], [false, 'Report could not be submitted.']);
  const saved = await report(bob, 'carol');
  assert.deepEqual([saved.ok, saved.message], [true, SAVED]);
  const entries = (await redis.lrange(`${prefix}:audit`, 0, -1)).map(line => JSON.parse(line)).filter(entry => entry.kind === 'report');
  assert.deepEqual(entries.map(({ reporterId, targetId, reason }) => ({ reporterId, targetId, reason })), [{ reporterId: 'bob', targetId: 'carol', reason: 'harassment' }]);
});
