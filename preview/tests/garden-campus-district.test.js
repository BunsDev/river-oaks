import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import {
  CAMPUS_BUILDING_KIND, DISTRICT_REVISION_GARAGE, DISTRICT_REVISION_GARDENS, attachGardenCampus, campusCollisionRects, campusGroundAt, detachGardenCampus,
  campusGroundCutout, configuredDistrictRevision, districtRevisionOf, isCampusRoom, planCampusRooms,
} from '../src/garden-campus-district.js';
import { buildGardenCampus } from '../src/garden-campus.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { groundSurfaceHeight, registerGroundSurfaces } from '../src/world-surface.js';
import { storeRoomsFor } from '../src/store-rooms.js';
import { insideRoomFootprint } from '../src/room-ground-clip.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusToScene, campusToSource } from '../../shared/garden-campus-layout.js';

const garage = await loadDistrictData();
const campus = attachGardenCampus(garage);
const BASE = CAMPUS.frame.baseAltitude;
// Campus [u, v] to the walking model's [x, z].
const xz = ([u, v]) => { const [east, north] = campusToSource([u, v]);return [east, -north]; };

test('the district revision defaults to the garage; only the exact campus id selects the Gardens', () => {
  const ignored = [];
  assert.equal(configuredDistrictRevision(undefined), DISTRICT_REVISION_GARAGE);
  assert.equal(configuredDistrictRevision(''), DISTRICT_REVISION_GARAGE);
  assert.equal(configuredDistrictRevision(DISTRICT_REVISION_GARDENS), DISTRICT_REVISION_GARDENS);
  assert.equal(configuredDistrictRevision('river-oaks-gardens-2', { onInvalid: value => ignored.push(value) }), DISTRICT_REVISION_GARAGE);
  assert.deepEqual(ignored, ['river-oaks-gardens-2']);
  assert.equal(districtRevisionOf(garage), null, 'the garage reports no revision');
  assert.equal(districtRevisionOf(campus), DISTRICT_REVISION_GARDENS);
});

test('the campus replaces the garage building and its exact collision ring, and nothing else', () => {
  const source = garage.buildings.find(item => item.id === CAMPUS.source.buildingId);
  assert.ok(source, 'the pinned district still has the garage');
  assert.equal(campus.buildings.some(item => item.id === source.id), false, 'no garage building remains');
  const same = ring => ring.length === source.ring.length && ring.every((p, i) => p[0] === source.ring[i][0] && p[1] === source.ring[i][1]);
  assert.equal(campus.collisionPolygons.filter(same).length, 0, 'no invisible garage collision remains');
  assert.equal(garage.collisionPolygons.filter(same).length, 1, 'the source district is not modified');
  // Every other building and collision ring is carried through unchanged, in order.
  assert.deepEqual(campus.buildings.filter(item => item.kind !== CAMPUS_BUILDING_KIND), garage.buildings.filter(item => item !== source));
  const index = campus.gardenCampus.replaced.collisionIndex, added = campusCollisionRects().length;
  assert.deepEqual([...campus.collisionPolygons.slice(0, index), ...campus.collisionPolygons.slice(index + added)], garage.collisionPolygons.filter(ring => !same(ring)));
  assert.equal(campus.collisionPolygons.length, garage.collisionPolygons.length - 1 + added);
  assert.deepEqual(campus.buildings.filter(item => item.kind === CAMPUS_BUILDING_KIND).map(item => item.campus.part), ['T1', 'T2', 'T3', 'C', 'S']);
  assert.deepEqual(campus.gardenCampus.replaced.building, source, 'provenance keeps the replaced building');
  // The garage district comes back byte for byte: the migration and rollback input.
  assert.equal(JSON.stringify(detachGardenCampus(campus)), JSON.stringify(garage));
  assert.equal(campus.gardenCampus.versions.layout, CAMPUS.versions.layout);
  // Tower volumes reach their declared silhouette cap, which stays below the office roof.
  for (const tower of CAMPUS.towers) assert.equal(campus.buildings.find(item => item.campus?.part === tower.id).size[2], tower.silhouette.capZ);
});

test('the overlay refuses a district the contract does not accept, and attaches once', () => {
  const shifted = structuredClone(garage);
  shifted.buildings.find(item => item.id === CAMPUS.source.buildingId).ring[2][0] += 0.5;
  assert.throws(() => attachGardenCampus(shifted), /contract refused this district: provenance/);
  const datum = structuredClone(garage);
  datum.buildings.find(item => item.id === CAMPUS.source.buildingId).center[2] += 0.2;
  assert.throws(() => attachGardenCampus(datum), /datum/);
  const noCollision = structuredClone(garage);
  noCollision.collisionPolygons.splice(1, 1);
  assert.throws(() => attachGardenCampus(noCollision), /collision ring/);
  assert.throws(() => attachGardenCampus(campus), /cannot attach/);
});

test('street walkers stay on the platform under both skywalks; the old garage is open ground', () => {
  const street = createWalkingEnvironment(campus), before = createWalkingEnvironment(garage);
  for (const [label, at] of [['P2 under B12', [16, 76.8]], ['under B23', [16, 123]], ['P1 promenade', [31, 90]], ['P4 approach', [27, 103]]]) {
    const [x, z] = xz(at);
    assert.equal(street.isFree(x, z), true, `${label} is walkable`);
    assert.equal(before.isFree(x, z), false, `${label} was inside the garage`);
    assert.equal(street.groundAt(x, z), BASE, `${label} stands on the platform, not a deck`);
  }
  for (const [label, at] of [['T1 lift shaft', [9.5, 56]], ['T2 stair shaft', [9.5, 104]], ['pool', [21, 18]], ['pergola post', [4.15, 154.15]], ['T3 wall away from its door', [25, 145]]]) {
    const [x, z] = xz(at);
    assert.equal(street.isFree(x, z), false, `${label} blocks`);
  }
});

test('E1, E2 and E3 reach every lobby, the café and under the pergola through physically clear ground', () => {
  const street = createWalkingEnvironment(campus), step = 0.5, [u0, v0, u1, v1] = [-3, -3, 41, 184];
  const cols = Math.round((u1 - u0) / step), key = (i, j) => j * cols + i, seen = new Uint8Array(cols * Math.round((v1 - v0) / step));
  const free = (i, j) => { const [x, z] = xz([u0 + i * step, v0 + j * step]);return street.isFree(x, z); };
  const flood = start => {
    seen.fill(0);
    const [si, sj] = start.map((n, axis) => Math.round((n - [u0, v0][axis]) / step)), queue = [[si, sj]];
    assert.equal(free(si, sj), true, `start ${start} is free`);seen[key(si, sj)] = 1;
    while (queue.length) {
      const [i, j] = queue.pop();
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (a < 0 || b < 0 || a >= cols || b >= seen.length / cols || seen[key(a, b)] || !free(a, b)) continue;
        seen[key(a, b)] = 1;queue.push([a, b]);
      }
    }
    return ([u, v]) => Boolean(seen[key(Math.round((u - u0) / step), Math.round((v - v0) / step))]);
  };
  const targets = { 'T1 lobby': [12, 58], 'T2 lobby': [12, 103], 'T3 lobby': [12, 139], 'T1 hall': [20, 64], 'café': [10, 32], 'under the pergola': [14, 161], 'under B12': [16, 80], 'under B23': [16, 125] };
  for (const entry of CAMPUS.entries) {
    // Start just inside the parcel at each mapped entry.
    const inward = { E1: [0, 1], E2: [1, 0], E3: [0, -1] }[entry.id], start = entry.position.map((n, axis) => n + inward[axis] * 1.5);
    const reached = flood(start);
    for (const [label, point] of Object.entries(targets)) assert.equal(reached(point), true, `${entry.id} reaches ${label}`);
  }
});

test('client and server read one platform height, above or below the terrain mesh', () => {
  const at = [16, 76.8], [x, z] = xz(at);
  const server = structuredClone(campus);
  assert.equal(groundSurfaceHeight(server, x, z), BASE, 'no registered meshes (the server)');
  // A client terrain mesh poking 0.3 m above the platform does not lift a walker on the campus...
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2));plane.position.set(x, BASE + 0.3, z);
  const client = structuredClone(campus);registerGroundSurfaces(client, [plane]);
  assert.equal(groundSurfaceHeight(client, x, z), BASE);
  // ...but still carries the street outside the parcel.
  const [ox, oz] = xz([-8, 76.8]);
  assert.ok(Math.abs(groundSurfaceHeight(client, ox, oz) - (BASE + 0.3)) < 1e-9);
  assert.equal(campusGroundAt(garage, x, -z), null, 'the garage revision has no platform');
});

test('flights keep clear of the towers and both skywalks but not of the open air above them', () => {
  const street = createWalkingEnvironment(campus);
  for (const bridge of CAMPUS.bridges) {
    const [x, z] = xz([16, (bridge.rect[1] + bridge.rect[3]) / 2]);
    assert.equal(street.canFly(x, BASE + bridge.deckZ + 0.5, z), false, `${bridge.id} deck height`);
    assert.equal(street.canFly(x, BASE + 40, z), true, `${bridge.id} high above`);
  }
  for (const tower of CAMPUS.towers) {
    const [x, z] = xz([20, (tower.tiers[0].rect[1] + tower.tiers[0].rect[3]) / 2]);
    assert.equal(street.canFly(x, BASE + tower.silhouette.capZ, z), false, `${tower.id} roof garden`);
  }
});

test('the halls and café are walk-in street rooms through their east doors, with the core shafts as obstacles', () => {
  const rooms = planCampusRooms(campus);
  assert.deepEqual(rooms.map(room => room.campus.surfaceId), ['T1-F1-hall', 'T2-F1-hall', 'T3-F1-hall', 'C-hall']);
  assert.equal(planCampusRooms(garage).length, 0);
  assert.equal(storeRoomsFor(campus).filter(isCampusRoom).length, 4);
  assert.equal(storeRoomsFor(campus).length, storeRoomsFor(garage).length + 4);
  for (const room of rooms) {
    assert.deepEqual(room.people, [], 'no staff, so the resident count is unchanged');
    assert.equal(room.floor, BASE);
    const [doorX, doorZ] = [room.facade[0], -room.facade[1]], street = createWalkingEnvironment(campus);
    assert.equal(street.roomAt(doorX, doorZ)?.storeId, room.storeId, `${room.name} door threshold`);
  }
  const t1 = rooms[0], tower = CAMPUS.towers[0];
  assert.deepEqual(t1.obstacles.map(item => item.kind), ['lift', 'stair']);
  // The street-environment door sits on the contract's entrance.
  const entrance = campusLevels()[0].openings.find(item => item.id === 'T1-F1/entrance');
  assert.ok(Math.hypot(...campusToSource(entrance.position).slice(0, 2).map((n, i) => n - t1.facade[i])) < 1e-9);
  assert.equal(t1.depth, tower.tiers[0].rect[2] - tower.tiers[0].rect[0]);
});

test('the terrain mask covers the platform and nothing beyond the parcel', () => {
  const cutout = campusGroundCutout(campus);
  assert.equal(campusGroundCutout(garage), null);
  const [e, n] = campusToSource([16, 76.8]);
  assert.equal(insideRoomFootprint(cutout, e, n), true);
  for (const outside of [[-0.5, 50], [38.5, 90], [20, -0.5], [20, 181.6]]) {
    const [oe, on] = campusToSource(outside);
    assert.equal(insideRoomFootprint(cutout, oe, on), false, `outside ${outside}`);
  }
});

test('the shells draw 6/7/6 occupied floors, open every skywalk portal and dispose what they own', () => {
  assert.equal(buildGardenCampus(garage), null);
  const group = buildGardenCampus(campus), counts = group.userData.counts;
  // One floor finish per occupied storey plus the café's: 6 + 7 + 6 + 1.
  assert.equal(counts.interior, 20);
  const boxes = finish => {
    const mesh = group.children.find(child => child.name === `campus:${finish}`), matrix = new THREE.Matrix4(), out = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();matrix.decompose(p, q, s);
      out.push({ u0: p.x - s.x / 2, u1: p.x + s.x / 2, z0: p.y - s.y / 2, z1: p.y + s.y / 2, v0: -p.z - s.z / 2, v1: -p.z + s.z / 2 });
    }
    return out;
  };
  const glass = boxes('glass'), bronze = boxes('bronze');
  for (const portal of CAMPUS.bridges.flatMap(bridge => bridge.portals)) {
    const [pu0, pu1] = portal.opening, v = portal.position[1], z = portal.position[2];
    const blocking = [...glass, ...bronze].filter(b => b.u0 < pu1 - 1e-6 && b.u1 > pu0 + 1e-6 && b.v0 < v + 0.3 && b.v1 > v - 0.3 && b.z0 < z + portal.clearHeight - 1e-6 && b.z1 > z + 1e-6);
    assert.deepEqual(blocking, [], `${portal.id} opens through the facade`);
  }
  // Each deck runs from facade to facade, except where B12 lies on T2's own z 13 terrace.
  const decks = boxes('slab').filter(b => Math.abs(b.z1 - 13) < 1e-6 && b.u0 === 14 && b.u1 === 18);
  assert.deepEqual(decks.map(b => [b.v0, b.v1]).sort((a, b) => a[0] - b[0]), [[70, 90], [116, 131]]);
  // Every published finish (and roof bed) is drawn over its own footprint from its level up: no
  // collision is ever invisible. #511's finish pass draws them as several parts (planter walls and
  // toe light, a bench top, a table pad, a tree pit's kerb), so the parts standing on the footprint
  // must together span it exactly.
  const drawn = ['timber', 'stone', 'bronze', 'luminaire'].flatMap(finish => boxes(finish)), near = (a, b) => Math.abs(a - b) < 1e-4; // instance matrices are float32
  for (const level of campusLevels()) for (const item of level.obstacles.filter(o => ['seat', 'table', 'planter', 'tree'].includes(o.kind))) {
    const [u0, v0, u1, v1] = item.rect, own = drawn.filter(b => b.u0 > u0 - 1e-4 && b.u1 < u1 + 1e-4 && b.v0 > v0 - 1e-4 && b.v1 < v1 + 1e-4 && b.z0 > level.z - 1e-4 && b.z0 < level.z + 0.5);
    const spans = own.length && near(Math.min(...own.map(b => b.u0)), u0) && near(Math.max(...own.map(b => b.u1)), u1) && near(Math.min(...own.map(b => b.v0)), v0) && near(Math.max(...own.map(b => b.v1)), v1);
    assert.ok(spans && own.some(b => near(b.z0, level.z)), `${item.id} is drawn over its footprint`);
  }
  // The rotated root puts campus metres exactly where the contract's transform does.
  group.updateMatrixWorld(true);
  for (const corner of [[6, 46, 4.65], [25, 150, 5], [14, 70, 13], [37.7, 181.2, 0]]) {
    const local = new THREE.Vector3(corner[0], corner[2], -corner[1]).applyMatrix4(group.matrixWorld), expected = campusToScene(corner);
    assert.ok(local.distanceTo(new THREE.Vector3(...expected)) < 1e-6, `campus ${corner} renders at ${local.toArray()} not ${expected}`);
  }
  const materials = [], geometries = [];
  group.traverse(item => { if (item.material) materials.push(item.material);if (item.geometry) geometries.push(item.geometry); });
  let disposed = 0;
  for (const item of new Set([...materials, ...geometries])) item.addEventListener('dispose', () => disposed++);
  group.userData.dispose();
  assert.equal(disposed, new Set([...materials, ...geometries]).size, 'every owned material and geometry is released');
});
