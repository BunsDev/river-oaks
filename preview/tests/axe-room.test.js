// The axe-and-darts venue as drawn and as collided: the same props in both, open floor
// where the throwing boxes and the darts area are, and a clean build and dispose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildAxeRoomInterior } from '../src/axe-room-interior.js';
import { AXE_LANES, AXE_ROOM_DARTS, atAxeLane, atAxeRoomDarts } from '../src/axe-room-plan.js';
import { isVenueRoom } from '../src/venue-rooms.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world), room = environment.rooms.find(isVenueRoom);
const group = buildAxeRoomInterior(room, { local: true });
group.updateMatrixWorld(true);
const meshes = []; group.traverse(item => { if (item.isMesh && !item.isInstancedMesh) meshes.push(item); });
const triangles = meshes.flatMap(mesh => {
  const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, count = index ? index.count : p.count, list = [];
  const corner = k => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
  for (let k = 0; k < count; k += 3) { const t = new THREE.Triangle(corner(k), corner(k + 1), corner(k + 2)); list.push({ t, box: new THREE.Box3().setFromPoints([t.a, t.b, t.c]), mesh: mesh.name }); }
  return list;
});
const free = (a, d) => { const [x, n] = room.toWorld(a, d); return environment.isFree(x, -n); };

test('every collision box in the venue has drawn geometry inside it', () => {
  const empty = room.obstacles.filter((o, index) => {
    const f = room.fixtures[index], box = new THREE.Box3(new THREE.Vector3(o.a0, f.y + .05, -o.d1), new THREE.Vector3(o.a1, Math.min(f.y + f.h, 2), -o.d0));
    return !triangles.some(item => item.box.intersectsBox(box) && item.t.intersectsBox(box));
  }).map((o, index) => room.fixtures[room.obstacles.indexOf(o)].kind);
  assert.deepEqual(empty, []);
});

test('nothing drawn at body height stands inside the floor a body can walk', () => {
  const intrusions = [];
  for (let a = room.aMin + .4; a <= room.aMax - .4; a += .25) for (let d = .5; d <= room.depth - .4; d += .25) {
    if (!free(a, d)) continue;
    const body = new THREE.Box3(new THREE.Vector3(a - .3, .15, -d - .3), new THREE.Vector3(a + .3, 1.9, -d + .3));
    const hit = triangles.find(item => item.box.intersectsBox(body) && item.t.intersectsBox(body) && !/chain-link|ceiling|glow|neon/.test(item.mesh));
    if (hit) intrusions.push(`${a.toFixed(2)},${d.toFixed(2)} ${hit.mesh}`);
  }
  assert.deepEqual(intrusions, []);
});

test('each throwing box and the darts area are open floor inside the venue', () => {
  for (const lane of AXE_LANES) for (const a of lane.box.a) for (const d of lane.box.d) {
    assert.ok(free(a, d), `${lane.id} box corner ${a},${d} is walkable`);
    assert.equal(atAxeLane([a, d]), lane.id);
  }
  for (const a of AXE_ROOM_DARTS.area.a) for (const d of AXE_ROOM_DARTS.area.d) { assert.ok(free(a, d), `darts corner ${a},${d}`); assert.ok(atAxeRoomDarts([a, d])); }
  assert.equal(atAxeLane([0, 2]), null, 'the doorway is not a lane');
});

test('the venue build shows stuck axes and darts, and disposes cleanly', () => {
  const lanes = group.userData.axeLanes;
  lanes[AXE_LANES[0].id].show([{ point: [0, 0], stuck: true }, { point: [50, 60], stuck: false }, { point: [-235, 235], stuck: true }]);
  assert.equal(lanes[AXE_LANES[0].id].count(), 2, 'bounced axes are not shown');
  group.userData.venueDarts.show([[0, 0], [10, 20]]);
  assert.equal(group.userData.venueDarts.count(), 2);
  group.userData.dispose();
  assert.equal(group.children.length, 0);
});
