import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkingEnvironment } from '../src/walking.js';

// Collision obstacles are looked up by 8 m buckets over their bounds (walking.js). These
// rings sit across bucket edges on both sides of zero, so a point just inside each edge and
// a point just outside it each land in a different bucket from most of the obstacle.
const square = (x, y, half) => [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half], [x - half, y - half]];
const world = {
  bounds_m: [-200, -200, 200, 200], buildings: [], terrain: null,
  collisionPolygons: [square(0, 0, 3), square(-8, -16, 1.2), square(23.9, 8.1, 4.1), square(-40, 40, .4), square(100, -100, 30)],
};

test('a point inside any obstacle, in any bucket it spans, is blocked; just outside it is free', () => {
  const environment = createWalkingEnvironment(world), free = (x, y) => environment.isFree(x, -y);
  for (const ring of world.collisionPolygons) {
    const [x0, y0] = ring[0], [x1, , ] = ring[1], [, y2] = ring[2], cx = (x0 + x1) / 2, cy = (y0 + y2) / 2, half = (x1 - x0) / 2;
    // The centre, the corners just inside, and points on every side within the 0.35 m walking radius.
    for (const [x, y] of [[cx, cy], [x0 + .01, y0 + .01], [x1 - .01, y2 - .01], [x0 - .3, cy], [x1 + .3, cy], [cx, y0 - .3], [cx, y2 + .3]]) assert.equal(free(x, y), false, `blocked at ${x}, ${y}`);
    // Clear of the ring by more than the radius, in every direction.
    for (const [x, y] of [[x0 - .5, cy], [x1 + .5, cy], [cx, y0 - .5], [cx, y2 + .5]]) assert.equal(free(x, y), true, `free at ${x}, ${y} beside a ${half * 2} m obstacle`);
  }
  // Open ground between obstacles and on exact bucket lines is free.
  for (const [x, y] of [[8, 8], [-8, 8], [16, -16], [-24, -24], [0, 64]]) assert.equal(free(x, y), true, `${x}, ${y}`);
});

test('a large obstacle spanning many buckets blocks its whole interior', () => {
  const environment = createWalkingEnvironment(world);
  for (let x = 71; x <= 129; x += 2.9) for (let y = -129; y <= -71; y += 2.9) assert.equal(environment.isFree(x, -y), false, `${x}, ${y}`);
});

test('the walking radius beyond a ring reaches into the next bucket', () => {
  // Ring edges 0.1 m short of the bucket lines at x 8 and z 8 (north -8): a point just across
  // the line is in another bucket from the ring itself, yet within the 0.35 m radius of it.
  const edge = { ...world, collisionPolygons: [square(4, -4, 3.9)] };
  const environment = createWalkingEnvironment(edge), free = (x, y) => environment.isFree(x, -y);
  assert.equal(free(8.1, -4), false, 'east of the x 8 line, within the radius');
  assert.equal(free(4, -8.1), false, 'south of the z 8 line, within the radius');
  assert.equal(free(8.3, -4), true, 'beyond the radius');
  assert.equal(free(4, -8.3), true);
});

test('an enormous or unbounded ring indexes quickly and still blocks', () => {
  const huge = { ...world, collisionPolygons: [square(0, 0, 1e7), [[-Infinity, -1], [Infinity, -1], [Infinity, 1], [-Infinity, 1]]] };
  const started = performance.now(), environment = createWalkingEnvironment(huge);
  assert.ok(performance.now() - started < 1000, 'buckets stay within the world bounds');
  assert.equal(environment.isFree(50, 50), false);
});
