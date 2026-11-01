import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createRedisSocial } from '../social.js';
import { createRedisGroups } from '../groups.js';
import { createRedisWaitlist, createFileWaitlist } from '../waitlist.js';
import { createContentFilter } from '../content-filter.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';

// The content filter (#292, App Review 1.2) screens every text a resident writes for
// others, on both architectures, before any store sees it. These tests drive the real
// routes: the town over HTTP and WebSocket with its file stores, and the hosted gateway
// with Redis. The terms come from config/content-filter.json; "kill yourself" is one.
const FILTERED = 'kill yourself', CHAT_REFUSED = 'That message can’t be sent here.', TEXT_REFUSED = 'That text can’t be used here.';
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
// A joined socket that can send commands, wait for their results, and read the latest snapshot.
function socket(t, url, headers) {
  const ws = new WebSocket(url, { headers }); ws.on('error', () => {}); t.after(() => ws.terminate());
  const results = new Map(); let joined; const state = { snapshot: null };
  const ready = new Promise(resolve => { joined = resolve; });
  ws.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'snapshot' || Array.isArray(message.players)) { state.snapshot = message.snapshot ?? message; joined(); }
    if (message.type === 'result') results.get(message.requestId)?.(message);
  });
  const command = message => new Promise(resolve => { const requestId = randomUUID(); results.set(requestId, resolve); ws.send(JSON.stringify({ ...message, requestId })); });
  // The town broadcasts every 200 ms and the gateway on change: wait for the chat to arrive.
  const chatText = async () => {
    for (let waited = 0; !(state.snapshot?.chat ?? []).length && waited < 2000; waited += 50) await new Promise(resolve => setTimeout(resolve, 50));
    return (state.snapshot?.chat ?? []).map(entry => entry.text);
  };
  return ready.then(() => ({ ws, command, chatText }));
}

async function town(t, extraEnv = {}) {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-filter-'));
  const instance = await createTown({ origin, env: { RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1',
    MODERATION_FILE: join(temporary, 'moderation.json'), WAITLIST_FILE: join(temporary, 'waitlist.json'), BLOCKS_FILE: join(temporary, 'blocks.json'), ...extraEnv }, devAuth: 'local', staticRoot: null });
  await new Promise(resolve => instance.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await instance.close(); await rm(temporary, { recursive: true, force: true }); });
  const resident = async () => {
    const response = await fetch(origin + '/auth/session'), session = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
    const post = async (path, body = {}) => {
      const reply = await fetch(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: reply.status, body: await reply.json() };
    };
    const { ticket } = (await post('/api/multiplayer/ticket')).body;
    return { id: session.user.id, post, ...await socket(t, `${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${ticket}`, { Origin: origin, Cookie: cookie }) };
  };
  return { origin, temporary, resident };
}

const event = (title, description) => ({ title, description, placeId: 'arrival', startsAt: Date.now() + 3_600_000, endsAt: Date.now() + 7_200_000, capacity: 4 });

test('the standalone town refuses filtered chat, messages, groups, events and profiles, and keeps clean text', { timeout: 30000 }, async t => {
  const { resident } = await town(t);
  const pat = await resident(), erin = await resident();

  // Town chat, over the socket. The refusal names the error and the shown message; clean chat lands.
  const refused = await pat.command({ type: 'chat', text: `Please ${FILTERED} now` });
  assert.deepEqual([refused.ok, refused.error, refused.message], [false, 'chat_filtered', CHAT_REFUSED]);
  assert.equal((await pat.command({ type: 'chat', text: 'k i l l y o u r s e l f' })).error, 'chat_filtered', 'spaced-out letters are read as the phrase');
  await new Promise(resolve => setTimeout(resolve, 1100)); // the chat cooldown
  const sent = await pat.command({ type: 'chat', text: 'Good evening, garden' });
  assert.equal(sent.ok, true);
  assert.deepEqual(await erin.chatText(), ['Good evening, garden']);

  // Direct messages, once the two are contacts.
  assert.equal((await pat.post('/api/social/request', { peerId: erin.id })).status, 200);
  assert.equal((await erin.post('/api/social/accept', { peerId: pat.id })).status, 200);
  const message = await pat.post('/api/social/send', { peerId: erin.id, text: `${FILTERED}!` });
  assert.deepEqual([message.status, message.body], [400, { error: CHAT_REFUSED, reason: 'filtered' }]);
  assert.equal((await pat.post('/api/social/send', { peerId: erin.id, text: 'See you at the plaza' })).status, 200);

  // Groups: the name, the description and a message.
  assert.deepEqual((await pat.post('/api/groups/create', { name: FILTERED, description: 'x' })).body, { error: TEXT_REFUSED, reason: 'filtered' });
  assert.deepEqual((await pat.post('/api/groups/create', { name: 'Walkers', description: `we ${FILTERED}` })).body, { error: TEXT_REFUSED, reason: 'filtered' });
  const group = await pat.post('/api/groups/create', { name: 'Walkers', description: 'Evening walks' });
  assert.equal(group.status, 200);
  assert.equal((await pat.post('/api/groups/send', { groupId: group.body.group.id, text: `go ${FILTERED}` })).status, 400);
  assert.equal((await pat.post('/api/groups/send', { groupId: group.body.group.id, text: 'Meet at seven' })).status, 200);

  // Public events: the title and the description.
  assert.deepEqual((await pat.post('/api/events/create', event(FILTERED, 'An evening'))).body, { error: TEXT_REFUSED, reason: 'filtered' });
  assert.equal((await pat.post('/api/events/create', event('Lantern walk', `then ${FILTERED}`))).status, 400);
  assert.equal((await pat.post('/api/events/create', event('Lantern walk', 'An evening by the bayou'))).status, 201);

  // Profiles: tagline, bio, pronouns and each interest.
  const profile = { tagline: 'Hi', bio: 'Here for the gardens', pronouns: 'they', interests: ['walking'], expectedVersion: 0 };
  for (const change of [{ tagline: FILTERED }, { bio: `I ${FILTERED}` }, { pronouns: 'kys' }, { interests: ['walking', FILTERED] }]) {
    const reply = await pat.post('/api/profile/save', { ...profile, ...change });
    assert.deepEqual([reply.status, reply.body], [400, { error: TEXT_REFUSED, reason: 'filtered' }], JSON.stringify(change));
  }
  assert.equal((await pat.post('/api/profile/save', profile)).status, 200);
});

test('a filter file can mask chat instead, and RIVER_OAKS_CONTENT_FILTER=off turns screening off', { timeout: 30000 }, async t => {
  const terms = join(await mkdtemp(join(tmpdir(), 'river-oaks-terms-')), 'terms.json');
  t.after(() => rm(terms, { force: true }));
  await writeFile(terms, JSON.stringify({ refuse: ['blort'], mask: ['chat'] }));
  const masked = await town(t, { RIVER_OAKS_CONTENT_FILTER_FILE: terms });
  const pat = await masked.resident(), erin = await masked.resident();
  assert.equal((await pat.command({ type: 'chat', text: 'You blort, you' })).ok, true);
  assert.deepEqual(await erin.chatText(), ['You ∗∗∗∗∗, you']);
  assert.equal((await pat.post('/api/groups/create', { name: 'blort', description: '' })).status, 400, 'only chat is masked by this file');
  assert.equal((await pat.post('/api/groups/create', { name: FILTERED, description: '' })).status, 200, 'the file replaces the default list');

  const off = await town(t, { RIVER_OAKS_CONTENT_FILTER: 'off' });
  const sam = await off.resident();
  assert.equal((await sam.command({ type: 'chat', text: FILTERED })).ok, true);
  assert.equal((await sam.post('/api/groups/create', { name: FILTERED, description: '' })).status, 200);
});

test('a username that reads as a filtered term is refused like a reserved one, in the file store', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-usernames-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const waitlist = await createFileWaitlist(join(temporary, 'waitlist.json'), { contentFilter: createContentFilter({ refuse: ['blort', 'kys'] }) });
  await waitlist.request({ userId: 'user_1', name: 'ab', email: 'one@example.org' });
  const set = username => waitlist.setUsername({ userId: 'user_1', username, actorId: 'user_1' });
  for (const username of ['blort', 'Blort', 'bl0rt', 'blorts', 'kys', 'k-y-s', 'K.Y.S']) {
    assert.deepEqual(await set(username), { ok: false, reason: 'invalid', message: 'That name can’t be used here.' }, username);
  }
  assert.equal((await set('blorting')).ok, true, 'a longer word is not the term');
  assert.equal((await waitlist.get?.('user_1'))?.username ?? (await waitlist.list()).find(record => record.userId === 'user_1').username, 'blorting');
});

test('the hosted gateway refuses filtered chat, messages, groups and usernames over Redis', { skip: !process.env.REDIS_URL, timeout: 30000 }, async t => {
  const origin = 'https://sim.jev.works';
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 }); redis.on('error', () => {});
  const prefix = `{river-oaks:test-filter:${randomUUID()}}`;
  const sessions = new Map(['bob', 'carol'].map(userId => [userId, { userId, name: userId, sessionId: `${userId}-session`, csrfToken: 'test-csrf', expiresAt: Date.now() + 120_000 }]));
  const security = createRedisSecurity({ redis, prefix });
  const auth = { authenticate: async req => sessions.get(req.headers.cookie?.match(/test_session=(\w+)/)?.[1]) ?? null, handle: async () => false };
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: data, authorize: async identity => sessions.get(identity.userId)?.sessionId === identity.sessionId });
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, social: createRedisSocial({ redis, prefix }), groups: createRedisGroups({ redis, prefix }), origin, moderators: [] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await room.close(); security.close(); const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headersFor = user => ({ Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' });
  const post = async (user, path, body) => { const reply = await fetch(`${base}${path}?world=river-oaks`, { method: 'POST', headers: headersFor(user), body: JSON.stringify(body) }); return { status: reply.status, body: await reply.json() }; };
  const resident = async user => {
    const { ticket } = (await post(user, '/api/multiplayer/ticket', {})).body;
    return socket(t, `${base.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket, protocol: String(WORLD_PROTOCOL_VERSION) })}`, { Origin: origin, Cookie: `test_session=${user}` });
  };
  const bob = await resident('bob'), carol = await resident('carol');
  const refused = await bob.command({ type: 'chat', text: FILTERED });
  assert.deepEqual([refused.ok, refused.error, refused.message], [false, 'chat_filtered', CHAT_REFUSED]);
  assert.equal((await bob.command({ type: 'chat', text: 'Evening, all' })).ok, true);
  assert.deepEqual(await carol.chatText(), ['Evening, all']);
  assert.equal((await post('bob', '/api/social/request', { peerId: 'carol' })).status, 200);
  assert.equal((await post('carol', '/api/social/accept', { peerId: 'bob' })).status, 200);
  assert.deepEqual((await post('bob', '/api/social/send', { peerId: 'carol', text: FILTERED })).body, { error: CHAT_REFUSED, reason: 'filtered' });
  assert.equal((await post('bob', '/api/social/send', { peerId: 'carol', text: 'Hello' })).status, 200);
  assert.deepEqual((await post('bob', '/api/groups/create', { name: FILTERED, description: '' })).body, { error: TEXT_REFUSED, reason: 'filtered' });

  const waitlist = createRedisWaitlist({ redis, prefix: `${prefix}:access`, contentFilter: createContentFilter({ refuse: ['blort'] }) });
  await waitlist.request({ userId: 'user_1', name: 'ab', email: 'one@example.org' });
  assert.deepEqual(await waitlist.setUsername({ userId: 'user_1', username: 'bl0rt', actorId: 'user_1' }), { ok: false, reason: 'invalid', message: 'That name can’t be used here.' });
  assert.equal((await waitlist.setUsername({ userId: 'user_1', username: 'blorting', actorId: 'user_1' })).ok, true);
});
