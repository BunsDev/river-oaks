import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ribbonCanopyVolumes, ribbonCanopyBlocks, ribbonCanopyHit, ribbonCanopyBoxHit } from '../../shared/city-kit/ribbon-canopy.js';
import { districtRibbonPlan } from '../src/ribbon-district.js';
import { buildRibbon, RIBBON_FINISH } from '../src/ribbon-finish.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { createFlightVehicle } from '../src/flight-vehicles.js';
import { FLIGHT_BUBBLE_CLEARANCE } from '../../shared/flight-bubble.js';
import { createRibbonwing } from '../src/ribbonwing.js';
import { ribbonwingCanopyBox, ribbonwingManeuverFromPilot } from '../src/ribbonwing-clearance.js';
import { maneuverPose, RIBBONWING_MANEUVERS } from '../src/ribbonwing-maneuvers.js';
import { VEHICLES } from '../src/vehicle-config.js';

const dimensions = { slab: RIBBON_FINISH.slab, edgeBeyondWalk: RIBBON_FINISH.overhang + RIBBON_FINISH.bullnose };
const simple = { modules: [{ id: 'test', from: [0, 0], to: [6, 0], yaw: 0, length: 6, width: 2.4, clearHeight: 3.6 }] };

test('finite canopy blocks both faces and retains the underpass and overflight', () => {
  const volumes = ribbonCanopyVolumes(simple, () => 0, dimensions);
  for (const y of [3.6, 3.8, 4]) assert.equal(ribbonCanopyBlocks(volumes, [3, y, 0]), true);
  for (const y of [0, 1.68, 3.5, 4.1, 20]) assert.equal(ribbonCanopyBlocks(volumes, [3, y, 0]), false);
  assert.equal(ribbonCanopyBlocks(volumes, [3, 3.8, 1.43]), true, 'rounded rim is inside the conservative envelope');
  assert.equal(ribbonCanopyBlocks(volumes, [3, 3.8, 1.6]), false, 'space beyond the rim stays clear');
  assert.equal(ribbonCanopyBlocks(volumes, [3, 3.8, 1.6], { radius: 0.35 }), true, 'the body overlaps even when its centre clears');
});

test('explicit body extents use the real bubble datum without turning the canopy into a ground-to-roof wall', () => {
  const bubble = createFlightVehicle('jevica');
  try {
    bubble.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bubble.object), extents = { above: box.max.y, below: -box.min.y, radius: Math.max(box.max.x, box.max.z) };
    assert.ok(Math.abs(FLIGHT_BUBBLE_CLEARANCE.above - extents.above) < 1e-6);
    assert.ok(Math.abs(FLIGHT_BUBBLE_CLEARANCE.below - extents.below) < 1e-6);
    assert.ok(FLIGHT_BUBBLE_CLEARANCE.radius >= extents.radius, 'authority encloses the actual mesh');
    assert.ok(extents.above > 2.4 && extents.below > 0.4, 'read actual rendered bubble bounds');
    const volumes = ribbonCanopyVolumes(simple, () => 0, dimensions);
    assert.equal(ribbonCanopyBlocks(volumes, [3, 1, 0], extents), false, 'bubble fits below');
    assert.equal(ribbonCanopyBlocks(volumes, [3, 1.3, 0], extents), true, 'bubble top reaches slab before its foot datum');
    assert.equal(ribbonCanopyBlocks(volumes, [3, 4.2, 0], extents), true, 'bubble bottom still intersects from above');
    assert.equal(ribbonCanopyBlocks(volumes, [3, 4.5, 0], extents), false, 'legal overflight');
  } finally { bubble.dispose(); }
});

test('swept flight disks clear rounded corners and catch contact between clear endpoints', () => {
  const [volume] = ribbonCanopyVolumes(simple, () => 0, dimensions);
  const volumes = [volume], clearance = { radius: 1.3, below: 0.4, above: 2.5 };
  const corner = [volume.x + volume.halfLength, 2, volume.z + volume.halfWidth];
  const beside = [corner[0] + 1.2, corner[1], corner[2] + 1.2];
  assert.equal(ribbonCanopyBlocks(volumes, beside, clearance), false);
  assert.equal(ribbonCanopyHit(volumes, beside, beside, clearance), null, 'expanded box corners are not walls');
  // Put the test on the rounded quadrant, grazing it from outside both endpoints.
  const a = [corner[0] + 1.2, 2, corner[2] + 0.6], b = [corner[0] + 0.6, 2, corner[2] + 1.2];
  assert.equal(ribbonCanopyBlocks(volumes, a, clearance), false);
  assert.equal(ribbonCanopyBlocks(volumes, b, clearance), false);
  const hit = ribbonCanopyHit(volumes, a, b, clearance);
  assert.ok(hit && hit.fraction > 0 && hit.fraction < 1);
  assert.ok(ribbonCanopyBlocks(volumes, a.map((v, i) => v + (b[i] - v) * (hit.fraction + 0.001)), clearance));
  assert.equal(ribbonCanopyHit(volumes, a.map((v, i) => i === 1 ? 8 : v), b.map((v, i) => i === 1 ? 8 : v), clearance), null, 'the same sweep clears above');
});

test('whole-segment contact catches clear endpoints, both directions, a thin edge, and a stationary camera', () => {
  const volumes = ribbonCanopyVolumes(simple, () => 0, dimensions);
  for (const [from, to] of [[[3, 2, 0], [3, 8, 0]], [[3, 8, 0], [3, 2, 0]], [[-20, 3.8, 1.44], [20, 3.8, 1.44]]]) {
    assert.equal(ribbonCanopyBlocks(volumes, from), false);
    assert.equal(ribbonCanopyBlocks(volumes, to), false);
    const hit = ribbonCanopyHit(volumes, from, to);
    assert.ok(hit && hit.fraction > 0 && hit.fraction < 1);
    const before = from.map((v, i) => v + (to[i] - v) * Math.max(0, hit.fraction - 0.001));
    assert.equal(ribbonCanopyBlocks(volumes, before), false, 'camera may stop before contact');
  }
  assert.equal(ribbonCanopyHit(volumes, [3, 2, 0], [3, 2, 0]), null);
  assert.equal(ribbonCanopyHit(volumes, [3, 3.8, 0], [3, 3.8, 0]).fraction, 0);
  assert.equal(ribbonCanopyHit(volumes, [-20, 8, 0], [20, 8, 0]), null, 'overflight does not hit a phantom wall');
});

test('bounds follow module rotation and midpoint support on slopes, with no query-time terrain resampling', () => {
  const module = { id: 'diagonal', from: [0, 0], to: [4, 4], yaw: Math.PI / 4, length: Math.sqrt(32), width: 2.4, clearHeight: 3.6 };
  let calls = 0;
  const volumes = ribbonCanopyVolumes({ modules: [module] }, (x, z) => { calls++; return x - z; }, dimensions);
  assert.equal(calls, 1);
  assert.equal(ribbonCanopyBlocks(volumes, [2, 7.8, -2]), true);
  assert.equal(ribbonCanopyBlocks(volumes, [0.2, 7.8, -0.2]), true, 'same level slab over sloped ground');
  assert.equal(ribbonCanopyBlocks(volumes, [2, 3.8, -2]), false);
  assert.equal(ribbonCanopyBlocks(volumes, [4, 7.8, -0.1]), false, 'axis-aligned bounding-box corner is not part of rotated slab');
  assert.ok(ribbonCanopyHit(volumes, [2, 6, -2], [2, 10, -2]));
  assert.equal(calls, 1);
});

test('all actual finished canopy and rim vertices fit the same finite volumes in Pink and Classic', () => {
  const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url), 'utf8'));
  const environment = createWalkingEnvironment(world), plan = districtRibbonPlan(world);
  const volumes = ribbonCanopyVolumes(plan, environment.groundAt, dimensions);
  assert.equal(volumes.length, plan.modules.length);
  for (const finish of ['pink-jet-age', 'classic']) {
    const group = buildRibbon({ world, finish, groundAt: environment.groundAt });
    try {
      const m = new THREE.Matrix4(), p = new THREE.Vector3();
      for (const mesh of group.children.filter(item => ['Ribbon canopy', 'Ribbon edges'].includes(item.name))) {
        for (let instance = 0; instance < mesh.count; instance++) {
          mesh.getMatrixAt(instance, m);
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            p.fromBufferAttribute(positions, i).applyMatrix4(m);
            assert.equal(ribbonCanopyBlocks(volumes, p.toArray()), true, `${finish} ${mesh.name} ${instance}, vertex ${i}`);
          }
        }
      }
    } finally { group.userData.dispose(); }
  }
});

test('absent plans add no obstruction and malformed dimensions fail explicitly', () => {
  const empty = ribbonCanopyVolumes(null, () => 0, dimensions);
  assert.equal(ribbonCanopyBlocks(empty, [3, 3.8, 0]), false);
  assert.equal(ribbonCanopyHit(empty, [3, 0, 0], [3, 8, 0]), null);
  assert.throws(() => ribbonCanopyVolumes(simple, () => 0, { slab: 0, edgeBeyondWalk: 0.24 }), TypeError);
  assert.throws(() => ribbonCanopyVolumes(simple, () => NaN, dimensions), TypeError);
  assert.throws(() => ribbonCanopyBlocks(empty, [3, NaN, 0]), TypeError);
  assert.throws(() => ribbonCanopyHit(empty, [0, 0, 0], [0, 8, 0], { radius: -1 }), TypeError);
});

test('oriented hull sweeps catch clear endpoints and intervening turns without blocking legal above/below flight', () => {
  const volumes = ribbonCanopyVolumes(simple, () => 0, dimensions);
  const box = { x: -4, z: 0, bottom: 3.7, top: 3.9, halfLength: 0.5, halfWidth: 0.5, yaw: 0 };
  assert.equal(ribbonCanopyBoxHit(volumes, box), null);
  assert.equal(ribbonCanopyBoxHit(volumes, { ...box, x: 10 }), null);
  assert.ok(ribbonCanopyBoxHit(volumes, box, { ...box, x: 10 }));
  for (const [bottom, top] of [[0, 3], [5, 8]]) assert.equal(ribbonCanopyBoxHit(volumes, { ...box, bottom, top }, { ...box, x: 10, bottom, top }), null);
  const tiny = ribbonCanopyVolumes({ modules: [{ ...simple.modules[0], from: [-0.1, 0], to: [0.1, 0], length: 0.2, width: 0.2 }] }, () => 0, dimensions);
  const turn = { ...box, x: 2, halfLength: 2, halfWidth: 0.1, yaw: -Math.PI / 2 };
  assert.equal(ribbonCanopyBoxHit(tiny, turn), null);
  assert.equal(ribbonCanopyBoxHit(tiny, { ...turn, yaw: Math.PI / 2 }), null);
  assert.ok(ribbonCanopyBoxHit(tiny, turn, { ...turn, yaw: Math.PI / 2 }), 'the long nose crosses the slab during the turn');
  assert.throws(() => ribbonCanopyBoxHit(volumes, { ...box, yaw: Infinity }), TypeError);
  for (const yaw of [0, Math.PI / 2]) {
    const craft = altitude => ribbonwingCanopyBox({ position: [3, 0, 0], altitude, yaw }, () => 0);
    assert.equal(ribbonCanopyBoxHit(volumes, craft(0)), null, 'the complete aircraft fits beneath the finite slab where there are no posts');
    assert.ok(ribbonCanopyBoxHit(volumes, craft(0.8)), 'its actual upper envelope cannot enter the slab');
    assert.equal(ribbonCanopyBoxHit(volumes, craft(4.5)), null, 'legal whole-aircraft overflight stays open');
  }
});

test('the shared hull envelope encloses actual airborne geometry through its mechanism states and cosmetic bank', () => {
  const craft = createRibbonwing();
  try {
    for (const phase of ['ready', 'takeoff', 'hover', 'cruise', 'maneuver', 'landing']) for (const [pitch, roll] of [[0, 0], [0.18, 0.32], [-0.18, -0.32]]) {
      craft.setFlightState({ phase, altitude: 1.8, speed: 9, tuck: phase === 'maneuver' ? 1 : 0, occupied: true });
      craft.settle();
      craft.object.position.set(0, 1.8, 0); craft.object.rotation.set(pitch, 0, roll, 'YXZ'); craft.object.updateMatrixWorld(true);
      const actual = new THREE.Box3().setFromObject(craft.object), box = ribbonwingCanopyBox({ position: [0, 0, 0], altitude: 1.8, yaw: 0, pitch, roll }, () => 0);
      assert.ok(actual.min.x >= box.x - box.halfLength && actual.max.x <= box.x + box.halfLength, `${phase}: entire length`);
      assert.ok(actual.min.z >= box.z - box.halfWidth && actual.max.z <= box.z + box.halfWidth, `${phase}: entire span`);
      assert.ok(actual.min.y >= box.bottom && actual.max.y <= box.top, `${phase}: entire height`);
    }
  } finally { craft.dispose(); }
});

test('authoritative maneuver boxes enclose actual pitched and rolled meshes around the pilot pivot', () => {
  const craft = createRibbonwing(), point = new THREE.Vector3(), seat = VEHICLES.hover.driverSeat;
  const groundAt = (x, z) => x * 0.03 - z * 0.01;
  try {
    for (const kind of Object.keys(RIBBONWING_MANEUVERS)) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const plan = { kind, heading: 0.71, origin: [3, -4], altitude: 12, startedAt: 0 };
      const at = maneuverPose(plan, t * RIBBONWING_MANEUVERS[kind].duration), yaw = at.heading - Math.PI;
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), at.pitch))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1, 0, 0), at.roll));
      const flat = new THREE.Vector3(seat[0], 0, seat[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const base = groundAt(at.east - flat.x, -at.north - flat.z), offset = new THREE.Vector3(seat[0], 0, seat[2]).applyQuaternion(rotation);
      craft.setFlightState({ phase: 'maneuver', altitude: at.altitude, speed: 9, tuck: at.tuck, occupied: true }); craft.settle();
      craft.object.position.set(at.east - offset.x, base + at.altitude - offset.y, -at.north - offset.z); craft.object.quaternion.copy(rotation); craft.object.updateMatrixWorld(true);
      const state = ribbonwingManeuverFromPilot([at.east, groundAt(at.east, -at.north), -at.north], at.heading, at.altitude, at.pitch, at.roll, groundAt);
      const box = ribbonwingCanopyBox(state, groundAt), c = Math.cos(box.yaw), s = Math.sin(box.yaw);
      let escaped = 0;
      craft.object.traverse(mesh => {
        if (!mesh.isMesh) return;
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
          const x = point.x - box.x, z = point.z - box.z;
          if (Math.abs(x * c - z * s) > box.halfLength || Math.abs(x * s + z * c) > box.halfWidth || point.y < box.bottom || point.y > box.top) escaped++;
        }
      });
      assert.equal(escaped, 0, `${kind} t=${t}: every actual vertex stays inside the shared box`);
    }
  } finally { craft.dispose(); }
});
