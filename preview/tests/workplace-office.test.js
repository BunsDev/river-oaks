import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planWorkplaceRoom, buildWorkplaceGraybox, validateRoomPlan, AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { buildWorkplaceOffice, OFFICE_VIEWS } from '../src/workplace-office.js';

const meshes = object => { const out = []; object.updateMatrixWorld(true); object.traverse(node => { if (node.isMesh) out.push(node); }); return out; };
// Plan coordinates of a mesh's world bounds: x across, d inward, y up.
const extent = mesh => { const box = new THREE.Box3().setFromObject(mesh); return { x0: box.min.x, x1: box.max.x, y0: box.min.y, y1: box.max.y, d0: -box.max.z, d1: -box.min.z }; };
const WALL_BAND = 0.16, EPS = 1e-6;

function allowedRegions(room, zone) {
  const half = room.width / 2;
  const walls = [{ x0: -half - 0.2, x1: -half + WALL_BAND, d0: -0.2, d1: room.depth + 0.2 }, { x0: half - WALL_BAND, x1: half + 0.2, d0: -0.2, d1: room.depth + 0.2 },
    { x0: -half - 0.2, x1: half + 0.2, d0: room.depth - WALL_BAND, d1: room.depth + 0.2 }, { x0: -half - 0.2, x1: half + 0.2, d0: -0.2, d1: WALL_BAND }];
  if (zone === 'wall') return walls;
  if (zone.startsWith('fixture:')) {
    const obstacle = room.obstacles.find(item => item.id === zone.slice(8));
    assert.ok(obstacle, `${zone} names a plan obstacle`);
    return [{ x0: obstacle.x0 - 0.01, x1: obstacle.x1 + 0.01, d0: obstacle.d0 - 0.01, d1: obstacle.d1 + 0.01 }, ...walls];
  }
  if (zone.startsWith('seat:')) {
    const station = room.stations.find(item => item.id === zone.slice(5));
    assert.ok(station, `${zone} names a plan station`);
    // The chair stays inside the seated footprint the plan already reserves.
    const r = AVATAR_ENVELOPE.seatedRadius / 2;
    return [{ x0: station.seat[0] - r, x1: station.seat[0] + r, d0: station.seat[1] - r, d1: station.seat[1] + r }];
  }
  return null;
}
const inside = (region, x, d) => x >= region.x0 - EPS && x <= region.x1 + EPS && d >= region.d0 - EPS && d <= region.d1 + EPS;

test('every office mesh stays in its plan zone, so routes, sockets and the aisle are unchanged', () => {
  const room = planWorkplaceRoom();
  assert.deepEqual(validateRoomPlan(room), []);
  const office = buildWorkplaceOffice(THREE, room), list = meshes(office.object);
  assert.ok(list.length > 80, `a furnished room, not a blockout (${list.length} meshes)`);
  for (const mesh of list) {
    const zone = mesh.userData.zone, e = extent(mesh), label = `${mesh.name || mesh.material.name} (${zone})`;
    assert.ok(zone, `${label} declares its zone`);
    assert.ok(e.x0 >= -room.width / 2 - 0.16 && e.x1 <= room.width / 2 + 0.16 && e.d0 >= -0.16 && e.d1 <= room.depth + 0.16 && e.y0 >= -0.06 && e.y1 <= room.height + 0.01, `${label} stays inside the shell`);
    if (zone === 'floor') { assert.ok(e.y1 <= 0.02, `${label} is flush with the floor (${e.y1})`); continue; }
    if (zone === 'ceiling') { assert.ok(e.y0 >= AVATAR_ENVELOPE.height + 0.1, `${label} clears the tallest look (${e.y0})`); continue; }
    const regions = allowedRegions(room, zone);
    assert.ok(regions, `${label} has a known zone`);
    // Sample the footprint: every point must lie in an allowed region.
    for (let i = 0; i <= 8; i++) for (let k = 0; k <= 8; k++) {
      const x = e.x0 + (e.x1 - e.x0) * i / 8, d = e.d0 + (e.d1 - e.d0) * k / 8;
      assert.ok(regions.some(region => inside(region, x, d)), `${label} reaches ${x.toFixed(2)},${d.toFixed(2)} outside its zone`);
    }
  }
  office.dispose();
});

test('the office keeps the doorway open to the door height that clears the tallest look', () => {
  const room = planWorkplaceRoom();
  assert.ok(room.door.height >= AVATAR_ENVELOPE.height + 0.1);
  for (const build of [buildWorkplaceGraybox, buildWorkplaceOffice]) {
    const finish = build(THREE, room);
    for (const mesh of meshes(finish.object)) {
      const e = extent(mesh);
      const inDoorway = e.x1 > -room.door.halfWidth + 0.01 && e.x0 < room.door.halfWidth - 0.01 && e.d0 < 0.05 && e.d1 > -0.2 && e.y1 > 0.01;
      if (inDoorway) assert.ok(e.y0 >= room.door.height - 1e-6, `${build.name}: ${mesh.name || mesh.material.name} in the doorway below ${room.door.height} m (${e.y0})`);
    }
    finish.dispose();
  }
});

test('the office releases every geometry, material and texture it made', () => {
  const room = planWorkplaceRoom(), scene = new THREE.Scene();
  const office = buildWorkplaceOffice(THREE, room); scene.add(office.object);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  office.object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  assert.ok(textures.size >= 5, 'procedural floor, onyx, skyline, interface and flute maps');
  let disposed = 0;
  for (const item of [...geometries, ...materials, ...textures]) item.addEventListener('dispose', () => disposed++);
  office.dispose();
  assert.equal(disposed, geometries.size + materials.size + textures.size);
  assert.equal(scene.children.length, 0);
});

test('the hologram animates from frame time alone and the showcase views look into the room', () => {
  const room = planWorkplaceRoom(), office = buildWorkplaceOffice(THREE, room);
  const globe = office.object.getObjectByName('Orbital hologram');
  office.update(0); const start = globe.rotation.y;
  office.update(2); assert.notEqual(globe.rotation.y, start);
  office.update(0); assert.equal(globe.rotation.y, start, 'the same time gives the same pose');
  for (const [name, view] of Object.entries(OFFICE_VIEWS)) {
    assert.ok(!(name in room.cameras), `${name} does not replace a measured plan camera`);
    const [x, , d] = view.position;
    assert.ok(Math.abs(x) < room.width / 2 && d > 0 && d < room.depth, `${name} stands inside the room`);
  }
  office.dispose();
});
