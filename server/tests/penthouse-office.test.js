import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { OFFICE_BODY_SPACING, OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeLevelFree } from '../../preview/src/office-layouts.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const owner = JEVICA_ADMIN_USER_IDS[0], officeId = 'jevica-office';
const L0 = 'jevica-office/l0', L1 = 'jevica-office/l1';
const penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const anchor = id => penthouse.anchors.find(item => item.id === id).position;
const portal = (levelId, kind) => penthouse.levels.find(level => level.id === levelId).portals.find(item => item.kind === kind).id;
const resign = checkpoint => { const { checksum, ...envelope } = checkpoint; return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }; };

function setup({ officeLayout: layout = OFFICE_LAYOUT_PENTHOUSE, restore } = {}) {
  const clock = { time: 10_000 };
  const world = createSharedWorld(data, { now: () => clock.time, officeLayout: layout });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  else for (const userId of [owner, 'guest']) assert.ok(world.join({ userId, name: userId }).ok);
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
  // Walk in budgeted steps of at most 2.4 m a second, as a client would.
  const walk = (user, to) => {
    let at = visit(user).position;
    while (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-9) {
      const length = Math.hypot(to[0] - at[0], to[1] - at[1]), t = Math.min(1, 2.4 / length);
      const next = [at[0] + (to[0] - at[0]) * t, at[1] + (to[1] - at[1]) * t];
      const moved = send(user, 'move', { position: next, yaw: 0, layout: visit(user).layout });
      assert.equal(moved.ok, true, `${user} to ${next}: ${moved.error}`);
      at = next;
    }
  };
  return { world, clock, send, visit, enter, walk };
}

test('the penthouse is the default and old clients cannot select the retired room', () => {
  const plain = createSharedWorld(data, { now: () => 10_000 });
  plain.join({ userId: owner, name: 'Jevica' });
  const office = plain.command(owner, { type: 'office', action: 'list', officeId }).offices[0];
  plain.command(owner, { type: 'travel', position: office.entrance });
  const entered = plain.command(owner, { type: 'office', action: 'enter', officeId });
  assert.deepEqual([entered.office.layout, entered.office.levelId, entered.office.elevation], [OFFICE_LAYOUT_PENTHOUSE, L0, 0]);
  assert.equal(plain.command(owner, { type: 'office', action: 'move', officeId, position: [0, 1.4], yaw: 0 }).error, 'office_layout_stale', 'old clients must refresh their layout');
  assert.throws(() => createSharedWorld(data, { officeLayout: 'office-penthouse-0' }), /Unknown office layout/);
  const f = setup();
  const visit = f.enter(owner);
  assert.deepEqual([visit.layout, visit.levelId, visit.position, visit.elevation], [OFFICE_LAYOUT_PENTHOUSE, L0, penthouse.spawn.position, 0]);
});

test('spoofed level, elevation, layout and oversized moves are refused without changing the visit', () => {
  const f = setup();
  f.enter(owner);
  const before = f.visit(owner);
  const move = more => f.send(owner, 'move', { position: [0, 2], yaw: 0, layout: OFFICE_LAYOUT_PENTHOUSE, ...more });
  assert.equal(move({ levelId: L1 }).error, 'office_level_stale', 'the client cannot name its floor');
  assert.equal(move({ elevation: 3.8 }).error, 'invalid_office_command');
  assert.equal(move({ layout: OFFICE_LAYOUT_LEGACY }).error, 'office_layout_stale');
  assert.equal(move({ layout: 'office-penthouse-9' }).error, 'office_layout_stale');
  assert.equal(f.send(owner, 'move', { position: [0, 2], yaw: 0 }).error, 'office_layout_stale', 'a penthouse visit needs the layout on every move');
  assert.equal(move({ position: [0, 2, 3.8] }).error, 'office_blocked');
  assert.equal(move({ position: [Number.NaN, 2] }).error, 'office_blocked');
  assert.equal(move({ position: [0, 19] }).error, 'office_too_fast', 'the movement budget still applies');
  assert.equal(move({ position: [10.5, 9] }).error, 'office_blocked', 'the stair\'s sides are never standing ground (walking it: penthouse-stairs.test.js)');
  assert.deepEqual(f.visit(owner), before);
});

test('the stair and lift move a visitor between floors only from their entry, and two floors render apart', () => {
  const f = setup();
  f.enter(owner);
  assert.equal(f.send(owner, 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE }).error, 'office_portal_out_of_reach');
  assert.equal(f.send(owner, 'transition', { portalId: portal(L1, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE }).error, 'invalid_office_portal', 'no arbitrary destination');
  assert.equal(f.send(owner, 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE, levelId: L1 }).error, 'invalid_office_command');
  f.walk(owner, anchor('stairs-bottom'));
  const up = f.send(owner, 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.equal(up.ok, true, up.error);
  assert.deepEqual([up.office.levelId, up.office.position, up.office.elevation], [L1, anchor('stairs-top'), 3.8]);
  // Along the clear gallery band, then up to the lift: the reading chairs are real collision.
  f.walk(owner, anchor('library'));
  f.walk(owner, [-12, anchor('library')[1]]);
  f.walk(owner, anchor('lift-upper'));
  // The guest stands under the mezzanine at the same XY, on the main floor.
  f.send(owner, 'invite', { peerId: 'guest' });
  f.enter('guest');
  f.walk('guest', [-8, 1.5]); // around the executive desk chair
  f.walk('guest', [-7, 13.6]); // and east of the lounge (#362's furnishings are collision)
  f.walk('guest', anchor('lift-ground'));
  const guest = f.visit('guest'), host = f.visit(owner);
  assert.deepEqual(guest.position, host.position);
  assert.deepEqual([guest.levelId, guest.elevation, host.levelId, host.elevation], [L0, 0, L1, 3.8]);
  // Someone standing at the landing never keeps another visitor off a floor (no barricades):
  // the lift lands beside the guest, never on them, on a free spot of the main floor.
  const down = f.send(owner, 'transition', { portalId: portal(L1, 'lift'), layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.deepEqual([down.ok, down.office.levelId, down.office.elevation], [true, L0, 0], down.error);
  assert.ok(Math.hypot(down.office.position[0] - guest.position[0], down.office.position[1] - guest.position[1]) >= OFFICE_BODY_SPACING, `beside the guest: ${down.office.position}`);
  assert.ok(officeLevelFree(penthouse, L0, down.office.position), 'on a free spot');
});

test('nobody can barricade a floor by standing on a landing: the stairs land beside them', () => {
  const f = setup();
  f.send(owner, 'invite', { peerId: 'guest' });
  f.enter(owner); f.enter('guest');
  for (const user of ['guest', owner]) f.walk(user, anchor('stairs-bottom'));
  const up = f.send('guest', 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.deepEqual([up.ok, up.office.position], [true, anchor('stairs-top')], up.error);
  // The guest stays on the stair-top landing; the owner still gets up, beside them.
  const climb = f.send(owner, 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.equal(climb.ok, true, climb.error);
  assert.equal(climb.office.levelId, L1);
  assert.ok(Math.hypot(climb.office.position[0] - anchor('stairs-top')[0], climb.office.position[1] - anchor('stairs-top')[1]) >= OFFICE_BODY_SPACING, `beside the guest: ${climb.office.position}`);
  assert.ok(officeLevelFree(penthouse, L1, climb.office.position), 'on a free spot of the mezzanine');
  // And back down past a guest who moved onto the stair foot.
  const back = f.send('guest', 'transition', { portalId: portal(L1, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.equal(back.ok, true, back.error);
  f.walk(owner, anchor('stairs-top'));
  const down = f.send(owner, 'transition', { portalId: portal(L1, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  assert.equal(down.ok, true, down.error);
  assert.ok(Math.hypot(down.office.position[0] - back.office.position[0], down.office.position[1] - back.office.position[1]) >= OFFICE_BODY_SPACING);
});

test('revocation during a climb ends the visit; a delayed transition or move cannot restore it', () => {
  const f = setup();
  f.send(owner, 'invite', { peerId: 'guest' });
  f.enter(owner); f.enter('guest');
  f.walk('guest', anchor('stairs-bottom'));
  assert.equal(f.send(owner, 'revoke', { peerId: 'guest' }).ok, true);
  assert.equal(f.visit('guest'), null);
  assert.equal(f.send('guest', 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE }).error, 'office_permission_required');
  assert.equal(f.send('guest', 'move', { position: anchor('stairs-bottom'), yaw: 0, layout: OFFICE_LAYOUT_PENTHOUSE }).error, 'office_permission_required');
  assert.equal(f.visit('guest'), null);
});

test('checkpoints keep the floor; retired visits end without restoring the legacy room; forged visits fail closed', () => {
  const f = setup();
  f.enter(owner);
  f.walk(owner, anchor('stairs-bottom'));
  f.send(owner, 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 14);
  const restored = setup({ restore: saved });
  assert.deepEqual([restored.visit(owner).levelId, restored.visit(owner).elevation], [L1, 3.8]);

  // A version 9 town written before layouts: its visits are legacy-room visits.
  const legacyTown = setup({ officeLayout: OFFICE_LAYOUT_LEGACY });
  legacyTown.enter(owner);
  const current = legacyTown.world.checkpoint();
  const v9 = structuredClone(current); v9.version = 9;
  for (const [, visit] of v9.payload.offices.visits) { delete visit.layout; delete visit.levelId; }
  const upgraded = setup({ officeLayout: OFFICE_LAYOUT_LEGACY, restore: resign(v9) });
  assert.equal(upgraded.visit(owner), null, 'old room occupancy ends safely');
  assert.equal(upgraded.enter(owner).layout, OFFICE_LAYOUT_PENTHOUSE);
  const masquerade = structuredClone(current); masquerade.version = 9;
  assert.equal(createSharedWorld(data, { officeLayout: OFFICE_LAYOUT_LEGACY }).restore(resign(masquerade)).ok, false, 'layout fields cannot hide in a v9 checkpoint');

  const forged = [
    visit => { visit.levelId = 'jevica-office/l7'; },
    visit => { visit.layout = 'office-penthouse-9'; },
    visit => { visit.position = [0, 10]; }, // free on the main floor, not on the mezzanine
    visit => { visit.elevation = 3.8; },
  ];
  for (const forge of forged) {
    const copy = structuredClone(saved); forge(copy.payload.offices.visits[0][1]);
    assert.equal(createSharedWorld(data, { officeLayout: OFFICE_LAYOUT_PENTHOUSE }).restore(resign(copy)).ok, false, String(forge));
  }
});

test('retired legacy configuration preserves penthouse visits and invitations', () => {
  const f = setup();
  f.send(owner, 'invite', { peerId: 'guest' });
  f.send('guest', 'request');
  f.enter(owner);
  f.walk(owner, anchor('stairs-bottom'));
  f.send(owner, 'transition', { portalId: portal(L0, 'stairs'), layout: OFFICE_LAYOUT_PENTHOUSE });
  const saved = f.world.checkpoint();
  const rolledBack = setup({ officeLayout: OFFICE_LAYOUT_LEGACY, restore: saved });
  assert.deepEqual(rolledBack.visit(owner), f.visit(owner), 'retired configuration cannot replace the live layout');
  assert.deepEqual(rolledBack.world.checkpoint().payload.offices.grants, saved.payload.offices.grants);
  assert.equal(rolledBack.visit(owner).layout, OFFICE_LAYOUT_PENTHOUSE);
});
