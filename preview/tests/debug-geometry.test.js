import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { colliderSegments, colliderWalls, describeObject, heaviestMeshes, objectPath, ringToScene, roadSegments, roofRings, roomRings, storeMarkers, triangleCount, walkableSamples } from '../src/debug-geometry.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { storeRoomsFor } from '../src/store-rooms.js';

const flat = () => 2;
const points = values => { const out = []; for (let i = 0; i < values.length; i += 3) out.push(values.slice(i, i + 3)); return out; };

test('collider fences stand on the ground under each mapped corner', () => {
  const ring = ringToScene([[0, 0], [4, 0], [4, 3]]);
  assert.deepEqual(ring, [[0, -0], [4, -0], [4, -3]], 'north becomes -z');
  const lines = points(colliderSegments([ring], (x) => x, 3));
  assert.equal(lines.length, 3 * 3 * 2, 'base, top and a post per edge');
  for (const [x, y] of lines) assert.ok(y === x + 0.05 || y === x + 3, 'every vertex follows its own ground height');
  assert.equal(colliderWalls([ring], flat, 3).length / 9, 6, 'two triangles per edge');
});

test('the walkable grid agrees with the walking model it samples', () => {
  const environment = { isFree: (x) => x < 0, groundAt: () => 5 };
  const grid = walkableSamples(environment, 0, 0, 2, 1);
  assert.equal(grid.free + grid.blocked, 25);
  assert.equal(grid.free, 10, 'x = -2 and -1 columns are free');
  const cloud = points(grid.positions), colours = points(grid.colors);
  cloud.forEach(([x, y], i) => { assert.equal(y, 5.04); assert.deepEqual(colours[i], x < 0 ? [0.25, 0.9, 0.4] : [1, 0.25, 0.2]); });
});

test('the district overlays line up with the data the game uses', () => {
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const environment = createWalkingEnvironment(world);
  // Points on the drawn fences are blocked by the walking model, apart from mapped doorways.
  let onEdge = 0, blocked = 0;
  for (const ring of world.collisionPolygons.map(ringToScene)) for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    for (const t of [0.25, 0.5, 0.75]) { onEdge++; if (!environment.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) blocked++; }
  }
  assert.ok(blocked / onEdge > 0.9, `fences match the model (${blocked}/${onEdge} edge samples blocked)`);
  const { centre, edges } = roadSegments(world.roads, flat);
  assert.equal(edges.length, centre.length * 2);
  const road = world.roads[0], [e, n] = road.points[0];
  assert.deepEqual(centre.slice(0, 3), [e, 2, -n]);
  const markers = points(storeMarkers(world.stores, flat));
  assert.ok(markers.length >= world.stores.length * 4);
  const roofs = roofRings(world, () => 0);
  assert.ok(roofs.length > 0 && roofs.every(roof => roof.top > 3.1 && roof.ring.length >= 3));
  const rooms = roomRings(storeRoomsFor(world));
  assert.ok(rooms.some(item => item.kind === 'room') && rooms.some(item => item.kind === 'obstacle'));
  // A drawn room obstacle is blocked in the walking model at its centre.
  const room = storeRoomsFor(world).find(item => item.obstacles.length), o = room.obstacles[0];
  const [ce, cn] = room.toWorld((o.a0 + o.a1) / 2, (o.d0 + o.d1) / 2);
  assert.equal(environment.isFree(ce, -cn), false, 'a drawn fixture is where the model blocks');
});

test('the polygon inspector counts triangles, instances and names', () => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'granite' }));
  box.name = 'Kerb';
  const group = new THREE.Group(); group.name = 'Street furniture'; group.add(box);
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 8), new THREE.MeshBasicMaterial(), 30); lamps.name = 'Lamps';
  group.add(lamps);
  assert.equal(triangleCount(box.geometry), 12);
  assert.equal(objectPath(box), 'Street furniture › Kerb');
  const info = describeObject(lamps, 4);
  assert.equal(info.instances, 30); assert.equal(info.drawnTriangles, info.triangles * 30); assert.equal(info.instanceId, 4);
  assert.deepEqual(describeObject(box).materials, ['granite']);
  assert.deepEqual(heaviestMeshes(group).map(row => row.name), ['Lamps', 'Kerb']);
  const partial = new THREE.BufferGeometry(); partial.setAttribute('position', new THREE.Float32BufferAttribute(new Array(27).fill(0), 3)); partial.setDrawRange(0, 6);
  assert.equal(triangleCount(partial), 2, 'the draw range limits what is drawn');
});
