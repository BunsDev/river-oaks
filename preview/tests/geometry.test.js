import test from 'node:test';
import assert from 'node:assert/strict';
import { localToScene, routeSegments, sampleRoute, terrainHeight } from '../src/geometry.js';

test('east, north, and altitude map to east, up, and south scene axes', () => {
  assert.deepEqual(localToScene([20, 30, 7]), [20, 7, -30]);
  assert.deepEqual(localToScene([20, 30]), [20, 0, -30]);
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
