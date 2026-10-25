import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { compileRegionPackage } from '../region-package.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { ABSENT_RESIDENT, createMemoryBlocks, screenCommand, viewFor } from '../blocks.js';

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
    players: [{ id: 'pat', name: 'Pat', gesture: 'dance', interaction: greeting }, { id: 'erin', name: 'Erin', gesture: 'wave', interaction: null }],
    interactions: [{ id: 'g1', fromId: 'pat', toId: 'kim', kind: 'dance' }, { id: 'g2', fromId: 'erin', toId: 'kim', kind: 'handshake' }],
    tables: [{ id: 'chess-west', kind: null, invite: { from: 'pat', to: 'erin', chair: 0, kind: 'chess' } }, { id: 'cafe', kind: 'dominoes', invite: null }],
    darts: [{ id: 'line', players: null, invite: { from: 'kim', to: 'pat' } }], axes: [{ id: 'lane', players: ['erin', 'kim'], invite: null }] };
  assert.equal(viewFor(snapshot, new Set()), snapshot);
  const seen = viewFor(snapshot, new Set(['pat']));
  assert.deepEqual(seen.chat.map(entry => entry.id), [2]);
  assert.deepEqual(seen.players.map(player => [player.id, player.gesture, player.interaction]), [['pat', null, null], ['erin', 'wave', null]]);
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
