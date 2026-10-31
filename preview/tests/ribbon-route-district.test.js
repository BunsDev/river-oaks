import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandRibbon } from '../../shared/city-kit/ribbon-layout.js';
import { laneFixtures, storefrontBenchSpots } from '../src/street-fixtures.js';

// The first District Ribbon route (#825 slice 2a): the east side of the central access lane,
// from just south of the arrival spawn past Van Cleef & Arpels and IPIC to the lane's north end.
// Its exclusions are derived here from the live District data, so a moved door, bench, lamp or
// building fails this test instead of silently putting a post in someone's way.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../public/data/district.json'), route = read('../../config/ribbon/district-spine.json');
const LANE = 'osm-way-583333526-0';
// A door's clear zone: 2.4 m along the facade, 2 m out from it. The repo states no door clearance;
// these are this route's working values (ledger: 2026-10-31-ribbon-route-825.md).
const DOOR_WIDTH = 2.4, DOOR_DEPTH = 2;
const square = (x, y, half) => [x - half, y - half, x + half, y + half];
const round = rect => rect.map(value => Math.round(value * 1000) / 1000);

function districtExclusions() {
  const out = [], add = (id, kind, rect) => out.push({ id, kind, rect: round(rect) });
  for (const store of world.stores) {
    const [fx, fy] = store.facade, [nx, ny] = store.outward, cx = fx + nx * DOOR_DEPTH / 2, cy = fy + ny * DOOR_DEPTH / 2;
    const hx = Math.abs(nx) * DOOR_DEPTH / 2 + Math.abs(ny) * DOOR_WIDTH / 2, hy = Math.abs(ny) * DOOR_DEPTH / 2 + Math.abs(nx) * DOOR_WIDTH / 2;
    add(`door-${store.id.replace(/[^a-z0-9]+/g, '-')}`.slice(0, 32), 'doorway', [cx - hx, cy - hy, cx + hx, cy + hy]);
  }
  // A storefront bench and the reach in front of it.
  storefrontBenchSpots(world).forEach((bench, i) => add(`bench-${i}`, 'seat-access', square(bench.x + bench.outward[0] * 0.6, bench.north + bench.outward[1] * 0.6, 1.4)));
  // Lane fixtures are in scene coordinates: [east, height, -north].
  const { lamps, planters, bins } = laneFixtures(world);
  [...lamps.map(f => ['lamp', f]), ...planters.map(f => ['planter', f]), ...bins.map(f => ['bin', f])].forEach(([kind, f], i) => add(`${kind}-${i}`, 'no-go', square(f[0], -f[2], 0.6)));
  world.buildings.forEach((building, i) => {
    const xs = building.ring.map(p => p[0]), ys = building.ring.map(p => p[1]);
    add(`building-${i}`, 'no-go', [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  });
  // The lane's carriageway and kerb, in pieces of at most 5 m so the boxes hug a slanting lane.
  const lane = world.roads.find(road => road.id === LANE), half = lane.width_m / 2 + 0.15;
  let piece = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1], b = lane.points[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
    for (let j = 0; j < n; j++) {
      const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], q = [a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n];
      add(`carriageway-${piece++}`, 'no-go', [Math.min(p[0], q[0]) - half, Math.min(p[1], q[1]), Math.max(p[0], q[0]) + half, Math.max(p[1], q[1])]);
    }
  }
  return out;
}

test('the District spine clears every door, bench, lane fixture, building and the carriageway', () => {
  const plan = expandRibbon({ ...route, exclusions: districtExclusions() });
  assert.deepEqual(plan.stats, { segments: 1, modules: 34, posts: 69, lamps: 18, fans: 34, seats: 0, skipped: 1 });
  // One canopy span bridges the Van Cleef & Arpels storefront bench.
  const bench = storefrontBenchSpots(world)[5];
  assert.equal(world.stores.find(store => store.id === bench.storeId).name, 'Van Cleef & Arpels');
  assert.deepEqual(plan.skipped, [{ id: 'ribbon:spine:post:019:l', segment: 'spine', zone: 'bench-5', kind: 'seat-access' }]);
});

test('the spine starts at the arrival spawn and passes the IPIC entrance', () => {
  const [start] = route.segments[0].points, end = route.segments[0].points.at(-1);
  assert.ok(Math.hypot(start[0] - world.walkSpawn[0], start[1] - world.walkSpawn[1]) < 8, 'starts within 8 m of the walk spawn');
  const ipic = world.stores.find(store => store.name === 'IPIC Theaters');
  assert.ok(start[1] < ipic.facade[1] && end[1] > ipic.facade[1], 'runs past the IPIC door');
  // Its walk runs between the lane's kerb and the IPIC frontage (door clearance is the first test's).
  const plan = expandRibbon({ ...route, exclusions: districtExclusions() });
  const atIpic = plan.modules.find(module => module.from[1] <= ipic.facade[1] && module.to[1] >= ipic.facade[1]);
  const centre = (atIpic.from[0] + atIpic.to[0]) / 2, laneX = -2765.5;
  assert.ok(centre - atIpic.width / 2 > laneX + 4.2 && centre + atIpic.width / 2 < ipic.facade[0], `walk ${centre} clear of kerb and frontage`);
});

test('without spans the same route is refused at the Van Cleef & Arpels bench', () => {
  const rigid = structuredClone(route);
  delete rigid.segments[0].maxSpan;
  assert.throws(() => expandRibbon({ ...rigid, exclusions: districtExclusions() }), /ribbon:spine:post:019:l lands in seat-access bench-5; set maxSpan on segment spine/);
});
