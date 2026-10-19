import test from 'node:test';
import assert from 'node:assert/strict';
import { flightPoint } from '../src/board-flight.js';

test('a thrown dart or axe leaves the hand, arcs and shrinks onto its landing', () => {
  const from = [100, 400], to = [160, 120];
  assert.deepEqual(flightPoint(from, to, 0), { x: 100, y: 400, r: 10 });
  assert.deepEqual(flightPoint(from, to, 1), { x: 160, y: 120, r: 4 });
  const mid = flightPoint(from, to, 0.5);
  assert.equal(mid.x, 130); assert.equal(mid.y, 260 - 40, 'lifted above the straight line at the middle');
  assert.ok(mid.r < 10 && mid.r > 4);
  assert.deepEqual(flightPoint(from, to, 2), flightPoint(from, to, 1), 'clamped past the end');
});
