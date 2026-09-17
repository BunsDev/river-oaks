import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { localToScene, buildingTransform, routeSegments, sampleRoute, parcelSegments, terrainHeight } from '../src/geometry.js';

test('east, north, and altitude map to east, up, and south scene axes', () => {
  assert.deepEqual(localToScene([20, 30, 7]), [20, 7, -30]);
  assert.deepEqual(localToScene([20, 30]), [20, 0, -30]);
});

test('building mass sits on its ground height and positive yaw points its east axis north', () => {
  const result = buildingTransform({ center: [12, 21, 5], size: [10, 8, 6], yaw_deg: 90 });
  assert.deepEqual(result.position, [12, 8, -21]);
  assert.deepEqual(result.scale, [10, 6, 8]);
  const east = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), result.rotationY);
  assert.ok(Math.abs(east.x) < 1e-10);
  assert.ok(Math.abs(east.z + 1) < 1e-10);
});

test('parcel line segments retain the exterior and holes without connecting rings', () => {
  const segments = parcelSegments({ ring: [[0, 0], [10, 0], [10, 10], [0, 0]], holes: [[[2, 2], [3, 2], [3, 3], [2, 2]]] });
  assert.equal(segments.length, 6);
  assert.deepEqual(segments[3], [[2, 2], [3, 2]]);
});

test('route travel interpolates through corners and wraps without leaving its polyline', () => {
  const route = routeSegments([[0, 0, 2], [10, 0, 2], [10, 10, 4]]);
  assert.deepEqual(sampleRoute(route, 5), { position: [5, 2, 0], direction: [1, 0] });
  const corner = sampleRoute(route, 15);
  assert.deepEqual(corner.position, [10, 3, -5]);
  assert.deepEqual(corner.direction, [0, -1]);
  assert.deepEqual(sampleRoute(route, 25), sampleRoute(route, 5));
});

test('empty and repeated road points never produce nonfinite movement', () => {
  assert.equal(routeSegments([[1, 2, 0], [1, 2, 0]]), null);
  assert.equal(routeSegments([]), null);
  const route = routeSegments([[0, 0, 0], [0, 0, 0], [10, 0, 0]]);
  assert.deepEqual(sampleRoute(route, -5).position, [5, 0, 0]);
});

test('terrain samples the south-first grid bilinearly and clamps boundary spillover', () => {
  const terrain = { grid_origin_m: [100, 200], spacing_m: [10, 20], width: 2, height: 2, heights_m: [2, 4, 6, 8] };
  assert.equal(terrainHeight(terrain, 105, 210), 5);
  assert.equal(terrainHeight(terrain, 100, 220), 6);
  assert.equal(terrainHeight(terrain, 130, 200), 4);
  assert.equal(terrainHeight(null, 0, 0), 0);
});
