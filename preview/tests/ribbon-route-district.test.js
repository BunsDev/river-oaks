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
  assert.deepEqual(plan.stats, { segments: 1, modules: 30, posts: 61, lamps: 16, fans: 30, seats: 0, skipped: 1 });
  // One canopy span bridges the Van Cleef & Arpels storefront bench.
  const bench = storefrontBenchSpots(world)[5];
  assert.equal(world.stores.find(store => store.id === bench.storeId).name, 'Van Cleef & Arpels');
  assert.deepEqual(plan.skipped, [{ id: 'ribbon:spine:post:015:l', segment: 'spine', zone: 'bench-5', kind: 'seat-access' }]);
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

test('without spans the same route is refused at the Van Cleef & Arpels bench', () => {
  const rigid = structuredClone(route);
  delete rigid.segments[0].maxSpan;
  assert.throws(() => expandRibbon({ ...rigid, exclusions: districtExclusions() }), /ribbon:spine:post:015:l lands in seat-access bench-5; set maxSpan on segment spine/);
});

test('the original start in the side-lane mouth is refused (#838, fixed by #853)', () => {
  // Before #853 the spine began at (-2759.834, -1300.113), inside the carriageway of
  // osm-way-625330795; with that lane excluded its posts 002-004 stood in it.
  const original = structuredClone(route);
  original.segments[0].points = [[-2759.834, -1300.113], [-2759.67, -1290.233], ...route.segments[0].points.slice(1)];
  assert.throws(() => expandRibbon({ ...original, exclusions: districtExclusions() }), /left out: ribbon:spine:post:002:l in no-go side-lane-8, ribbon:spine:post:003:l in no-go side-lane-8, ribbon:spine:post:004:l in no-go side-lane-8/);
});

test('the shared builder refuses a spine that starts in the side-lane mouth', () => {
  // The pre-#827 start stood in osm-way-625330795's carriageway; the renderer's builder must refuse it.
  assert.ok(districtExclusions().some(zone => zone.id.startsWith('side-lane-')), 'side-lane pieces are excluded');
  const inLane = structuredClone(route);
  inLane.segments[0].points = [[-2759.834, -1300.113], [-2759.67, -1290.233], ...route.segments[0].points.slice(1)];
  assert.throws(() => expandRibbon({ ...inLane, exclusions: districtExclusions() }), /over its maxSpan 6 m \(left out: ribbon:spine:post:\d+:[lr] in no-go side-lane-\d+/);
});
