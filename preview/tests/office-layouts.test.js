import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { OFFICE_SPAWN, officeFree, stepOffice } from '../src/office-contract.js';
import {
  DEFAULT_OFFICE_LAYOUT, OFFICE_LAYOUTS, OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeLevelFree,
  officeLevelSegmentFree, officeNearbyPortal, officeTransition, officeWorkstations, stepOfficeLevel,
} from '../src/office-layouts.js';

const contract = JSON.parse(readFileSync(new URL('../../docs/design/office-ipic/layout-contract.json', import.meta.url)));
const proposed = contract.places.find(place => place.id === 'office-penthouse-proposed');
const legacy = officeLayout(OFFICE_LAYOUT_LEGACY), penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const L0 = 'jevica-office/l0', L1 = 'jevica-office/l1';
// The contract names the mezzanine level `mezz`; the runtime uses #349's `<building>/l<n>` ids.
const LEVEL_OF = { l0: L0, mezz: L1 };
const anchor = id => penthouse.anchors.find(item => item.id === id);
const near = (a, b) => Math.abs(a - b) < 1e-9;

// Breadth-first search on a 0.2 m grid anchored at the start: is there a walkable path on one level?
function walkable(layout, levelId, from, to) {
  const step = 0.2, at = ([i, j]) => [from[0] + i * step, from[1] + j * step];
  const seen = new Set(['0,0']), queue = [[0, 0]];
  while (queue.length) {
    const cell = queue.shift(), here = at(cell);
    if (Math.hypot(here[0] - to[0], here[1] - to[1]) <= step && officeLevelSegmentFree(layout, levelId, here, to)) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [cell[0] + di, cell[1] + dj], key = next.join();
      if (seen.has(key) || !officeLevelFree(layout, levelId, at(next))) continue;
      seen.add(key); queue.push(next);
    }
  }
  return false;
}

test('the legacy office stays the default and its collision is unchanged', () => {
  assert.equal(DEFAULT_OFFICE_LAYOUT, OFFICE_LAYOUT_LEGACY);
  assert.deepEqual(Object.keys(OFFICE_LAYOUTS).sort(), [OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE].sort());
  assert.equal(officeLayout('office-penthouse-0'), null);
  assert.equal(officeLayout('__proto__'), null);
  assert.deepEqual(legacy.spawn, { levelId: L0, position: OFFICE_SPAWN });
  assert.deepEqual(legacy.levels.map(level => level.id), [L0]);
  for (let x = -4.6; x <= 4.6; x += 0.23) for (let d = -0.2; d <= 7.2; d += 0.23)
    assert.equal(officeLevelFree(legacy, L0, [x, d]), officeFree([x, d]), `${x},${d}`);
  assert.equal(officeLevelFree(legacy, L1, [0, 2]), false, 'the legacy room has one level');
});

test('both layouts use #349\'s level and portal shape, with reciprocal portal pairs', () => {
  for (const layout of [legacy, penthouse]) {
    assert.equal(layout.schemaVersion, 1);
    assert.equal(layout.buildingId, 'jevica-office');
    layout.levels.forEach((level, index) => {
      assert.equal(level.id, `jevica-office/l${index}`);
      assert.equal(level.index, index);
      assert.ok(level.clearHeight >= AVATAR_ENVELOPE.height + 0.1, `${level.id} clears the tallest look`);
      for (const room of level.rooms) assert.match(room.id, new RegExp(`^${level.id}/room/[a-z-]+$`));
      for (const portal of level.portals) {
        assert.match(portal.id, new RegExp(`^${level.id}/portal/[a-z-]+$`));
        assert.ok(['entrance', 'stairs', 'lift'].includes(portal.kind));
        if (portal.kind === 'entrance') continue;
        const other = layout.levels.find(item => item.id === portal.toLevelId)?.portals.find(item => item.id === portal.pairId);
        assert.ok(other, `${portal.id} pairs with a portal on ${portal.toLevelId}`);
        assert.deepEqual([other.pairId, other.toLevelId, other.kind], [portal.id, level.id, portal.kind]);
      }
    });
  }
});

test('the penthouse plan carries the reviewed contract numbers, not a second set', () => {
  assert.equal(proposed.status, 'proposed', 'the contract still records the penthouse as proposed');
  for (const level of proposed.levels) {
    const runtime = penthouse.levels.find(item => item.id === LEVEL_OF[level.id]);
    assert.deepEqual([runtime.floorElevation, runtime.clearHeight], [level.elevation, level.clearHeight], level.id);
  }
  for (const zone of proposed.zones) {
    const room = penthouse.levels.find(item => item.id === LEVEL_OF[zone.level]).rooms.find(item => item.id.endsWith(`/room/${zone.id}`));
    assert.ok(room, zone.id);
    assert.deepEqual([[room.x0, room.x1], [room.d0, room.d1]], [zone.x, zone.d], zone.id);
  }
  assert.deepEqual(penthouse.stair, { x: proposed.stair.x, d: proposed.stair.d, rise: proposed.stair.rise, risers: proposed.stair.risers });
  assert.deepEqual(penthouse.anchors.map(item => item.id).sort(), proposed.anchors.map(item => item.id).sort());
  for (const item of proposed.anchors) {
    const runtime = anchor(item.id);
    assert.deepEqual([runtime.levelId, runtime.position, runtime.kind], [LEVEL_OF[item.level], item.position, item.kind], item.id);
    if (item.seat) assert.deepEqual(runtime.seat, item.seat, `${item.id} seat`);
  }
  const programme = proposed.mezzanineProgramme;
  for (const seat of programme.seats) assert.deepEqual(penthouse.mezzanine.seats.find(item => item.id === seat.id).position, seat.position);
  for (const item of programme.furniture) assert.deepEqual(penthouse.mezzanine.furniture.find(other => other.id === item.id).position, item.position);
  assert.deepEqual(penthouse.mezzanine.retired, programme.retired);
  assert.deepEqual(penthouse.spawn, { levelId: L0, position: anchor(proposed.spawn).position });
});

test('every required contract route works on the penthouse with the measured body', () => {
  for (const route of proposed.routes.filter(item => item.required)) {
    const from = anchor(route.from), to = anchor(route.to);
    if (route.kind === 'walk') {
      assert.equal(from.levelId, to.levelId, `${route.from} -> ${route.to} stays on one level`);
      assert.ok(officeLevelFree(penthouse, from.levelId, from.position), `${route.from} is free`);
      assert.ok(walkable(penthouse, from.levelId, from.position, to.position), `${route.from} -> ${route.to}`);
    } else {
      const portal = penthouse.levels.find(level => level.id === from.levelId).portals.find(item => item.kind === route.kind && near(item.position[0], from.position[0]) && near(item.position[1], from.position[1]));
      assert.ok(portal, `${route.from} is a ${route.kind} portal`);
      const moved = officeTransition(penthouse, { levelId: from.levelId, position: from.position }, portal.id);
      assert.deepEqual(moved.ok && [moved.levelId, moved.position], [to.levelId, to.position], `${route.from} -> ${route.to}`);
    }
  }
});

test('overlapping floors are told apart by level, never by a nearest elevation', () => {
  const lift = anchor('lift-ground').position;
  assert.ok(officeLevelFree(penthouse, L0, lift) && officeLevelFree(penthouse, L1, lift), 'the lift stands on both floors at one position');
  assert.equal(officeLevelFree(penthouse, L1, [0, 10]), false, 'the mezzanine does not extend over the main floor');
  assert.equal(officeLevelFree(penthouse, L0, [0, 10]), true);
  assert.equal(officeLevelFree(penthouse, 'jevica-office/l2', lift), false, 'an unknown level is never free');
  assert.equal(officeLevelFree(penthouse, L0, [Number.NaN, 2]), false);
  assert.equal(officeLevelFree(penthouse, L0, [0, 2, 0]), false, 'positions are [x, d] only');
  const under = penthouse.levels.find(level => level.id === L0).rooms.find(room => room.id.endsWith('/room/main-floor'));
  assert.ok(under.clearUnderMezzanine >= AVATAR_ENVELOPE.height + 0.1, 'headroom under the mezzanine clears the tallest look');
});

test('guards, walls and the stair side stop the body; the openings and passing bay do not', () => {
  const r = AVATAR_ENVELOPE.turningRadius;
  assert.equal(officeLevelFree(penthouse, L1, [0, 14 + r - 0.01]), false, 'mezzanine guard at d 14');
  assert.equal(officeLevelFree(penthouse, L1, [0, 14 + r + 0.01]), true);
  assert.equal(officeLevelFree(penthouse, L0, [-23 + r - 0.01, 8]), false, 'terrace edge');
  assert.equal(officeLevelFree(penthouse, L0, [-15, 5]), true, 'through the south terrace portal');
  assert.equal(officeLevelFree(penthouse, L0, [-15, 12]), true, 'through the north terrace portal');
  assert.equal(officeLevelFree(penthouse, L0, [-15, 8.5]), false, 'the wall between the portals');
  assert.equal(officeLevelFree(penthouse, L0, [11.8, 9]), false, 'the stair is not walkable from the main floor');
  assert.equal(officeLevelFree(penthouse, L0, [10.2 - r + 0.01, 9]), false, 'nor brushed from its side');
  assert.equal(officeLevelSegmentFree(penthouse, L0, [-17, 8.5], [-13, 8.5]), false, 'no walking through the wall');
  assert.equal(officeLevelSegmentFree(penthouse, L0, [0, 1.5], [0, 17]), false, 'segments are bounded like the legacy office');
  for (const band of proposed.mezzanineProgramme.clearBands) {
    for (let x = band.x[0] + r; x <= band.x[1] - r; x += 0.25) for (let d = Math.max(band.d[0], 14 + r); d <= band.d[1] - 0.01; d += 0.25)
      assert.ok(officeLevelFree(penthouse, L1, [x, Math.min(d, 20 - r)]), `${band.id} is clear at ${x},${d}`);
  }
  const bay = proposed.mezzanineProgramme.clearBands.find(band => band.id === 'east-passing-bay');
  const waiting = bay.waitingCentre, passing = [waiting[0], bay.throughRouteD];
  assert.ok(Math.hypot(waiting[0] - passing[0], waiting[1] - passing[1]) >= 2 * r, 'two standing bodies pass in the bay');
});

test('stairs and lift are fixed-endpoint transitions from their entry, never from beside or across', () => {
  const bottom = anchor('stairs-bottom').position, top = anchor('stairs-top').position;
  const up = penthouse.levels[0].portals.find(item => item.kind === 'stairs');
  const down = penthouse.levels[1].portals.find(item => item.kind === 'stairs');
  assert.deepEqual(officeTransition(penthouse, { levelId: L0, position: [bottom[0] + 1, bottom[1] - 0.5] }, up.id),
    { ok: true, levelId: L1, position: top, portalId: down.id, elevation: 3.8 });
  assert.equal(officeTransition(penthouse, { levelId: L0, position: [bottom[0], bottom[1] - 2] }, up.id).error, 'office_portal_out_of_reach');
  assert.equal(officeTransition(penthouse, { levelId: L0, position: [14.3, 9] }, up.id).error, 'office_portal_out_of_reach', 'no side entry onto the stair');
  assert.equal(officeTransition(penthouse, { levelId: L0, position: bottom }, down.id).error, 'invalid_office_portal', 'a portal on another floor is not a destination');
  assert.equal(officeTransition(penthouse, { levelId: L1, position: top }, down.id).levelId, L0);
  assert.equal(officeTransition(penthouse, { levelId: L0, position: bottom }, 'jevica-office/l0/portal/roof').error, 'invalid_office_portal');
  assert.equal(officeTransition(legacy, { levelId: L0, position: OFFICE_SPAWN }, up.id).error, 'invalid_office_portal');
  const lift = penthouse.levels[0].portals.find(item => item.kind === 'lift');
  const moved = officeTransition(penthouse, { levelId: L0, position: anchor('lift-ground').position }, lift.id);
  assert.deepEqual([moved.levelId, moved.position, moved.elevation], [L1, anchor('lift-upper').position, 3.8]);
});

test('client stepping predicts the server: legacy unchanged, penthouse slides along guards and walls', () => {
  for (const [x, d, dx, dd] of [[0, 1.25, 0.2, 0.1], [3.5, 3, 0.3, -0.2], [-3.4, 1, -0.4, 0.2], [0, 6, 0, 0.4]])
    assert.deepEqual(stepOfficeLevel(legacy, L0, [x, d], dx, dd), stepOffice([x, d], dx, dd));
  const r = AVATAR_ENVELOPE.turningRadius;
  const along = stepOfficeLevel(penthouse, L1, [0, 14 + r + 0.05], 0.2, -0.2);
  assert.deepEqual(along, [0.2, 14 + r + 0.05], 'pushing into the guard slides along it');
  assert.deepEqual(stepOfficeLevel(penthouse, L0, [-14, 8.5], -0.2, 0), [-14, 8.5], 'the wall between the terrace portals holds');
  assert.ok(officeLevelFree(penthouse, L0, stepOfficeLevel(penthouse, L0, [0, 1.5], 0.25, 0.25)));
});

test('the nearby portal and workstations come from the admitted floor', () => {
  const bottom = anchor('stairs-bottom').position;
  assert.equal(officeNearbyPortal(penthouse, L0, bottom)?.kind, 'stairs');
  assert.equal(officeNearbyPortal(penthouse, L0, [bottom[0], bottom[1] - 2]), null);
  assert.equal(officeNearbyPortal(penthouse, L1, bottom), null, 'the stair head is upstairs, not here');
  assert.equal(officeNearbyPortal(penthouse, L1, anchor('lift-upper').position)?.toLevelId, L0);
  assert.equal(officeNearbyPortal(legacy, L0, OFFICE_SPAWN), null, 'the legacy room has no stairs');
  assert.deepEqual(officeWorkstations(penthouse, L0).map(item => item.id), ['desk-executive', 'desk-a1', 'desk-a2', 'desk-b1', 'desk-b2']);
  assert.deepEqual(officeWorkstations(penthouse, L1), []);
  assert.deepEqual(officeWorkstations(legacy, L0).map(item => item.approach), [[-2.05, 2.2], [-2.05, 4.6]]);
});
