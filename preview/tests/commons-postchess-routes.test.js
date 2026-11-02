// The Commons journey (e2e/east-garden-commons.js) walks both players from the chess table back to
// the plaza along fixed legs after they stand up (#587 "post-chess traversal", mode B of the
// 2026-10-24 readiness record). The walk driver steers a straight line and re-aims by a few
// degrees, so each leg needs room either side. Seat both players and stand them up in the real
// town, in the journey's order, then measure each leg from where the town put them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedWorld } from '../../server/world.js';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { plazaSalonSeats } from '../src/plaza-salon-plan.js';

const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' }), edge = world.eastGardenCommons.edge;
const env = createWalkingEnvironment(world);
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });
const ROOM = 0.4;
const clearance = (a, b) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]), [ux, un] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  let worst = ROOM;
  for (const side of [-1, 1]) for (let offset = 0; offset <= ROOM; offset += 0.05) {
    let free = true;
    for (let t = 0; t <= length && free; t += 0.05) free = env.isFree(a[0] + ux * t - side * un * offset, -(a[1] + un * t + side * ux * offset));
    if (!free) { worst = Math.min(worst, offset); break; }
  }
  return worst;
};
const plazaReturn = { owner: [[edge + 90, -1325], [edge + 80, -1334]], alice: [[edge + 90, -1325], [edge + 80, -1336]] };

test('both plaza walks leave the Commons chess table with room either side of every leg', () => {
  let time = 1_000_000;
  const town = createSharedWorld(world, { now: () => time });
  const seats = [0, 1].map(chair => plazaSalonSeats(world).find(seat => seat.buildId === `bench:plaza-salon-chess-commons-${chair}`));
  for (const [id, seat] of [['owner', seats[0]], ['alice', seats[1]]]) {
    assert.equal(town.join(identity(id)).ok, true);
    const [x, north] = seat.approach;
    Object.assign(town.players.get(id), { position: [x, north, env.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
    time += 600; assert.equal(town.command(id, { type: 'sit', buildId: seat.buildId, slot: seat.slot }).ok, true, `${id} sits`);
  }
  for (const id of ['owner', 'alice']) { time += 600; assert.equal(town.command(id, { type: 'stand' }).ok, true, `${id} stands`); }
  const report = {};
  for (const id of ['owner', 'alice']) {
    const legs = [town.players.get(id).position.slice(0, 2), ...plazaReturn[id]];
    report[id] = legs.slice(1).map((leg, i) => +clearance(legs[i], leg).toFixed(2));
  }
  console.log(JSON.stringify({ stand: Object.fromEntries(['owner', 'alice'].map(id => [id, town.players.get(id).position.slice(0, 2).map(v => +v.toFixed(2))])), seats: seats.map(s => s.approach), report }));
  for (const id of ['owner', 'alice']) report[id].forEach((room, i) => assert.ok(room >= ROOM, `${id} leg ${i + 1} keeps only ${room} m clear`));
});
