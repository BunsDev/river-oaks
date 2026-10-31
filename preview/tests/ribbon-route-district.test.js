import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandRibbon } from '../../shared/city-kit/ribbon-layout.js';
import { storefrontBenchSpots } from '../src/street-fixtures.js';
import { districtRibbonExclusions, RIBBON_DOOR } from '../src/ribbon-district.js';

// The first District Ribbon route (#825 slice 2a): the east side of the central access lane,
// from just south of the arrival spawn past Van Cleef & Arpels and IPIC to the lane's north end.
// Its exclusions come from the live District data (ribbon-district.js, the same builder the
// renderer uses), so a moved door, bench, lamp or building fails this test instead of silently
// putting a post in someone's way.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../public/data/district.json'), route = read('../../config/ribbon/district-spine.json');
const DOOR_DEPTH = RIBBON_DOOR.depth;
const districtExclusions = () => districtRibbonExclusions(world);

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
