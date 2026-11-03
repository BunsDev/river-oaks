import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { bikeRackSlots, cityBikeRackFootprints, cityBikeRacks, rackSlots } from '../src/bike-racks.js';
import { buildCityBikeRacks } from '../src/city-bike-racks.js';
import { bicycleCanOccupy, bicyclePlacement } from '../src/plaza-bicycle.js';
import { plazaSalonFootprints, plazaSalonPlan, plazaSalonRack } from '../src/plaza-salon-plan.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildRoads, checkBuildSite } from '../src/shared-build.js';
import { clearOfRoads, laneFixtures } from '../src/street-fixtures.js';
import { treePits } from '../src/street-furniture.js';
import { benchSeats, boutiquePlanters, lanePlanters } from '../src/world-interactions.js';
import { createPedestrianNetwork } from '../src/pedestrian-network.js';
import { STREET, crossingDistance } from '../src/street-profile.js';
import { DISTRICT_REVISIONS, campusGroundAt } from '../src/garden-campus-district.js';
import { groundSurfaceHeight } from '../src/world-surface.js';

// The curbside bike racks: where they stand, what they block, how they draw.
const worlds = await Promise.all(DISTRICT_REVISIONS.map(async revision => ({ revision, world: await loadDistrictData({ districtRevision: revision }) })));
const district = worlds[0].world;
const along = ([x, north], heading, distance) => [x + Math.sin(heading) * distance, north - Math.cos(heading) * distance];
// The same ground without the District's furniture: the plaza and every rack belong to the District scene.
const elsewhere = world => ({ ...world, scene: 'elsewhere' });

test('a curbside rack lays out its slots as the plaza rack does, after the plaza slots', () => {
  assert.deepEqual(rackSlots(plazaSalonPlan(district).rack), plazaSalonRack(district));
  const racks = cityBikeRacks(district), slots = bikeRackSlots(district);
  assert.equal(racks.length, 6);
  assert.deepEqual(slots.slice(0, 4), plazaSalonRack(district));
  assert.equal(slots.length, 4 + 6 * 4);
  assert.equal(new Set(slots.map(slot => slot.id)).size, slots.length, 'slot ids are unique');
  for (const rack of racks) {
    const own = slots.filter(slot => slot.rackId === rack.id);
    assert.deepEqual(own.map(slot => slot.id), [0, 1, 2, 3].map(n => `${rack.id}:${n}`));
    for (let i = 1; i < own.length; i++) assert.ok(Math.abs(Math.hypot(own[i].x - own[i - 1].x, own[i].north - own[i - 1].north) - rack.pitch) < 1e-9);
    for (const slot of own) assert.ok(Math.abs(Math.hypot(...[0, 1].map(k => slot.approach[k] - [slot.x, slot.north][k])) - rack.approach) < 1e-9);
  }
  // Spread around the District: no two racks (the plaza's included) within 25 m.
  const centres = [plazaSalonPlan(district).rack, ...racks];
  for (const [i, a] of centres.entries()) for (const b of centres.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.north - b.north) > 25, `${a.id} and ${b.id} are apart`);
});

test('there are no curbside racks outside the District', () => {
  for (const world of [null, { scene: 'district', stores: [] }, elsewhere(district)]) {
    assert.deepEqual(cityBikeRacks(world), []);
    assert.deepEqual(cityBikeRackFootprints(world), []);
    assert.deepEqual(bikeRackSlots(world), []);
  }
});

// The same rules the street furniture keeps (street-fixtures.js), plus room
// for the bikes themselves, in every District revision.
test('every curbside rack stands on open paving clear of the street, in every revision', () => {
  const probe = radius => ({ id: 'probe', radius, height: 0.8 });
  for (const { revision, world } of worlds) {
    const environment = createWalkingEnvironment(world), bare = createWalkingEnvironment(elsewhere(world)), roads = buildRoads(world), network = createPedestrianNetwork(world);
    const streetSpace = (x, z) => environment.isFree(x, z) && !environment.roomAt(x, z) && campusGroundAt(world, x, -z) === null;
    const { lamps, planters, bins } = laneFixtures(world, streetSpace);
    const keepClear = [
      ...lamps.map(([x, , z]) => ['lamp', x, -z, 1]), ...planters.map(([x, , z]) => ['planter', x, -z, 1.4]), ...bins.map(([x, , z]) => ['bin', x, -z, 1]),
      ...treePits(world).map(([x, , z]) => ['tree pit', x, -z, 1.4]),
      ...benchSeats(world).flatMap(seat => [['seat', seat.x, seat.north, 1.5], ['seat approach', ...seat.approach, 1]]),
      ...[...lanePlanters(world, streetSpace), ...boutiquePlanters(world)].map(planter => ['planter', planter.x, planter.north, 1.4]),
      ...world.communityLocations.map(spot => [`${spot.name} door`, spot.position[0], spot.position[1], 3.5]),
      ...plazaSalonFootprints(world).map(([x, north]) => ['plaza', x, north, 6]),
      ['spawn', world.walkSpawn[0], world.walkSpawn[1], 8],
    ];
    assert.ok(keepClear.length > 300 && keepClear.every(([, x, north]) => Number.isFinite(x) && Number.isFinite(north)), `${revision}: the street furniture is all there`);
    for (const [r, rack] of cityBikeRacks(world).entries()) {
      const where = `${revision} ${rack.id}`, slots = rackSlots(rack);
      const bar = cityBikeRackFootprints(world)[r].map(([x, north]) => [x, north]);
      const points = [...bar, ...slots.flatMap(slot => [[slot.x, slot.north], along([slot.x, slot.north], slot.heading, 0.85), along([slot.x, slot.north], slot.heading, -0.85), slot.approach])];
      for (const [what, x, north, clearance] of keepClear) assert.ok(points.every(p => Math.hypot(p[0] - x, p[1] - north) >= clearance), `${where} keeps ${clearance} m from the ${what}`);
      assert.ok(points.every(([x, north]) => clearOfRoads(world, x, -north, 0.5)), `${where} is off the lanes and walkways`);
      for (const road of world.roads) assert.ok(points.every(p => crossingDistance(network, road.id, p) >= STREET.crossingWidth / 2 + STREET.flareRun + 0.8), `${where} keeps clear of the ${road.name} crossings`);
      for (const [x, north] of bar) assert.equal(checkBuildSite({ environment: bare, roads, position: [x, north], kind: probe(0.3) }).reason, undefined, `${where}: the bar stands on open ground`);
      for (const slot of slots) {
        assert.equal(checkBuildSite({ environment, roads, position: [slot.x, slot.north], kind: probe(0.45) }).reason, undefined, `${where}: ${slot.id} stands on open paving`);
        assert.equal(checkBuildSite({ environment, roads, position: slot.approach, kind: probe(0.35) }).reason, undefined, `${where}: ${slot.id} can be walked up to`);
        assert.equal(bicycleCanOccupy(bicyclePlacement(slot, environment), environment), true, `${where}: ${slot.id}'s bike is clear of its bar`);
        const out = along(slot.approach, slot.heading, 1.2);
        assert.ok(environment.isFree(out[0], -out[1]) && !environment.roomAt(out[0], -out[1]), `${where}: ${slot.id} rides out onto open paving`);
      }
    }
  }
});

test('a curbside bar blocks walkers and low flight, as the plaza bar does', () => {
  const environment = createWalkingEnvironment(district);
  for (const [r, rack] of cityBikeRacks(district).entries()) {
    const discs = cityBikeRackFootprints(district)[r];
    assert.equal(discs.length, Math.ceil(rack.length / 0.4) + 1);
    const [x, north] = [rack.x, rack.north], ground = environment.groundAt(x, -north);
    assert.equal(environment.isFree(x, -north), false, `${rack.id}: a walker cannot stand in the bar`);
    assert.equal(environment.canFly(x, ground + 0.4, -north), false, `${rack.id}: nor fly low through it`);
    assert.equal(environment.canFly(x, ground + 4, -north), true, `${rack.id}: but can fly over it`);
    const ends = [-1, 1].map(side => [x + Math.cos(rack.heading) * side * (rack.length / 2 + 0.75), north + Math.sin(rack.heading) * side * (rack.length / 2 + 0.75)]);
    for (const [ex, en] of ends) assert.equal(environment.isFree(ex, -en), true, `${rack.id}: a walker passes the end of the bar`);
  }
  // Without the racks, the same spots are open: the bars are what blocks them.
  const bare = createWalkingEnvironment(elsewhere(district));
  for (const rack of cityBikeRacks(district)) assert.equal(bare.isFree(rack.x, -rack.north), true, `${rack.id} stands on open ground`);
});

test('the racks draw their bikes instanced per rack, and a taken slot hides its bike and its shadow', () => {
  const group = buildCityBikeRacks(district);
  group.updateMatrixWorld(true);
  const racks = cityBikeRacks(district), slots = racks.flatMap(rackSlots);
  assert.equal(group.name, 'City bike racks');
  assert.equal(group.children.filter(item => item.isMesh && !item.isInstancedMesh).length, 1, 'every bar is one mesh');
  const bikes = group.getObjectByName('Parked bikes'), proxies = group.userData.shadowProxies;
  const { bikeBatches } = group.userData.counts;
  assert.ok(bikeBatches < 11, `${bikeBatches} materials draw a rack, not the bicycle's 11 meshes`);
  assert.equal(bikes.children.length, racks.length * bikeBatches);
  assert.ok(bikes.children.every(mesh => mesh.isInstancedMesh && mesh.count === 4 && !mesh.castShadow && mesh.receiveShadow));
  assert.equal(proxies.length, racks.length);
  assert.ok(proxies.every(proxy => proxy.name === 'Parked bikes shadow' && proxy.isInstancedMesh && proxy.castShadow && !proxy.visible && proxy.parent === group));
  // Each rack's batches stay small, so a rack out of view is culled.
  assert.ok(bikes.children.every(mesh => mesh.boundingSphere.radius < 4));
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), turn = new THREE.Quaternion(), scale = new THREE.Vector3();
  const instance = (mesh, i) => { mesh.getMatrixAt(i, matrix); matrix.premultiply(group.matrixWorld).decompose(position, turn, scale); return { position: position.clone(), turn: turn.clone(), scale: scale.clone() }; };
  // decompose() reads a zero matrix as scale 1, so a hidden bike is checked by its columns.
  const size = (mesh, i) => { mesh.getMatrixAt(i, matrix); return Math.hypot(...matrix.elements.slice(0, 11)); };
  racks.forEach((rack, r) => {
    const meshes = [...bikes.children.filter(mesh => mesh.name === rack.id), proxies[r]];
    assert.equal(meshes.length, bikeBatches + 1);
    rackSlots(rack).forEach((slot, i) => {
      const [x, z] = [slot.x, -slot.north];
      for (const mesh of meshes) {
        const { position: at, turn: q, scale: s } = instance(mesh, i);
        assert.ok(at.distanceTo(new THREE.Vector3(x, groundSurfaceHeight(district, x, z), z)) < 1e-3, `${slot.id} stands on its slot`);
        // The mesh faces local -X; it should point along the slot's heading (0 = south = +Z).
        const facing = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
        assert.ok(facing.distanceTo(new THREE.Vector3(Math.sin(slot.heading), 0, Math.cos(slot.heading))) < 1e-6, `${slot.id} points the way of its heading`);
        assert.ok(Math.abs(s.x - 1) < 1e-9);
      }
    });
  });
  // The town takes Cartier's third bike, then hands it back.
  const id = 'cartier-rack:2', r = racks.findIndex(rack => rack.id === 'cartier-rack'), k = slots.findIndex(slot => slot.id === id);
  const meshes = [...bikes.children.filter(mesh => mesh.name === 'cartier-rack'), proxies[r]];
  assert.equal(group.userData.rack.setTaken([id, 'plaza-salon-rack:0']), true);
  assert.deepEqual(group.userData.rack.parked(), slots.map((_, i) => i !== k));
  for (const mesh of meshes) {
    assert.equal(size(mesh, 2), 0, 'its bike and its shadow are gone');
    assert.ok(Math.abs(instance(mesh, 1).scale.x - 1) < 1e-9 && size(mesh, 1) > 1, 'its neighbours stay');
  }
  assert.equal(group.userData.rack.setTaken([id]), false, 'nothing changes for the same slots');
  assert.equal(group.userData.rack.setTaken([]), true);
  assert.ok(group.userData.rack.parked().every(Boolean));
  for (const mesh of meshes) assert.ok(size(mesh, 2) > 1 && Math.abs(instance(mesh, 2).scale.x - 1) < 1e-9, 'the bike is back');
  group.userData.rack.dispose();
});

test('outside the District the rack layer is empty', () => {
  const group = buildCityBikeRacks(elsewhere(district));
  assert.equal(group.children.length, 0);
  assert.deepEqual(group.userData.shadowProxies, []);
  assert.equal(group.userData.rack, undefined);
});
