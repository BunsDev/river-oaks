import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
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
import { createModerationNotifier } from '../moderation-notify.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';

// A report from the roster's Report button (preview/src/multiplayer-client.js) is the
// socket command {type:'report', playerId, reason}, with an optional `text` the reporter
// quotes. In both architectures it reaches the moderation store with what it carries (the
// quote and the reported account's last chat lines) and a response target, then the
// moderators' inbox (MODERATION_NOTIFY_URL) is told. The reporter is told only what is
// true: it was saved. Someone who has left but spoke recently can still be reported.
const SAVED = 'Report saved.';
// A moderators' inbox on a local HTTP server, recording every notice it receives.
async function inbox(t) {
  const received = [];
  const server = createHttpServer((req, res) => { let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { received.push({ authorization: req.headers.authorization, notice: JSON.parse(body) }); res.writeHead(204); res.end(); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/moderation`;
  const settled = async () => { for (let i = 0; i < 50 && !received.length; i++) await new Promise(resolve => setTimeout(resolve, 20)); return received; };
  return { url, received, settled };
}
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
const report = (from, playerId, reason = 'harassment', text) => from.command({ type: 'report', playerId, reason, ...(text === undefined ? {} : { text }) });
const chat = (from, text) => from.command({ type: 'chat', text });
// Closes a resident's socket; the town drops the connection on close, before any departure grace.
const leave = async ws => { ws.close(); await new Promise(resolve => setTimeout(resolve, 300)); };

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
  const { url, settled } = await inbox(t);
  const app = createDistributedServer({ auth, security, room, waitlist: approvedWaitlist, landmarks: createRedisLandmarks({ redis, prefix }),
    social: createRedisSocial({ redis, prefix }), blocks: createRedisBlocks({ redis, prefix }), origin, moderators: [], moderationNotifier: createModerationNotifier({ url, token: 'inbox-token' }), responseHours: 3 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close();await room.close();security.close();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const resident = async user => {
    const headers = { Origin: origin, Cookie: `test_session=${user}`, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' };
    const { ticket } = await (await fetch(`${base}/api/multiplayer/ticket?world=river-oaks`, { method: 'POST', headers, body: '{}' })).json();
    return socket(t, `${base.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket, protocol: String(WORLD_PROTOCOL_VERSION) })}`, { Origin: origin, Cookie: `test_session=${user}` });
  };
  const bob = await resident('bob'), carol = await resident('carol');
  assert.equal((await chat(carol, 'bob is a blort')).ok, true);
  // Blocking doesn't stop a report here either.
  const blocked = await fetch(`${base}/api/blocks/add?world=river-oaks`, { method: 'POST', body: JSON.stringify({ peerId: 'carol' }),
    headers: { Origin: origin, Cookie: 'test_session=bob', 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'application/json' } });
  assert.equal(blocked.status, 200);
  const refused = await report(bob, 'nobody-here');
  assert.deepEqual([refused.ok, refused.message], [false, 'Report could not be submitted.']);
  const saved = await report(bob, 'carol', 'harassment', 'bob is a blort');
  assert.deepEqual([saved.ok, saved.message], [true, SAVED]);
  const entries = (await redis.lrange(`${prefix}:audit`, 0, -1)).map(line => JSON.parse(line)).filter(entry => entry.kind === 'report');
  assert.deepEqual(entries.map(({ reporterId, targetId, reason }) => ({ reporterId, targetId, reason })), [{ reporterId: 'bob', targetId: 'carol', reason: 'harassment' }]);
  const [entry] = entries;
  assert.match(entry.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(entry.content, { quoted: 'bob is a blort', chat: [{ at: entry.content.chat[0].at, text: 'bob is a blort' }] });
  assert.ok(Math.abs(Date.parse(entry.respondBy) - Date.parse(entry.at) - 3 * 3_600_000) < 1000, 'due three hours after it was saved');
  const [notice] = await settled();
  assert.equal(notice.authorization, 'Bearer inbox-token');
  assert.deepEqual(notice.notice, { type: 'report', id: entry.id, at: entry.at, reason: 'harassment', content: entry.content, respondBy: entry.respondBy,
    reporter: { id: 'bob', name: notice.notice.reporter.name }, reported: { id: 'carol', name: notice.notice.reported.name } });
  // Carol leaves; she spoke here, so a report about her still lands.
  carol.ws.close();
  for (let i = 0; i < 100 && (await room.read()).connections.some(item => item.userId === 'carol'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  const gone = await report(bob, 'carol', 'disruption');
  assert.deepEqual([gone.ok, gone.message], [true, SAVED]);
});

test('a town report carries the quoted text and the reported resident\'s chat, names someone who has left, records a response target and reaches the inbox', { timeout: 30000 }, async t => {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-reports-'));
  const moderationFile = join(temporary, 'moderation.json');
  const { url, settled } = await inbox(t);
  const town = await createTown({ origin, env: { RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', MODERATION_NOTIFY_URL: url, MODERATION_NOTIFY_TOKEN: 'inbox-token', MODERATION_RESPONSE_HOURS: '2',
    MODERATION_FILE: moderationFile, WAITLIST_FILE: join(temporary, 'waitlist.json'), BLOCKS_FILE: join(temporary, 'blocks.json') }, devAuth: 'local', staticRoot: null });
  await new Promise(resolve => town.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await town.close();await rm(temporary, { recursive: true, force: true }); });
  const resident = async () => {
    const response = await fetch(origin + '/auth/session'), session = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
    const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const { ticket } = await (await post('/api/multiplayer/ticket')).json();
    return { id: session.user.id, post, ...await socket(t, `${origin.replace('http:', 'ws:')}/multiplayer?protocol=3&ticket=${ticket}`, { Origin: origin, Cookie: cookie }) };
  };
  const pat = await resident(), erin = await resident();
  const audit = async () => (await readFile(`${moderationFile}.audit.jsonl`, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal((await chat(erin, 'everyone here is a blort')).ok, true);
  assert.equal((await chat(pat, 'please stop')).ok, true);
  const before = Date.now();
  const saved = await report(pat, erin.id, 'harassment', '  everyone here\u0007 is a blort  ');
  assert.deepEqual([saved.ok, saved.message], [true, SAVED]);
  const [entry] = await audit();
  assert.match(entry.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(entry.content, { quoted: 'everyone here is a blort', chat: [{ at: entry.content.chat[0].at, text: 'everyone here is a blort' }] }, 'the quote, cleaned, and only erin\'s line');
  assert.ok(!Number.isNaN(Date.parse(entry.content.chat[0].at)));
  assert.ok(Math.abs(Date.parse(entry.respondBy) - Date.parse(entry.at) - 2 * 3_600_000) < 1000, 'due two hours after it was saved');
  assert.ok(Date.parse(entry.at) >= before - 1000);
  // The notice names the same report as the audit line: same id and time.
  const [notice] = await settled();
  assert.equal(notice.authorization, 'Bearer inbox-token');
  assert.deepEqual(notice.notice, { type: 'report', id: entry.id, at: entry.at, reason: 'harassment', content: entry.content, respondBy: entry.respondBy,
    reporter: { id: pat.id, name: notice.notice.reporter.name }, reported: { id: erin.id, name: notice.notice.reported.name } });
  assert.ok(notice.notice.reporter.name && notice.notice.reported.name, 'both accounts have shown names');
  // Erin leaves. A report about her still lands, because she spoke here; one about an id
  // nobody here has had is refused.
  await leave(erin.ws);
  const gone = await report(pat, erin.id, 'disruption');
  assert.deepEqual([gone.ok, gone.message], [true, SAVED]);
  assert.equal((await audit()).length, 2);
  assert.equal((await audit())[1].content.chat.length, 1, 'her line is still what it carries');
  const nobody = await report(pat, 'nobody-here', 'disruption');
  assert.deepEqual([nobody.ok, nobody.message], [false, 'Report could not be submitted.']);
  assert.equal((await audit()).length, 2);
});
