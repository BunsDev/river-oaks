import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkKitDesks } from '../office-kit-fit.mjs';

// Synthetic kits only: invented desk centres and footprints, not the supplied kit and not final art.
const contract = JSON.parse(readFileSync(new URL('../../docs/design/office-ipic/layout-contract.json', import.meta.url)));
const routes = contract.places.find(place => place.id === 'office-penthouse-proposed').routes;
const stations = [
  { id: 'desk-executive', x: -3, d: 7.45 }, { id: 'desk-a1', x: 3.65, d: 6.5 }, { id: 'desk-a2', x: 6.35, d: 6.5 },
  { id: 'desk-b1', x: 3.65, d: 11.5 }, { id: 'desk-b2', x: 6.35, d: 11.5 },
];
const desk = (id, x0, x1, d0, d1, y1 = 0.74) => ({ id, x0, x1, d0, d1, y0: 0, y1 });
const narrow = () => [desk('exec', -4, -2, 7.1, 7.8), desk('row-a', 2.9, 7.1, 6.2, 6.8), desk('row-b', 2.9, 7.1, 11.2, 11.8)];

test('narrow synthetic desks behind each chair pass: approaches clear, chairs clear, every route walkable with other seats taken', () => {
  const report = checkKitDesks({ stations, colliders: [...narrow(), desk('station-chair', 3.3, 4, 5.2, 6, 1.1), desk('planter', 9.3, 9.9, 1, 1.6, 1)] }, routes);
  assert.deepEqual(report.problems, []);
  assert.equal(report.desks.length, 5);
  assert.ok(report.desks.every(item => item.ok && item.approachClearanceM >= 0.888));
  assert.ok(report.routes.length >= 8 && report.routes.every(item => item.ok));
  assert.deepEqual(report.unchecked, ['station-chair', 'planter'], 'other floor colliders are listed, not silently trusted');
});

test('a crowded approach, a missing desk, a route-closing desk, a desk over a chair and a desk without a height are each named', () => {
  const crowd = checkKitDesks({ stations, colliders: [desk('exec', -4, -2, 4.8, 7.8), ...narrow().slice(1)] }, routes);
  assert.ok(crowd.problems.some(problem => problem.startsWith('desk-executive: exec leaves its approach')), crowd.problems.join('\n'));
  const missing = checkKitDesks({ stations: stations.slice(1), colliders: narrow() }, routes);
  assert.ok(missing.problems.includes('desk-executive: no desk collider at the kit\'s desk centre'));
  const wall = checkKitDesks({ stations, colliders: [desk('exec', -15, 15, 7.1, 7.8), ...narrow().slice(1)] }, routes);
  assert.ok(wall.problems.some(problem => problem.includes('is not walkable')), wall.problems.join('\n'));
  assert.equal(wall.ok, false);
  // Independent review: a desk spanning another station's chair, and one running into its own chair.
  const overChair = checkKitDesks({ stations, colliders: [desk('exec', -4, -2, 7.1, 7.8), desk('row-a', -3.4, 7.1, 6.15, 6.8), narrow()[2]] }, routes);
  assert.ok(overChair.problems.some(problem => problem.includes('desk-executive-chair')), overChair.problems.join('\n'));
  const intoOwn = checkKitDesks({ stations, colliders: [desk('exec', -4, -2, 6.56, 7.8), ...narrow().slice(1)] }, routes);
  assert.ok(intoOwn.problems.some(problem => problem.includes('exec') && problem.includes('desk-executive-chair')), intoOwn.problems.join('\n'));
  const noHeight = checkKitDesks({ stations, colliders: [{ ...narrow()[0], y1: undefined }, ...narrow().slice(1)] }, routes);
  assert.ok(noHeight.problems.some(problem => problem.startsWith('desk-executive: exec') && problem.includes('height')), noHeight.problems.join('\n'));
});

test('the penthouse plan\'s own imported desks pass the same rules, every route walkable with the other seats taken', async () => {
  const { OFFICE_LAYOUT_PENTHOUSE, officeLayout } = await import('../../preview/src/office-layouts.js');
  const plan = officeLayout(OFFICE_LAYOUT_PENTHOUSE), desks = plan.levels.find(level => level.id === 'jevica-office/l0').obstacles.filter(o => o.kind === 'desk');
  assert.equal(desks.length, 3, 'the R19 import is in the plan');
  // Present the plan's desks as a kit would: each station's desk centre and the desk colliders.
  const centre = desk => [(desk.x0 + desk.x1) / 2, (desk.d0 + desk.d1) / 2];
  const own = plan.anchors.filter(item => item.kind === 'approach').map(item => {
    const desk = desks.find(box => item.seat[0] >= box.x0 && item.seat[0] <= box.x1 && box.d0 > item.seat[1]);
    return { id: item.id, x: item.seat[0], d: centre(desk)[1] };
  });
  const report = checkKitDesks({ stations: own, colliders: desks.map(({ id, x0, x1, d0, d1, height }) => ({ id, x0, x1, d0, d1, y0: 0, y1: height })) }, routes);
  assert.deepEqual(report.problems, []);
  assert.ok(report.routes.length >= 8 && report.routes.every(item => item.ok));
});

