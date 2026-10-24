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

// The controller against a fake walking model and town: taking a bike mounts
// the rider, a server correction that drops the transport forgets the ride
// (no ghost bike), and stepping off travels first, then hands the slot back.
import * as THREE from 'three';
import { createPlazaBicycle } from '../src/plaza-bicycle.js';
import { stopHeldMovement } from '../src/held-movement.js';

function harness() {
  const scene = new THREE.Group();
  const listeners = new Map();
  const host = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: () => listeners.clear() };
  const approach = slots[1].approach;
  const walking = {
    environment, riding: false, notices: [], mounted: null, dismounted: null,
    getPose() { return { position: [approach[0], 0, -approach[1]], riding: this.mounted?.pose ?? null, sitting: null, flying: false, roomId: null }; },
    mount(controller) { this.mounted = controller; this.riding = true; return true; },
    dismount(position) { this.dismounted = position; this.mounted?.stop(); this.mounted = null; this.riding = false; },
    setYaw() {}, notify(text) { this.notices.push(text); }, applyServerPose(player) { this.applied = player; },
    // What applyServerPose does on a correction: the transport is dropped first.
    correct() { this.mounted?.stop(); this.mounted = null; this.riding = false; },
  };
  const sent = [];
  const multiplayer = {
    connected: true, snapshot: { cycling: { taken: [] } },
    async command(message) { sent.push(message); return { ok: true, player: message.type === 'cycle' ? { position: [slots[1].x, slots[1].north, 0], vehicle: 'bicycle' } : undefined }; },
    async travel(target) { sent.push({ type: 'travel', ...target }); walking.correct(); return { ok: true, player: { position: [target.position[0], target.position[1], 0] } }; },
  };
  const bicycle = createPlazaBicycle({ scene, host, walking, getMultiplayer: () => multiplayer, getLocals: () => [] });
  bicycle.load(district);
  const bike = scene.children[0];
  return { bicycle, walking, multiplayer, sent, bike, press: event => listeners.get('keydown')(event) };
}

test('taking a bike mounts the rider on the slot and a server correction forgets the ride', async () => {
  const h = harness();
  assert.equal(h.bicycle.prompt().kind, 'take-bike');
  assert.equal(await h.bicycle.take(), true);
  assert.deepEqual(h.sent, [{ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 }]);
  assert.equal(h.bicycle.riding, true); assert.equal(h.bicycle.slotId, 'plaza-salon-rack:1'); assert.equal(h.bike.visible, true);
  assert.equal(h.walking.applied?.vehicle, 'bicycle', 'the server pose is applied before mounting');
  assert.equal(h.bicycle.prompt().kind, 'step-off');
  h.walking.correct(); h.bicycle.sync();
  assert.equal(h.bicycle.riding, false); assert.equal(h.bicycle.slotId, null); assert.equal(h.bike.visible, false, 'no ghost bike after a correction');
});

test('stepping off travels to a ground spot, then hands the slot back', async () => {
  const h = harness();
  await h.bicycle.take();
  // Two seconds of pedalling at 20 steps a second (stepCarriage caps each step at 80 ms).
  for (let i = 0; i < 40; i++) h.walking.mounted.step({ forward: 1 }, 1 / 20);
  assert.ok(h.bicycle.rideMeters > 2, `pedalling moves the bike (${h.bicycle.rideMeters.toFixed(2)} m)`);
  assert.equal(await h.bicycle.stepOff(), true);
  assert.equal(h.sent.at(-2).type, 'travel'); assert.equal(h.sent.at(-1).type, 'uncycle');
  assert.ok(h.bicycle.lastRideMeters > 2); assert.equal(h.bicycle.riding, false); assert.equal(h.bike.visible, false); assert.equal(h.bicycle.slotId, null);
  assert.equal(h.bicycle.prompt().kind, 'take-bike', 'back on foot beside the rack');
});

test('background release brakes the mounted bicycle until a fresh pedal input', async () => {
  const h = harness(); await h.bicycle.take();
  const ride = h.walking.mounted;
  for (let i = 0; i < 20; i++) ride.step({ forward: 1 }, 1 / 60);
  stopHeldMovement(null, null, ride);
  const position = h.bike.position.toArray();
  for (let i = 0; i < 20; i++) ride.step({}, 1 / 60);
  assert.deepEqual(h.bike.position.toArray(), position);
  for (let i = 0; i < 20; i++) ride.step({ forward: 1 }, 1 / 60);
  assert.notDeepEqual(h.bike.position.toArray(), position);
});

test('G ignores typing in a field and acts only when a bike is in play', async () => {
  const h = harness();
  const press = target => { const event = { code: 'KeyG', repeat: false, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target, preventDefault() { event.defaultPrevented = true; } }; h.press(event); return event; };
  const field = press({ closest: selector => selector.includes('input') ? {} : null, ownerDocument: null });
  assert.equal(field.defaultPrevented, false, 'typing g in a field is not a bike action');
  const paving = press({ closest: () => null, ownerDocument: null });
  assert.equal(paving.defaultPrevented, true, 'beside the rack, G takes a bike');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.bicycle.riding, true);
});

test('a refused step-off that still corrected the rider leaves no ghost bike', async () => {
  const h = harness();
  await h.bicycle.take();
  // The town refuses the exit spot but its correction has already dropped the transport.
  h.multiplayer.travel = async () => { h.walking.correct(); return { ok: false, message: 'blocked' }; };
  assert.equal(await h.bicycle.stepOff(), false);
  assert.equal(h.bicycle.riding, false); assert.equal(h.bike.visible, false); assert.equal(h.bicycle.slotId, null);
});
