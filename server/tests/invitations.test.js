import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createFileWaitlist, createRedisWaitlist } from '../waitlist.js';
import { createWaitlistRoutes } from '../waitlist-routes.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createRedisSecurity } from '../redis-security.js';
import { createAuth } from '../auth.js';
import { workosSdkFixture } from './workos-sdk-fixture.js';

test('real SDK email login stays waitlisted until invite redemption unlocks a multiplayer ticket', async t => {
  const origin = 'https://typesafe.example';
  const config = { origin, apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32) };
  const { sdk } = await workosSdkFixture(t, config, { issuer: 'https://api.workos.com', authenticationMethod: 'MagicAuth' });
  const dir = await mkdtemp(join(tmpdir(), 'typesafe-email-access-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const waitlist = await createFileWaitlist(join(dir, 'waitlist.json'), { admins: ['admin'] });
  const invite = await waitlist.issueInvite({ actorId: 'admin', ownerId: 'admin' });
  const auth = createAuth({ ...config, workos: sdk });
  const app = createGameServer({ auth, waitlist, origin, waitlistAdmins: ['admin'],
    world: { players: new Map(), step() {}, leave() {}, snapshot: () => ({ players: [] }) } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const cookie = (response, name) => response.headers.getSetCookie().find(v => v.startsWith(`${name}=`))?.split(';')[0];
  const post = (path, data, sessionCookie, csrf) => fetch(base + path, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...(sessionCookie ? { cookie: sessionCookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify(data) });
  const start = await post('/auth/email/start', { email: 'private@example.com' });
  assert.equal(start.status, 200);
  const verified = await post('/auth/email/verify', { code: '123456' }, cookie(start, 'river_oaks_magic_state'));
  assert.equal(verified.status, 200);
  const sessionCookie = cookie(verified, 'river_oaks_session');
  const session = await (await fetch(base + '/auth/session', { headers: { cookie: sessionCookie } })).json();
  assert.equal(session.authenticated, true);
  const status = await (await fetch(base + '/api/waitlist/status', { headers: { cookie: sessionCookie } })).json();
  assert.equal(status.status, 'pending');
  assert.equal((await post('/api/multiplayer/ticket', {}, sessionCookie, session.csrfToken)).status, 403);
  assert.equal((await post('/api/waitlist/invite-redeem', { code: invite.code }, sessionCookie, session.csrfToken)).status, 200);
  assert.equal((await post('/api/multiplayer/ticket', {}, sessionCookie, session.csrfToken)).status, 200);
  const codes = await (await fetch(base + '/api/waitlist/invites', { headers: { cookie: sessionCookie } })).json();
  assert.equal(codes.invites.length, 2);
});

test('invitation HTTP routes require a verified session, CSRF and administrator authority', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'typesafe-invite-routes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const waitlist = await createFileWaitlist(join(dir, 'waitlist.json'), { admins: ['admin'] });
  const users = Object.fromEntries(['admin', 'owner', 'visitor', 'banned'].map(userId => [userId, { userId, name: 'Resident', csrfToken: 'csrf' }]));
  for (const user of Object.values(users)) await waitlist.request(user);
  await waitlist.decide({ userId: 'owner', approved: true, actorId: 'admin' });
  const origin = 'https://typesafe.example';
  const banned = new Set(['banned']);
  const route = createWaitlistRoutes({ auth: { authenticate: async req => users[req.headers.cookie] }, waitlist, admins: ['admin'], origin, isBanned: async id => banned.has(id) });
  const server = createServer(async (req, res) => {
    try { if (!await route(req, res, new URL(req.url, origin).pathname)) { res.writeHead(404); res.end(); } }
    catch { res.writeHead(503); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const call = (path, user = 'visitor', data, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/waitlist/${path}`, {
    method: data ? 'POST' : 'GET', headers: { cookie: user, origin, 'content-type': 'application/json', 'x-csrf-token': 'csrf', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}),
  });
  assert.equal((await call('invites', '')).status, 401);
  const ownerInvites = await (await call('invites', 'owner')).json();
  assert.equal(ownerInvites.invites.length, 2);
  assert.deepEqual((await (await call('invites')).json()).invites, []);
  assert.equal((await call('invite-issue', 'owner', { ownerId: 'owner' })).status, 403);
  assert.equal((await call('invite-issue', 'admin', { ownerId: 'owner' }, { 'x-csrf-token': 'wrong' })).status, 403);
  const issued = await (await call('invite-issue', 'admin', { ownerId: 'owner', assignedUserId: 'visitor' })).json();
  assert.ok(issued.invite.code);
  assert.equal((await call('invite-redeem', 'banned', { code: issued.invite.code })).status, 403);
  assert.equal((await call('invite-redeem', 'visitor', { code: issued.invite.code }, { origin: 'https://evil.example' })).status, 403);
  banned.add('owner');
  assert.equal((await call('invite-redeem', 'visitor', { code: issued.invite.code })).status, 400);
  assert.equal(await waitlist.isApproved('visitor'), false);
  assert.equal((await call('invite-issue', 'admin', { ownerId: 'owner' })).status, 400);
  banned.delete('owner');
  assert.equal((await call('invite-redeem', 'visitor', { code: issued.invite.code })).status, 200);
  assert.equal(await waitlist.isApproved('visitor'), true);
  assert.equal((await call('invite-redeem', 'visitor', { code: issued.invite.code })).status, 400);
});

for (const backend of ['file', 'redis']) {
  test(`${backend}: moderation ban revokes invitations before ban persistence and unban cannot revive them`, { skip: backend === 'redis' && !process.env.REDIS_URL }, async t => {
    const origin = 'https://typesafe.example', admin = { userId: 'admin', csrfToken: 'csrf', sessionId: 'session_admin', expiresAt: Date.now() + 60000 };
    const dir = await mkdtemp(join(tmpdir(), 'typesafe-invite-ban-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const redis = backend === 'redis' ? new Redis(process.env.REDIS_URL) : null;
    const prefix = `{invite-ban:${randomUUID()}}`;
    if (redis) t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
    const waitlist = redis ? createRedisWaitlist({ redis, prefix, admins: ['admin'] }) : await createFileWaitlist(join(dir, 'waitlist.json'), { admins: ['admin'] });
    await waitlist.request({ userId: 'owner' }); await waitlist.request({ userId: 'visitor' });
    await waitlist.decide({ userId: 'owner', actorId: 'admin', approved: true });
    const [{ code }] = await waitlist.listInvites({ userId: 'owner' });
    const auth = { handle: async () => false, authenticate: async () => admin };
    let banned = false, observedRevocation = false;
    const verifyRevocation = async () => { observedRevocation = (await waitlist.listInvites({ userId: 'owner' })).every(i => i.status === 'revoked'); assert.ok(observedRevocation); };
    let app;
    if (redis) {
      const security = createRedisSecurity({ redis, prefix: `${prefix}:security` });
      const ban = security.ban;
      security.ban = async args => { await verifyRevocation(); return ban(args); };
      app = createDistributedServer({ auth, waitlist, security, origin, moderators: ['admin'], room: { worldId: 'river-oaks', request: async () => ({ ok: true }) } });
    } else {
      app = createGameServer({ auth, waitlist, origin, moderators: ['admin'], world: { players: new Map(), step() {}, leave() {}, snapshot: () => ({ players: [] }) },
        moderation: { isBanned: id => id === 'owner' && banned, setBanned: async (_id, value) => { if (value) await verifyRevocation(); banned = value; } } });
    }
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    t.after(() => app.close());
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/moderation/ban`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': 'csrf' }, body: JSON.stringify({ userId: 'owner', banned: true }),
    });
    assert.equal(response.status, 200); assert.ok(observedRevocation);
    const unban = await fetch(`http://127.0.0.1:${app.server.address().port}/api/moderation/ban`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': 'csrf' }, body: JSON.stringify({ userId: 'owner', banned: false }),
    });
    assert.equal(unban.status, 200);
    assert.equal((await waitlist.redeemInvite({ identity: { userId: 'visitor' }, code })).ok, false);
    assert.equal((await waitlist.listInvites({ userId: 'visitor' })).length, 0);
  });
  test(`${backend}: invitations require approval, grant once, redeem once, and respect assignment, revocation and expiry`, { skip: backend === 'redis' && !process.env.REDIS_URL }, async t => {
    let time = Date.now();
    const options = { admins: ['admin'], now: () => time };
    let store, reopen;
    if (backend === 'file') {
      const dir = await mkdtemp(join(tmpdir(), 'typesafe-invites-'));
      t.after(() => rm(dir, { recursive: true, force: true }));
      reopen = () => createFileWaitlist(join(dir, 'waitlist.json'), options);
      store = await reopen();
    } else {
      const redis = new Redis(process.env.REDIS_URL);
      const prefix = `{invites-test:${randomUUID()}}`;
      t.after(async () => { const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
      reopen = async () => createRedisWaitlist({ redis, prefix, ...options });
      store = await reopen();
    }
    const identity = userId => ({ userId, name: 'Resident', email: `${userId}@example.com` });
    for (const user of ['owner', 'first', 'second', 'assigned', 'blocked']) await store.request(identity(user));
    assert.deepEqual(await store.listInvites({ userId: 'owner' }), []);
    await assert.rejects(store.issueInvite({ actorId: 'owner', ownerId: 'owner' }));
    await store.decide({ userId: 'owner', approved: true, actorId: 'admin' });
    let invites = await store.listInvites({ userId: 'owner' });
    assert.equal(invites.length, 2);
    assert.ok(invites.every(i => Date.parse(i.expiresAt) === time + 30 * 86400000));
    await store.decide({ userId: 'owner', approved: true, actorId: 'admin' });
    assert.equal((await store.listInvites({ userId: 'owner' })).length, 2);
    const outcomes = await Promise.all(['first', 'second'].map(userId => store.redeemInvite({ identity: identity(userId), code: invites[0].code })));
    assert.equal(outcomes.filter(r => r.ok).length, 1);
    const accepted = await store.isApproved('first') ? 'first' : 'second';
    const pending = accepted === 'first' ? 'second' : 'first';
    assert.equal((await store.listInvites({ userId: accepted })).length, 2);
    assert.equal(await store.isApproved(pending), false);
    await store.updateInvite({ actorId: 'admin', id: invites[1].id, assignedUserId: 'assigned' });
    assert.equal((await store.redeemInvite({ identity: identity(pending), code: invites[1].code })).ok, false);
    assert.equal((await store.redeemInvite({ identity: identity('assigned'), code: invites[1].code })).ok, true);
    const custom = await store.issueInvite({ actorId: 'admin', ownerId: 'admin', assignedUserId: 'blocked' });
    await store.decide({ userId: 'blocked', approved: false, actorId: 'admin' });
    assert.equal((await store.redeemInvite({ identity: identity('blocked'), code: custom.code })).ok, false);
    const expired = await store.issueInvite({ actorId: 'admin', ownerId: 'owner' });
    await store.updateInvite({ actorId: 'admin', id: expired.id, expire: true });
    assert.equal((await store.redeemInvite({ identity: identity(pending), code: expired.code })).ok, false);
    const revokedOwner = await store.issueInvite({ actorId: 'admin', ownerId: 'owner' });
    await store.decide({ userId: 'owner', approved: false, actorId: 'admin' });
    assert.equal((await store.redeemInvite({ identity: identity(pending), code: revokedOwner.code })).ok, false);
    await store.decide({ userId: 'owner', approved: true, actorId: 'admin' });
    assert.equal((await store.redeemInvite({ identity: identity(pending), code: revokedOwner.code })).ok, false);
    assert.equal((await store.listInvites({ userId: 'owner' })).length, 4);
    const timed = await store.issueInvite({ actorId: 'admin', ownerId: 'admin' });
    const bannedOwnerInvite = await store.issueInvite({ actorId: 'admin', ownerId: 'owner' });
    await store.revokeInvites({ userId: 'owner', actorId: 'moderator' });
    assert.equal((await store.redeemInvite({ identity: identity(pending), code: bannedOwnerInvite.code })).ok, false);
    time += 30 * 86400000;
    assert.equal((await store.redeemInvite({ identity: identity(pending), code: timed.code })).ok, false);
    store = await reopen();
    assert.equal(await store.isApproved(accepted), true);
    assert.equal((await store.listInvites({ userId: 'owner' })).length, 5);
    await assert.rejects(store.updateInvite({ actorId: 'owner', id: timed.id, expire: true }));
    assert.deepEqual(await store.listInvites({ userId: pending }), []);
  });
}
