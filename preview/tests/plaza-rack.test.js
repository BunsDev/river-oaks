import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plazaSalonRack } from '../src/plaza-salon-plan.js';

// The planters' shared planting loads its model asynchronously and reports to the page.
globalThis.document ??= { querySelector: () => null, dispatchEvent: () => true };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { buildPlazaSalon } = await import('../src/plaza-salon.js');

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));

test('the rack draws four parked bikes and hides the ones that are out', () => {
  const salon = buildPlazaSalon(district), rack = salon.userData.rack;
  assert.ok(rack, 'the salon exposes its rack');
  assert.equal(rack.slots, 4);
  assert.deepEqual(rack.parked(), [true, true, true, true]);
  assert.equal(rack.setTaken(['plaza-salon-rack:1', 'plaza-salon-rack:3']), true);
  assert.deepEqual(rack.parked(), [true, false, true, false]);
  assert.equal(rack.setTaken(['plaza-salon-rack:1', 'plaza-salon-rack:3']), false, 'no change reports false');
  assert.equal(rack.setTaken([]), true);
  assert.deepEqual(rack.parked(), [true, true, true, true]);
  const bikes = salon.getObjectByName('Parked bikes');
  assert.ok(bikes, 'parked bikes are one group');
  assert.equal(bikes.children.length, 4);
  const slot = plazaSalonRack(district)[2], bike = bikes.children[2];
  assert.ok(Math.abs(bike.position.x - slot.x) < 1e-9 && Math.abs(bike.position.z + slot.north) < 1e-9, 'a parked bike stands on its slot');
  assert.equal(salon.userData.counts.rackSlots, 4);
  rack.dispose();
});
