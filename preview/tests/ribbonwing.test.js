import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  RIBBONWING_PALETTE, RIBBONWING_DIMENSIONS, WING_PLANFORM, FANS, THRUSTERS, PETALS, SEATS, FEET, STEPS, MECHANISMS,
  ATTACHMENTS, LODS, COLLIDERS, canopyHeightAt, halfSpan, hullSamples, wingHeightAt,
} from '../src/ribbonwing-design.js';
import { createRibbonwingRig, ribbonwingTargets, GEAR_DOWN_BELOW, GEAR_UP_ABOVE } from '../src/ribbonwing-rig.js';
import { createRibbonwing, createRibbonwingVehicle } from '../src/ribbonwing.js';
import { VEHICLES } from '../src/vehicle-config.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
// Distance from a point to the planform outline (left wing, x/z plane).
const edgeDistance = ([px, pz]) => {
  let best = Infinity;
  for (let i = 0; i < WING_PLANFORM.length; i++) {
    const [ax, az] = WING_PLANFORM[i], [bx, bz] = WING_PLANFORM[(i + 1) % WING_PLANFORM.length], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(ax + t * dx - px, az + t * dz - pz));
  }
  return best;
};
const leadingEdgeAt = z => {
  for (let i = 0; i < 8; i++) { const [ax, az] = WING_PLANFORM[i], [bx, bz] = WING_PLANFORM[i + 1];if (z >= az && z <= bz) return ax + (bx - ax) * (z - az) / (bz - az); }
  return null;
};

test('the finalized Ribbonwing design keeps its two seats side by side, two wing fans, twin thrusters, split tail, three feet and palette', () => {
  assert.deepEqual([RIBBONWING_PALETTE.lacquer, RIBBONWING_PALETTE.ivory, RIBBONWING_PALETTE.mint, RIBBONWING_PALETTE.chrome], ['#F486A1', '#F3ECE1', '#BFE3D4', '#E3E8EC']);
  assert.equal(FANS.centres.length, 2);assert.deepEqual(FANS.centres[1], [FANS.centres[0][0], -FANS.centres[0][1]]);
  assert.equal(THRUSTERS.centres.length, 2);assert.equal(THRUSTERS.centres[0][2], -THRUSTERS.centres[1][2]);
  assert.equal(PETALS.roots.length, 2);assert.equal(PETALS.tips.length, 2);
  assert.equal(FEET.pads.length, 3);
  // Side by side: same station and height, mirrored across the centreline, pilot on the left (+Z).
  assert.equal(SEATS.pilot.root[0], SEATS.passenger.root[0]);assert.equal(SEATS.pilot.root[1], SEATS.passenger.root[1]);
  assert.ok(SEATS.pilot.root[2] > 0 && close(SEATS.pilot.root[2], -SEATS.passenger.root[2]) && SEATS.pilot.root[2] * 2 >= .6);
  // The vehicle spec the game uses is the design's.
  const spec = VEHICLES.hover;
  assert.deepEqual([spec.length, spec.width, spec.height], [RIBBONWING_DIMENSIONS.length, RIBBONWING_DIMENSIONS.span, RIBBONWING_DIMENSIONS.height]);
  assert.deepEqual(spec.driverSeat, SEATS.pilot.root);assert.deepEqual(spec.passengerSeat, SEATS.passenger.root);
  assert.deepEqual(spec.wheels.map(([x, , z]) => [x, z]), FEET.pads);
});

test('each lift fan sits inside its wing with structure around the shroud', () => {
  const [x, z] = FANS.centres[0];
  assert.ok(edgeDistance([x, z]) - FANS.shroud >= .15, `fan margin ${edgeDistance([x, z]) - FANS.shroud}`);
  assert.ok(FANS.rotor < FANS.shroud);
});

test('the boarding ladder reaches the ground clear of the wing, fans and canopy sweep', () => {
  const [hx, hy, hz] = STEPS.hinges[0], angle = MECHANISMS.steps.deployed;
  const foot = [hx, hy - STEPS.reach * Math.cos(angle), hz + STEPS.reach * Math.sin(angle)];
  assert.ok(Math.abs(foot[1]) < .06, `ladder foot height ${foot[1]}`);
  assert.ok(foot[2] > FEET.pads[1][1] - 1 && foot[2] < ATTACHMENTS['entry.left'][2] + .05);
  // The wing's leading edge stays aft of the ladder band, and the fan aft of the climber.
  for (let z = hz; z <= ATTACHMENTS['entry.left'][2] + .4; z += .05) {
    const edge = leadingEdgeAt(z);if (edge !== null) assert.ok(edge > hx + STEPS.width / 2 + .1, `leading edge ${edge} at z ${z}`);
  }
  assert.ok(FANS.centres[0][0] - FANS.shroud > hx + STEPS.width / 2 + .3);
});

test('both occupants get a metre of canopy headroom and the tuck, gear and nozzles stay inside their envelopes', () => {
  for (const seat of [SEATS.pilot, SEATS.passenger]) for (const [dx, dz] of [[0, 0], [.1, .12], [-.1, .12], [.1, -.12], [-.1, -.12]])
    assert.ok(canopyHeightAt(seat.root[0] + dx, seat.root[2] + dz) > seat.root[1] + 1);
  assert.ok(close(halfSpan(0), 2.92, .01));assert.ok(halfSpan(1) < 2 && halfSpan(1) > THRUSTERS.centres[0][2] + THRUSTERS.radius, `tucked ${halfSpan(1)}`);
  // Tucked wings stay above the pads' ground plane with the gear down.
  for (const [, y] of hullSamples({ tuck: 1 })) assert.ok(y >= RIBBONWING_DIMENSIONS.belly);
  assert.ok(MECHANISMS.nozzles.hover <= MECHANISMS.nozzles.limit && MECHANISMS.nozzles.yawLimit < .5);
  // Petal tips clear the thruster box at full nozzle pitch.
  const box = COLLIDERS.body.find(c => c.name === 'thrusters').box;
  assert.ok(PETALS.tips[0][1] > box[0][1] + box[1][1]);
  assert.ok(wingHeightAt(2.92) > wingHeightAt(.56));
});

test('the Ribbonwing rig follows accepted state with interlocked, reversible mechanisms', () => {
  const rig = createRibbonwingRig(), run = (state, seconds) => { for (let t = 0; t < seconds; t += .05) rig.step(ribbonwingTargets(state), .05);return rig.value; };
  // Boarding: the canopy opens first; the steps wait for it.
  rig.step(ribbonwingTargets({ phase: 'boarding', boarding: true }), .05);
  assert.ok(rig.value.canopy > 0 && rig.value.steps === 0);
  let v = run({ phase: 'boarding', boarding: true }, 3);assert.equal(v.canopy, 1);assert.equal(v.steps, 1);
  // Interrupted: boarding cancelled mid-stroke reverses from where it is; the
  // canopy may close only to half-open while the steps are still out.
  run({ phase: 'ready', occupied: true }, .3);const mid = rig.value;
  assert.ok(mid.steps < 1 && mid.steps > 0 && mid.canopy < 1 && mid.canopy >= .5, JSON.stringify(mid));
  for (let t = 0; t < 4; t += .05) { const w = rig.step(ribbonwingTargets({ phase: 'ready', occupied: true }), .05);assert.ok(w.steps <= .1 || w.canopy >= .5, JSON.stringify(w)); }
  v = run({ phase: 'ready', occupied: true }, 4);assert.equal(v.steps, 0);assert.equal(v.canopy, 0);
  // Aloft: gear holds in the band, retracts above it, and never retracts with the canopy open.
  assert.ok(Number.isNaN(ribbonwingTargets({ phase: 'hover', altitude: (GEAR_DOWN_BELOW + GEAR_UP_ABOVE) / 2 }).gear));
  v = run({ phase: 'hover', altitude: 4, occupied: true }, 2);assert.equal(v.gear, 1);assert.ok(v.fanRate > MECHANISMS.fans.idle);
  v = run({ phase: 'landing', altitude: 1, occupied: true }, 2);assert.equal(v.gear, 0);
  const forced = createRibbonwingRig({ canopy: 1 });forced.step({ ...ribbonwingTargets({ phase: 'hover', altitude: 5 }), canopy: 1 }, .1);
  assert.equal(forced.value.gear, 0);
  // Unpowered on the ground: fans stop; maneuvers spin to max and fly the nozzles level.
  assert.equal(ribbonwingTargets({ phase: 'parked' }).fanRate, 0);
  const stunt = ribbonwingTargets({ phase: 'maneuver', altitude: 6, tuck: 1, turn: 3 });
  assert.equal(stunt.fanRate, MECHANISMS.fans.max);assert.equal(stunt.nozzlePitch, MECHANISMS.nozzles.cruise);assert.equal(stunt.nozzleYaw, MECHANISMS.nozzles.yawLimit);
  // Hostile input stays bounded.
  const hostile = ribbonwingTargets({ phase: 'hover', altitude: NaN, tuck: Infinity, turn: NaN, speed: -1e9 });
  for (const value of Object.values(hostile)) assert.ok(Number.isFinite(value) || Number.isNaN(value));
  assert.equal(hostile.tuck, 0);assert.equal(hostile.nozzleYaw, 0);
});

test('the Ribbonwing model exposes named attachments, three LOD levels within budget, and disposes once', () => {
  const craft = createRibbonwing();
  try {
    for (const name of Object.keys(ATTACHMENTS)) {
      const node = craft.attachments.get(name);assert.ok(node, name);
      const at = new THREE.Vector3();craft.object.updateMatrixWorld(true);node.getWorldPosition(at);
      assert.ok(at.distanceTo(new THREE.Vector3(...ATTACHMENTS[name])) < 1e-6, name);
    }
    assert.deepEqual(Object.keys(craft.levels), LODS.map(l => l.name));
    const { perLevel } = craft.stats();
    assert.ok(perLevel.near.draws <= 65 && perLevel.near.triangles < 130000, JSON.stringify(perLevel.near));
    assert.ok(perLevel.medium.triangles < perLevel.near.triangles / 2 && perLevel.far.triangles < perLevel.medium.triangles / 5);
    assert.equal(craft.wheels.length, 3);
  } finally { craft.dispose(); }
  let disposals = 0;const vehicle = createRibbonwingVehicle(VEHICLES.hover);
  vehicle.object.traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => disposals++); });
  vehicle.dispose();const once = disposals;vehicle.dispose();
  assert.ok(once > 0 && disposals === once && vehicle.ribbonwing.disposed && !vehicle.object.parent);
});

test('a parked Ribbonwing blocks walkers under its wings but not ahead of them, where its steps and exits are', async () => {
  const { carriageContains } = await import('../src/carriage-parking.js');
  const placement = { vehicle: 'hover', position: [0, 0, 0], yaw: 0, scale: 1 };
  // Under the wing, at the tip, at the trailing hook, on the ladder band and at the petals: blocked.
  for (const [x, z] of [[0, 2.4], [1.3, 2.85], [1.85, -2.7], [-1.45, 1.7], [-2.5, 0], [2.5, .3]]) assert.ok(carriageContains(placement, x, 1, z, .3), `${x},${z}`);
  // Ahead of the wing beside the cockpit (the exit the journey found), beyond the tip, and behind the tail: free.
  for (const [x, z] of [[-1.9, 3.5], [-2.4, 2.4], [1.2, 3.4], [3.3, 0]]) assert.ok(!carriageContains(placement, x, 1, z, .3), `${x},${z}`);
  // The envelope covers every planform vertex, the deployed ladder foot and the tail thrusters.
  for (const [x, z] of WING_PLANFORM) assert.ok(carriageContains(placement, x, 1, z - .02, 0), `${x},${z}`);
  assert.ok(carriageContains(placement, STEPS.hinges[0][0], .2, ATTACHMENTS['entry.left'][2] - .05, 0));
  assert.ok(carriageContains(placement, THRUSTERS.centres[0][0], 1, THRUSTERS.centres[0][2] + THRUSTERS.radius, 0));
});

test('stepping out of the Ribbonwing leaves room for the follow camera, and narrow vehicles keep their exits', async () => {
  const { findCarriageExit } = await import('../src/carriage-motion.js');
  const { carriageContains } = await import('../src/carriage-parking.js');
  const open = { groundAt: () => 0, isFree: () => true, roomAt: () => null };
  for (const yaw of [0, 1.1, 4.695]) {
    const placement = { vehicle: 'hover', position: [10, 0, -4], yaw, scale: 1 }, exit = findCarriageExit(placement, open);
    assert.ok(exit && !carriageContains(placement, exit[0], 1.68, exit[2], 1.3), `${yaw}: ${exit}`);
  }
  // The rolls still steps out at the first candidate: 3 m beside the front seats.
  const rolls = { vehicle: 'rolls', position: [0, 0, 0], yaw: 0, scale: 1 };
  assert.deepEqual(findCarriageExit(rolls, open).map(v => +v.toFixed(6)), [-1.9, 0, 3]);
});
