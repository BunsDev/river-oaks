import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createWalkingEnvironment, createWalkingState } from '../src/walking.js';
import { thirdPersonPose } from '../src/third-person.js';
import { beginFlight, createFlightState, stepFlight } from '../src/flight.js';
import { createFlightVehicle } from '../src/flight-vehicles.js';
import { districtRibbonPlan, DISTRICT_RIBBON_LANE } from '../src/ribbon-district.js';
import { buildRibbon } from '../src/ribbon-finish.js';
import { createSharedWorld } from '../../server/world.js';
import { registerGroundSurfaces } from '../src/world-surface.js';
import { hoverClear } from '../src/carriage-motion.js';
import { VEHICLES } from '../src/vehicle-config.js';
import { loadDistrictData } from '../../server/district-data.js';
import { benchSeats } from '../src/world-interactions.js';

const data = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(data), plan = districtRibbonPlan(data);
const owner = 'user_01M40Y914S1H4EJCEHH91DKTAY'; // Existing local acceptance identity.
const middle = module => [(module.from[0] + module.to[0]) / 2, (module.from[1] + module.to[1]) / 2];
const station = plan.modules.find(module => module.id === 'ribbon:spine:module:013');
assert.ok(station, 'the recorded failing station remains identifiable');
const [east, north] = middle(station), ground = environment.groundAt(east, -north);

function bubbleSize() {
  const vehicle = createFlightVehicle('jevica');
  try {
    vehicle.object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(vehicle.object);
    return { above: bounds.max.y, below: -bounds.min.y, bounds };
  } finally { vehicle.dispose(); }
}
const bubble = bubbleSize();

function rendered(finish = 'pink-jet-age') {
  const group = buildRibbon({ world: data, finish, groundAt: environment.groundAt });
  group.updateMatrixWorld(true);
  const canopy = group.children.find(child => child.name === 'Ribbon canopy');
  assert.ok(canopy, 'use the actual drawn canopy');
  const bounds = (x, z) => {
    const base = environment.groundAt(x, z);
    const bottom = new THREE.Raycaster(new THREE.Vector3(x, base + 1, z), new THREE.Vector3(0, 1, 0), 0, 12).intersectObject(canopy)[0];
    const top = new THREE.Raycaster(new THREE.Vector3(x, base + 8, z), new THREE.Vector3(0, -1, 0), 0, 12).intersectObject(canopy)[0];
    assert.ok(bottom && top, 'both actual slab faces bracket the station');
    return [bottom.point.y, top.point.y];
  };
  const hits = pose => {
    const from = new THREE.Vector3(...pose.target), direction = new THREE.Vector3(...pose.position).sub(from);
    const length = direction.length();
    return length ? new THREE.Raycaster(from, direction.normalize(), 0, length).intersectObject(canopy) : [];
  };
  // Check the actual mesh against the restored body's bounds, so valid recovery beside the
  // canopy is accepted too. A vertical ray that requires a slab at the new position would
  // incorrectly reject a compatible horizontal relocation outside the overhead geometry.
  const bodyIntersects = (x, foot, z) => {
    const box = bubble.bounds.clone().translate(new THREE.Vector3(x, foot, z));
    const matrix = new THREE.Matrix4(), triangle = new THREE.Triangle();
    for (const mesh of group.children.filter(item => ['Ribbon canopy', 'Ribbon edges'].includes(item.name))) {
      const positions = mesh.geometry.attributes.position, indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      for (let instance = 0; instance < mesh.count; instance++) {
        mesh.getMatrixAt(instance, matrix);
        for (let i = 0; i < count; i += 3) {
          for (const [vertex, offset] of [[triangle.a, 0], [triangle.b, 1], [triangle.c, 2]])
            vertex.fromBufferAttribute(positions, indices ? indices.getX(i + offset) : i + offset).applyMatrix4(matrix);
          if (box.intersectsTriangle(triangle)) return true;
        }
      }
    }
    return false;
  };
  return { group, bounds, hits, bodyIntersects, dispose: () => group.userData.dispose() };
}

for (const finish of ['pink-jet-age', 'classic']) {
  test(`${finish}: ordinary and long camera booms stop before the actual finite canopy`, () => {
    const scene = rendered(finish);
    try {
      for (const cameraDistance of [4.2, 25, 80]) {
        const state = createWalkingState(environment, [east + 0.45, north], Math.PI);
        Object.assign(state, { pitch: -0.5, cameraDistance });
        const before = structuredClone(state), pose = thirdPersonPose(state, environment);
        assert.deepEqual(state, before, 'camera clearance never alters the mover');
        assert.equal(scene.hits(pose).length, 0, `boom ${cameraDistance} m crosses the drawn slab`);
        assert.ok(Math.hypot(...pose.position.map((value, i) => value - pose.target[i])) > 0.5, 'retain usable camera space below the canopy');
      }
    } finally { scene.dispose(); }
  });
}

test('flight clearance accounts for both ends of the actual bubble at every canopy midpoint', () => {
  const scene = rendered();
  try {
    for (const module of plan.modules) {
      const [x, n] = middle(module), [bottom, top] = scene.bounds(x, -n);
      assert.equal(environment.canFly(x, bottom - bubble.above - 0.1, -n), true, `${module.id}: whole bubble fits below`);
      assert.equal(environment.canFly(x, bottom - bubble.above + 0.1, -n), false, `${module.id}: upper bubble intersects before the foot datum`);
      assert.equal(environment.canFly(x, (bottom + top) / 2, -n), false, `${module.id}: foot datum inside the slab`);
      assert.equal(environment.canFly(x, top + bubble.below - 0.1, -n), false, `${module.id}: lower bubble intersects from above`);
      assert.equal(environment.canFly(x, top + bubble.below + 0.1, -n), true, `${module.id}: whole bubble clears overflight`);
    }
  } finally { scene.dispose(); }
});

for (const direction of ['ascent', 'descent']) {
  test(`normal flight ${direction} retains full-body clearance on its original side`, () => {
    const scene = rendered();
    try {
      const [bottom, top] = scene.bounds(east, -north), state = createWalkingState(environment, [east, north]);
      const flight = createFlightState();
      if (direction === 'ascent') assert.equal(beginFlight(state, environment, flight), true);
      else {
        Object.assign(flight, { active: true, altitude: 8, target: 8 });
        state.position[1] += 8; // Only the initial fixture pose is staged; motion uses the real controller.
      }
      for (let frame = 0; frame < 360; frame++) {
        stepFlight(state, environment, flight, { lift: direction === 'ascent' ? 1 : -1 }, 1 / 60);
        const foot = environment.groundAt(state.position[0], state.position[2]) + flight.altitude;
        assert.ok(direction === 'ascent' ? foot + bubble.above < bottom : foot - bubble.below > top, `${direction}: bubble intersects at frame ${frame}`);
      }
      assert.ok(direction === 'ascent' ? flight.altitude > 0.5 : flight.altitude < 7.5, 'blocked flight still approaches the obstacle normally');
    } finally { scene.dispose(); }
  });
}

test('authoritative ascent rejects the full bubble before its foot datum reaches the slab', () => {
  const scene = rendered();
  try {
    const [bottom] = scene.bounds(east, -north);
    let time = 1000;
    const world = createSharedWorld({ ...data, walkSpawn: [east, north, 0] }, { now: () => time });
    const joined = world.join({ userId: owner, name: 'Canopy body fixture' });
    assert.equal(joined.ok, true);
    let refused = null, lastAccepted = 0;
    for (let step = 1; step <= 60; step++) {
      time += 100;
      const reply = world.command(owner, { type: 'pose', position: joined.player.position, yaw: 0, altitude: step / 10 });
      if (!reply.ok) { refused = reply.error; break; }
      lastAccepted = step / 10;
    }
    assert.equal(refused, 'blocked');
    assert.ok(ground + lastAccepted + bubble.above < bottom, 'authority keeps the full body below, rather than only its foot datum');
  } finally { scene.dispose(); }
});

test('occupied checkpoint body penetration recovers the same occupant outside the finite canopy', () => {
  const scene = rendered();
  try {
    const [bottom] = scene.bounds(east, -north);
    const world = createSharedWorld({ ...data, walkSpawn: [east, north, 0] }, { now: () => 1000 });
    assert.equal(world.join({ userId: owner, name: 'Canopy checkpoint fixture' }).ok, true);
    const original = world.checkpoint(), saved = structuredClone(original);
    saved.payload.players.find(player => player.id === owner).altitude = bottom - ground - bubble.above + 0.15;
    const { checksum, ...envelope } = saved;
    const occupied = { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') };
    const result = world.restore(occupied);
    assert.equal(result.ok, true, 'a newly obstructed historical flight pose has compatible vertical recovery');
    {
      const player = world.snapshot().players.find(item => item.id === owner);
      assert.ok(player, 'recovery preserves occupant identity');
      assert.equal(player.appearance, original.payload.players[0].appearance);
      assert.deepEqual(player.position, original.payload.players[0].position, 'no horizontal relocation or ground change');
      const foot = environment.groundAt(player.position[0], -player.position[1]) + player.altitude;
      assert.equal(scene.bodyIntersects(player.position[0], foot, -player.position[1]), false, 'recovery clears the whole body');
      const recovered = world.checkpoint().payload;
      assert.deepEqual(recovered.ledgers, original.payload.ledgers, 'account ledgers are retained');
      assert.deepEqual(recovered.builds, original.payload.builds, 'saved creations are retained');
      const again = createSharedWorld({ ...data, walkSpawn: [east, north, 0] }, { now: () => 1000 });
      assert.equal(again.restore(world.checkpoint()).ok, true, 'the recovered checkpoint remains restorable');
      assert.deepEqual(again.checkpoint(), world.checkpoint(), 'recovery is stable on the next restart');
    }
  } finally { scene.dispose(); }
});

test('canopy recovery cannot rescue an unrelated invalid occupied pose', () => {
  const world = createSharedWorld({ ...data, walkSpawn: [east, north, 0] }, { now: () => 1000 });
  assert.equal(world.join({ userId: owner, name: 'Canopy invalid fixture' }).ok, true);
  const original = world.checkpoint(), saved = structuredClone(original);
  const player = saved.payload.players.find(item => item.id === owner);
  player.position[0] = data.bounds_m[0] - 100;
  player.altitude = 3.8;
  const { checksum, ...envelope } = saved;
  const invalid = { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') };
  assert.equal(world.restore(invalid).ok, false);
  assert.deepEqual(world.checkpoint(), original, 'rejection is atomic and retains the occupied world');
});

test('a world without the district lane acquires no phantom overhead collision', () => {
  const other = createWalkingEnvironment({ scene: 'district', bounds_m: [-30, -30, 30, 30], buildings: [], stores: [], roads: [] });
  for (const altitude of [0.04, 1.2, 3.8, 4.2, 8]) assert.equal(other.canFly(0, altitude, 0), true);
});

test('a refused and undrawn district plan acquires no phantom canopy collision', () => {
  // A valid road through the authored post line makes the plan refuse its first post.
  // There are no buildings here: their roof collisions cannot mask a phantom canopy.
  const world = { scene: 'district', bounds_m: data.bounds_m, buildings: [], stores: [],
    roads: [{ id: DISTRICT_RIBBON_LANE, width_m: 8.4, points: [plan.modules[0].from, plan.modules.at(-1).to] }] };
  const group = buildRibbon({ world });
  assert.match(group.userData.ribbon.refused, /lands in no-go carriageway/);
  assert.equal(group.children.length, 0);
  const other = createWalkingEnvironment(world);
  for (const altitude of [1.2, 3.8, 4.2, 8]) assert.equal(other.canFly(east, altitude, -north), true);
});

test('checkpoint mesh inspection distinguishes penetration from valid recovery beside the canopy', () => {
  const scene = rendered();
  try {
    const [bottom] = scene.bounds(east, -north);
    assert.equal(scene.bodyIntersects(east, bottom - bubble.above + 0.15, -north), true);
    assert.equal(scene.bodyIntersects(east, bottom - bubble.above - 0.1, -north), false);
    assert.equal(scene.bodyIntersects(east + 40, bottom - bubble.above + 0.15, -north), false);
  } finally { scene.dispose(); }
});

test('canopy queries follow midpoint support registered after environment creation and rebuilt later', () => {
  const world = structuredClone(data), env = createWalkingEnvironment(world);
  // Force the old terrain-based cache before the actual renderer registers supports.
  assert.equal(env.canPlaceCamera(east, ground + 3.8, -north), false);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(12, 12));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(east, ground + 1, -north);
  try {
    for (const rise of [1, 1.5]) {
      patch.position.y = ground + rise;
      registerGroundSurfaces(world, [patch]);
      const group = buildRibbon({ world, groundAt: env.groundAt });
      try {
        const canopy = group.children.find(mesh => mesh.name === 'Ribbon canopy');
        const bottom = new THREE.Raycaster(new THREE.Vector3(east, ground + rise + 1, -north), new THREE.Vector3(0, 1, 0), 0, 8).intersectObject(canopy)[0];
        assert.ok(bottom);
        assert.equal(env.canPlaceCamera(east, bottom.point.y + 0.1, -north), false, 'cache follows the current drawn slab');
        assert.equal(env.canFly(east, bottom.point.y - bubble.above + 0.1, -north), false, 'the full bubble stays outside it');
        assert.equal(env.canPlaceCamera(east, ground + 3.8, -north), true, 'old terrain slab does not remain as a phantom obstacle');
      } finally { group.userData.dispose(); }
    }
  } finally { patch.geometry.dispose(); patch.material.dispose(); }
});

test('authority recovers occupied aircraft hulls at all thirty canopy modules and refuses renewed penetration', () => {
  for (const module of plan.modules) {
    const [x, n] = middle(module), yaw = module.yaw, c = Math.cos(yaw), s = Math.sin(yaw), seat = VEHICLES.hover.driverSeat;
    const craft = altitude => {
      const cx = x - seat[0] * c - seat[2] * s, cz = -n + seat[0] * s - seat[2] * c;
      return { vehicle: 'hover', position: [cx, environment.groundAt(cx, cz), cz], altitude, yaw, speed: 0 };
    };
    assert.equal(hoverClear(craft(1.8), environment), false, 'independent witness is inside the actual aircraft clearance');
    let time = 1000;
    const world = createSharedWorld({ ...data, walkSpawn: [x, n, 0] }, { now: () => time });
    assert.equal(world.join({ userId: owner, name: 'Occupied hull fixture' }).ok, true);
    const saved = world.checkpoint(), player = saved.payload.players.find(item => item.id === owner);
    Object.assign(player, { position: [x, n, environment.groundAt(x, -n)], altitude: 1.8, yaw, vehicle: 'hover' });
    const { checksum, ...envelope } = saved;
    const occupied = { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') };
    assert.equal(world.restore(occupied).ok, true, `${module.id}: compatible occupied hull recovery`);
    const restored = world.snapshot().players.find(item => item.id === owner);
    assert.equal(restored.vehicle, 'hover');
    assert.deepEqual(restored.position, player.position, 'retain account location and vehicle');
    assert.equal(hoverClear(craft(restored.altitude), environment), true, `${module.id}: authority never restores the hull through the slab`);
    let refusal = null;
    for (let altitude = restored.altitude; altitude >= 1.8; altitude -= 0.1) {
      time += 100;
      const reply = world.command(owner, { type: 'pose', position: restored.position, altitude, yaw, vehicle: 'hover' });
      if (!reply.ok) { refusal = reply.error; break; }
    }
    assert.equal(refusal, 'blocked', `${module.id}: normal authority refuses descent back into an obstructed hull pose`);
  }
});

test('occupied hull recovery preserves the passenger pair and both account appearances across restart', () => {
  const worldData = { ...data, walkSpawn: [east, north, 0] }, world = createSharedWorld(worldData, { now: () => 1000 });
  assert.equal(world.join({ userId: owner, name: 'Hull pilot' }).ok, true);
  assert.equal(world.join({ userId: 'canopy-peer', name: 'Hull passenger' }).ok, true);
  const saved = world.checkpoint(), pilot = saved.payload.players.find(item => item.id === owner), peer = saved.payload.players.find(item => item.id === 'canopy-peer');
  const appearances = [pilot.appearance, peer.appearance];
  Object.assign(pilot, { position: [east, north, ground], altitude: 1.8, yaw: station.yaw, vehicle: 'hover', passengerId: peer.id });
  const x = east - 0.68 * Math.sin(station.yaw), n = north + 0.68 * Math.cos(station.yaw);
  Object.assign(peer, { position: [x, n, environment.groundAt(x, -n)], altitude: 1.8, yaw: station.yaw, passengerOf: owner });
  const { checksum, ...envelope } = saved, occupied = { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') };
  assert.equal(world.restore(occupied).ok, true);
  const players = world.snapshot().players, p = players.find(item => item.id === owner), q = players.find(item => item.id === peer.id);
  assert.equal(q.passengerOf, owner);
  assert.equal(q.altitude, p.altitude);
  assert.ok(p.altitude !== 1.8);
  assert.deepEqual([p.appearance, q.appearance], appearances);
  const restarted = createSharedWorld(worldData, { now: () => 1000 });
  assert.equal(restarted.restore(world.checkpoint()).ok, true);
  for (const player of restarted.snapshot().players) assert.deepEqual(player, players.find(item => item.id === player.id));
});

test('legacy pilot-only checkpoints remain recoverable beside a roof in worlds without a Ribbon', () => {
  const data = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-3.5, 0, 0], stores: [], roads: [],
    buildings: [{ id: 'roof-fixture', center: [0, 0, 0], size: [4, 4, 5] }] };
  const env = createWalkingEnvironment(data), world = createSharedWorld(data, { now: () => 1000 });
  assert.equal(env.canFly(-3.5, 1.8, 0, { radius: 1.3 }), true, 'the old pilot-point rule admitted it');
  assert.equal(env.canFlyHullPilot(-3.5, 1.8, 0, 0), false, 'the actual hull extends over the roof');
  assert.equal(world.join({ userId: owner, name: 'Historical roof pilot' }).ok, true);
  const saved = world.checkpoint(), pilot = saved.payload.players.find(item => item.id === owner);
  Object.assign(pilot, { altitude: 1.8, vehicle: 'hover', yaw: 0 });
  const { checksum, ...envelope } = saved, occupied = { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') };
  assert.equal(world.restore(occupied).ok, true, 'full-hull authority must not strand an old occupied world');
  const restored = world.snapshot().players.find(item => item.id === owner);
  assert.deepEqual(restored.position, pilot.position);
  assert.equal(restored.vehicle, 'hover');
  assert.equal(env.canFlyHullPilot(restored.position[0], restored.position[2] + restored.altitude, -restored.position[1], restored.yaw), true);
});

test('away descent keeps the full aircraft and its passenger above a canopy outside the pilot point', () => {
  const module = plan.modules[0], [midEast, n] = middle(module), x = midEast - 3, z = -n, yaw = 0;
  const worldData = { ...data, walkSpawn: [x, n, 0] }, env = createWalkingEnvironment(worldData);
  const ground = env.groundAt(x, z);
  assert.equal(env.canFly(x, ground + 4, z), true, 'pilot bubble beside the slab is clear');
  assert.equal(env.canFlyHullPilot(x, ground + 4, z, yaw), false, 'the actual aircraft extends across the canopy');
  assert.equal(env.canFlyHullPilot(x, ground + 8, z, yaw), true, 'the initial overflight clears the whole hull');
  let time = 1000;
  const world = createSharedWorld(worldData, { now: () => time });
  world.join({ userId: owner, name: 'Away hull pilot' });
  world.join({ userId: 'canopy-away-peer', name: 'Away hull passenger' });
  // Stage only the legal initial occupied pose; every descent afterwards is a normal world tick.
  const saved = world.checkpoint(), pilot = saved.payload.players.find(p => p.id === owner);
  const peer = saved.payload.players.find(p => p.id === 'canopy-away-peer');
  Object.assign(pilot, { position: [x, n, ground], altitude: 8, yaw, vehicle: 'hover', passengerId: peer.id });
  Object.assign(peer, { position: [x, n + 0.68, env.groundAt(x, -(n + 0.68))], altitude: 8, yaw, passengerOf: owner });
  const { checksum, ...envelope } = saved;
  assert.equal(world.restore({ ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }).ok, true);
  const appearances = world.snapshot().players.map(p => [p.id, p.appearance]);
  world.away(owner, true);
  let previous = 8;
  for (let tick = 0; tick < 48; tick++) {
    time += 250; world.step(0.25);
    const players = world.snapshot().players, p = players.find(p => p.id === owner), q = players.find(p => p.id === peer.id);
    assert.equal(env.canFlyHullPilot(x, ground + p.altitude, z, p.yaw), true, `away tick ${tick} admitted hull penetration at ${p.altitude} m`);
    assert.ok(p.altitude <= previous && previous - p.altitude <= 0.500001, 'retain the 2 m/s bounded descent');
    assert.deepEqual(p.position, pilot.position, 'the automatic descent never shifts the pilot horizontally');
    assert.equal(q.passengerOf, owner);
    assert.equal(q.altitude, p.altitude, 'the passenger follows the held craft');
    previous = p.altitude;
  }
  assert.ok(previous > 4 && previous < 7, 'approach the canopy and hold clear instead of refusing all descent');
  world.away(owner, false);
  time += 1000; world.step(0.25);
  assert.equal(world.snapshot().players.find(p => p.id === owner).altitude, previous, 'reconnect stops automatic descent');
  assert.deepEqual(world.snapshot().players.map(p => [p.id, p.appearance]), appearances);
  const restarted = createSharedWorld(worldData, { now: () => time });
  assert.equal(restarted.restore(world.checkpoint()).ok, true, 'the held occupied checkpoint stays restorable');
  assert.equal(restarted.snapshot().players.find(p => p.id === peer.id).passengerOf, owner);
});

test('away descent still lands a craft on genuinely open ground without a Ribbon', () => {
  const worldData = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [0, 0, 0], buildings: [], stores: [], roads: [] };
  const env = createWalkingEnvironment(worldData);
  let time = 1000;
  const world = createSharedWorld(worldData, { now: () => time });
  const joined = world.join({ userId: owner, name: 'Open away pilot' });
  for (const altitude of [3, 6]) {
    time += 1000;
    assert.equal(world.command(owner, { type: 'pose', position: joined.player.position, altitude, yaw: 0, vehicle: 'hover' }).ok, true);
  }
  world.away(owner, true);
  for (let tick = 0; tick < 20; tick++) {
    time += 250; world.step(0.25);
    const p = world.snapshot().players.find(p => p.id === owner);
    assert.equal(env.canFlyHullPilot(p.position[0], p.position[2] + p.altitude, -p.position[1], p.yaw), true);
  }
  const landed = world.snapshot().players.find(p => p.id === owner);
  assert.equal(landed.altitude, 0);
  assert.equal(landed.vehicle, 'hover');
});

test('passenger roll setup keeps the unsafe hull refusal and admits the settled clear-air path', async () => {
  const fixture = await loadDistrictData(), env = createWalkingEnvironment(fixture);
  const [x, north] = [-2765.022140789407, -1287.7082485006429], yaw = -1.588093915593603;
  for (const [index, altitude] of [6.2398121255855585, 9].entries()) {
    const world = createSharedWorld(fixture, { now: () => 1000 });
    world.join({ userId: owner, name: 'Recorded roll pilot' });
    world.join({ userId: 'alice', name: 'Recorded roll passenger' });
    const saved = world.checkpoint(), pilot = saved.payload.players.find(p => p.id === owner), peer = saved.payload.players.find(p => p.id === 'alice');
    const pe = x - .68 * Math.sin(yaw), pn = north + .68 * Math.cos(yaw);
    Object.assign(pilot, { position: [x, north, env.groundAt(x, -north)], altitude, yaw, vehicle: 'hover', passengerId: peer.id });
    Object.assign(peer, { position: [pe, pn, env.groundAt(pe, -pn)], altitude, yaw, passengerOf: owner });
    const { checksum, ...envelope } = saved;
    assert.equal(world.restore({ ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }).ok, true);
    const before = world.snapshot().players;
    assert.equal(before.find(p => p.id === owner).altitude, altitude, 'the legal level starting pose needs no recovery');
    const result = world.command(owner, { type: 'maneuver', kind: 'roll', id: `recorded-roll-${index}`, seq: 1 });
    if (altitude < 9) {
      assert.equal(result.error, 'maneuver_blocked', 'the swept full body still cannot cross the canopy');
      assert.deepEqual(world.snapshot().players, before, 'refusal changes neither occupied player');
    } else {
      assert.equal(result.ok, true);
      assert.equal(result.player.maneuver.kind, 'roll');
      assert.equal(world.snapshot().players.find(p => p.id === 'alice').passengerOf, owner);
    }
  }
});

function occupiedCarrierCheckpoint(order = [owner, 'bob', 'alice']) {
  const fixture = { ...data, walkSpawn: [east, north, 0] }, world = createSharedWorld(fixture, { now: () => 1000 });
  for (const id of order) assert.equal(world.join({ userId: id, name: id }).ok, true);
  const bench = benchSeats(fixture).find(item => item.buildId === 'bench:osm-node-8172494966');
  assert.equal(world.command('bob', { type: 'travel', position: bench.approach }).ok, true);
  assert.equal(world.command('bob', { type: 'sit', buildId: bench.buildId, slot: 0 }).ok, true);
  const saved = world.checkpoint(), pilot = saved.payload.players.find(p => p.id === owner), passenger = saved.payload.players.find(p => p.id === 'alice');
  Object.assign(pilot, { position: [east, north, ground], altitude: 1.8, yaw: 0, vehicle: 'hover', passengerId: 'alice' });
  Object.assign(passenger, { position: [east, north + .68, environment.groundAt(east, -north - .68)], altitude: 1.8, yaw: 0, passengerOf: owner });
  const seal = value => { const { checksum, ...envelope } = value; return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }; };
  return { fixture, saved, seal, bench };
}

test('a recovered carrier restores its seated passenger before independent flight admission, in either player order', () => {
  for (const order of [[owner, 'bob', 'alice'], ['alice', 'bob', owner]]) {
    const { fixture, saved, seal, bench } = occupiedCarrierCheckpoint(order);
    const passenger = saved.payload.players.find(p => p.id === 'alice');
    assert.equal(environment.canFly(east, passenger.position[2] + passenger.altitude, -passenger.position[1]), false,
      'the recorded seated passenger cannot independently clear this station as a flight bubble');
    const world = createSharedWorld(fixture, { now: () => 1000 });
    assert.equal(world.restore(seal(saved)).ok, true, 'the valid carrier pair must not strand the occupied town');
    const players = world.snapshot().players, pilot = players.find(p => p.id === owner), rider = players.find(p => p.id === 'alice'), sitter = players.find(p => p.id === 'bob');
    assert.equal(pilot.vehicle, 'hover');
    assert.equal(pilot.passengerId, 'alice');
    assert.equal(rider.passengerOf, owner);
    assert.equal(rider.altitude, pilot.altitude);
    assert.notEqual(pilot.altitude, 1.8);
    assert.equal(environment.canFlyHullPilot(east, ground + pilot.altitude, -north, 0), true);
    assert.equal(sitter.sitting.buildId, bench.buildId);
    for (const player of players) assert.equal(player.appearance, saved.payload.players.find(p => p.id === player.id).appearance);
    const durable = world.checkpoint();
    assert.equal(durable.payload.players.find(p => p.id === 'alice').altitude, durable.payload.players.find(p => p.id === owner).altitude,
      'the writer must retain the recovered passenger altitude, not only project it in public snapshots');
    const restarted = createSharedWorld(fixture, { now: () => 1000 });
    assert.equal(restarted.restore(durable).ok, true);
    assert.deepEqual(restarted.snapshot().players, players);
  }
});

test('an unmatched passenger cannot borrow carrier recovery and an invalid carrier still fails closed', () => {
  const { fixture, saved, seal } = occupiedCarrierCheckpoint();
  const unmatched = structuredClone(saved); delete unmatched.payload.players.find(p => p.id === owner).passengerId;
  assert.equal(createSharedWorld(fixture, { now: () => 1000 }).restore(seal(unmatched)).ok, false);
  const invalidCarrier = structuredClone(saved); invalidCarrier.payload.players.find(p => p.id === owner).position[0] = 1e9;
  assert.equal(createSharedWorld(fixture, { now: () => 1000 }).restore(seal(invalidCarrier)).ok, false);
  for (const corrupt of [p => { p.position[0] = data.bounds_m[0] - 100; }, p => { p.position[2] += 10; }, p => { p.vehicle = 'not-a-vehicle'; }]) {
    const invalidPassenger = structuredClone(saved); corrupt(invalidPassenger.payload.players.find(p => p.id === 'alice'));
    const world = createSharedWorld(fixture, { now: () => 1000 }), before = world.checkpoint();
    assert.equal(world.restore(seal(invalidPassenger)).ok, false);
    assert.deepEqual(world.checkpoint(), before, 'invalid rider records must fail atomically before carrier normalization');
  }
});
