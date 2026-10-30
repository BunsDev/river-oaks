// #287: a native host (desktop shell, iOS probe) signs in through the WorkOS
// device flow and posts the one-time refresh token to /auth/desktop/exchange.
// Only the sealed session cookie comes back. Everything after that (waitlist
// status, the asset gate, join tickets and the socket) must deny a pending,
// banned, revoked or signed-out account exactly as it does for a browser.
// HTTP, cookies, CSRF, tickets, sockets, the file/Redis stores and the hosted
// asset middleware are real; only WorkOS and GitHub are fixtures, so this does
// not stand in for a live device round trip (docs/ios-auth.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createAuth } from '../auth.js';
import { createRedisAuth } from '../redis-auth.js';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createFileWaitlist, createRedisWaitlist } from '../waitlist.js';
import { createModeration } from '../moderation.js';
import { createMemoryLandmarks, createRedisLandmarks } from '../landmarks.js';
import { createMemorySocial, createRedisSocial } from '../social.js';
import { createGameAssetMiddleware } from '../../middleware.js';
import { ASSET_GATE_COOKIE, ASSET_GATE_TTL_MS } from '../asset-gate.js';
import { createAuthAdapter } from './redis-auth-fixture.js';
import { createGitHubFixture } from './github-fixture.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';

const SESSION = 'river_oaks_session';
const config = { apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32) };
const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));

// WorkOS rotates refresh tokens: the device flow hands the app one token, the
// exchange spends it, and a replayed or lapsed token is refused with 400
// invalid_grant. The fixture keeps that rule; the adapter still mints sessions.
function deviceTokens(workos, now = Date.now) {
  const issued = new Map();
  const mint = workos.userManagement.authenticateWithRefreshToken.bind(workos.userManagement);
  let calls = 0;
  workos.userManagement.authenticateWithRefreshToken = async options => {
    calls++;
    const grant = issued.get(options.refreshToken);
    if (!grant || grant.used || grant.expiresAt <= now()) throw Object.assign(new Error('Invalid refresh token'), { status: 400, code: 'invalid_grant' });
    grant.used = true;
    workos.setUserId(grant.userId);
    workos.setAuthenticationMethod(grant.method);
    return mint({ ...options, refreshToken: 'private-desktop-refresh' });
  };
  return {
    calls: () => calls,
    issue(userId, { method = 'GitHubOAuth', ttlMs = 600_000 } = {}) {
      const token = `private-device-${randomUUID()}`;
      issued.set(token, { userId, method, used: false, expiresAt: now() + ttlMs });
      return token;
    },
  };
}

async function freePort() {
  const server = createNetServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const sessionCookie = response => response.headers.getSetCookie().find(value => value.startsWith(`${SESSION}=`)) ?? null;
const cookieValue = header => header?.split(';')[0] ?? null;
const exchange = ({ base, origin }, refreshToken, headers = {}) => fetch(`${base}/auth/desktop/exchange`, { method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ refreshToken }) });
// fetch() always sends an Origin on POST; the raw request is what a client without one sends.
const rawExchange = ({ base }, refreshToken) => new Promise((resolve, reject) => {
  const { hostname, port } = new URL(base);
  const req = httpRequest({ hostname, port, method: 'POST', path: '/auth/desktop/exchange', headers: { 'Content-Type': 'application/json' } }, res => {
    res.resume(); res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie'] ?? [] }));
  });
  req.on('error', reject); req.end(JSON.stringify({ refreshToken }));
});
const session = async ({ base }, cookie) => (await fetch(`${base}/auth/session`, { headers: { Cookie: cookie } })).json();
const get = ({ base }, path, cookie) => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const post = ({ base, origin }, path, { cookie, csrf, body = {}, headers = {} }) => fetch(`${base}${path}`, { method: 'POST',
  headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
// Resolves with the upgrade status: 101 and the first frame when joined, or the rejection status.
function connect(t, { base, origin }, { ticket, cookie, wsOrigin = origin, protocol = WORLD_PROTOCOL_VERSION }) {
  return new Promise(resolve => {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/multiplayer?${new URLSearchParams({ ticket: ticket ?? '', protocol: String(protocol) })}`,
      { headers: { Origin: wsOrigin, Cookie: cookie } });
    // A join that never answers is a failure, not a hang.
    const timer = setTimeout(() => resolve({ status: 0, error: new Error('no upgrade answer in 5 s'), ws }), 5000);
    t.after(() => { clearTimeout(timer); ws.terminate(); });
    ws.once('unexpected-response', (req, res) => { res.resume(); clearTimeout(timer); resolve({ status: res.statusCode, ws }); });
    ws.once('error', error => { clearTimeout(timer); resolve({ status: 0, error, ws }); });
    ws.once('message', data => { clearTimeout(timer); resolve({ status: 101, ws, frame: JSON.parse(data) }); });
  });
}
const closed = ws => new Promise(resolve => { if (ws.readyState === WebSocket.CLOSED) resolve(null); else ws.once('close', code => resolve(code)); });
// A signed-in native client: exchange, then the identity the server reports.
async function resident(t, target, tokens, userId, options) {
  const exchanged = await exchange(target, tokens.issue(userId, options));
  assert.equal(exchanged.status, 200, `${userId} exchange`);
  const cookie = cookieValue(sessionCookie(exchanged));
  const identity = await session(target, cookie);
  assert.equal(identity.authenticated, true);
  const ticket = async () => post(target, '/api/multiplayer/ticket', { cookie, csrf: identity.csrfToken });
  return { userId, cookie, csrf: identity.csrfToken, identity, ticket };
}

async function standalone(t) {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`, base = origin;
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-native-exchange-'));
  const root = join(temporary, 'dist');
  await mkdir(join(root, 'data'), { recursive: true }); await mkdir(join(root, 'assets'), { recursive: true });
  for (const [file, text] of [['index.html', '<!doctype html>'], ['assets/main-game.js', 'fixture'], ['data/district.json', '{}']]) await writeFile(join(root, file), text);
  const workos = createAuthAdapter(), tokens = deviceTokens(workos);
  const github = createGitHubFixture({ 1001: 'val-dev', 1002: 'second-resident' });
  const moderation = await createModeration(join(temporary, 'moderation.json'));
  const waitlist = await createFileWaitlist(join(temporary, 'waitlist.json'), { admins: ['admin_1'] });
  const tombstones = new Set();
  let app;
  const auth = createAuth({ ...config, origin, workos, githubFetch: github.fetcher, accountActive: async id => !tombstones.has(id),
    usernameOf: id => waitlist.usernameOf(id), onLogout: userId => app.disconnectUser(userId) });
  const players = new Map();
  const world = { worldId: 'river-oaks', players,
    join(identity) { players.set(identity.userId, { id: identity.userId, name: identity.name, position: [0, 0, 0], yaw: 0 }); return { ok: true }; },
    leave(id) { players.delete(id); }, command() { return { ok: true }; }, step() {},
    snapshot() { return { type: 'snapshot', players: [...players.values()], locals: [], wishes: {} }; } };
  app = createGameServer({ auth, world, waitlist, waitlistAdmins: ['admin_1'], moderation, origin, staticRoot: root,
    landmarks: createMemoryLandmarks(), social: createMemorySocial() });
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); auth.close(); await rm(temporary, { recursive: true, force: true }); });
  return { base, origin, workos, tokens, waitlist, moderation, tombstones, github };
}

test('standalone town: the native exchange admits one token once, and every later gate follows the account', { timeout: 60_000 }, async t => {
  const f = await standalone(t);
  const token = f.tokens.issue('user_1');

  // The Origin must be the server's own origin exactly: a bundled app origin,
  // a trailing slash, an opaque origin or none at all is refused before WorkOS is asked.
  for (const wrong of ['https://evil.example', `${f.origin}/`, 'null', 'capacitor://localhost', 'ionic://localhost']) {
    const refused = await exchange(f, token, { Origin: wrong });
    assert.equal(refused.status, 403, wrong);
    assert.deepEqual(await refused.json(), { error: 'invalid_origin' });
    assert.equal(sessionCookie(refused), null, wrong);
  }
  const missing = await rawExchange(f, token);
  assert.deepEqual([missing.status, missing.cookie], [403, []], 'no Origin header');
  assert.equal((await exchange(f, token, { 'Content-Type': 'text/plain' })).status, 403, 'a non-JSON content type');
  for (const malformed of ['', 'short', 'x'.repeat(2049), null, 42]) assert.equal((await exchange(f, malformed)).status, 400, JSON.stringify(malformed)?.slice(0, 12));
  assert.equal(f.tokens.calls(), 0, 'nothing reached WorkOS');

  // The real exchange: one HttpOnly cookie, nothing else about the session in the reply.
  const accepted = await exchange(f, token);
  assert.equal(accepted.status, 200);
  const reply = await accepted.text();
  assert.deepEqual(JSON.parse(reply), { authenticated: true });
  assert.doesNotMatch(reply, /private-/, 'no token or sealed session in the body');
  const header = sessionCookie(accepted);
  assert.match(header, /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
  assert.doesNotMatch(header, /Secure/, 'a loopback http origin sets no Secure flag (the hosted https origin does)');
  const val = { cookie: cookieValue(header) };
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  val.identity = await session(f, val.cookie);
  assert.equal(val.identity.authenticated, true);
  assert.deepEqual(val.identity.user, { id: 'user_1', name: 'val-dev' }, 'named from the GitHub lookup, not the token');
  assert.match(val.identity.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  val.csrf = val.identity.csrfToken;

  // The spent token, an expired one and a session from an unsupported provider
  // create no session. WorkOS refuses them; today the route reports that as
  // 503 auth_unavailable (its catch-all), so a native client must treat the
  // reply as final for that token and sign in again rather than retry it.
  const replayed = await exchange(f, token);
  assert.equal(replayed.status, 503);
  assert.equal(sessionCookie(replayed), null, 'a replayed token issues nothing');
  const expired = await exchange(f, f.tokens.issue('user_1', { ttlMs: 0 }));
  assert.deepEqual([expired.status, sessionCookie(expired)], [503, null], 'an expired token issues nothing');
  assert.equal((await session(f, val.cookie)).authenticated, true, 'the first session is unaffected by the replay');
  const apple = await exchange(f, f.tokens.issue('user_9', { method: 'AppleOAuth' }));
  assert.deepEqual([apple.status, await apple.json(), sessionCookie(apple)], [403, { error: 'unsupported_provider' }, null],
    'Sign in with Apple is not an accepted session method until the server lists it');
  assert.equal((await session(f, 'river_oaks_session=forged')).authenticated, false);

  // Pending: signed in, named on the waitlist, and kept out of everything that is the town.
  const status = await get(f, '/api/waitlist/status', val.cookie);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).status, 'pending');
  assert.equal(status.headers.getSetCookie().some(value => value.startsWith(`${ASSET_GATE_COOKIE}=`)), false, 'the standalone town issues no asset pass');
  const ticketWhilePending = await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf });
  assert.deepEqual([ticketWhilePending.status, await ticketWhilePending.json()], [403, { error: 'waitlist_approval_required' }]);
  for (const path of ['/data/district.json', '/assets/main-game.js']) assert.equal((await get(f, path, val.cookie)).status, 403, path);
  assert.equal((await get(f, '/', val.cookie)).status, 200, 'the entry page stays public');
  assert.equal((await connect(t, f, { ticket: 'x'.repeat(43), cookie: val.cookie })).status, 401, 'no ticket can exist while pending');

  // Approved: the ticket is one-use, bound to its session, and not spent by a cross-origin attempt.
  await f.waitlist.decide({ userId: 'user_1', approved: true, actorId: 'admin_1' });
  assert.equal((await get(f, '/data/district.json', val.cookie)).status, 200);
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: 'wrong' })).status, 403, 'CSRF still applies to a native session');
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf, headers: { Origin: 'capacitor://localhost' } })).status, 403);
  const issued = await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf });
  assert.equal(issued.status, 200);
  const { ticket } = await issued.json();
  const pat = await resident(t, f, f.tokens, 'user_2');
  await get(f, '/api/waitlist/status', pat.cookie);
  await f.waitlist.decide({ userId: 'user_2', approved: true, actorId: 'admin_1' });
  assert.equal((await connect(t, f, { ticket, cookie: pat.cookie })).status, 401, 'another approved session cannot spend it');
  assert.equal((await connect(t, f, { ticket, cookie: val.cookie, wsOrigin: 'https://evil.example' })).status, 403, 'wrong socket Origin');
  const joined = await connect(t, f, { ticket, cookie: val.cookie });
  assert.equal(joined.status, 101, 'the resident still has the ticket after those refusals');
  assert.equal(joined.frame.type, 'snapshot');
  assert.equal((await connect(t, f, { ticket, cookie: val.cookie })).status, 401, 'a ticket joins once');
  assert.equal((await connect(t, f, { ticket, cookie: val.cookie })).status, 401);

  // Banned: every gate closes, the open socket ends at its next command, and the ticket in hand dies with it.
  const spare = (await (await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).json()).ticket;
  await f.moderation.setBanned('user_1', true, 'mod_1');
  const banned = await get(f, '/api/waitlist/status', val.cookie);
  assert.deepEqual([banned.status, await banned.json()], [403, { error: 'access_denied' }]);
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 403);
  assert.equal((await get(f, '/data/district.json', val.cookie)).status, 403);
  assert.equal((await connect(t, f, { ticket: spare, cookie: val.cookie })).status, 401);
  const ending = closed(joined.ws);
  joined.ws.send(JSON.stringify({ type: 'pose', position: [1, 0, 0], yaw: 0 }));
  assert.equal(await ending, 4001, 'the live socket is dropped as soon as it speaks');
  assert.equal((await session(f, val.cookie)).authenticated, true, 'the session itself is a WorkOS fact; the ban is enforced at every gate');

  // Revoked approval closes the same gates without a ban.
  await f.moderation.setBanned('user_1', false, 'mod_1');
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 200, 'unbanned and still approved');
  const beforeRevocation = (await (await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).json()).ticket;
  await f.waitlist.decide({ userId: 'user_1', approved: false, actorId: 'admin_1' });
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 403);
  assert.equal((await get(f, '/data/district.json', val.cookie)).status, 403);
  assert.equal((await connect(t, f, { ticket: beforeRevocation, cookie: val.cookie })).status, 401);
  assert.equal((await get(f, '/api/waitlist/status', val.cookie)).status, 200, 'the gate page can still show "not approved"');

  // Signed out: the cookie is dead everywhere, and a ticket issued before logout cannot join.
  const patTicket = (await (await pat.ticket()).json()).ticket;
  const logout = await post(f, '/auth/logout', { cookie: pat.cookie, csrf: pat.csrf });
  assert.equal(logout.status, 200);
  assert.match((await logout.json()).url, /^https:\/\/api\.workos\.com\/user_management\/sessions\/logout\?session_id=/);
  assert.equal((await session(f, pat.cookie)).authenticated, false);
  assert.equal((await pat.ticket()).status, 401);
  assert.equal((await get(f, '/data/district.json', pat.cookie)).status, 403);
  assert.equal((await connect(t, f, { ticket: patTicket, cookie: pat.cookie })).status, 401);
  assert.equal((await post(f, '/auth/logout', { cookie: pat.cookie, csrf: pat.csrf })).status, 401, 'a second logout has nothing to end');

  // Deleted (tombstoned) accounts cannot exchange at all, and an existing session stops answering.
  const kim = await resident(t, f, f.tokens, 'user_3', { method: 'MagicAuth' });
  assert.deepEqual(kim.identity.user, { id: 'user_3', name: 'Visitor #user_3' }, 'an email-code session is accepted and never looked up on GitHub');
  f.tombstones.add('user_3');
  assert.equal((await session(f, kim.cookie)).authenticated, false);
  const gone = await exchange(f, f.tokens.issue('user_3', { method: 'MagicAuth' }));
  assert.deepEqual([gone.status, await gone.json(), sessionCookie(gone)], [403, { error: 'account_unavailable' }, null]);
});

async function hosted(t) {
  const origin = 'https://river.example';
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 }); redis.on('error', () => {});
  const prefix = `{river-oaks:test-native-exchange:${randomUUID()}}`;
  const workos = createAuthAdapter(), tokens = deviceTokens(workos);
  const github = createGitHubFixture({ 1001: 'val-dev', 1002: 'second-resident' });
  const tombstones = new Set();
  const waitlist = createRedisWaitlist({ redis, prefix, admins: ['admin_1'] });
  const security = createRedisSecurity({ redis, prefix });
  let app;
  const auth = createRedisAuth({ ...config, origin, redis, prefix, workos, githubFetch: github.fetcher, accountActive: async id => !tombstones.has(id),
    usernameOf: id => waitlist.usernameOf(id), onLogout: (userId, sessionId) => app.disconnectUser(userId, sessionId) });
  const room = createRedisRoom({ redis, prefix, worldId: 'river-oaks', worldData: district, authorize: identity => auth.isSessionActive(identity.userId, identity.sessionId) });
  app = createDistributedServer({ auth, security, room, waitlist, waitlistAdmins: ['admin_1'], origin, moderators: [], assetGateSecret: config.cookiePassword,
    landmarks: createRedisLandmarks({ redis, prefix }), social: createRedisSocial({ redis, prefix }) });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); await room.close(); security.close(); auth.close();
    const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  // The Vercel middleware, asking this server's own /api/waitlist/status when a browser has no pass.
  const serverChecks = [];
  const gateAt = now => createGameAssetMiddleware({ secret: config.cookiePassword, now,
    fetcher: (url, options) => { serverChecks.push(new URL(url).pathname); return fetch(`${base}${new URL(url).pathname}`, options); },
    forward: () => new Response('asset') });
  const gate = gateAt(Date.now);
  const asset = (cookie, middleware = gate) => middleware(new Request(`${origin}/data/district.json`, { headers: cookie ? { cookie } : {} }));
  return { base, origin, workos, tokens, waitlist, security, tombstones, asset, gateAt, serverChecks };
}

test('hosted path: the native exchange and the Redis gates deny pending, banned, revoked and signed-out accounts', { skip: !process.env.REDIS_URL, timeout: 60_000 }, async t => {
  const f = await hosted(t);
  const token = f.tokens.issue('user_1');
  for (const wrong of ['https://evil.example', `${f.origin}/`, 'null', 'capacitor://localhost']) {
    const refused = await exchange(f, token, { Origin: wrong });
    assert.deepEqual([refused.status, await refused.json(), sessionCookie(refused)], [403, { error: 'invalid_origin' }, null], wrong);
  }
  assert.equal(f.tokens.calls(), 0);
  const accepted = await exchange(f, token);
  assert.equal(accepted.status, 200);
  const header = sessionCookie(accepted);
  assert.match(header, /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/, 'the hosted https origin sets Secure');
  const val = { cookie: cookieValue(header) };
  val.identity = await session(f, val.cookie);
  assert.deepEqual(val.identity.user, { id: 'user_1', name: 'val-dev' });
  val.csrf = val.identity.csrfToken;
  const replayed = await exchange(f, token);
  assert.deepEqual([replayed.status, sessionCookie(replayed)], [503, null], 'a replayed token issues nothing');
  assert.equal((await exchange(f, f.tokens.issue('user_1', { ttlMs: 0 }))).status, 503, 'an expired token');
  assert.equal((await exchange(f, f.tokens.issue('user_9', { method: 'AppleOAuth' }))).status, 403, 'AppleOAuth is not a listed session method');
  assert.equal((await session(f, val.cookie)).authenticated, true);

  // Pending: no pass, the middleware asks the server once and is told no, and no ticket.
  const pending = await get(f, '/api/waitlist/status', val.cookie);
  assert.equal((await pending.json()).status, 'pending');
  assert.equal(pending.headers.getSetCookie().some(value => value.startsWith(`${ASSET_GATE_COOKIE}=`)), false, 'no pass while pending');
  assert.equal((await f.asset(val.cookie)).status, 403);
  assert.deepEqual(f.serverChecks, ['/api/waitlist/status']);
  assert.equal((await f.asset(null)).status, 403, 'no session cookie, no server call');
  assert.equal(f.serverChecks.length, 1);
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 403);
  assert.equal((await connect(t, f, { ticket: 'x'.repeat(43), cookie: val.cookie })).status, 401);

  // Approved: the status reply carries the pass, the pass serves without a server call, the ticket joins once.
  await f.waitlist.decide({ userId: 'user_1', approved: true, actorId: 'admin_1' });
  const approved = await get(f, '/api/waitlist/status', val.cookie);
  const pass = approved.headers.getSetCookie().find(value => value.startsWith(`${ASSET_GATE_COOKIE}=`));
  assert.match(pass, /; Path=\/; Max-Age=1800; HttpOnly; SameSite=Lax; Secure$/);
  const withPass = `${val.cookie}; ${cookieValue(pass)}`;
  const checks = f.serverChecks.length;
  assert.equal((await f.asset(withPass)).status, 200);
  assert.equal(f.serverChecks.length, checks, 'a valid pass costs no server call');
  assert.equal((await f.asset(`river_oaks_session=other; ${cookieValue(pass)}`)).status, 403, 'the pass is bound to its session');
  const issued = await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf });
  assert.equal(issued.status, 200);
  const { ticket } = await issued.json();
  const pat = await resident(t, f, f.tokens, 'user_2');
  await get(f, '/api/waitlist/status', pat.cookie);
  await f.waitlist.decide({ userId: 'user_2', approved: true, actorId: 'admin_1' });
  assert.equal((await connect(t, f, { ticket, cookie: pat.cookie })).status, 401, 'another session cannot spend the ticket');
  assert.equal((await connect(t, f, { ticket, cookie: val.cookie, wsOrigin: 'https://evil.example' })).status, 403);
  const joined = await connect(t, f, { ticket, cookie: val.cookie });
  assert.equal(joined.status, 101);
  assert.ok(joined.frame.type === 'snapshot' || Array.isArray(joined.frame.players), 'joined the shared room');
  assert.equal((await connect(t, f, { ticket, cookie: val.cookie })).status, 401, 'a ticket joins once');

  // Banned: the status route refuses, so a lapsed pass is not renewed; a pass still in
  // hand keeps the static bundle for its remaining life (at most 30 minutes), as documented.
  const spare = (await (await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).json()).ticket;
  assert.equal(await f.security.ban({ userId: 'user_1', reason: 'test', actorId: 'mod_1' }), true);
  assert.equal((await get(f, '/api/waitlist/status', val.cookie)).status, 403);
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 403);
  assert.equal((await connect(t, f, { ticket: spare, cookie: val.cookie })).status, 401);
  assert.equal((await f.asset(withPass)).status, 200, 'the revocation lag of an unexpired pass');
  assert.equal((await f.asset(withPass, f.gateAt(() => Date.now() + ASSET_GATE_TTL_MS + 1))).status, 403, 'once the pass lapses, the server says no');
  assert.equal((await f.asset(val.cookie)).status, 403);

  // Revoked approval, then a signed-out session.
  assert.equal(await f.security.unban({ userId: 'user_1', actorId: 'mod_1' }), true);
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 200);
  await f.waitlist.decide({ userId: 'user_1', approved: false, actorId: 'admin_1' });
  assert.equal((await post(f, '/api/multiplayer/ticket', { cookie: val.cookie, csrf: val.csrf })).status, 403);
  assert.equal((await f.asset(val.cookie)).status, 403);
  const patTicket = (await (await pat.ticket()).json()).ticket;
  assert.equal((await post(f, '/auth/logout', { cookie: pat.cookie, csrf: 'wrong' })).status, 403, 'logout needs the CSRF token');
  assert.equal((await post(f, '/auth/logout', { cookie: pat.cookie, csrf: pat.csrf })).status, 200);
  assert.equal((await session(f, pat.cookie)).authenticated, false);
  assert.equal((await pat.ticket()).status, 401);
  assert.equal((await connect(t, f, { ticket: patTicket, cookie: pat.cookie })).status, 401);
  assert.equal((await f.asset(pat.cookie)).status, 403);

  // A deleted account cannot exchange, in either session method.
  f.tombstones.add('user_3');
  const gone = await exchange(f, f.tokens.issue('user_3', { method: 'MagicAuth' }));
  assert.deepEqual([gone.status, await gone.json(), sessionCookie(gone)], [403, { error: 'account_unavailable' }, null]);
});
