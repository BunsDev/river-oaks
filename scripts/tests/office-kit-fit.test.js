import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkKitDesks } from '../office-kit-fit.mjs';

// Synthetic kits only: these footprints are test geometry, not the supplied kit or final art.
const contract = JSON.parse(readFileSync(new URL('../../docs/design/office-ipic/layout-contract.json', import.meta.url)));
const routes = contract.places.find(place => place.id === 'office-penthouse-proposed').routes;
const stations = [
  { id: 'desk-executive', x: -3, d: 8 }, { id: 'desk-a1', x: 3.65, d: 7 }, { id: 'desk-a2', x: 6.35, d: 7 },
  { id: 'desk-b1', x: 3.65, d: 12 }, { id: 'desk-b2', x: 6.35, d: 12 },
];
const desk = (id, x0, x1, d0, d1) => ({ id, x0, x1, d0, d1, y0: 0, y1: 0.76 });
const narrow = () => [desk('exec', -4, -2, 7.4, 8.6), desk('row-a', 2.9, 7.1, 6.6, 7.4), desk('row-b', 2.9, 7.1, 11.6, 12.4)];

test('narrow synthetic desks behind each chair pass: approaches clear, every route walkable with other seats taken', () => {
  const report = checkKitDesks({ stations, colliders: [...narrow(), desk('station-chair', 3.3, 4, 5.2, 6)] }, routes);
  assert.deepEqual(report.problems, []);
  assert.equal(report.desks.length, 5);
  assert.ok(report.desks.every(item => item.ok && item.approachClearanceM >= 0.888));
  assert.ok(report.routes.length >= 8 && report.routes.every(item => item.ok));
});

test('a desk that crowds its approach, a missing desk, and a desk that closes the routes are each named', () => {
  const crowd = checkKitDesks({ stations, colliders: [desk('exec', -4, -2, 4.8, 8.6), ...narrow().slice(1)] }, routes);
  assert.ok(crowd.problems.some(problem => problem.startsWith('desk-executive: exec leaves its approach')), crowd.problems.join('\n'));
  const missing = checkKitDesks({ stations: stations.slice(1), colliders: narrow() }, routes);
  assert.ok(missing.problems.includes('desk-executive: no desk collider at the kit\'s desk centre'));
  // A wall-to-wall desk row across the main floor leaves nothing walkable past it.
  const wall = checkKitDesks({ stations, colliders: [desk('exec', -15, 15, 7.4, 8.6), ...narrow().slice(1)] }, routes);
  assert.ok(wall.problems.some(problem => problem.includes('is not walkable')), wall.problems.join('\n'));
  assert.equal(wall.ok, false);
});
