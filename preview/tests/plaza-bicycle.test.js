import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bicyclePlacement, bicycleCanOccupy, nearestFreeSlot } from '../src/plaza-bicycle.js';
import { plazaSalonRack } from '../src/plaza-salon-plan.js';
import { createWalkingEnvironment } from '../src/walking.js';

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(district);
const slots = plazaSalonRack(district);

test('a slot becomes a scene placement that faces the way the bike points', () => {
  const placement = bicyclePlacement(slots[0], environment);
  assert.equal(placement.vehicle, 'bicycle');
  assert.deepEqual([placement.position[0], placement.position[2]], [slots[0].x, -slots[0].north]);
  assert.ok(Math.abs(placement.position[1] - environment.groundAt(slots[0].x, -slots[0].north)) < 1e-9);
  assert.equal(placement.speed, 0); assert.equal(placement.distance, 0);
  // Heading 0 is south (+Z). The mesh faces local -X, and stepCarriage moves along (-cos yaw, +sin yaw).
  assert.ok(Math.abs(placement.yaw - Math.PI / 2) < 1e-9);
});

test('a bike may stand on open paving but not inside a shop', () => {
  const placement = bicyclePlacement(slots[0], environment);
  assert.equal(bicycleCanOccupy(placement, environment), true, 'a parked bike is clear of its own rack');
  // Facing the bar from the slot, a bike one frame-length north would hit it.
  assert.equal(bicycleCanOccupy({ ...placement, position: [placement.position[0], placement.position[1], placement.position[2] - 0.8] }, environment), false);
  // A point inside the Dior boutique (north of the plaza) is a room.
  const inside = { ...placement, position: [-2784.7, 0, 1288.5] };
  assert.ok(environment.roomAt(-2784.7, 1288.5), 'the probe point is indoors');
  assert.equal(bicycleCanOccupy(inside, environment), false);
});

test('the nearest free slot in reach is offered, taken ones are skipped', () => {
  // Just west of slot 1's approach, so slot 0 is nearer than slot 2.
  const me = [slots[1].approach[0] - 0.1, slots[1].approach[1]];
  assert.equal(nearestFreeSlot(slots, me, new Set()).id, 'plaza-salon-rack:1');
  assert.equal(nearestFreeSlot(slots, me, new Set(['plaza-salon-rack:1'])).id, 'plaza-salon-rack:0');
  assert.equal(nearestFreeSlot(slots, [me[0], me[1] - 20], new Set()), null);
});
