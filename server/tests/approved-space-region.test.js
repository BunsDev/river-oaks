import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileRegionPackage, editableRegionFromWorld } from '../region-package.js';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { editableRegion } from '../../preview/src/region-draft.js';
import { APPROVED_SPACES } from '../../preview/src/approved-spaces.js';
import { approvedSpaceSources, approvedSpacesCurrent, verifyApprovedSpaceRoutes } from '../../preview/src/approved-space-plan.js';
import { worldProtocolVersion } from '../../preview/src/world-contract.js';

// #420: one approved Corner Café revision placed in a creator-region building.
const sha256 = value => createHash('sha256').update(value).digest('hex');
const pilot = JSON.parse(readFileSync(new URL('./fixtures/cafe-pilot-region.json', import.meta.url)));
const sample = JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json', import.meta.url)));
const record = APPROVED_SPACES[0];
const declaration = { id: 'corner-cafe', revision: 1, sha256: record.documentSha256 };
const region = (mutate = () => {}) => { const value = structuredClone(pilot); mutate(value, value.buildings[0]); return value; };
const compile = (value, options = {}) => compileRegionPackage(value, 'Harbour Café', { worldId: 'harbour-cafe', ...options });
const planOf = world => world.buildingInteriors.find(plan => plan.kind === 'approved-space');
const rejects = (value, code, options) => assert.throws(() => compile(value, options), error => error.code === code, code);

test('the reviewed Café is placed whole, from the server record, at the mapped entrance', () => {
  assert.equal(editableRegion(pilot), true);
  const world = compile(pilot), plan = planOf(world);
  const { approvedSha256, ...body } = plan;
  assert.equal(approvedSha256, sha256(JSON.stringify(body)));
  assert.equal(plan.kind, 'approved-space');
  assert.equal(plan.adapterVersion, 1);
  assert.deepEqual(plan.source, { id: 'corner-cafe', revision: 1, name: 'Corner Café', documentSha256: record.documentSha256,
    assetsSha256: record.assets.sha256, profile: { templateId: 'cafe', profileVersion: 1 } });
  assert.deepEqual(plan.placement.door, [0, -12]);
  assert.equal(plan.space.objects.length, record.space.objects.length);
  // The level keeps the generated-plan contract that the walking and authority code read.
  assert.equal(plan.levels.length, 1);
  assert.equal(plan.levels[0].id, 'corner-cafe/l0');
  assert.equal(plan.levels[0].portals[0].id, 'corner-cafe/l0/portal/venue-corner-cafe');
  // Terrace blockers join the shared collision list; the building rings come first, unchanged.
  assert.equal(world.collisionPolygons.length, world.buildings.length + plan.outdoor.length);
  assert.deepEqual(plan.outdoor.map(item => item.id.split('/').at(-1)),
    ['terrace-table', 'terrace-chair-a', 'terrace-chair-b', 'terrace-planter', 'terrace-planter-west']);
  assert.deepEqual(approvedSpaceSources(world), ['corner-cafe@1']);
  assert.equal(approvedSpacesCurrent(world), true);
  assert.equal(worldProtocolVersion(world), 4);
  // The editable package keeps only the reference: no geometry, digest claims or approval.
  assert.deepEqual(editableRegionFromWorld(world).buildings[0].interior.space, declaration);
  // Compilation is deterministic and independent of unrelated building order.
  const reordered = region(value => value.buildings.reverse());
  assert.deepEqual(planOf(compile(reordered)), plan);
});

test('one rigid transform: no object is scaled, and every distance in the reviewed layout survives', () => {
  const placements = [[0, 'south', [18, 14, 6]], [37, 'south', [18, 14, 6]], [30, 'east', [14, 18, 6]], [-135, 'north', [18, 14, 6]], [180, 'south', [18, 14, 6]]];
  for (const [yaw, entrance, size] of placements) {
    const value = region((value, cafe) => { Object.assign(cafe, { center: [-5, 10], size, yaw_deg: yaw }); cafe.interior.entrance = entrance; value.buildings.splice(1, 1); });
    const plan = planOf(compile(value));
    const placed = new Map(plan.space.objects.map(item => [item.id, item]));
    for (const item of record.space.objects) {
      const moved = placed.get(item.id);
      for (const key of ['width', 'depth', 'height', 'elevation', 'kind', 'finish']) assert.equal(moved[key], item[key], `${yaw} ${item.id} ${key}`);
      const turn = ((moved.yaw - item.yaw - plan.placement.rotationDeg) % 360 + 540) % 360 - 180;
      assert.ok(Math.abs(turn) < 1e-4, `${yaw} ${item.id} turns with the room`);
    }
    for (let i = 0; i < record.space.objects.length; i += 7) for (let j = i + 1; j < record.space.objects.length; j += 5) {
      const [a, b] = [record.space.objects[i], record.space.objects[j]], [p, q] = [placed.get(a.id), placed.get(b.id)];
      assert.ok(Math.abs(Math.hypot(a.east - b.east, a.north - b.north) - Math.hypot(p.east - q.east, p.north - q.north)) < 1e-5);
    }
    const room = plan.levels[0].rooms[0].footprint;
    const area = Math.abs(room.reduce((sum, p, index) => sum + p[0] * room[(index + 1) % room.length][1] - room[(index + 1) % room.length][0] * p[1], 0)) / 2;
    assert.ok(Math.abs(area - 192) < 1e-3, `${yaw}: the 16 × 12 m floor is not resized`);
  }
});

test('plain region-v1 and generation-v1 output and editable round trips are byte-identical', () => {
  // Digests recorded on main d109648a before the adapter existed.
  const withInterior = interior => ({ ...sample, buildings: sample.buildings.map((building, index) => index ? building : { ...building, interior }) });
  const cases = [
    ['plain', sample, 'Sample Region', {}, 'fdc6a3a54de265d2827143eb875495b394d497e4b1b23e7138bf798cd31d507a', 'ced33b0bb4e2972e14edf03788a2b457d67ee37ae8cc3482b07d48db98fc7392'],
    ['legacy venue', withInterior({ name: 'Moon Pavilion Gallery', category: 'art', entrance: 'south' }), 'Moon Garden', { worldId: 'moon-garden' },
      '5569cd9e4114055a49981636a79f428b18c61ce517a23faf66d07053ace53395', 'b8eed0890dee7b263af7095dfb17aad5674b799a5f1cded81eb956155c29eb53'],
    ['legacy restaurant', withInterior({ name: 'Moon Café', category: 'restaurant', entrance: 'south' }), 'Moon Garden', { worldId: 'moon-garden' },
      '1cf6a022f3817fa0b07eb8a8208e6d2613f5dd21cb5598a26d166bb8468c443a', 'c3c1e3f604ac798c48fe2f157e1c3af6810521eb944d48d2aa479ab7859f33d2'],
    ['generated', withInterior({ name: 'Moon Pavilion Gallery', category: 'art', entrance: 'south', generation: { version: 1, seed: 'moon-gallery-01', levels: 2,
      overrides: [{ targetId: 'moon-pavilion/l0/finish/floor', material: 'concrete' }] } }), 'Moon Garden', { worldId: 'moon-garden' },
      'ec57bed9a40aac38020b18e566995ad5b0b42cc416115da38a8d46fc09c2c0d0', 'bcfeded59b1d0d2f05e46730d4196361992f25e267cc616a26d102e308c1a86a'],
  ];
  for (const [name, value, title, options, compiled, editable] of cases) {
    const world = compileRegionPackage(value, title, options);
    assert.equal(sha256(JSON.stringify(world)), compiled, name);
    assert.equal(sha256(JSON.stringify(editableRegionFromWorld(world))), editable, name);
    assert.equal(worldProtocolVersion(world), 3, name);
  }
});

test('forged, unknown, stale, changed or misapplied revisions are refused', () => {
  // Client claims of approval or profile are not fields: the closed key set refuses them.
  for (const mutate of [
    (_, cafe) => { cafe.interior.space.approved = true; },
    (_, cafe) => { cafe.interior.space.profile = { templateId: 'cafe', profileVersion: 1 }; },
    (_, cafe) => { cafe.interior.approved = true; },
    (_, cafe) => { cafe.interior.space = { ...record.space }; },
    (_, cafe) => { cafe.interior.generation = { version: 1, levels: 1 }; },
  ]) {
    const value = region(mutate);
    assert.equal(editableRegion(value), false);
    assert.throws(() => compile(value), /Invalid creator region package/);
  }
  rejects(region((_, cafe) => { cafe.interior.space.revision = 2; }), 'approved_space_unknown');
  rejects(region((_, cafe) => { cafe.interior.space.id = 'garden-office'; }), 'approved_space_unknown');
  rejects(region((_, cafe) => { cafe.interior.space.sha256 = '0'.repeat(64); }), 'approved_space_stale');
  rejects(region((_, cafe) => { cafe.interior.category = 'art'; }), 'approved_space_policy');
  rejects(region((_, cafe) => { cafe.kind = 'residential'; cafe.interior.category = 'home'; }), 'approved_space_policy');
  // Synthetic registries, labelled as such: assets this build no longer serves, and a
  // record whose document no longer matches its reviewed digest.
  rejects(pilot, 'approved_space_assets', { approvedSpaces: { assets: { id: 'studio-space-forms', sha256: 'f'.repeat(64) } } });
  const tampered = { ...record, space: { ...record.space, name: 'Synthetic tampered fixture' } };
  rejects(pilot, 'approved_space_unknown', { approvedSpaces: { registry: [tampered] } });
});

test('false fit, neighbours, slope and obstructed arrival or departure fail safely', () => {
  rejects(region((_, cafe) => { cafe.size = [15, 14, 6]; }), 'approved_space_fit');
  rejects(region((_, cafe) => { cafe.size = [18, 11, 6]; cafe.center = [0, -6.5]; }), 'approved_space_fit');
  rejects(region((value, cafe) => { Object.assign(cafe, { center: [-5, 10], size: [16.1, 14, 6], yaw_deg: 37 }); value.buildings.splice(1, 1); }), 'approved_space_fit');
  rejects(region(value => value.buildings.push({ id: 'kiosk', center: [4.6, -17.5], size: [6, 4, 6], yaw_deg: 0, kind: 'parking' })), 'approved_space_neighbor');
  rejects(region(value => { value.roads[0].points = [[-50, -17], [50, -17]]; }), 'approved_space_neighbor');
  // The carriageway clears the terrace here, but the drawn curb and sidewalk would not.
  rejects(region(value => { value.roads[0].points = [[-50, -23], [50, -23]]; }), 'approved_space_neighbor');
  rejects(region(value => value.trees.push({ id: 'terrace-tree', position: [5, -14], height_m: 6, crown_radius_m: 2 })), 'approved_space_neighbor');
  rejects(region(value => { value.places[0].position = [5.5, -14]; }), 'approved_space_neighbor');
  // A footway west of the door moves the shared storefront bench (street-fixtures.js) east, onto the terrace.
  rejects(region(value => value.roads.push({ id: 'side-walk', name: 'Side Walk', kind: 'footway', width_m: 2, points: [[-4.5, -40], [-4.5, -14.5]] })), 'approved_space_neighbor');
  rejects(region(value => { value.parcels = [{ id: 'neighbour-lot', name: 'Neighbour Lot', bounds_m: [-5, -20, 10, -13] }]; }), 'approved_space_neighbor');
  rejects(region(value => { value.terrain.heights_m = value.terrain.heights_m.map((_, index) => (index % 5) * 0.6); }), 'approved_space_support');
  rejects(region(value => value.buildings.push({ id: 'kiosk', center: [-1.5, -15], size: [4, 4, 6], yaw_deg: 0, kind: 'parking' })), 'approved_space_route');
  rejects(region(value => {
    value.bounds_m = [-100, -100, 100, 100]; value.spawn = [0, -40];
    value.roads = [{ id: 'far-lane', name: 'Far Lane', kind: 'residential', width_m: 8.4, points: [[-90, 90], [90, 90]] }];
  }), 'approved_space_route');
});

test('route checks use the assembled world and the real controller, not the Studio bounds', () => {
  const world = compile(pilot), plan = planOf(world), environment = createWalkingEnvironment(world);
  const verdict = verifyApprovedSpaceRoutes(plan, environment, { roads: world.roads });
  assert.equal(verdict.status, 'passed');
  assert.deepEqual(verdict.routes.map(route => route.targetId), ['exit', 'cafe-1', 'cafe-2', 'cafe-3', 'cafe-4', 'departure']);
  assert.ok(verdict.routes.every(route => route.returnChecked));
  assert.ok(verdict.work > 0 && verdict.work < 30000);
  // A creation dropped on the doorway would block the same routes.
  // Scene z is -north: this 0.4 m creation stands 0.6 m outside the door at north -12.
  const doorway = { contains: (x, y, z, radius) => Math.hypot(x, z - 12.6) < radius + 0.4 };
  const blocked = verifyApprovedSpaceRoutes(plan, createWalkingEnvironment(world, [doorway]), { roads: world.roads });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.findings[0].ruleId, 'required-route');
  assert.equal(verifyApprovedSpaceRoutes(plan, environment, { roads: world.roads, maxWork: 5 }).findings[0].ruleId, 'route-budget');
});

test('the shared world admits visitors through the Café door onto its approved floor', () => {
  const world = compile(pilot), plan = planOf(world), environment = createWalkingEnvironment(world);
  const room = environment.rooms.find(item => item.approvedSpace);
  assert.equal(room.planId, 'corner-cafe/l0');
  assert.equal(room.people.length, 0, 'the first increment brings no residents');
  assert.equal(room.obstacles.length, plan.levels[0].layers.fixtures.length);
  let time = 1000;
  const shared = createSharedWorld(world, { worldId: 'harbour-cafe', now: () => time });
  assert.equal(shared.protocolVersion, 4);
  assert.equal(shared.join({ userId: 'guest', name: 'Guest' }).ok, true);
  const entered = shared.command('guest', { type: 'travel', storeId: 'venue-corner-cafe', mode: 'enter' });
  assert.equal(entered.ok, true);
  assert.equal(entered.player.levelId, 'corner-cafe/l0');
  assert.equal(environment.roomAt(entered.player.position[0], -entered.player.position[1])?.storeId, 'venue-corner-cafe');
  // Walking into the service counter is refused by the same collision every client draws.
  const counter = plan.space.objects.find(item => item.id === 'service-counter-left');
  time += 10000;
  const into = shared.command('guest', { type: 'pose', position: [counter.east, counter.north, 0], yaw: 0, altitude: 0 });
  assert.equal(into.ok, false);
  time += 1000;
  const left = shared.command('guest', { type: 'travel', storeId: 'venue-corner-cafe', mode: 'leave' });
  assert.equal(left.ok, true);
  assert.equal(left.player.levelId, null);
  assert.equal(environment.roomAt(left.player.position[0], -left.player.position[1]), null);
  // The terrace table outside is solid as well.
  const table = plan.space.objects.find(item => item.id === 'terrace-table');
  assert.equal(environment.isFree(table.east, -table.north), false);
});
