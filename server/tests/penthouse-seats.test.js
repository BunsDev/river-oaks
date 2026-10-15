import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeSeat } from '../../preview/src/office-layouts.js';

// #363: office seat claims. The plan's seats (office-layouts.js) are the only seats; a claim is
// part of the visit, so leaving, revocation and departure release it, and checkpoints keep it.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const owner = JEVICA_ADMIN_USER_IDS[0], officeId = 'jevica-office', layout = OFFICE_LAYOUT_PENTHOUSE;
const L0 = 'jevica-office/l0', L1 = 'jevica-office/l1';
const penthouse = officeLayout(layout);
const anchor = id => penthouse.anchors.find(item => item.id === id).position;
const seat = id => officeSeat(penthouse, id);
const stairs = levelId => penthouse.levels.find(level => level.id === levelId).portals.find(item => item.kind === 'stairs').id;
const resign = checkpoint => { const { checksum, ...envelope } = checkpoint; return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }; };

function setup({ officeLayout: chosen = layout, restore, users = [owner, 'guest'] } = {}) {
  const clock = { time: 10_000 };
  const world = createSharedWorld(data, { now: () => clock.time, officeLayout: chosen });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  else for (const userId of users) assert.ok(world.join({ userId, name: userId }).ok);
  const send = (user, action, more = {}) => { clock.time += 1000; return world.command(user, { type: 'office', action, officeId, ...more }); };
  const visit = user => world.snapshot().players.find(player => player.id === user)?.office ?? null;
  const enter = user => {
    const office = send(user, 'list').offices[0];
    const at = world.snapshot().players.find(player => player.id === user).position;
    clock.time += 2000;
    if (Math.hypot(at[0] - office.entrance[0], at[1] - office.entrance[1]) > 3) assert.ok(world.command(user, { type: 'travel', position: office.entrance }).ok);
    const entered = send(user, 'enter');
    assert.equal(entered.ok, true, entered.error);
    return entered.office;
  };
  const walk = (user, ...points) => {
    for (const to of points) {
      let at = visit(user).position;
      while (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-9) {
        const length = Math.hypot(to[0] - at[0], to[1] - at[1]), t = Math.min(1, 2.4 / length);
        const next = [at[0] + (to[0] - at[0]) * t, at[1] + (to[1] - at[1]) * t];
        const moved = send(user, 'move', { position: next, yaw: 0, layout: visit(user).layout });
        assert.equal(moved.ok, true, `${user} to ${next}: ${moved.error}`);
        at = next;
      }
    }
  };
  const sit = (user, seatId, more = {}) => send(user, 'sit', { seatId, layout, ...more });
  const stand = (user, more = {}) => send(user, 'stand', { layout, ...more });
  return { world, clock, send, visit, enter, walk, sit, stand };
}
// The west corridor past the executive chair to the B row, clear of an occupied A-row seat.
const toB1 = [[1, 3], [1, 8], seat('desk-b1-chair').stand];

test('a visitor sits from the seat\'s stand point and stands back up there; snapshots carry the seat id only', () => {
  const f = setup(), chair = seat('desk-a1-chair');
  f.enter(owner);
  f.walk(owner, chair.stand);
  const sat = f.sit(owner, chair.id);
  assert.equal(sat.ok, true, sat.error);
  assert.deepEqual([sat.office.position, sat.office.yaw, sat.office.seat, sat.office.levelId], [chair.position, chair.facing, { id: chair.id }, L0]);
  assert.deepEqual(f.visit(owner).seat, { id: chair.id }, 'peers see the claim');
  assert.equal(f.send(owner, 'move', { position: chair.stand, yaw: 0, layout }).error, 'office_seated', 'seated visitors do not walk');
  assert.equal(f.send(owner, 'transition', { portalId: stairs(L0), layout }).error, 'office_seated');
  assert.equal(f.sit(owner, 'desk-a2-chair').error, 'office_already_seated');
  const stood = f.stand(owner);
  assert.equal(stood.ok, true, stood.error);
  assert.deepEqual([stood.office.position, stood.office.seat], [chair.stand, undefined]);
  assert.equal(f.stand(owner).error, 'office_not_seated');
  f.walk(owner, [chair.stand[0] - 1, chair.stand[1]]);
});

test('sitting is refused out of reach, on the other floor, for unknown seats, stale layouts and malformed commands', () => {
  const f = setup();
  f.enter(owner);
  const before = f.visit(owner);
  assert.equal(f.sit(owner, 'desk-a1-chair').error, 'office_seat_out_of_reach', 'not from the arrival');
  assert.equal(f.sit(owner, 'bookcase-1').error, 'invalid_office_seat', 'furniture is not a seat');
  assert.equal(f.sit(owner, 'constructor').error, 'invalid_office_seat');
  assert.equal(f.sit(owner, 42).error, 'invalid_office_command');
  assert.equal(f.sit(owner, 'x'.repeat(200)).error, 'invalid_office_command');
  assert.equal(f.send(owner, 'sit', { seatId: 'desk-a1-chair' }).error, 'invalid_office_command', 'the layout is required');
  assert.equal(f.sit(owner, 'desk-a1-chair', { position: seat('desk-a1-chair').position }).error, 'invalid_office_command', 'no client pose');
  assert.equal(f.sit(owner, 'desk-a1-chair', { layout: OFFICE_LAYOUT_LEGACY }).error, 'office_layout_stale');
  assert.equal(f.stand(owner, { layout: 'office-penthouse-9' }).error, 'office_layout_stale');
  assert.deepEqual(f.visit(owner), before);
  // The reading chairs are upstairs: standing under them on the main floor reaches nothing.
  f.walk(owner, [-8, 3], seat('reading-chair-a').stand);
  assert.equal(f.sit(owner, 'reading-chair-a').error, 'office_seat_out_of_reach');
  assert.equal(f.send('guest', 'sit', { officeId, seatId: 'desk-a1-chair', layout }).error, 'office_permission_required', 'no visit, no seat');
});

test('one winner per seat; a body inside the envelope blocks sitting; nobody walks into an occupied seat', () => {
  const f = setup(), chair = seat('desk-a1-chair'), beside = [chair.stand[0] - 1, chair.stand[1] - 0.5];
  f.send(owner, 'invite', { peerId: 'guest' });
  f.enter(owner); f.enter('guest');
  f.walk(owner, beside); f.walk('guest', chair.stand);
  assert.equal(f.sit(owner, chair.id).error, 'office_seat_blocked', 'the guest stands where the seated body would be');
  const won = f.sit('guest', chair.id);
  assert.equal(won.ok, true, won.error);
  assert.equal(f.sit(owner, chair.id).error, 'office_seat_occupied', 'the second claim loses');
  // The seated body's measured envelope is collision for everyone else on that floor.
  assert.equal(f.send(owner, 'move', { position: chair.stand, yaw: 0, layout }).error, 'office_blocked');
  f.walk(owner, ...toB1);
  // Standing up returns to the stand point, which nobody else could have taken.
  const stood = f.stand('guest');
  assert.deepEqual([stood.ok, stood.office.position], [true, chair.stand], stood.error);
  assert.equal(f.sit(owner, 'desk-b1-chair').ok, true);
  assert.equal(f.sit('guest', chair.id).ok, true, 'the released seat is free again');
});

test('leaving, revocation and departure release the seat; a late sit or stand cannot resurrect a visit', () => {
  const f = setup(), chair = seat('desk-a1-chair');
  f.send(owner, 'invite', { peerId: 'guest' });
  f.enter(owner); f.enter('guest');
  f.walk('guest', ...toB1);
  f.walk(owner, chair.stand);
  assert.equal(f.sit(owner, chair.id).ok, true);
  assert.equal(f.send(owner, 'leave').ok, true);
  assert.equal(f.visit(owner), null);
  f.walk('guest', [1, 8], [1, 3], chair.stand);
  assert.equal(f.sit('guest', chair.id).ok, true, 'leaving released the chair');

  assert.equal(f.send(owner, 'revoke', { peerId: 'guest' }).ok, true);
  assert.equal(f.visit('guest'), null);
  assert.equal(f.sit('guest', chair.id).error, 'office_permission_required');
  assert.equal(f.stand('guest').error, 'office_permission_required');
  assert.equal(f.visit('guest'), null, 'a delayed seat command does not restore the visit');
  f.enter(owner);
  f.walk(owner, chair.stand);
  assert.equal(f.sit(owner, chair.id).ok, true, 'revocation released the chair');

  f.world.leave(owner);
  assert.ok(f.world.join({ userId: owner, name: owner }).ok);
  assert.equal(f.visit(owner), null);
  assert.equal(f.send(owner, 'invite', { peerId: 'guest' }).ok, true);
  f.enter('guest');
  f.walk('guest', [1, 3], chair.stand);
  assert.equal(f.sit('guest', chair.id).ok, true, 'departure released the chair');
});

test('the reading chairs seat two visitors while a third passes the gallery and takes the lift', () => {
  const f = setup({ users: [owner, 'guest', 'third'] });
  for (const peerId of ['guest', 'third']) f.send(owner, 'invite', { peerId });
  for (const user of [owner, 'guest', 'third']) {
    f.enter(user);
    f.walk(user, anchor('stairs-bottom'));
    assert.equal(f.send(user, 'transition', { portalId: stairs(L0), layout }).ok, true);
    f.walk(user, [anchor('stairs-top')[0] - 1.5, anchor('stairs-top')[1]]);
  }
  f.walk(owner, [-4.5, 15.3], seat('reading-chair-b').stand);
  assert.equal(f.sit(owner, 'reading-chair-b').ok, true);
  f.walk('guest', [-8, 15.3], seat('reading-chair-a').stand);
  assert.equal(f.sit('guest', 'reading-chair-a').ok, true);
  assert.equal(f.visit('guest').levelId, L1);
  f.walk('third', anchor('library'), [-12, 15.3], anchor('lift-upper'));
  assert.equal(f.send('third', 'transition', { portalId: penthouse.levels[1].portals.find(item => item.kind === 'lift').id, layout }).ok, true);
});

test('checkpoints keep each claim at the plan\'s exact pose; older checkpoints carry none; forged claims fail closed', () => {
  const f = setup();
  f.send(owner, 'invite', { peerId: 'guest' });
  f.enter(owner); f.enter('guest');
  f.walk(owner, seat('desk-a1-chair').stand);
  f.walk('guest', seat('desk-a2-chair').stand);
  assert.equal(f.sit(owner, 'desk-a1-chair').ok, true);
  assert.equal(f.sit('guest', 'desk-a2-chair').ok, true);
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 11);
  const restored = setup({ restore: saved });
  assert.deepEqual([restored.visit(owner).seat, restored.visit(owner).position], [{ id: 'desk-a1-chair' }, seat('desk-a1-chair').position]);
  assert.deepEqual(restored.visit('guest').seat, { id: 'desk-a2-chair' });
  assert.equal(restored.stand(owner).ok, true, 'a restored claim stands up normally');

  // A version 10 checkpoint predates claims: its visits stand, and a claim cannot hide in one.
  const standing = setup(); standing.enter(owner);
  const v10 = structuredClone(standing.world.checkpoint()); v10.version = 10;
  assert.equal(setup({ restore: resign(v10) }).visit(owner).seat, undefined);
  const masquerade = structuredClone(saved); masquerade.version = 10;
  assert.equal(createSharedWorld(data, { officeLayout: layout }).restore(resign(masquerade)).ok, false);

  const visits = copy => copy.payload.offices.visits;
  const forged = [
    copy => { visits(copy)[0][1].seat = { id: 'desk-a9-chair' }; },
    copy => { visits(copy)[0][1].seat = { id: 'reading-chair-a' }; }, // upstairs, on a main-floor visit
    copy => { visits(copy)[0][1].seat.position = [3.65, 5.6]; },
    copy => { visits(copy)[0][1].position = [3.65, 5.5]; }, // not the seat's pose
    copy => { visits(copy)[0][1].yaw = 1; },
    copy => { visits(copy)[1][1].seat = { id: visits(copy)[0][1].seat.id }; visits(copy)[1][1].position = [...visits(copy)[0][1].position]; }, // shared claim
    copy => { visits(copy)[0][1].seat = null; },
  ];
  for (const forge of forged) {
    const copy = structuredClone(saved); forge(copy);
    assert.equal(createSharedWorld(data, { officeLayout: layout }).restore(resign(copy)).ok, false, String(forge));
  }
  // Rolling back to the legacy room ends the penthouse visits and their claims with them.
  const rolledBack = setup({ officeLayout: OFFICE_LAYOUT_LEGACY, restore: saved });
  assert.equal(rolledBack.visit(owner), null);
});
