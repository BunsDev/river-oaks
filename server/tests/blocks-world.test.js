import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { compileRegionPackage } from '../region-package.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { ABSENT_RESIDENT, createMemoryBlocks, screenCommand, viewFor } from '../blocks.js';
import { createCampusLeases } from '../campus-leases.js';
import { GARDEN_CAMPUS_ID, GARDEN_CAMPUS_VERSIONS } from '../../shared/garden-campus-layout.js';
import { CAMPUS_LEASE_CONTRACT } from '../../shared/garden-campus-lease-contract.js';

// A block between Jevica and a resident ends the resident's private home and office
// invitations and steps them out; between two residents it changes nothing here.
const admin = JEVICA_ADMIN_USER_IDS[0];
const sample = JSON.parse(await readFile(new URL('../../preview/public/data/sample-region.json', import.meta.url)));
const region = { ...sample, buildings: sample.buildings.map((building, index) => index === 2
  ? { ...building, interior: { name: 'Moon House', category: 'home', entrance: 'south', access: 'owner' } } : building) };
const worldData = compileRegionPackage(region, 'Moon Garden'), environment = createWalkingEnvironment(worldData), storeId = environment.rooms[0].storeId;
const inside = world => { const [x, north] = world.snapshot().players.find(player => player.id === 'guest').position; return environment.roomAt(x, -north)?.storeId === storeId; };

test('separating Jevica from a resident ends the home invitation and steps the resident out', () => {
  let time = 1000;
  const make = () => createSharedWorld(worldData, { worldId: 'moon-garden', now: () => time });
  const world = make();
  for (const person of [{ userId: admin, name: 'Jevica' }, { userId: 'guest', name: 'Guest' }, { userId: 'other', name: 'Other' }]) assert.equal(world.join(person).ok, true);
  for (const peerId of ['guest', 'other']) assert.equal(world.command(admin, { type: 'homeAccess', action: 'grant', storeId, peerId }).ok, true);
  time += 1000;assert.equal(world.command('guest', { type: 'travel', storeId, mode: 'enter' }).ok, true);
  assert.equal(inside(world), true);
  assert.equal(world.separate('guest', 'other'), false, 'two residents: nothing to end here');
  assert.equal(inside(world), true);
  assert.equal(world.separate('guest', admin), true);
  const homes = world.command(admin, { type: 'homeAccess', action: 'list' }).homes;
  assert.deepEqual(homes.find(home => home.storeId === storeId).guestIds, ['other']);
  assert.equal(inside(world), false);
  time += 1000;assert.equal(world.command('guest', { type: 'travel', storeId, mode: 'enter' }).ok, false);
  assert.equal(make().restore(JSON.parse(JSON.stringify(world.checkpoint()))).ok, true);
});

test('separating Jevica from a resident ends the office invitation', async () => {
  const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
  let time = 1000;
  const world = createSharedWorld(district, { now: () => time });
  for (const person of [{ userId: admin, name: 'Jevica' }, { userId: 'guest', name: 'Guest' }]) assert.equal(world.join(person).ok, true);
  const send = (user, action, more = {}) => { time += 1000; return world.command(user, { type: 'office', action, officeId: 'jevica-office', ...more }); };
  assert.equal(send(admin, 'invite', { peerId: 'guest' }).ok, true);
  assert.equal(send('guest', 'list').offices[0].access, 'invited');
  world.separate(admin, 'guest');
  assert.equal(send('guest', 'list').offices[0].access, null);
  assert.deepEqual(send(admin, 'list').offices[0].guests, []);
});

test('a viewer’s snapshot drops the chat, gestures, greetings and game invitations of residents hidden from them, and nothing else', () => {
  const greeting = { id: 'g1', kind: 'dance', peerId: 'kim' };
  const snapshot = { revision: 4, chat: [{ id: 1, authorId: 'pat', text: 'hi' }, { id: 2, authorId: 'erin', text: 'yo' }],
    players: [{ id: 'pat', name: 'Pat', gesture: 'dance', interaction: greeting }, { id: 'erin', name: 'Erin', gesture: 'wave', interaction: null },
      { id: 'kim', name: 'Kim', gesture: 'dance', interaction: { id: 'g1', kind: 'dance', peerId: 'pat' } }],
    interactions: [{ id: 'g1', fromId: 'pat', toId: 'kim', kind: 'dance' }, { id: 'g2', fromId: 'erin', toId: 'kim', kind: 'handshake' }],
    tables: [{ id: 'chess-west', kind: null, invite: { from: 'pat', to: 'erin', chair: 0, kind: 'chess' } }, { id: 'cafe', kind: 'dominoes', invite: null }],
    darts: [{ id: 'line', players: null, invite: { from: 'kim', to: 'pat' } }], axes: [{ id: 'lane', players: ['erin', 'kim'], invite: null }] };
  assert.equal(viewFor(snapshot, new Set()), snapshot);
  const seen = viewFor(snapshot, new Set(['pat']));
  assert.deepEqual(seen.chat.map(entry => entry.id), [2]);
  assert.deepEqual(seen.players.map(player => [player.id, player.gesture, player.interaction]), [['pat', null, null], ['erin', 'wave', null], ['kim', null, null]],
    'Kim’s half of a greeting with Pat goes too, pose included: a snapshot shows a greeting as the gesture');
  assert.deepEqual(seen.interactions.map(item => item.id), ['g2']);
  assert.deepEqual(seen.tables.map(item => item.invite), [null, null]);
  assert.deepEqual(seen.darts[0].invite, null);
  assert.deepEqual(seen.axes, snapshot.axes, 'entries without them stay as they were');
  // Pat, the blocked sender, still sees the invitation Pat sent; it just goes unanswered.
  assert.deepEqual(viewFor(snapshot, new Set(['erin']), 'pat').tables[0].invite, snapshot.tables[0].invite);
  assert.equal(viewFor(snapshot, new Set(['pat']), 'erin').tables[0].invite, null, 'Erin, invited, sees nothing');
  assert.equal(seen.revision, 4);
  assert.deepEqual([snapshot.chat.length, snapshot.interactions.length, Boolean(snapshot.tables[0].invite)], [2, 2, true], 'the shared snapshot is untouched');
});

// The interactions fixture: three residents a step apart on open ground.
const open = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], stores: [], buildings: [], collisionPolygons: [], communityLocations: [] };
function plaza() {
  let time = 1000;
  const world = createSharedWorld(open, { now: () => time, isAdmin: id => id === 'jev' });
  for (const id of ['a', 'b', 'c', 'jev']) world.join({ userId: id, name: id });
  ['a', 'b', 'c', 'jev'].forEach((id, index) => { world.players.get(id).position = [-12, index, 0]; });
  return { world, advance: ms => { time += ms; } };
}

test('a block ends a pending greeting between the two residents, and only theirs', () => {
  const { world } = plaza();
  const greet = (from, to) => world.command(from, { type: 'interaction', action: 'invite', peerId: to, kind: 'handshake' });
  assert.equal(greet('a', 'b').ok, true);
  assert.equal(world.separate('a', 'c'), false, 'no greeting between a and c');
  assert.equal(greet('b', 'c').error, 'interaction_busy', 'the greeting between a and b still stands');
  assert.equal(world.separate('b', 'a'), true);
  assert.equal(greet('b', 'c').ok, true, 'b is free to greet someone else at once');
});

test('greetings and travel toward a blocked resident get the world’s answer for an absent one, in any validation order', async () => {
  const blocks = createMemoryBlocks();
  await blocks.add('a', { userId: 'b', name: 'b' });
  const isAdmin = id => id === 'jev';
  const send = async (world, userId, command) => {
    const screened = await screenCommand(blocks, userId, command, isAdmin);
    return screened.refusal ?? world.command(userId, screened.command);
  };
  for (const command of [
    { type: 'interaction', action: 'invite', kind: 'handshake' }, { type: 'interaction', action: 'invite', kind: 'cartwheel' },
    { type: 'interaction', action: 'invite', kind: 'handshake', extra: 1 }, { type: 'travel' }, { type: 'travel', storeId: 'x' },
  ]) for (const actor of ['a', 'b']) {
    const blocked = plaza(), absent = plaza(), peer = actor === 'a' ? 'b' : 'a';
    const towardBlocked = await send(blocked.world, actor, { ...command, peerId: peer });
    const towardAbsent = absent.world.command(actor, { ...command, peerId: 'someone-who-left' });
    assert.deepEqual(towardBlocked, towardAbsent, JSON.stringify([actor, command]));
  }
  for (const aimed of [{ type: 'travel', peerId: 'a' }, { type: 'darts', action: 'invite', lineId: 'line', peerId: 'a' }, { type: 'axes', action: 'invite', laneId: 'lane', peerId: 'a' }])
    assert.equal((await screenCommand(blocks, 'b', aimed, isAdmin)).command.peerId, ABSENT_RESIDENT, aimed.type);
  // Unrelated commands, and commands toward anyone else, pass through untouched.
  const command = { type: 'interaction', action: 'invite', peerId: 'c', kind: 'handshake' };
  assert.equal((await screenCommand(blocks, 'a', command, isAdmin)).command, command);
  const chat = { type: 'chat', text: 'hi', peerId: 'b' };
  assert.equal((await screenCommand(blocks, 'a', chat, isAdmin)).command, chat);
});

test('only Jevica’s invitations to a blocked resident are refused; anyone else keeps the world’s own refusal', async () => {
  const blocks = createMemoryBlocks(), isAdmin = id => id === 'jev';
  await blocks.add('b', { userId: 'jev', name: 'Jev' });await blocks.add('a', { userId: 'b', name: 'b' });
  const office = { type: 'office', action: 'invite', officeId: 'jevica-office', peerId: 'b' };
  assert.deepEqual((await screenCommand(blocks, 'jev', office, isAdmin)).refusal, { ok: false, error: 'invalid_office_guest', message: 'invalid_office_guest' });
  assert.equal((await screenCommand(blocks, 'a', office, isAdmin)).command, office, 'a resident’s attempt reaches the world, which refuses it as for anyone');
  const home = { type: 'homeAccess', action: 'grant', storeId: 'home', peerId: 'b' };
  assert.equal((await screenCommand(blocks, 'jev', home, isAdmin)).refusal.error, 'invalid_home_access');
  const revoke = { ...home, action: 'revoke' };
  assert.equal((await screenCommand(blocks, 'jev', revoke, isAdmin)).command, revoke, 'revoking stays possible');
});

test('separating Jevica from a resident with nothing to end changes nothing, revision included', () => {
  const { world } = plaza();
  const before = world.snapshot().revision;
  assert.equal(world.separate('jev', 'a'), false);
  assert.equal(world.snapshot().revision, before);
});

// Garden campus tenancy (#509): two tenants, each with a suite, and a guest.
const OP = 'campus-operator', U1 = 'T1-F2-W-S', U2 = 'T2-F4-E-N';
const campusData = { ...open, gardenCampus: { id: GARDEN_CAMPUS_ID, revision: 'river-oaks-gardens-3', versions: { ...GARDEN_CAMPUS_VERSIONS } } };
function campusTown(blocks) {
  const clock = { time: Date.UTC(2026, 9, 26, 16) };let serial = 0;
  const world = createSharedWorld(campusData, { now: () => clock.time, campusOperators: [OP] });
  for (const id of [OP, 'ann', 'ben', 'gus', 'sam']) assert.equal(world.join({ userId: id, name: id }).ok, true);
  const send = async (id, message) => {
    clock.time += 500;
    const screened = await screenCommand(blocks, id, { type: 'campus', operationId: `op-${String(++serial).padStart(6, '0')}`, worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT }, ...message }, () => false);
    return screened.refusal ?? world.command(id, screened.command);
  };
  const leases = new Map();
  const lease = async (id, action, unitTenant, more = {}) => {
    const current = leases.get(unitTenant);
    const result = await send(id, { action, leaseId: current.id, expectedVersion: current.version, ...more });
    if (result.ok) leases.set(unitTenant, result.lease);
    return result;
  };
  const tenant = async (tenantId, unitId) => {
    const offered = await send(OP, { action: 'issue', unitId, tenantId, startsAt: clock.time + 1000, endsAt: clock.time + 30 * 86_400_000 });
    assert.equal(offered.ok, true, JSON.stringify(offered));
    clock.time += 2000;leases.set(tenantId, offered.lease);
    assert.equal((await lease(tenantId, 'accept', tenantId)).ok, true);
  };
  return { world, send, lease, tenant, leases };
}

test('a block ends campus guest access between the two accounts either way round, and a new grant between them is refused as an invalid guest', async () => {
  const blocks = createMemoryBlocks(), f = campusTown(blocks);
  await f.tenant('ann', U1);await f.tenant('ben', U2);
  for (const [tenant, peerId] of [['ann', 'ben'], ['ben', 'ann'], ['ann', 'gus']]) assert.equal((await f.lease(tenant, 'grant', tenant, { peerId })).ok, true, `${tenant} → ${peerId}`);
  assert.deepEqual([f.world.campusSuiteAccess('ben', U1), f.world.campusSuiteAccess('ann', U2)].map(access => access.ok), [true, true]);
  await blocks.add('ann', { userId: 'ben', name: 'ben' });
  const before = f.world.snapshot().revision;
  assert.equal(f.world.separate('ann', 'ben'), true);
  assert.ok(f.world.snapshot().revision > before);
  assert.deepEqual([f.world.campusSuiteAccess('ben', U1), f.world.campusSuiteAccess('ann', U2), f.world.campusSuiteAccess('gus', U1)].map(access => access.ok), [false, false, true],
    'both grants end; another guest keeps theirs');
  // Separation moved both leases' versions; a client reads them again.
  for (const tenant of ['ann', 'ben']) f.leases.set(tenant, f.world.command(tenant, { type: 'campus', action: 'list' }).campus.leases.find(item => item.id === f.leases.get(tenant).id));
  const settled = f.world.snapshot().revision;
  assert.equal(f.world.separate('ben', 'ann'), false, 'nothing left to end');
  assert.equal(f.world.snapshot().revision, settled);
  // A new grant either way gets the world's answer for an account that cannot be a guest.
  const self = await f.lease('ann', 'grant', 'ann', { peerId: 'ann' });
  assert.equal(self.error, 'campus_invalid_guest');
  for (const [tenant, peerId] of [['ann', 'ben'], ['ben', 'ann']]) assert.deepEqual(await f.lease(tenant, 'grant', tenant, { peerId }), self, `${tenant} → ${peerId}`);
  // Anyone else gets what they would get for anyone: here a guest, who cannot grant.
  await blocks.add('gus', { userId: 'sam', name: 'sam' });
  const unblocked = await f.lease('gus', 'grant', 'ann', { peerId: 'ben' });
  assert.equal(unblocked.error, 'campus_tenant_required');
  assert.deepEqual(await f.lease('gus', 'grant', 'ann', { peerId: 'sam' }), unblocked);
  // Removing a guest stays possible.
  assert.equal((await f.lease('ann', 'ungrant', 'ann', { peerId: 'gus' })).ok, true);
});

test('a block ends campus guest access both ways, walks each guest out and moves each lease version, once', () => {
  let time = Date.UTC(2026, 9, 26, 16), serial = 0;
  const events = [], players = new Map(['ann', 'ben', 'gus'].map(id => [id, { name: id }]));
  const campus = createCampusLeases({ worldId: 'river-oaks', operators: ['op'], players, onAccessEnded: event => events.push(event) });
  const send = (id, message) => { time += 1000;return campus.command({ id }, { type: 'campus', operationId: `op-${String(++serial).padStart(6, '0')}`, worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT }, ...message }, time); };
  const lease = (id, action, item, more = {}) => send(id, { action, leaseId: item.id, expectedVersion: item.version, ...more }).lease;
  const take = (unitId, tenantId) => lease(tenantId, 'accept', send('op', { action: 'issue', unitId, tenantId, startsAt: time + 2000, endsAt: time + 2 * 86_400_000 }).lease);
  let anns = lease('ann', 'grant', lease('ann', 'grant', take('T1-F2-W-S', 'ann'), { peerId: 'ben' }), { peerId: 'gus' });
  let bens = lease('ben', 'grant', take('T2-F4-E-N', 'ben'), { peerId: 'ann' });
  const versions = campus.checkpoint().leases.map(item => [item.id, item.version]), updated = new Map(campus.checkpoint().leases.map(item => [item.id, item.updatedAt]));
  // Another gateway's clock a minute behind.
  assert.equal(campus.separate('ben', 'ann', time - 60_000), true);
  assert.deepEqual(events.map(event => [event.userId, event.role, event.leaseId, event.reason, typeof event.landing]),
    [['ben', 'guest', anns.id, 'guest_removed', 'object'], ['ann', 'guest', bens.id, 'guest_removed', 'object']], 'each guest is walked out');
  const after = new Map(campus.checkpoint().leases.map(item => [item.id, item]));
  assert.deepEqual(after.get(anns.id).guests.map(item => item.userId), ['gus'], 'anyone else keeps access');
  assert.deepEqual(after.get(bens.id).guests, []);
  for (const [id, version] of versions) assert.equal(after.get(id).version, version + 1, 'clients see each lease change');
  for (const [id, at] of updated) assert.equal(after.get(id).updatedAt, at, 'and a clock behind never dates a lease back');
  events.length = 0;
  assert.equal(campus.separate('ann', 'ben', time), false, 'nothing left to end');
  assert.deepEqual(events, []);
  assert.deepEqual(campus.checkpoint().leases.map(item => item.version), versions.map(([, version]) => version + 1));
});
