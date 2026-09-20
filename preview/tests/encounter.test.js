import test from 'node:test';
import assert from 'node:assert/strict';
import { clearEncounterLine, encounterPosition } from '../src/encounter.js';

const person = { id: 'person', position: [0, 0, 0] };
const open = { isFree: () => true };
test('comfortable encounters preserve the visitor position', () => {
  const visitor = [0, -2.5, 1.68];
  assert.equal(encounterPosition(open, person, visitor), visitor);
});
test('approach clears foreground residents and does not enter buildings', () => {
  const environment = { isFree: (x, z) => x > -0.5 && z > -0.5 };
  const crowd = [{ id: 'other', position: [0, -1.3, 0] }];
  const result = encounterPosition(environment, person, [0, -5, 1.68], crowd);
  assert.ok(result);
  assert.ok(clearEncounterLine(environment, result, person.position));
  assert.ok(Math.abs(result[0]) > 1, 'moves away from the crowded direct approach');
  assert.ok(Math.hypot(result[0], result[1]) <= 3.5);
});
test('blocked sightlines cannot produce a remote fallback or talk through a wall', () => {
  const blocked = { isFree: (x, z) => Math.abs(z - 1) > 0.25 };
  assert.equal(clearEncounterLine(blocked, [0, -2.5], [0, 0]), false);
  assert.equal(encounterPosition({ isFree: () => false }, person, [0, -2.5, 0]), null);
  assert.equal(encounterPosition(open, { position: [NaN, 0, 0] }, null), null);
});

test('every bundled district resident has a clear personal-space approach', async () => {
  const { readFileSync } = await import('node:fs');
  const { createWalkingEnvironment } = await import('../src/walking.js');
  const { createCommunity } = await import('../src/community.js');
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  const environment = createWalkingEnvironment(world), locals = createCommunity(world).locals;
  for (const local of locals) {
    const position = encounterPosition(environment, local, world.walkSpawn, locals);
    assert.ok(position, `${local.name} has a clear approach`);
    assert.ok(clearEncounterLine(environment, position, local.position));
  }
});
