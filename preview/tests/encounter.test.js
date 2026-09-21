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

test('anyone within talking range with a clear line keeps the visitor in place', () => {
  for (const north of [-1.0, -1.2, -4.4]) {
    const visitor = [0, north, 1.68];
    assert.equal(encounterPosition(open, person, visitor), visitor, `stays put at ${-north} m`);
  }
  for (const north of [-0.5, -4.6]) {
    const result = encounterPosition(open, person, [0, north, 1.68]);
    assert.ok(result && Math.hypot(result[0], result[1]) >= 1.8 && Math.hypot(result[0], result[1]) <= 3.5, `relocates from ${-north} m`);
  }
});

test('a resident on a doorway threshold never draws the visitor through the facade', () => {
  // A boutique occupies north >= 0 with its door corridor open to the street south of it.
  const room = { toLocal: (east, north) => [east, north] };
  const withStore = { isFree: () => true, roomAt: (x, z) => (-z > -1.4 && Math.abs(x) < 0.85) || -z > 0 ? room : null };
  const threshold = { id: 'greeter', position: [0, -0.9, 0] };
  const result = encounterPosition(withStore, threshold, [0, -6, 1.68]);
  assert.ok(result, 'a street-side place exists');
  assert.ok(result[1] <= 0, `stays on the pavement, got north=${result[1]}`);
  const insideVisitor = encounterPosition(withStore, threshold, [0, 2, 1.68]);
  assert.ok(insideVisitor && insideVisitor[1] > 0, 'a visitor already inside meets them from inside');
});
