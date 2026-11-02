import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandRibbon } from '../../shared/city-kit/ribbon-layout.js';
import { laneFixtures, storefrontBenchSpots } from '../src/street-fixtures.js';

// The first District Ribbon route (#825 slice 2a): the east side of the central access lane,
// from the side lane's north kerb beside the arrival spawn past Van Cleef & Arpels and IPIC to the
// lane's north end.
// Its exclusions are derived here from the live District data, so a moved door, bench, lamp or
// building fails this test instead of silently putting a post in someone's way.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../public/data/district.json'), route = read('../../config/ribbon/district-spine.json');
const LANE = 'osm-way-583333526-0', SIDE_LANE = 'osm-way-625330795-0';
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
  // The side lane that meets the central lane at the spawn (osm-way-625330795), carriageway and
  // kerb in pieces of at most 5 m, padded across its direction so the boxes suit an east-west lane.
  const side = world.roads.find(road => road.id === SIDE_LANE), sideHalf = side.width_m / 2 + 0.15;
  let sidePiece = 0;
  for (let i = 1; i < side.points.length; i++) {
    const a = side.points[i - 1], b = side.points[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
    for (let j = 0; j < n; j++) {
      const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], q = [a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]), ox = Math.abs(q[1] - p[1]) / length * sideHalf, oy = Math.abs(q[0] - p[0]) / length * sideHalf;
      add(`side-lane-${sidePiece++}`, 'no-go', [Math.min(p[0], q[0]) - ox, Math.min(p[1], q[1]) - oy, Math.max(p[0], q[0]) + ox, Math.max(p[1], q[1]) + oy]);
    }
  }
  return out;
}

test('the District spine clears every door, bench, lane fixture, building and the carriageway', () => {
  const plan = expandRibbon({ ...route, exclusions: districtExclusions() });
  assert.deepEqual(plan.stats, { segments: 1, modules: 30, posts: 58, lamps: 16, fans: 30, seats: 0, skipped: 4 });
  // Canopy spans bridge the Van Cleef & Arpels storefront bench on the kerb edge and three
  // doorways (Van Cleef & Arpels, IPIC and the next door north) on the shopfront edge.
  const bench = storefrontBenchSpots(world)[5];
  assert.equal(world.stores.find(store => store.id === bench.storeId).name, 'Van Cleef & Arpels');
  assert.deepEqual(plan.skipped, [
    { id: 'ribbon:spine:post:014:r', segment: 'spine', zone: 'door-osm-node-8172494966', kind: 'doorway' },
    { id: 'ribbon:spine:post:015:l', segment: 'spine', zone: 'bench-5', kind: 'seat-access' },
    { id: 'ribbon:spine:post:019:r', segment: 'spine', zone: 'door-osm-node-8172494964', kind: 'doorway' },
    { id: 'ribbon:spine:post:024:r', segment: 'spine', zone: 'door-osm-node-8172495006', kind: 'doorway' },
  ]);
});

// Val, 2026-11-02: the walk is 2.4 m, the pavement's clear path less 4 cm, and no lamp, planter
// or bin is in it or under a post. Each fixture's 1.2 m no-go square stays clear of the walk edge
// by more than half a post.
test('the 2.4 m spine walk keeps every lane lamp, planter and bin out of the walk', () => {
  const [segment] = route.segments, half = segment.width / 2, points = segment.points;
  assert.equal(segment.width, 2.4);
  const toWalk = ([x, y]) => Math.min(...points.slice(1).map((b, i) => {
    const a = points[i], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  }));
  const fixtures = districtExclusions().filter(zone => /^(lamp|planter|bin)-/.test(zone.id));
  assert.ok(fixtures.length > 50, `${fixtures.length} lane fixtures`);
  const near = fixtures.map(zone => ({ id: zone.id, gap: toWalk([(zone.rect[0] + zone.rect[2]) / 2, (zone.rect[1] + zone.rect[3]) / 2]) - half - 0.6 }))
    .filter(item => item.gap < 1);
  // The four fixtures beside the walk: the kerb-side lamps at the spawn and IPIC, the planter at the
  // north end and the bin at Van Cleef & Arpels.
  assert.deepEqual(near.map(item => item.id).sort(), ['bin-54', 'lamp-13', 'lamp-15', 'planter-42']);
  for (const item of near) assert.ok(item.gap > 0.15, `${item.id} is ${item.gap} m from the walk edge`);
  const plan = expandRibbon({ ...route, exclusions: districtExclusions() });
  assert.ok(plan.modules.every(module => module.width === 2.4));
  assert.deepEqual(plan.skipped.filter(item => /^(lamp|planter|bin)-/.test(item.zone)), []);
});

test('the spine starts at the side lane north kerb nearest the arrival spawn and passes the IPIC entrance', () => {
  const [start] = route.segments[0].points, end = route.segments[0].points.at(-1);
  // The spawn stands in the mouth of the side lane, so the walk starts just past its north kerb
  // (about 11.2 m from the spawn) instead of in the carriageway.
  const side = world.roads.find(road => road.id === SIDE_LANE), [a, b] = side.points.slice(-2);
  const kerb = a[1] + (b[1] - a[1]) * (start[0] - a[0]) / (b[0] - a[0]) + side.width_m / 2 + 0.15;
  assert.ok(start[1] - kerb > 0.15 && start[1] - kerb < 0.6, `starts ${start[1] - kerb} m north of the side-lane kerb`);
  assert.ok(Math.hypot(start[0] - world.walkSpawn[0], start[1] - world.walkSpawn[1]) < 12, 'starts within 12 m of the walk spawn');
  const ipic = world.stores.find(store => store.name === 'IPIC Theaters');
  assert.ok(start[1] < ipic.facade[1] && end[1] > ipic.facade[1], 'runs past the IPIC door');
  // Its walk runs between the lane's kerb and the IPIC frontage (door clearance is the first test's).
  const plan = expandRibbon({ ...route, exclusions: districtExclusions() });
  const atIpic = plan.modules.find(module => module.from[1] <= ipic.facade[1] && module.to[1] >= ipic.facade[1]);
  const centre = (atIpic.from[0] + atIpic.to[0]) / 2, laneX = -2765.5;
  assert.ok(centre - atIpic.width / 2 > laneX + 4.2 && centre + atIpic.width / 2 < ipic.facade[0], `walk ${centre} clear of kerb and frontage`);
});

test('without spans the same route is refused at the Van Cleef & Arpels door', () => {
  const rigid = structuredClone(route);
  delete rigid.segments[0].maxSpan;
  assert.equal(world.stores.find(store => store.id === 'osm-node-8172494966').name, 'Van Cleef & Arpels');
  assert.throws(() => expandRibbon({ ...rigid, exclusions: districtExclusions() }), /ribbon:spine:post:014:r lands in doorway door-osm-node-8172494966; set maxSpan on segment spine/);
});
