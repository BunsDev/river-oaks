// The Bayou Terraces journey walks both players back from the gardens chess table along fixed
// legs (e2e/bayou-terraces-routes.js). The walk driver steers a straight line and re-aims by a
// few degrees, so each leg needs room either side of it. Seat both players and stand them up in
// the real town, in the journey's order, then measure each leg from where the town put them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedWorld } from '../../server/world.js';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { greenwayReturn } from '../e2e/bayou-terraces-routes.js';

const world = await loadDistrictData({ districtRevision: 'bayou-terraces-1' }), edge = world.eastGardenCommons.edge;
const at = ([x, y]) => [edge + x, -1335 + y], env = createWalkingEnvironment(world);
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });
const ROOM = 0.4; // metres clear on each side of every leg

// The widest offset, up to ROOM, that a straight leg keeps free on its tighter side.
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

test('both greenway walks leave the chess table with room either side of every leg', () => {
  let time = 1_000_000;
  const town = createSharedWorld(world, { now: () => time });
  const seats = [0, 1].map(chair => plazaSalonSeats(world).find(seat => seat.buildId === `bench:plaza-salon-chess-terrace-${chair}`));
  for (const [id, seat] of [['owner', seats[1]], ['alice', seats[0]]]) {
    assert.equal(town.join(identity(id)).ok, true);
    const [x, north] = seat.approach;
    Object.assign(town.players.get(id), { position: [x, north, env.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
    time += 600; assert.equal(town.command(id, { type: 'sit', buildId: seat.buildId, slot: seat.slot }).ok, true, `${id} sits`);
  }
  // The journey stands the owner first, then alice.
  for (const id of ['owner', 'alice']) { time += 600; assert.equal(town.command(id, { type: 'stand' }).ok, true, `${id} stands`); }
  const start = id => town.players.get(id).position.slice(0, 2);

  // The owner's former straight line ran into the table: this is the wedge the hosted run hit.
  assert.equal(clearance(start('owner'), at([101, 128])), 0, 'the direct line from the owner\'s stand spot meets the table');

  for (const id of ['alice', 'owner']) {
    const legs = [start(id), ...greenwayReturn[id].map(at)];
    for (let i = 1; i < legs.length; i++) {
      const room = clearance(legs[i - 1], legs[i]);
      assert.ok(room >= ROOM, `${id} leg ${i} to ${JSON.stringify(greenwayReturn[id][i - 1])} keeps only ${room.toFixed(2)} m clear`);
    }
  }
});
