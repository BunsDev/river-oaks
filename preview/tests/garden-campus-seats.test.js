import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPUS_OCCUPIED_CLEARANCE, campusSeatOccupancy, campusSeatRestorable, campusSeatWorkstation, campusSit, campusStand } from '../../shared/garden-campus-seats.js';
import { campusUnitSeats } from '../../shared/garden-campus-fitout.js';

const [desk] = campusUnitSeats('T1-F2-W-S'), tenant = () => ({ ok: true, role: 'tenant' }), stranger = () => ({ ok: false, reason: 'campus_access_required' });
const at = (position, levelId = desk.levelId) => ({ levelId, position });

test('a suite desk is taken from its stand point on its own floor, by someone the suite admits', () => {
  assert.equal(desk.levelId, 'garden-campus/l1');
  const sat = campusSit({ seatId: desk.id, at: at(desk.stand), access: tenant });
  assert.deepEqual([sat.ok, sat.seat.seatId, sat.seat.levelId], [true, desk.id, desk.levelId]);
  assert.deepEqual(sat.position, desk.position);
  assert.equal(campusSit({ seatId: desk.id, at: at(desk.stand), access: stranger }).error, 'campus_access_required', 'no lease, no desk');
  assert.equal(campusSit({ seatId: desk.id, at: at(desk.stand, 'garden-campus/l3'), access: tenant }).error, 'campus_seat_out_of_reach', 'the floor above or below is not reach');
  assert.equal(campusSit({ seatId: desk.id, at: at([desk.stand[0] + 1.5, desk.stand[1]]), access: tenant }).error, 'campus_seat_out_of_reach');
  assert.equal(campusSit({ seatId: desk.id, at: at(desk.stand), taken: new Set([desk.id]), access: tenant }).error, 'campus_seat_occupied');
  assert.equal(campusSit({ seatId: desk.id, at: at(desk.stand), bodies: [desk.position], access: tenant }).error, 'campus_seat_blocked');
  assert.equal(campusSit({ seatId: 'T9-F2-desk', at: at(desk.stand), access: tenant }).error, 'campus_seat_unknown');
});

test('standing returns to the stand point; a taken seat is collision only on its own floor', () => {
  assert.deepEqual(campusStand({ seatId: desk.id }), { ok: true, levelId: desk.levelId, position: desk.stand });
  const circles = campusSeatOccupancy(desk.levelId, [desk.id]);
  assert.deepEqual(circles.map(circle => circle.radius), [CAMPUS_OCCUPIED_CLEARANCE, 0.7]);
  assert.deepEqual(campusSeatOccupancy('garden-campus/l3', [desk.id]), []);
});

test('the desk opens at a suite workstation only while the suite still admits the sitter', () => {
  assert.equal(campusSeatWorkstation({ seatId: desk.id }, tenant), true);
  assert.equal(campusSeatWorkstation({ seatId: desk.id }, stranger), false, 'revoked or expired access closes the desk');
});

test('a restored seat must still exist on its floor, be unclaimed, compatible and admitted', () => {
  const saved = { seatId: desk.id, levelId: desk.levelId, layout: '3.1' };
  assert.equal(campusSeatRestorable(saved, { levelId: desk.levelId, access: tenant }), true);
  assert.equal(campusSeatRestorable(saved, { levelId: desk.levelId, access: stranger }), false);
  assert.equal(campusSeatRestorable(saved, { levelId: 'garden-campus/l3', access: tenant }), false);
  assert.equal(campusSeatRestorable(saved, { levelId: desk.levelId, claimed: new Set([desk.id]), access: tenant }), false);
  assert.equal(campusSeatRestorable({ ...saved, layout: '4.0' }, { levelId: desk.levelId, access: tenant }), false, 'an incompatible layout major');
  assert.equal(campusSeatRestorable({ ...saved, seatId: 'nope' }, { levelId: desk.levelId, access: tenant }), false);
});
