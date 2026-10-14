import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { interiorLevelRoomsFor, storeRoomsFor } from '../src/store-rooms.js';
import { generatedVerticalRoute } from '../src/generated-vertical-route.js';
import { createWalkingEnvironment } from '../src/walking.js';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)));
const plan = read('building-interiors/river-oaks-gallery-v2.json');
const world = { ...read('district.json'), buildingInteriors: [plan] };
const ground = storeRoomsFor(world).find(room => room.planId === plan.levels[0].id);
const upper = interiorLevelRoomsFor(world, plan.levels[1].id)[0];
const contains = (panel, a, d) => Math.abs(a - panel.a) < panel.width / 2 && Math.abs(d - panel.d) < panel.depth / 2;

test('approved gallery shaft opens the lower ceiling while preserving both authoritative landing floors', () => {
  const below = generatedVerticalRoute(ground), above = generatedVerticalRoute(upper);
  assert.equal(below.above, true);
  assert.equal(above.above, false);
  assert.deepEqual([below.a0, below.a1, below.d0, below.d1], [above.a0, above.a1, above.d0, above.d1]);
  const area = panels => panels.reduce((sum, panel) => sum + panel.width * panel.depth, 0);
  const roomArea = ground.width * (ground.depth - ground.frontInset);
  assert.ok(Math.abs(area(below.ceilingPanels) - (roomArea - (below.a1 - below.a0) * (below.d1 - below.d0))) < 1e-6);
  assert.ok(Math.abs(area(above.ceilingPanels) - roomArea) < 1e-6);
  for (const room of [ground, upper]) {
    const route = generatedVerticalRoute(room);
    const portal = room.generatedPlan.portals.find(item => item.kind === 'stairs');
    const [a, d] = room.toLocal(...portal.position);
    assert.ok(contains(route.platform, a, d));
    const environment = createWalkingEnvironment(world, [], room.generatedPlan.index ? room.planId : null);
    assert.equal(environment.isFree(portal.position[0], -portal.position[1]), true);
    assert.equal(environment.groundAt(portal.position[0], -portal.position[1]), room.floor);
  }
  const [a, d] = ground.toLocal(...ground.generatedPlan.portals.find(item => item.kind === 'stairs').position);
  assert.ok(below.ceilingPanels.every(panel => !contains(panel, a, d)), 'the lower shaft remains open above the portal');
});

test('a shifted shaft or portal fails before a misleading visual route is built', () => {
  const wrong = { ...ground, generatedPlan: structuredClone(ground.generatedPlan) };
  wrong.generatedPlan.layers.shell[0].stairOpening = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.throws(() => generatedVerticalRoute(wrong), /shaft/);
  assert.equal(generatedVerticalRoute({ generatedPlan: null }), null);
});
