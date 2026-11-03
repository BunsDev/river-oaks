import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSharedWorld as createWorld } from '../world.js';
import { maneuverPose } from '../../preview/src/ribbonwing-maneuvers.js';

// The Ribbonwing's right-hand seat (#777): the pilot invites, the passenger
// accepts, and the town places them from the pilot's pose until they step out
// on the ground or the town sets them down.
const OWNER = 'user_01M40Y914S1H4EJCEHH91DKTAY';
const resign = value => { const { checksum, ...envelope } = value;return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }; };
const data = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, -14, 0], collisionPolygons: [], stores: [], buildings: [], communityLocations: [] };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function setup() {
  let time = 1000;
  const world = createWorld(data, { now: () => time, isAdmin: () => false });
  for (const [userId, name] of [[OWNER, 'Jevica'], ['guest', 'Guest'], ['third', 'Third']]) world.join({ userId, name });
  const view = id => world.snapshot().players.find(player => player.id === id);
  const yaw = -Math.PI / 2; // nose north
  const pilot = (altitude, vehicle = 'hover') => { time += 1000;const { position } = view(OWNER);return world.command(OWNER, { type: 'pose', position, yaw, altitude, vehicle }); };
  const climb = altitude => { let at = view(OWNER).altitude;while (at < altitude) { at = Math.min(altitude, at + 3.2);assert.equal(pilot(at).ok, true); } };
  const ride = (id, body) => world.command(id, { type: 'ribbonwing', ...body });
  assert.equal(pilot(0).ok, true, 'Jevica is in the landed Ribbonwing');
  return { world, view, pilot, climb, ride, advance: ms => { time += ms; }, get time() { return time; } };
}
const board = t => { assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'guest' }).ok, true);const reply = t.ride('guest', { action: 'board', pilotId: OWNER });assert.equal(reply.ok, true, JSON.stringify(reply));return reply; };
// The passenger sits 0.68 m to the right of the pilot's seat.
const rightOf = (pilot, metres) => { const h = pilot.yaw + Math.PI;return [pilot.position[0] + metres * Math.sin(h), pilot.position[1] - metres * Math.cos(h)]; };

test('boarding needs the pilot\'s current invitation, the craft landed and the passenger on foot and near', () => {
  const t = setup();
  assert.equal(t.ride('guest', { action: 'board', pilotId: OWNER }).error, 'no_ribbonwing_invite', 'no invitation');
  assert.equal(t.ride('guest', { action: 'invite', peerId: 'third' }).error, 'exclusive_vehicle', 'only the owner invites');
  for (const bad of [{ action: 'invite' }, { action: 'invite', peerId: 'guest', extra: 1 }, { action: 'board' }, { action: 'fly' }])
    assert.equal(t.ride(OWNER, bad).error, 'invalid_ribbonwing', JSON.stringify(bad));
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: OWNER }).error, 'invalid_passenger');
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'nobody' }).error, 'invalid_passenger');
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'guest' }).ok, true);
  assert.deepEqual(t.view(OWNER).ribbonwingInvite.peerId, 'guest');
  assert.equal(t.ride('third', { action: 'board', pilotId: OWNER }).error, 'no_ribbonwing_invite', 'an invitation is for one person');
  t.advance(60001);
  assert.equal(t.ride('guest', { action: 'board', pilotId: OWNER }).error, 'no_ribbonwing_invite', 'an invitation lapses after a minute');
  t.climb(2);
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'guest' }).error, 'ribbonwing_not_landed');
  t.pilot(0);
  const reply = board(t), guest = t.view('guest'), owner = t.view(OWNER), [east, north] = rightOf(owner, .68);
  assert.equal(reply.player.passengerOf, OWNER);
  assert.deepEqual([owner.passengerId, owner.ribbonwingInvite], ['guest', undefined]);
  assert.ok(close(guest.position[0], east) && close(guest.position[1], north), 'seated to the pilot\'s right');
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'third' }).error, 'ribbonwing_seat_taken');
});

test('aboard, the passenger moves only with the craft, through flight and a maneuver, and steps out only on the ground', () => {
  const t = setup();board(t);
  const before = t.view('guest');
  const refused = t.world.command('guest', { type: 'pose', position: [before.position[0] + 1, before.position[1], before.position[2]], yaw: 0, altitude: 0 });
  assert.deepEqual([refused.error, refused.correction], ['passenger_aboard', undefined], 'refused without a correction that would unseat them');
  assert.equal(t.world.command('guest', { type: 'travel', position: [0, 0] }).error, 'passenger_aboard');
  assert.equal(t.world.command('guest', { type: 'chat', text: 'Off we go' }).ok, true, 'chat still works');
  t.climb(10);
  assert.ok(close(t.view('guest').altitude, 10), 'the seat climbs with the craft');
  assert.equal(t.ride('guest', { action: 'leave' }).error, 'ribbonwing_aloft');
  const reply = t.world.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'm1', seq: 1 });assert.equal(reply.ok, true, JSON.stringify(reply));
  t.advance(1300);
  const pilotNow = t.view(OWNER), guestNow = t.view('guest'), [east, north] = rightOf(pilotNow, .68);
  assert.ok(close(pilotNow.position[1], maneuverPose(reply.player.maneuver, t.time).north), 'the pilot is on the path');
  assert.ok(close(guestNow.position[0], east) && close(guestNow.position[1], north) && close(guestNow.altitude, pilotNow.altitude), 'and the passenger beside them');
  t.advance(1400);t.world.step(.05);
  // Land, then step out to the right of the craft, on the ground, free to walk again.
  let altitude = t.view(OWNER).altitude;while (altitude > 0) { altitude = Math.max(0, altitude - 3.2);assert.equal(t.pilot(altitude).ok, true); }
  const landed = t.view(OWNER), left = t.ride('guest', { action: 'leave' });
  assert.equal(left.ok, true, JSON.stringify(left));
  const out = t.view('guest');
  assert.deepEqual([out.passengerOf, out.altitude, t.view(OWNER).passengerId], [undefined, 0, undefined]);
  const offset = Math.hypot(out.position[0] - landed.position[0], out.position[1] - landed.position[1]);
  assert.ok(offset > 2.5 && offset < 6, `set down beside the craft (${offset.toFixed(2)} m)`);
  t.advance(1000);
  assert.equal(t.world.command('guest', { type: 'pose', position: out.position, yaw: 0, altitude: 0 }).ok, true);
});

test('losing the pilot or the craft sets the passenger down safely on clear ground', () => {
  for (const [name, end] of [
    ['the pilot leaves the town aloft', t => { t.climb(8);assert.equal(t.world.leave(OWNER), true); }],
    ['the craft is revoked aloft', t => { t.climb(8);t.world.players.get(OWNER).vehicle = null;t.world.step(.05); }],
    ['the pilot steps out on the ground', t => { assert.equal(t.pilot(0, null).ok, true); }],
    ['the pilot travels away', t => { t.world.command(OWNER, { type: 'travel', position: [10, 10] }); }],
  ]) {
    const t = setup();board(t);end(t);t.world.step(.05);
    const guest = t.view('guest');
    assert.deepEqual([guest.passengerOf, guest.altitude], [undefined, 0], name);
    assert.ok(t.world.players.get(OWNER)?.passengerId === undefined, `${name}: the seat is free`);
    t.advance(1000);
    assert.equal(t.world.command('guest', { type: 'pose', position: guest.position, yaw: 0, altitude: 0 }).ok, true, `${name}: the passenger walks on`);
  }
  // A passenger who leaves frees the seat for someone else.
  const t = setup();board(t);assert.equal(t.world.leave('guest'), true);
  assert.equal(t.view(OWNER).passengerId, undefined);
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'third' }).ok, true);
});

test('checkpoints keep the seat as a matched pair and drop invitations; a malformed seat fails closed and an unmatched one is cleared', () => {
  const t = setup();board(t);t.climb(5);
  assert.equal(t.ride(OWNER, { action: 'cancel' }).ok, true);
  const saved = JSON.parse(JSON.stringify(t.world.checkpoint()));
  const restored = createWorld(data, { now: () => t.time, isAdmin: () => false });
  assert.deepEqual(restored.restore(saved), { ok: true });
  const back = restored.snapshot().players;
  assert.deepEqual([back.find(p => p.id === 'guest').passengerOf, back.find(p => p.id === OWNER).passengerId], [OWNER, 'guest']);
  assert.ok(close(back.find(p => p.id === 'guest').altitude, 5));
  // Re-signed, so each edit reaches the seat's own validation rather than the checksum.
  const restoreCopy = change => { const copy = JSON.parse(JSON.stringify(saved));change(Object.fromEntries(copy.payload.players.map(p => [p.id, p])));const world = createWorld(data, { now: () => t.time, isAdmin: () => false });return { result: world.restore(resign(copy)), world }; };
  assert.equal(restoreCopy(() => {}).result.ok, true, 'an unchanged re-signed copy restores');
  // Malformed: fails the whole checkpoint.
  for (const [name, change] of [
    ['saved invitation', p => { p[OWNER].ribbonwingInvite = { peerId: 'third', until: t.time + 1000 }; }], ['non-text seat', p => { p.guest.passengerOf = 42; }],
    ['a guest in the Ribbonwing', p => { p.guest.vehicle = 'hover'; }],
  ]) assert.equal(restoreCopy(change).result.ok, false, name);
  // A pair that no longer matches (after a rollback #737 kept one side while the other left or
  // moved): the town restores, the seat is cleared on both sides and the passenger is on the ground.
  for (const [name, change] of [
    ['one-sided passenger', p => { delete p[OWNER].passengerId; }], ['one-sided pilot', p => { delete p.guest.passengerOf; }],
    ['pilot not in the craft', p => { p[OWNER].vehicle = null;p[OWNER].altitude = 0; }], ['non-owner pilot', p => { p.third.passengerId = 'guest';p.guest.passengerOf = 'third';delete p[OWNER].passengerId; }],
    ['passenger left (rollback)', p => { p[OWNER].passengerId = 'gone'; }],
  ]) {
    const { result, world } = restoreCopy(change);
    assert.deepEqual(result, { ok: true }, name);
    const players = world.snapshot().players, guest = players.find(p => p.id === 'guest');
    assert.ok(players.every(p => p.passengerId == null && p.passengerOf == null), `${name}: no seat survives`);
    if (name !== 'one-sided pilot') assert.equal(guest.altitude, 0, `${name}: the passenger is on the ground`);
  }
  // An invitation is not saved.
  assert.equal(t.ride(OWNER, { action: 'invite', peerId: 'third' }).error, 'ribbonwing_not_landed');
});

test('a block hides invitations and boarding like an absent resident, and ends a ride already under way', async () => {
  const { createMemoryBlocks, screenCommand } = await import('../blocks.js');
  const blocks = createMemoryBlocks();await blocks.add('guest', { userId: OWNER, name: 'Jevica' });
  const send = async (world, userId, command) => { const screened = await screenCommand(blocks, userId, command, () => false);return screened.refusal ?? world.command(userId, screened.command); };
  const blocked = setup(), absent = setup();
  assert.deepEqual(await send(blocked.world, OWNER, { type: 'ribbonwing', action: 'invite', peerId: 'guest' }), absent.world.command(OWNER, { type: 'ribbonwing', action: 'invite', peerId: 'someone-who-left' }));
  assert.equal(blocked.view(OWNER).ribbonwingInvite, undefined);
  // An invitation sent before the block cannot be accepted after it.
  assert.equal(absent.ride(OWNER, { action: 'invite', peerId: 'guest' }).ok, true);
  assert.equal((await send(absent.world, 'guest', { type: 'ribbonwing', action: 'board', pilotId: OWNER })).error, 'no_ribbonwing_invite');
  // A ride under way ends when the block is stored.
  const riding = setup();board(riding);riding.climb(6);
  assert.equal(riding.world.separate(OWNER, 'guest'), true);
  assert.deepEqual([riding.view('guest').passengerOf, riding.view('guest').altitude, riding.view(OWNER).passengerId], [undefined, 0, undefined]);
});

test('a page that lost the ride mid-flight cannot step its pilot out in the sky; on the ground it can', () => {
  const t = setup();
  t.climb(8);
  // What a reloaded page sends before it resumes: the pilot on foot at the craft's altitude.
  const { position } = t.view(OWNER);
  t.advance(1000);
  const lost = t.world.command(OWNER, { type: 'pose', position, yaw: 0, altitude: 8, vehicle: null });
  assert.equal(lost.ok, false);assert.equal(lost.error, 'land_before_leaving');
  assert.equal(lost.correction.vehicle, 'hover', 'the correction hands the page the craft back');
  assert.ok(close(lost.correction.altitude, 8), 'at its altitude');
  assert.equal(t.view(OWNER).vehicle, 'hover', 'the town keeps her at the controls');
  let at = 8;while (at > 0) { at = Math.max(0, at - 3.2);assert.equal(t.pilot(at).ok, true); }
  t.advance(1000);
  assert.equal(t.world.command(OWNER, { type: 'pose', position: t.view(OWNER).position, yaw: 0, altitude: 0, vehicle: null }).ok, true, 'landed, she steps out');
  assert.equal(t.view(OWNER).vehicle ?? null, null);
});

test('the town publishes its flight ceiling, so a page can stop the craft under it', () => {
  const t = setup(), ceiling = t.world.snapshot().flightCeiling;
  assert.ok(Number.isFinite(ceiling) && ceiling >= 32, `ceiling ${ceiling}`);
  t.climb(ceiling - .05);
  assert.ok(close(t.view(OWNER).altitude, ceiling - .05), 'a page that stops 5 cm under it is accepted');
  t.advance(1000);
  const over = t.world.command(OWNER, { type: 'pose', position: t.view(OWNER).position, yaw: -Math.PI / 2, altitude: ceiling + .02, vehicle: 'hover' });
  assert.equal(over.error, 'invalid_pose', 'above it is refused');
  assert.equal(t.view(OWNER).vehicle, 'hover');
});
