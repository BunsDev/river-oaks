import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandFiveRooms, siteFromDistrict, siteExclusions, validateFiveRooms, FIVE_ROOMS_VERSION, VENUE_IDS } from '../../shared/city-kit/five-rooms-layout.js';
import { laneFixtures, storefrontBenchSpots } from '../src/street-fixtures.js';
import { treePits } from '../src/street-furniture.js';
import { matureTreePlacements } from '../src/landscape-models.js';
import { winstonBed } from '../src/reference-planting.js';
import { storeRoomsFor } from '../src/store-rooms.js';
import { groundSurfaceHeight } from '../src/world-surface.js';
import { validateVegetation } from '../src/vegetation.js';

// The Five Rooms spatial contract (#825, #838). Every exclusion is rebuilt here from the live
// District modules (doors, door planters, benches, lane fixtures, buildings, roads, tree pits,
// crowns and the REF-HW-01 bed), so a moved door or tree fails this test instead of quietly
// putting a post or a canopy in someone's way.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const contract = read('../../config/ribbon/five-rooms.json');
function liveSite(mutate = world => world) {
  const world = mutate(read('../public/data/district.json'));
  world.vegetation = validateVegetation(world, read('../public/data/district-vegetation.json'));
  const tenants = storeRoomsFor(world).filter(room => world.stores.some(store => store.id === room.storeId));
  return siteFromDistrict(world, { fixtures: laneFixtures(world), benches: storefrontBenchSpots(world), treePits: treePits(world), trees: matureTreePlacements(world), beds: [winstonBed(world)], tenants, groundAt: (x, y) => groundSurfaceHeight(world, x, -y) });
}
const site = liveSite();
const plan = expandFiveRooms(contract, site);
const edit = change => { const copy = structuredClone(contract); change(copy); return copy; };
const segment = (copy, id) => copy.ribbon.segments.find(item => item.id === id);

test('v1 validates against the live District and rebuilds the full plan', () => {
  assert.equal(contract.version, FIVE_ROOMS_VERSION);
  assert.deepEqual(plan.venues.map(venue => venue.id), VENUE_IDS);
  assert.deepEqual(plan.stats, { venues: 5, segments: 3, clear: 0, blocked: 3, modules: 70, posts: 146, lamps: 38, fans: 70, seats: 0, skipped: 0, links: 5, cameras: 5, exclusions: 1024, retired: 4 });
  assert.equal(site.stores.length, 30);
  assert.equal(site.buildings.length, 9);
  assert.equal(site.tenants.length, 30);
  // The exclusions the plan used are exactly those the live site produces, plus the five
  // entrance door zones and five link reaches the contract adds.
  const rebuilt = siteExclusions(site, { retired: new Set(plan.venues.flatMap(venue => venue.retire.tenants)) });
  assert.equal(plan.exclusions.length, rebuilt.length + 10);
  assert.ok(rebuilt.some(zone => zone.id === 'tree-pit-36' && zone.kind === 'no-go'), 'tree pits are exclusions');
  assert.ok(!rebuilt.some(zone => zone.id.startsWith('door-osm-node-8172495006')), 'a retired tenant has no shop door zone');
});

test('the #827 spine is carried unchanged and its blocked record matches the site', () => {
  const spine = read('../../config/ribbon/district-spine.json').segments[0];
  const { status, blocked, source, ...carried } = segment(contract, 'spine');
  assert.deepEqual(carried, spine);
  assert.equal(status, 'blocked');
  // The side-lane mouth is the conflict #827's own test did not model.
  assert.ok(blocked.blockers.includes('road-625330795-7') && blocked.blockers.includes('road-625330795-8'));
  const findings = plan.segments.find(item => item.id === 'spine').findings;
  assert.deepEqual(findings.filter(item => item.zone === 'road-625330795-8' && item.what === 'post').map(item => item.element), ['ribbon:spine:post:002:l', 'ribbon:spine:post:003:l', 'ribbon:spine:post:004:l']);
});

test('every venue entrance is reached from the Ribbon without crossing a road or a kept door', () => {
  for (const venue of plan.venues) {
    const link = plan.links.find(item => item.venue === venue.id);
    assert.ok(link, `${venue.id} has a link`);
    assert.equal(link.entrance, venue.entrances[0].id);
    // Only the Gardens threshold crosses road pieces, and only its own lane's end at E2.
    if (venue.id === 'venue:studios-overlook') assert.ok(link.crossesLaneEnd.every(id => id.startsWith('road-625330795-')));
    else assert.deepEqual(link.crossesLaneEnd, []);
  }
  // No post was left out: entrances sit between edge posts.
  assert.deepEqual(plan.skipped, []);
});

test('attachments and interiors stay inside their envelopes', () => {
  for (const venue of plan.venues) {
    assert.ok(venue.attachments.length >= 3, `${venue.id} has anchors`);
    if (venue.kind === 'bay') assert.ok(venue.interior.clearHeight >= 2.75);
  }
  const overlook = plan.venues.find(venue => venue.id === 'venue:studios-overlook');
  assert.deepEqual(overlook.attachments.filter(item => item.frame === 'campus').map(item => item.id), ['attach:overlook:t1-lantern', 'attach:overlook:t2-lantern', 'attach:overlook:t3-lantern']);
  const escaped = edit(copy => { copy.venues[0].attachments[1].position[2] += 10; });
  assert.throws(() => expandFiveRooms(escaped, site), /attachment attach:counter:sign z .* is outside the venue:counter envelope/);
});

test('the same input gives the same hash; a changed point changes only its segment', () => {
  assert.equal(expandFiveRooms(structuredClone(contract), liveSite()).hash, plan.hash);
  const moved = edit(copy => { segment(copy, 'link-studios').points[1][0] = -2723.6; });
  const other = expandFiveRooms(moved, site);
  assert.notEqual(other.hash, plan.hash);
  const ids = (result, id) => result.modules.filter(module => module.segment === id).map(module => JSON.stringify(module));
  for (const id of ['spine', 'south']) assert.deepEqual(ids(other, id), ids(plan, id), `${id} unchanged`);
  assert.notDeepEqual(ids(other, 'link-studios'), ids(plan, 'link-studios'));
});

test('a venue over a kept tenant fails, naming the tenant', () => {
  const kept = edit(copy => { copy.venues[0].retire.tenants = []; });
  assert.throws(() => expandFiveRooms(kept, site), /venue:counter overlaps kept tenant osm-node-8172495006 \(Amorino\)/);
});

test('an entrance with no Ribbon link fails, naming the entrance', () => {
  const orphan = edit(copy => { copy.links = copy.links.filter(link => link.id !== 'link:atelier'); });
  assert.throws(() => validateFiveRooms(orphan), /entrance entrance:atelier of venue:atelier has no Ribbon link/);
});

test('a post in a tree pit fails, naming the pit', () => {
  // link-studios at the kit's 3 m clear height passes; moved 1.8 m north its first post lands in
  // the pit of tree-118.
  const lowered = edit(copy => { const item = segment(copy, 'link-studios'); item.clearHeight = 3; item.status = 'clear'; delete item.blocked; });
  assert.equal(expandFiveRooms(lowered, site).segments.find(item => item.id === 'link-studios').status, 'clear');
  const inPit = edit(copy => { const item = segment(copy, 'link-studios'); item.clearHeight = 3; item.status = 'clear'; delete item.blocked; item.points = item.points.map(([x, y]) => [x, y + 1.8]); });
  assert.throws(() => expandFiveRooms(inPit, site), /segment link-studios is documented as clear but the site refuses it: .*tree-pit-117/);
});

test('a camera corridor crossed by the canopy fails, naming the module', () => {
  const crossed = edit(copy => {
    const floor = copy.venues[0].floor.height;
    copy.venues[0].cameraCorridors.push({ id: 'camera:counter:over', from: [-2752, -1216.4, floor + 3.8], to: [-2764, -1216.4, floor + 3.8], halfWidth: 0.3 });
  });
  assert.throws(() => expandFiveRooms(crossed, site), /camera corridor camera:counter:over of venue:counter is crossed by canopy ribbon:spine:module:\d{3}/);
});

test('a Gardens footprint change fails the contract', () => {
  const moved = liveSite(world => { const building = world.buildings.find(item => item.id === 'osm-way-625330790'); building.ring[0] = [building.ring[0][0] + 2, building.ring[0][1]]; return world; });
  assert.throws(() => expandFiveRooms(contract, moved), /the Gardens contract no longer matches the district/);
});

test('blocked records are confirmed both ways', () => {
  const stale = edit(copy => { segment(copy, 'south').blocked.blockers.push('tree-pit-36'); });
  assert.throws(() => expandFiveRooms(stale, site), /segment south names blockers the site does not confirm: tree-pit-36/);
  const missing = edit(copy => { const item = segment(copy, 'south'); item.blocked.blockers = item.blocked.blockers.filter(id => id !== 'tree-pit-3'); });
  assert.throws(() => expandFiveRooms(missing, site), /segment south is blocked by undocumented tree-pit-3/);
  const cleared = edit(copy => { const item = segment(copy, 'link-studios'); item.clearHeight = 3; });
  assert.throws(() => expandFiveRooms(cleared, site), /segment link-studios is documented as blocked but passes/);
});
