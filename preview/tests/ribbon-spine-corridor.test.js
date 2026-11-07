import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateVegetation } from '../src/vegetation.js';
import { matureTreePlacements } from '../src/landscape-models.js';
import { treePits, TREE_GRATE, TREE_FRAME } from '../src/street-furniture.js';
import { benchLamp, clearOfRoads, movedBenchSpots, storefrontBenchSpots } from '../src/street-fixtures.js';
import { benchSeats } from '../src/world-interactions.js';
import { districtRibbonPlan } from '../src/ribbon-district.js';
import { districtRibbonTreeClearance } from '../src/ribbon-tree-clearance.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { expandFiveRooms, siteFromDistrict } from '../../shared/city-kit/five-rooms-layout.js';
import { laneFixtures } from '../src/street-fixtures.js';
import { storeRoomsFor } from '../src/store-rooms.js';
import { winstonBed } from '../src/reference-planting.js';
import { groundSurfaceHeight } from '../src/world-surface.js';
import { reachesRibbonClearance, ribbonClearanceCondition, ribbonCrownClearance } from '../src/ribbon-crown-clearance.js';
import { RIBBON_FINISH } from '../src/ribbon-finish.js';

// The main Ribbon spine as a corridor (#740, the 11-04 closeout plan): a pass here means the whole
// body and the camera fit, not that one path found a way through. Everything is measured from the
// placements the renderer draws, so no list of expected trees can hide a blocker.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const district = read('../public/data/district.json'), vegetation = read('../public/data/district-vegetation.json');
const contract = read('../../config/ribbon/five-rooms.json');
const runtimeWorld = () => ({ ...district, vegetation: validateVegetation(district, vegetation) });

const BODY = 0.35, CANOPY_TOP = 3.6 + RIBBON_FINISH.slab, OVERHANG = RIBBON_FINISH.overhang + RIBBON_FINISH.bullnose;
const plan = districtRibbonPlan(runtimeWorld());
const centreAt = north => {
  for (const m of plan.modules) {
    const [lo, hi] = [Math.min(m.from[1], m.to[1]), Math.max(m.from[1], m.to[1])];
    if (north >= lo && north <= hi) return m.from[0] + (m.to[0] - m.from[0]) * (north - m.from[1]) / (m.to[1] - m.from[1]);
  }
  return null;
};
const spineSouth = Math.min(...plan.modules.flatMap(m => [m.from[1], m.to[1]])), spineNorth = Math.max(...plan.modules.flatMap(m => [m.from[1], m.to[1]]));
// How far a point stands from the walk's centreline; Infinity past either end.
const offCentre = (x, north) => { const c = centreAt(north); return c === null ? Infinity : Math.abs(x - c); };
const WALK = 1.2;
// Distance to the centreline, ends included: the crown clearance has rounded caps there.
const fromSpine = (x, north) => Math.min(...plan.modules.map(({ from: a, to: b }) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - north);
}));

test('the 2.4 m walk and its route are unchanged', () => {
  const spine = contract.ribbon.segments.find(item => item.id === 'spine');
  assert.equal(spine.width, 2.4);
  assert.equal(spine.clearHeight, 3.6);
  assert.deepEqual(spine.points, read('../../config/ribbon/district-spine.json').segments[0].points);
  assert.equal(plan.modules.length, 30);
  assert.equal(plan.modules[0].id, 'ribbon:spine:module:000');
});

test('no tree pit stands in the walk or under a post, on any drawn pit', () => {
  const half = (TREE_GRATE + TREE_FRAME * 2) / 2, world = runtimeWorld(), bad = [];
  treePits(world).forEach(([x, , z], i) => {
    const north = -z;
    for (let n = north - half; n <= north + half; n += 0.1) if (offCentre(x, n) < WALK + half) { bad.push(`tree-pit-${i}`); break; }
    if (plan.posts.some(post => Math.abs(post.position[0] - x) < half + 0.15 && Math.abs(post.position[1] - north) < half + 0.15)) bad.push(`tree-pit-${i} post`);
  });
  assert.deepEqual([...new Set(bad)], []);
});

test('no trunk stands in the corridor the canopy covers, so no body or camera passes through one', () => {
  const trunk = tree => 0.4 + Math.max(0.065, tree.height * 0.014);
  const bad = matureTreePlacements(runtimeWorld()).flatMap((tree, i) => {
    const off = fromSpine(tree.position[0], -tree.position[2]);
    return off < WALK + OVERHANG + trunk(tree) ? [`tree-${i} ${off.toFixed(2)} m off centre`] : [];
  });
  assert.deepEqual(bad, []);
});

test('no crown reaches below the canopy top over the walk, in the data or in what is drawn', () => {
  const world = runtimeWorld(), rows = districtRibbonTreeClearance(world, { within: 9 });
  assert.deepEqual(rows.filter(row => row.blocks).map(row => `${row.tree} ${row.crownGapCm} cm ${row.pit ?? ''}`), []);
  // The drawn crown carries leaves from about 12 % of its height, so the data alone proves nothing:
  // the renderer clears a volume at least as wide as the canopy and as high as its top.
  const clearance = ribbonCrownClearance(world);
  assert.ok(clearance, 'the District clears its crowns along the spine');
  assert.ok(clearance.halfWidth >= WALK + OVERHANG, `clears ${clearance.halfWidth} m each side`);
  const ground = Math.max(...plan.modules.flatMap(m => [m.from, m.to]).map(([x, n]) => groundSurfaceHeight(world, x, -n)));
  assert.ok(clearance.top >= ground + CANOPY_TOP, `clears up to ${clearance.top}, canopy top ${ground + CANOPY_TOP}`);
  assert.deepEqual(clearance.points, contract.ribbon.segments.find(item => item.id === 'spine').points);
  // The carve must never take a trunk: every stem stands outside it.
  const taken = matureTreePlacements(world).filter(tree => fromSpine(tree.position[0], -tree.position[2]) < clearance.halfWidth + 0.4);
  assert.deepEqual(taken.map(tree => tree.position), []);
});

test('the Van Cleef & Arpels bench stands beside the walk, keeps its seats, and its reach is free', () => {
  const world = runtimeWorld(), bench = storefrontBenchSpots(world).find(item => item.storeId === 'osm-node-8172494966');
  const offEdge = offCentre(bench.x, bench.north) - WALK;
  assert.ok(offEdge >= 0.3, `the 0.6 m body stays off the walk: ${offEdge.toFixed(3)} m`);
  const seats = benchSeats(world).filter(seat => seat.buildId === 'bench:osm-node-8172494966');
  assert.deepEqual(seats.map(seat => seat.id), ['bench:osm-node-8172494966:0', 'bench:osm-node-8172494966:1']);
  const environment = createWalkingEnvironment(world);
  for (const seat of seats) assert.equal(environment.isFree(seat.approach[0], -seat.approach[1]), true, `${seat.id} can be approached`);
  // Its lamp column keeps the road clearance every bench lamp has, and stays off the walk.
  const [lampX, lampNorth] = benchLamp(bench);
  assert.equal(clearOfRoads(world, lampX, -lampNorth, 0.9), true, 'the lamp keeps 0.9 m from the road');
  assert.ok(offCentre(lampX, lampNorth) - WALK > 0.15 + 0.09, 'the lamp stands off the walk and the canopy edge');
});

test('two people side by side fit between the posts along the whole spine, on the client and on the authoritative ground', () => {
  // The client draws vegetation; the server walks district.json alone. Both must agree.
  const environments = [createWalkingEnvironment(runtimeWorld()), createWalkingEnvironment(district)];
  const clearOfPosts = (x, north) => !plan.posts.some(post => Math.hypot(post.position[0] - x, post.position[1] - north) < 0.21 + BODY + 0.02);
  for (const lane of [-0.45, 0.45]) {
    for (let north = spineSouth; north <= spineNorth; north += 0.5) {
      const centre = centreAt(north), x = centre + lane;
      assert.ok(clearOfPosts(x, north), `post at ${x.toFixed(2)},${north}`);
      environments.forEach((environment, i) => assert.equal(environment.isFree(x, -north), true, `environment ${i} refuses ${x.toFixed(2)},${north}`));
    }
  }
});

test('the contract records the spine as clear because the site confirms it, and leaves south and link-studios blocked', () => {
  const world = runtimeWorld();
  const site = siteFromDistrict(world, { fixtures: laneFixtures(world), benches: storefrontBenchSpots(world), treePits: treePits(world), trees: matureTreePlacements(world), beds: [winstonBed(world)], tenants: [] });
  const statuses = Object.fromEntries(contract.ribbon.segments.map(item => [item.id, item.status]));
  assert.deepEqual(statuses, { spine: 'clear', south: 'blocked', 'link-studios': 'blocked' });
  assert.equal(site.trees.length, 199);
  // The validator refuses a `clear` the site does not confirm (five-rooms-layout.test.js proves it),
  // so this reading of the live site is the evidence, not the status field above.
  const tenants = storeRoomsFor(world).filter(room => world.stores.some(store => store.id === room.storeId));
  const expanded = expandFiveRooms(contract, { ...site, tenants, groundAt: (x, north) => groundSurfaceHeight(world, x, -north) });
  const spine = expanded.segments.find(item => item.id === 'spine');
  assert.equal(spine.status, 'clear');
  assert.deepEqual(spine.crowns.filter(crown => crown.through), []);
});

test('the crown clearance applies only below the canopy top, on every run of the spine', () => {
  const clearance = ribbonCrownClearance(runtimeWorld()), expression = ribbonClearanceCondition(clearance);
  // GLSL and JavaScript share this grammar and precedence, so the expression is evaluated as written.
  const vec2 = (x, y) => [x, y], gap = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  };
  const inVolume = (east, y, north) => new Function('vRoWorld', 'vec2', 'roRibbonGap', `return ${expression};`)({ y, xz: [east, -north] }, vec2, gap);
  clearance.points.slice(1).forEach((to, i) => {
    const from = clearance.points[i], east = (from[0] + to[0]) / 2, north = (from[1] + to[1]) / 2;
    assert.equal(inVolume(east, clearance.top - 1, north), true, `run ${i} clears below the top`);
    assert.equal(inVolume(east, clearance.top + 0.5, north), false, `run ${i} keeps the crown above the top`);
    assert.equal(inVolume(east + clearance.halfWidth + 0.2, clearance.top - 1, north), false, `run ${i} keeps what is beside it`);
  });
  // Only batches that reach the volume lose bark occlusion.
  assert.equal(reachesRibbonClearance(clearance, [-2760.8, 18, 1257], 3.1), true);
  assert.equal(reachesRibbonClearance(clearance, [-2801.9, 18, 1296], 3.1), false);
});

test('every moved tree and the bench stay within the bounded correction and keep their identity', () => {
  const before = matureTreePlacements({ ...district, roads: district.roads.filter(road => road.id !== 'osm-way-583333526-0'), vegetation: validateVegetation(district, vegetation) });
  const after = matureTreePlacements(runtimeWorld());
  assert.equal(after.length, before.length, 'no tree is removed');
  const moved = after.map((tree, i) => [i, Math.hypot(tree.position[0] - before[i].position[0], tree.position[2] - before[i].position[2])]).filter(([, d]) => d > 0);
  assert.deepEqual(moved.map(([i]) => i).sort((a, b) => a - b), [27 + 1, 76 + 1, 83 + 1, 84 + 1, 103 + 1, 126 + 1, 152 + 1, 171 + 1]);
  for (const [i, d] of moved) assert.ok(d <= 2, `tree-${i} moved ${d.toFixed(2)} m, over the 2 m bound`);
  const [before5] = movedBenchSpots(runtimeWorld()), after5 = storefrontBenchSpots(runtimeWorld()).find(item => item.storeId === before5.storeId);
  assert.ok(Math.hypot(after5.x - before5.x, after5.north - before5.north) <= 1, 'the bench moves at most 1 m');
  assert.equal(movedBenchSpots(runtimeWorld()).length, 1, 'one bench is corrected');
});
