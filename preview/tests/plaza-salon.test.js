import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHESS_CELL_M, chessCell, chessCellIsDark, chessCellPosition, chessSeat, plazaSalonPlan, plazaSalonFootprints, plazaSalonRack, plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { distanceToRoad } from '../src/street-fixtures.js';
import { treeSupports } from '../src/tree-placements.js';
import { benchSeats, resolveBenchSeat } from '../src/world-interactions.js';
import { blankRegion } from '../src/region-draft.js';
import { validateVegetation } from '../src/vegetation.js';

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const DIOR = district.stores.find(store => store.id === 'osm-node-8172494958');
// The game and the town load the vegetation dataset, whose grove has ten trees in this plaza.
const vegetated = { ...district, vegetation: validateVegetation(district, JSON.parse(await readFile(new URL('../public/data/district-vegetation.json', import.meta.url), 'utf8'))) };
// The same district without the salon, to check the furniture stands on open paving.
const bare = createWalkingEnvironment({ ...district, scene: 'plaza-salon-check' });
const furnished = createWalkingEnvironment(district);
const free = (environment, [east, north]) => environment.isFree(east, -north);

test('the salon furnishes only the River Oaks district, and the same way every time', () => {
  assert.ok(plazaSalonPlan(district));
  assert.deepEqual(plazaSalonPlan(district), plazaSalonPlan(JSON.parse(JSON.stringify(district))));
  assert.equal(plazaSalonPlan({ ...district, scene: 'creator' }), null);
  assert.equal(plazaSalonPlan(blankRegion()), null);
  assert.deepEqual(plazaSalonFootprints(blankRegion()), []);
  assert.deepEqual(plazaSalonSeats(blankRegion()), []);
});

test('blocking and seating do not depend on whether the vegetation dataset is loaded', () => {
  assert.deepEqual(plazaSalonFootprints(vegetated), plazaSalonFootprints(district));
  assert.deepEqual(plazaSalonSeats(vegetated), plazaSalonSeats(district));
  const plan = plazaSalonPlan(vegetated);
  assert.equal(plan.trees.length, 10, 'string lights follow the whole grove');
  // Every trunk and lantern post is wired into one web, with no overlong span.
  assert.equal(plan.strands.length, plan.trees.length + plan.lanterns.length - 1);
  for (const { from, to } of plan.strands) assert.ok(Math.hypot(to.x - from.x, to.north - from.north) <= 9);
});

test('every piece stands on open paving, clear of roads, walkways and tree trunks', () => {
  const trunks = treeSupports(vegetated).map(tree => [tree.position[0], tree.position[1], 0.4 + Math.max(0.065, (tree.height_m ?? 20) * 0.014)]);
  for (const [east, north, radius] of plazaSalonFootprints(district)) {
    for (const angle of [0, 1, 2, 3, 4, 5, 6, 7].map(i => i * Math.PI / 4))
      assert.ok(bare.isFree(east + Math.sin(angle) * radius, -(north + Math.cos(angle) * radius)), `footprint at ${east},${north} reaches a building`);
    for (const road of district.roads)
      assert.ok(distanceToRoad(road, east, -north) >= road.width_m / 2 + radius + 0.15, `footprint at ${east},${north} is on ${road.id}`);
    for (const [x, y, trunk] of trunks) assert.ok(Math.hypot(east - x, north - y) >= trunk + radius + 0.2, `footprint at ${east},${north} hits a trunk`);
  }
  // Chairs and seats are open to walk through, but nobody should sit inside a tree.
  for (const seat of plazaSalonSeats(vegetated)) for (const [x, y, trunk] of trunks) {
    assert.ok(Math.hypot(seat.x - x, seat.north - y) >= trunk + 0.45, `${seat.id} is inside a trunk`);
    assert.ok(Math.hypot(seat.approach[0] - x, seat.approach[1] - y) >= trunk + 0.35, `${seat.id} is approached through a trunk`);
  }
});

test('the furniture blocks walking and low flight, but not the seats it offers', () => {
  const plan = plazaSalonPlan(district);
  for (const piece of [plan.round, ...plan.chess, ...plan.planters, ...plan.lanterns, plan.stage])
    assert.equal(free(furnished, [piece.x, piece.north]), false, `${piece.id} must block`);
  assert.equal(furnished.canFly(plan.round.x, furnished.groundAt(plan.round.x, -plan.round.north) + 0.5, -plan.round.north), false);
  assert.equal(furnished.canFly(plan.round.x, furnished.groundAt(plan.round.x, -plan.round.north) + 3, -plan.round.north), true, 'flying over the tables is fine');
  for (const seat of plazaSalonSeats(district)) {
    assert.ok(free(furnished, [seat.x, seat.north]), `${seat.id} must stay sittable`);
    assert.ok(free(furnished, seat.approach), `${seat.id} must be reachable`);
  }
});

test('arrival, the Dior door and the west footway stay connected through the furnished plaza', () => {
  // Breadth-first search on a 0.25 m grid over the plaza and its edges.
  const step = 0.25, [west, south, east, north] = [-2812, -1310, -2760, -1286];
  const key = (x, y) => `${Math.round((x - west) / step)},${Math.round((y - south) / step)}`;
  const snap = ([x, y]) => [west + Math.round((x - west) / step) * step, south + Math.round((y - south) / step) * step];
  const reachable = (from, to) => {
    const start = snap(from), goal = key(...to), seen = new Set([key(...start)]), queue = [start];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (Math.hypot(x - to[0], y - to[1]) < 0.4) return true;
      for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const next = [x + dx, y + dy], id = key(...next);
        if (next[0] < west || next[0] > east || next[1] < south || next[1] > north || seen.has(id) || !free(furnished, next)) continue;
        seen.add(id); queue.push(next);
      }
      if (seen.has(goal)) return true;
    }
    return false;
  };
  const arrival = district.walkSpawn.slice(0, 2), door = DIOR.visit.slice(0, 2), westFootway = [-2809, -1290];
  assert.ok(free(furnished, arrival) && free(furnished, door));
  assert.ok(reachable(arrival, door), 'arrival to Dior');
  assert.ok(reachable(arrival, westFootway), 'arrival across the plaza to the west footway');
  // And into the salon itself: the bench and every chair can be walked up to.
  for (const seat of plazaSalonSeats(district)) assert.ok(reachable(arrival, seat.approach), `arrival to ${seat.id}`);
});

test('salon seats join the shared bench places, resolvable by the authoritative town', () => {
  const benches = benchSeats(district), salon = benches.filter(seat => seat.buildId.startsWith('bench:plaza-salon-'));
  assert.equal(salon.length, plazaSalonSeats(district).length);
  assert.equal(new Set(benches.map(seat => seat.id)).size, benches.length, 'seat ids are unique');
  const seat = resolveBenchSeat(benches, 'bench:plaza-salon-chess-west-0', 0, () => 18.2);
  assert.ok(seat && seat.height > 0.4 && seat.height < 0.6);
  assert.deepEqual(benches.filter(seat => seat.buildId === 'bench:plaza-salon-bench').map(seat => seat.slot), [0, 1, 2]);
});

test('every chess player has a light square at the right hand and their own back rank nearest', () => {
  const plan = plazaSalonPlan(district);
  for (const table of plan.chess) {
    for (const chair of [0, 1]) {
      const seat = plan.chairs.find(item => item.id === `${table.id}-${chair}`);
      // The player faces the table; right is that direction turned clockwise.
      const facing = [table.x - seat.x, table.north - seat.north], right = [facing[1], -facing[0]];
      const toward = ([east, north], [dx, dn]) => (east - table.x) * dx + (north - table.north) * dn;
      const corners = [0, 7, 56, 63].map(square => ({ square, cell: chessCell(square, chair) })).map(item => ({ ...item, position: chessCellPosition(table, item.cell) }));
      const nearRight = corners.reduce((best, item) => toward(item.position, right) - toward(item.position, facing) > toward(best.position, right) - toward(best.position, facing) ? item : best);
      assert.equal(nearRight.square, 7, `${table.id} chair ${chair}: h1 is the near right corner`);
      assert.equal(chessCellIsDark(nearRight.cell.i, nearRight.cell.j), false, `${table.id} chair ${chair}: h1 is light`);
      const a1 = chessCell(0, chair);
      assert.equal(chessCellIsDark(a1.i, a1.j), true, 'a1 is dark');
      assert.equal(chessSeat(`bench:plaza-salon-${seat.id}`).tableId, table.id);
    }
  }
  assert.ok(Math.abs(CHESS_CELL_M - 0.068) < 0.001);
  assert.equal(chessSeat('bench:plaza-salon-round-0'), null);
});

test('the bike rack offers four slots on open paving that face south into the plaza', () => {
  const slots = plazaSalonRack(district);
  assert.equal(slots.length, 4);
  assert.deepEqual(slots.map(slot => slot.id), ['plaza-salon-rack:0', 'plaza-salon-rack:1', 'plaza-salon-rack:2', 'plaza-salon-rack:3']);
  assert.deepEqual(plazaSalonRack(blankRegion()), []);
  assert.deepEqual(plazaSalonRack(vegetated), slots, 'slots do not depend on the vegetation dataset');
  const plan = plazaSalonPlan(district);
  for (const slot of slots) {
    assert.equal(slot.rackId, 'plaza-salon-rack');
    assert.equal(slot.heading, 0, 'a parked bike points south, away from the footway');
    assert.ok(slot.approach[1] < slot.north, 'the approach is south of the bike');
    assert.ok(free(furnished, [slot.x, slot.north]), `${slot.id} must stay mountable`);
    assert.ok(free(furnished, slot.approach), `${slot.id} must be reachable`);
    assert.ok(slot.x > -2784.7 + 1.2, 'the rack keeps the Dior entrance clear');
    assert.ok(slot.north > plan.rack.north - 1.4 && slot.north < plan.rack.north, 'bikes sit just south of the bar');
  }
  // The bar blocks walking; a bike slot does not.
  assert.equal(free(furnished, [plan.rack.x, plan.rack.north]), false, 'the rack bar must block');
  assert.equal(free(bare, [plan.rack.x, plan.rack.north]), true, 'the bar stands on open paving');
});
