import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandRibbon } from '../../shared/city-kit/ribbon-layout.js';
import { storefrontBenchSpots } from '../src/street-fixtures.js';
import { districtRibbonExclusions, DISTRICT_RIBBON_SIDE_LANE } from '../src/ribbon-district.js';

// The first District Ribbon route (#825 slice 2a): the east side of the central access lane,
// from the side lane's north kerb beside the arrival spawn past Van Cleef & Arpels and IPIC to the
// lane's north end.
// Its exclusions come from the live District data (ribbon-district.js, the same builder the
// renderer uses), so a moved door, bench, lamp, building or lane fails this test instead of
// silently putting a post in someone's way.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../public/data/district.json'), route = read('../../config/ribbon/district-spine.json');
const SIDE_LANE = DISTRICT_RIBBON_SIDE_LANE;
const districtExclusions = () => districtRibbonExclusions(world);

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

test('the shared builder refuses a spine that starts in the side-lane mouth', () => {
  // The pre-#827 start stood in osm-way-625330795's carriageway; the renderer's builder must refuse it.
  assert.ok(districtExclusions().some(zone => zone.id.startsWith('side-lane-')), 'side-lane pieces are excluded');
  const inLane = structuredClone(route);
  inLane.segments[0].points = [[-2759.834, -1300.113], [-2759.67, -1290.233], ...route.segments[0].points.slice(1)];
  assert.throws(() => expandRibbon({ ...inLane, exclusions: districtExclusions() }), /over its maxSpan 6 m \(left out: ribbon:spine:post:\d+:[lr] in no-go side-lane-\d+/);
});
