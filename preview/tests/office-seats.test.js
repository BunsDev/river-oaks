import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import {
  OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, OFFICE_OCCUPIED_CLEARANCE, OFFICE_SEAT_REACH, officeLayout, officeLevelFree,
  officeLevelSegmentFree, officeNearbySeat, officeSeat, officeSeats, officeTransition, stepOfficeLevel,
} from '../src/office-layouts.js';

const contract = JSON.parse(readFileSync(new URL('../../docs/design/office-ipic/layout-contract.json', import.meta.url)));
const proposed = contract.places.find(place => place.id === 'office-penthouse-proposed');
const programme = proposed.mezzanineProgramme;
const legacy = officeLayout(OFFICE_LAYOUT_LEGACY), penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const L0 = 'jevica-office/l0', L1 = 'jevica-office/l1';
const LEVEL_OF = { l0: L0, mezz: L1 };
const anchor = id => penthouse.anchors.find(item => item.id === id);
const seats = officeSeats(penthouse);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Breadth-first search on a 0.2 m grid, as office-layouts.test.js does, with occupied seats.
function walkable(levelId, from, to, occupied) {
  const step = 0.2, at = ([i, j]) => [from[0] + i * step, from[1] + j * step];
  const seen = new Set(['0,0']), queue = [[0, 0]];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head], here = at(cell);
    if (distance(here, to) <= step && officeLevelSegmentFree(penthouse, levelId, here, to, occupied)) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [cell[0] + di, cell[1] + dj], key = next.join();
      if (seen.has(key) || !officeLevelFree(penthouse, levelId, at(next), occupied)) continue;
      seen.add(key); queue.push(next);
    }
  }
  return false;
}

test('the penthouse seats are the contract\'s desk chairs and revision-3 reading chairs; the legacy room has none', () => {
  assert.deepEqual(officeSeats(legacy), [], 'legacy desks keep their current behaviour');
  assert.deepEqual(seats.map(seat => seat.id), [
    'desk-executive-chair', 'desk-a1-chair', 'desk-a2-chair', 'desk-b1-chair', 'desk-b2-chair', 'reading-chair-a', 'reading-chair-b',
  ]);
  for (const station of proposed.anchors.filter(item => item.seat)) {
    const seat = officeSeat(penthouse, `${station.id}-chair`);
    assert.deepEqual([seat.levelId, seat.position, seat.stand, seat.workstation], [LEVEL_OF[station.level], station.seat, station.position, station.id], station.id);
    assert.equal(seat.facing, 0, `${station.id} faces its desk (+d)`);
  }
  for (const chair of programme.seats) {
    const seat = officeSeat(penthouse, chair.id);
    assert.deepEqual([seat.levelId, seat.position, seat.workstation], [L1, chair.position, null], chair.id);
    assert.equal(seat.facing, Math.PI, `${chair.id} faces the gallery (-d)`);
    const gallery = programme.clearBands.find(band => band.id === 'gallery-route');
    assert.deepEqual(seat.stand, [chair.position[0], gallery.d[1]], `${chair.id} stands up onto the gallery band's edge`);
  }
  assert.equal(officeSeat(penthouse, 'bookcase-0'), null);
  assert.equal(officeSeat(penthouse, '__proto__'), null);
  assert.equal(officeSeat(legacy, 'desk-a1-chair'), null);
  assert.equal(OFFICE_OCCUPIED_CLEARANCE, AVATAR_ENVELOPE.turningRadius + AVATAR_ENVELOPE.seatedRadius, 'a turning body beside the measured seated footprint');
});

test('seats are far enough apart for two seated bodies, and each stand point is free, reachable and inside its own seat\'s envelope', () => {
  for (const seat of seats) {
    for (const other of seats.filter(item => item !== seat && item.levelId === seat.levelId))
      assert.ok(distance(seat.position, other.position) >= 2 * AVATAR_ENVELOPE.seatedRadius, `${seat.id} and ${other.id} seat two measured bodies`);
    const others = seats.filter(item => item !== seat);
    assert.ok(officeLevelFree(penthouse, seat.levelId, seat.stand), `${seat.id} stand point is free`);
    assert.ok(officeLevelFree(penthouse, seat.levelId, seat.stand, others), `${seat.id} stand point stays free with every other seat occupied`);
    // Nobody else can walk onto it while the seat is taken, so standing up is never blocked by a body.
    assert.ok(distance(seat.stand, seat.position) < OFFICE_OCCUPIED_CLEARANCE, `${seat.id} stand point is inside its own occupied envelope`);
    assert.equal(officeNearbySeat(penthouse, seat.levelId, seat.stand)?.id, seat.id);
    assert.equal(officeNearbySeat(penthouse, seat.levelId, [seat.stand[0] + OFFICE_SEAT_REACH + 0.01, seat.stand[1]]), null, `${seat.id} is out of reach beyond ${OFFICE_SEAT_REACH} m`);
    assert.notEqual(officeNearbySeat(penthouse, seat.levelId === L0 ? L1 : L0, seat.stand)?.id, seat.id, 'a seat is reached only on its own floor');
  }
  assert.equal(officeNearbySeat(penthouse, L0, penthouse.spawn.position), null, 'nothing to sit on at the arrival');
  assert.equal(officeNearbySeat(legacy, L0, [-2.05, 2.2]), null);
});

test('an occupied seat blocks the measured turning body around it, on its own floor only', () => {
  const chair = officeSeat(penthouse, 'desk-a1-chair'), [x, d] = chair.position;
  const edge = [x - OFFICE_OCCUPIED_CLEARANCE, d];
  assert.equal(officeLevelFree(penthouse, L0, [edge[0] + 0.01, d]), true, 'an empty chair is only its own collision');
  assert.equal(officeLevelFree(penthouse, L0, [edge[0] + 0.01, d], [chair]), false, 'inside the occupied envelope');
  assert.equal(officeLevelFree(penthouse, L0, [edge[0] - 0.01, d], [chair]), true, 'just outside it');
  assert.equal(officeLevelFree(penthouse, L1, [-8, 15.6], [chair]), true, 'occupancy downstairs does not block the mezzanine');
  assert.equal(officeLevelSegmentFree(penthouse, L0, [x - 3, d - 0.3], [x - 3, d + 0.3], [chair]), true);
  assert.equal(officeLevelSegmentFree(penthouse, L0, [x - 3, d], [x - 1.5, d], [chair]), false, 'a sweep may not enter it');
  // Client prediction slides along the envelope exactly as the server's rule refuses.
  const start = [edge[0] - 0.05, d];
  assert.deepEqual(stepOfficeLevel(penthouse, L0, start, 0.2, 0, [chair]), start);
  assert.deepEqual(stepOfficeLevel(penthouse, L0, start, 0.2, 0), [start[0] + 0.2, d], 'without occupancy the step succeeds');
  // A landing inside a synthetic occupied envelope is refused like any other blocked landing.
  const top = anchor('stairs-top').position, upStair = penthouse.levels[0].portals.find(item => item.kind === 'stairs');
  const synthetic = { id: 'synthetic-test-seat', levelId: L1, position: [top[0] - 1.5, top[1] + 1] };
  assert.equal(officeTransition(penthouse, { levelId: L0, position: anchor('stairs-bottom').position }, upStair.id, [synthetic]).error, 'office_landing_blocked');
  assert.equal(officeTransition(penthouse, { levelId: L0, position: anchor('stairs-bottom').position }, upStair.id, [chair]).ok, true);
});

test('every required contract route stays walkable with every other seat occupied', () => {
  for (const route of proposed.routes.filter(item => item.required && item.kind === 'walk')) {
    const from = anchor(route.from), to = anchor(route.to);
    // A desk's own chair stays free for its approach; every other seat on that floor is taken.
    const occupied = seats.filter(seat => seat.levelId === from.levelId && seat.workstation !== route.to && seat.workstation !== route.from);
    for (const end of [from, to]) assert.ok(officeLevelFree(penthouse, end.levelId, end.position, occupied), `${end.id} is free with ${occupied.map(seat => seat.id)} occupied`);
    assert.ok(walkable(from.levelId, from.position, to.position, occupied), `${route.from} -> ${route.to} with ${occupied.map(seat => seat.id).join(', ')} occupied`);
  }
  assert.ok(officeLevelFree(penthouse, L0, penthouse.spawn.position, seats), 'arrival is clear of every seated body');
  for (const levelId of [L0, L1]) for (const portal of penthouse.levels.find(level => level.id === levelId).portals.filter(item => item.kind !== 'entrance'))
    assert.ok(officeLevelFree(penthouse, levelId, portal.position, seats), `${portal.id} lands clear of every seated body`);
});

test('the reading chairs\' seated envelopes stay out of the gallery band and passing bay, which stay open with both chairs taken', () => {
  const reading = seats.filter(seat => seat.levelId === L1);
  for (const band of programme.clearBands) for (const seat of reading) {
    const nx = Math.max(band.x[0], Math.min(seat.position[0], band.x[1])), nd = Math.max(band.d[0], Math.min(seat.position[1], band.d[1]));
    assert.ok(distance(seat.position, [nx, nd]) >= AVATAR_ENVELOPE.seatedRadius, `${seat.id}'s seated body stays out of ${band.id}`);
  }
  const gallery = programme.clearBands.find(band => band.id === 'gallery-route'), bay = programme.clearBands.find(band => band.id === 'east-passing-bay');
  for (let x = gallery.x[0] + AVATAR_ENVELOPE.turningRadius; x <= gallery.x[1] - AVATAR_ENVELOPE.turningRadius; x += 0.25)
    assert.ok(officeLevelFree(penthouse, L1, [x, bay.throughRouteD], reading), `the through route is open at x ${x}`);
  assert.ok(officeLevelFree(penthouse, L1, bay.waitingCentre, reading), 'the bay still holds a waiting body');
  assert.ok(walkable(L1, anchor('stairs-top').position, anchor('lift-upper').position, reading), 'stair to lift with both chairs taken');
});
