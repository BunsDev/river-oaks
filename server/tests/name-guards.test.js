import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSharedWorld } from '../world.js';
import { createMemorySocial } from '../social.js';
import { socialAction } from '../social-api.js';
import { createMemoryGroups } from '../groups.js';
import { groupAction } from '../groups-api.js';
import { createMemoryEvents } from '../events.js';
import { eventAction } from '../events-api.js';
import { profileAction } from '../profile-api.js';
import { createFileWaitlist } from '../waitlist.js';
import { createDevAuth } from '../dev-auth.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { reservedName } from '../../preview/src/resident-names.js';

// These tests feed every name surface a non-admin record that claims Jevica, as
// a record saved before residents were named by GitHub username, a stale
// checkpoint or a bug would. None may reach a client as Jevica; the admin
// account always does.
const ADMIN = JEVICA_ADMIN_USER_IDS[1];
const CLAIMS = ['Jevica', 'jevica', 'Jеvica', 'J e v i c a', 'Jev1ca', 'Je​vica', 'Ｊｅｖｉｃａ', 'jevica-official'];
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const identity = (userId, name) => ({ userId, name, sessionId: `${userId}-session`, csrfToken: 'csrf', expiresAt: Date.now() + 3_600_000 });

test('the world never shows a non-admin player, chat line or build owner as Jevica', () => {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time, isAdmin: id => id === ADMIN });
  CLAIMS.forEach((name, index) => assert.equal(world.join(identity(`resident-${index}`, name)).ok, true));
  assert.equal(world.join(identity(ADMIN, 'BunsDev')).ok, true);
  assert.equal(world.join(identity('octocat', 'octocat')).ok, true);
  const names = Object.fromEntries(world.snapshot().players.map(player => [player.id, player.name]));
  assert.equal(names[ADMIN], 'Jevica');
  assert.equal(names.octocat, 'octocat');
  for (let index = 0; index < CLAIMS.length; index++) assert.equal(names[`resident-${index}`], 'resident', CLAIMS[index]);

  // A name stored before this change, then a chat line under it.
  world.players.get('octocat').name = 'Jevica';
  assert.equal(world.command('octocat', { type: 'chat', text: 'hello from octocat' }).ok, true);
  time += 5000;
  assert.equal(world.command(ADMIN, { type: 'chat', text: 'hello from the admin' }).ok, true);
  const snapshot = world.snapshot();
  assert.equal(snapshot.players.find(player => player.id === 'octocat').name, 'resident');
  assert.deepEqual(snapshot.chat.map(entry => [entry.authorId, entry.authorName]), [['octocat', 'resident'], [ADMIN, 'Jevica']]);

  // The stale record survives a checkpoint and is still never shown as Jevica.
  const restored = createSharedWorld(data, { now: () => time, isAdmin: id => id === ADMIN });
  assert.equal(restored.restore(world.checkpoint()).ok, true);
  const again = restored.snapshot();
  assert.equal(again.players.find(player => player.id === 'octocat').name, 'resident');
  assert.equal(again.chat[0].authorName, 'resident');
  for (const player of again.players) if (player.id !== ADMIN) assert.equal(reservedName(player.name), false, player.id);
});

test('a resident still in the world takes their current name when they sign in again', () => {
  const world = createSharedWorld(data, { now: () => 1_000_000 });
  world.join(identity('user_1', 'Val Dev'));
  const before = world.snapshot().revision;
  assert.equal(world.rename(identity('user_1', 'val-dev')).name, 'val-dev');
  assert.equal(world.snapshot().players[0].name, 'val-dev');
  assert.ok(world.snapshot().revision > before, 'clients see the new name');
  assert.equal(world.rename(identity('user_1', 'Jevica')).name, 'resident');
  assert.equal(world.rename(identity('nobody', 'x')), null);
});

test('contacts and private messages never show a non-admin as Jevica', async () => {
  const social = createMemorySocial(), impostor = identity('impostor', 'Jevica'), alice = identity('alice', 'alice'), admin = identity(ADMIN, 'Jevica');
  await social.request(alice, { userId: 'impostor', name: 'Jevica' }); await social.accept('impostor', 'alice');
  await social.send(impostor, 'alice', 'hi alice');
  await social.request(alice, { userId: ADMIN, name: 'BunsDev' }); await social.accept(ADMIN, 'alice');
  await social.send(admin, 'alice', 'hello');
  const call = (action, data) => socialAction({ action, identity: alice, social, readBody: async () => data, allowWrite: async () => true });
  const contacts = Object.fromEntries((await call('list')).value.contacts.map(item => [item.peer.id, item]));
  assert.equal(contacts.impostor.peer.name, 'resident');
  assert.equal(contacts.impostor.latest.authorName, 'resident');
  assert.equal(contacts[ADMIN].peer.name, 'Jevica');
  assert.deepEqual((await call('messages', { peerId: 'impostor' })).value.messages.map(message => message.authorName), ['resident']);
  assert.deepEqual((await call('messages', { peerId: ADMIN })).value.messages.map(message => message.authorName), ['Jevica']);
});

test('groups never show a non-admin member, inviter or author as Jevica, but keep their own titles', async () => {
  const groups = createMemoryGroups({ createId: () => 'group-1' }), social = createMemorySocial();
  const impostor = identity('impostor', 'Jevica'), alice = identity('alice', 'alice');
  await social.request(impostor, { userId: 'alice', name: 'alice' }); await social.accept('alice', 'impostor');
  const call = (who, action, data = {}) => groupAction({ action, identity: who, groups, social, readBody: async () => data, allowWrite: async () => true });
  const created = await call(impostor, 'create', { name: 'Jevica fans', description: 'A club about Jevica' });
  assert.equal(created.value.group.ownerName, 'resident');
  assert.equal(created.value.group.name, 'Jevica fans', 'a group title is not a resident name');
  await call(impostor, 'invite', { groupId: 'group-1', peerId: 'alice' });
  await call(alice, 'accept', { groupId: 'group-1' });
  await call(impostor, 'send', { groupId: 'group-1', text: 'welcome' });
  const read = (await call(alice, 'read', { groupId: 'group-1' })).value.group;
  assert.deepEqual(read.members.map(member => [member.id, member.name]), [['impostor', 'resident'], ['alice', 'alice']]);
  assert.deepEqual(read.messages.map(message => message.authorName), ['resident']);
  const listed = (await call(alice, 'list')).value.groups[0];
  assert.equal(listed.ownerName, 'resident'); assert.equal(listed.latest.authorName, 'resident');
  const ownerView = (await call(impostor, 'read', { groupId: 'group-1' })).value.group;
  assert.ok(ownerView.members.every(member => member.id === 'alice' ? member.name === 'alice' : member.name === 'resident'));
});

test('event hosts are never shown as Jevica unless the admin hosts', async () => {
  const events = createMemoryEvents({ now: () => 0 });
  const call = (who, action, data) => eventAction({ action, identity: who, events, readBody: async () => data,
    resolveVenue: async id => ({ worldId: 'moon-garden', worldTitle: 'Moon Garden', placeId: id, placeName: 'Arrival' }),
    allowWrite: async () => true, isAdmin: id => id === ADMIN });
  const draft = { title: "Jevica's tea", description: 'All welcome', placeId: 'arrival', startsAt: 1000, endsAt: 3_601_000, capacity: 4 };
  assert.equal((await call(identity('impostor', 'Jevica'), 'create', draft)).value.event.hostName, 'resident');
  assert.equal((await call(identity(ADMIN, 'BunsDev'), 'create', draft)).value.event.hostName, 'Jevica');
  const listed = (await call(identity('alice', 'alice'), 'list')).value.events;
  assert.deepEqual(listed.map(event => event.hostName).sort(), ['Jevica', 'resident']);
  assert.ok(listed.every(event => event.title === "Jevica's tea"), 'an event title is not a resident name');
});

test('a profile is never shown as Jevica unless it is the admin', async () => {
  const profiles = { get: async () => ({ tagline: '' }) };
  const view = (viewer, peer) => profileAction({ action: 'view', identity: viewer, profiles, social: null,
    readBody: async () => (peer ? { peerId: peer.userId } : {}), visiblePlayer: async () => peer ? { id: peer.userId, name: peer.name } : null });
  assert.equal((await view(identity('impostor', 'Jevica'))).value.profile.name, 'resident');
  assert.equal((await view(identity('alice', 'alice'), identity('impostor', 'Jevica'))).value.profile.name, 'resident');
  assert.equal((await view(identity('alice', 'alice'), identity(ADMIN, 'BunsDev'))).value.profile.name, 'Jevica');
});

test('the waitlist keeps each request named as its owner signs in now, never as a non-admin Jevica', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'river-oaks-waitlist-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const waitlist = await createFileWaitlist(join(dir, 'waitlist.json'));
  await waitlist.request({ userId: 'user_1', name: 'Val Dev', email: 'a@example.com' });
  assert.equal((await waitlist.request({ userId: 'user_1', name: 'val-dev', email: 'a@example.com' })).name, 'val-dev');
  assert.equal((await waitlist.list())[0].name, 'val-dev', 'the approval list shows the GitHub username');
  const reopened = await createFileWaitlist(join(dir, 'waitlist.json'));
  assert.equal((await reopened.list())[0].name, 'val-dev', 'and keeps it after a restart');
  const { guardWaitlistRequest } = await import('../name-guard.js');
  assert.equal(guardWaitlistRequest({ userId: 'impostor', name: 'Jevica' }).name, 'resident');
  assert.equal(guardWaitlistRequest({ userId: ADMIN, name: 'BunsDev' }).name, 'Jevica');
});

test('development identities look like GitHub usernames and are never Jevica', async () => {
  const auth = createDevAuth({ origin: 'http://127.0.0.1:5173', env: { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' } });
  const names = [];
  for (let index = 0; index < 12; index++) {
    const headers = {}, res = { setHeader: (key, value) => { headers[key] = value; }, writeHead() {}, end(body) { names.push(JSON.parse(body).user.name); } };
    await auth.handle({ url: '/auth/session', headers: {}, method: 'GET' }, res);
  }
  assert.equal(names[0], 'wren-dev');
  assert.ok(names.every(name => /^[a-z]+-dev$/.test(name) && !reservedName(name)), names.join(', '));
  auth.close();
});

test('the Redis waitlist also keeps each request named as its owner signs in now', { skip: !process.env.REDIS_URL }, async t => {
  const { default: Redis } = await import('ioredis');
  const { randomUUID } = await import('node:crypto');
  const { createRedisWaitlist } = await import('../waitlist.js');
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 }); redis.on('error', () => {});
  const prefix = `{river-oaks:test:${randomUUID()}}`;
  t.after(async () => { await redis.del(`${prefix}:waitlist:users`, `${prefix}:waitlist:audit`); await redis.quit(); });
  const waitlist = createRedisWaitlist({ redis, prefix });
  await waitlist.request({ userId: 'user_1', name: 'Val Dev', email: 'a@example.com' });
  await waitlist.decide({ userId: 'user_1', approved: true, actorId: 'admin' });
  const renamed = await waitlist.request({ userId: 'user_1', name: 'val-dev', email: 'a@example.com' });
  assert.deepEqual([renamed.name, renamed.status], ['val-dev', 'approved'], 'renaming keeps the decision');
  assert.equal((await waitlist.list())[0].name, 'val-dev');
  assert.equal((await waitlist.request({ userId: 'user_1', name: 'val-dev' })).decidedBy, 'admin');
});
