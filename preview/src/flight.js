import { CatmullRomCurve3, Vector3 } from 'three';
import { terrainHeight } from './geometry.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const smooth = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const EYE_HEIGHT = 2.5, RIDER_RADIUS = 1.2, CELL_SIZE = 64;

function localPoint(building, [x, y, z]) {
  const dx = x - building.x, dz = z - building.z;
  return [building.cos * dx - building.sin * dz, y, building.sin * dx + building.cos * dz];
}

function contains(building, x, z) {
  const [lx, , lz] = localPoint(building, [x, 0, z]);
  return Math.abs(lx) < building.halfWidth && Math.abs(lz) < building.halfDepth;
}

// Segment/slab intersection catches even walls thinner than one boosted frame.
function buildingHit(building, start, end) {
  const from = localPoint(building, start), to = localPoint(building, end);
  const low = [-building.halfWidth, -Infinity, -building.halfDepth];
  const high = [building.halfWidth, building.top + EYE_HEIGHT, building.halfDepth];
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-10) {
      if (from[axis] <= low[axis] || from[axis] >= high[axis]) return 1;
      continue;
    }
    const a = (low[axis] - from[axis]) / delta, b = (high[axis] - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return 1;
  }
  return leave > 1e-9 && enter < 1 ? Math.max(0, enter) : 1;
}

export function createFlightEnvironment(world) {
  const [west, south, east, north] = world.bounds_m;
  const width = east - west, depth = north - south;
  const cx = (west + east) / 2, cz = -(south + north) / 2;
  const groundAt = (x, z) => terrainHeight(world.terrain, x, -z);
  const buildings = (world.buildings ?? []).map((building) => {
    const yaw = (building.yaw_deg ?? 0) * Math.PI / 180;
    return { x: building.center[0], z: -building.center[1], top: (building.center[2] ?? 0) + building.size[2], halfWidth: building.size[0] / 2 + RIDER_RADIUS, halfDepth: building.size[1] / 2 + RIDER_RADIUS, cos: Math.cos(yaw), sin: Math.sin(yaw) };
  });
  const cells = new Map();
  for (const building of buildings) {
    const rx = Math.abs(building.cos) * building.halfWidth + Math.abs(building.sin) * building.halfDepth;
    const rz = Math.abs(building.sin) * building.halfWidth + Math.abs(building.cos) * building.halfDepth;
    for (let x = Math.floor((building.x - rx) / CELL_SIZE); x <= Math.floor((building.x + rx) / CELL_SIZE); x++) {
      for (let z = Math.floor((building.z - rz) / CELL_SIZE); z <= Math.floor((building.z + rz) / CELL_SIZE); z++) {
        const key = `${x}:${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(building);
      }
    }
  }
  const nearby = (x, z, endX = x, endZ = z) => {
    const found = new Set();
    for (let column = Math.floor(Math.min(x, endX) / CELL_SIZE); column <= Math.floor(Math.max(x, endX) / CELL_SIZE); column++) {
      for (let row = Math.floor(Math.min(z, endZ) / CELL_SIZE); row <= Math.floor(Math.max(z, endZ) / CELL_SIZE); row++) {
        for (const building of cells.get(`${column}:${row}`) ?? []) found.add(building);
      }
    }
    return found;
  };
  const floorAt = (x, z) => {
    let height = groundAt(x, z) + EYE_HEIGHT;
    for (const building of nearby(x, z)) if (contains(building, x, z)) height = Math.max(height, building.top + EYE_HEIGHT);
    return height;
  };
  // Only the sightseeing route uses a district-wide roof envelope; manual riding does not.
  const roof = buildings.reduce((height, building) => Math.max(height, building.top), 0);
  const terrainTop = (world.terrain?.heights_m ?? [0]).reduce((height, value) => Math.max(height, value), 0);
  const cruiseHeight = Math.max(roof + 14, terrainTop + 24);
  const waypoints = [[0.10, 0.02], [0.28, -0.20], [0.05, -0.34], [-0.26, -0.24], [-0.32, 0.10], [-0.12, 0.32], [0.24, 0.27], [0.32, 0.10]];
  const curve = new CatmullRomCurve3(waypoints.map(([x, z], index) => new Vector3(cx + x * width, cruiseHeight + 12 + (index % 3) * 9, cz + z * depth)), true, 'centripetal');
  curve.arcLengthDivisions = 1024;
  const roads = (world.roads ?? []).flatMap((road) => (road.points ?? []).slice(1).map((end, index) => {
    const start = road.points[index];
    return { start: [start[0], -start[1]], end: [end[0], -end[1]] };
  }));
  return { curve, length: curve.getLength(), groundAt, floorAt, nearby, cruiseHeight, ceiling: Math.max(terrainTop + 400, cruiseHeight + 50), roads, bounds: { minX: west + 5, maxX: east - 5, minZ: -north + 5, maxZ: -south - 5 } };
}

export function createFlightState(environment, reducedMotion = false) {
  const point = environment.curve.getPointAt(0), tangent = environment.curve.getTangentAt(0);
  const speed = reducedMotion ? 0 : 32;
  return { position: point.toArray(), yaw: Math.atan2(-tangent.x, -tangent.z), yawRate: 0, bank: 0, speed, driveSpeed: speed, velocity: tangent.multiplyScalar(speed).toArray(), progress: 0, mode: reducedMotion ? 'manual' : 'tour', paused: false, elapsed: 0, assist: null };
}

export function setFlightMode(state, mode, environment) {
  if (mode === state.mode) return;
  state.mode = mode;
  state.assist = null;
  state.driveSpeed = state.speed;
  if (mode === 'tour') {
    let nearest = Infinity;
    const position = new Vector3(...state.position);
    for (let index = 0; index < 256; index++) {
      const distance = environment.curve.getPointAt(index / 256).distanceToSquared(position);
      if (distance < nearest) { nearest = distance; state.progress = index / 256; }
    }
    state.joiningTour = state.position[1] < environment.cruiseHeight;
  }
}

function streetTarget(position, environment) {
  const [x, , z] = position, { minX, maxX, minZ, maxZ } = environment.bounds;
  const candidates = [];
  for (const road of environment.roads) {
    const [ax, az] = road.start, [bx, bz] = road.end;
    const lengthSquared = (bx - ax) ** 2 + (bz - az) ** 2;
    if (!lengthSquared) continue;
    const fraction = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / lengthSquared, 0, 1);
    // Include endpoints when a bad source segment puts its closest point inside a house.
    for (const t of [fraction, 0, 1]) candidates.push([ax + (bx - ax) * t, az + (bz - az) * t]);
  }
  const valid = ([px, pz]) => px >= minX && px <= maxX && pz >= minZ && pz <= maxZ && environment.floorAt(px, pz) <= environment.groundAt(px, pz) + EYE_HEIGHT + 0.001;
  candidates.sort((a, b) => (a[0] - x) ** 2 + (a[1] - z) ** 2 - ((b[0] - x) ** 2 + (b[1] - z) ** 2));
  let target = candidates.find(valid);
  if (!target) {
    if (valid([x, z])) target = [x, z];
    // A map without roads can still descend beside its source buildings.
    for (let radius = 4; !target && radius <= 160; radius += 4) {
      for (let index = 0; index < 24; index++) {
        const angle = index / 24 * Math.PI * 2;
        const candidate = [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius];
        if (valid(candidate)) { target = candidate; break; }
      }
    }
  }
  return target ? [target[0], environment.groundAt(...target) + EYE_HEIGHT, target[1]] : null;
}

export function requestStreetLevel(state, environment) {
  const target = streetTarget(state.position, environment);
  if (!target) return false;
  const distance = Math.hypot(target[0] - state.position[0], target[2] - state.position[2]);
  state.mode = 'street';
  state.assist = { target, phase: distance < 1 ? 'descend' : 'approach', height: Math.max(state.position[1], environment.cruiseHeight) };
  return true;
}

export function requestRoofLevel(state, environment) {
  state.mode = 'rise';
  state.assist = { target: [state.position[0], Math.max(state.position[1], environment.cruiseHeight), state.position[2]] };
}

function sweep(start, end, environment) {
  let fraction = 1;
  for (const building of environment.nearby(start[0], start[2], end[0], end[2])) fraction = Math.min(fraction, buildingHit(building, start, end));
  if (fraction < 1) fraction = Math.max(0, fraction - 0.0001 / Math.max(0.0001, Math.hypot(...end.map((value, axis) => value - start[axis]))));
  return start.map((value, axis) => value + (end[axis] - value) * fraction);
}

function move(state, environment, dt, followGround) {
  const start = state.position, bounds = environment.bounds;
  const target = start.map((value, axis) => value + state.velocity[axis] * dt);
  target[0] = clamp(target[0], bounds.minX, bounds.maxX);
  target[2] = clamp(target[2], bounds.minZ, bounds.maxZ);
  const floor = environment.groundAt(target[0], target[2]) + EYE_HEIGHT;
  const grounded = start[1] - environment.groundAt(start[0], start[2]) <= EYE_HEIGHT + 0.15;
  if (followGround && grounded) target[1] = Math.max(floor, start[1] - 18 * dt);
  target[1] = Math.max(target[1], floor);
  let terrainBlocked = target[1] > start[1] + 18 * dt + 0.001;
  const samples = Math.max(1, Math.ceil(Math.hypot(target[0] - start[0], target[2] - start[2]) / 0.2));
  for (let index = 1; !terrainBlocked && index <= samples; index++) {
    const t = index / samples;
    const x = start[0] + (target[0] - start[0]) * t, z = start[2] + (target[2] - start[2]) * t;
    terrainBlocked = environment.groundAt(x, z) + EYE_HEIGHT > start[1] + (target[1] - start[1]) * t + 0.001;
  }
  if (terrainBlocked) {
    target[0] = start[0]; target[2] = start[2];
    target[1] = Math.max(environment.groundAt(start[0], start[2]) + EYE_HEIGHT, start[1] + state.velocity[1] * dt);
  }
  target[1] = Math.min(target[1], environment.ceiling);
  let position = sweep(start, target, environment);
  // Preserve vertical escape and sliding along walls when forward movement is blocked.
  for (const axis of [1, 0, 2]) {
    if (Math.abs(position[axis] - target[axis]) < 1e-8) continue;
    const slide = [...position]; slide[axis] = target[axis];
    if (slide[1] < environment.groundAt(slide[0], slide[2]) + EYE_HEIGHT - 0.001) continue;
    position = sweep(position, slide, environment);
  }
  state.position = position;
  state.velocity = position.map((value, axis) => (value - start[axis]) / dt);
  state.speed = Math.hypot(state.velocity[0], state.velocity[2]);
}

function assistedTarget(state, environment) {
  if (state.mode === 'tour') {
    if (state.joiningTour) {
      if (state.position[1] < environment.cruiseHeight - 0.3) return [state.position[0], environment.cruiseHeight + 1, state.position[2]];
      state.joiningTour = false;
    }
    return environment.curve.getPointAt(state.progress).toArray();
  }
  const assist = state.assist;
  if (state.mode === 'street' && assist.phase === 'approach') {
    if (state.position[1] < assist.height - 0.3) return [state.position[0], assist.height + 0.2, state.position[2]];
    if (Math.hypot(state.position[0] - assist.target[0], state.position[2] - assist.target[2]) > 0.2) return [assist.target[0], assist.height, assist.target[2]];
    assist.phase = 'descend';
  }
  return assist.target;
}

export function stepFlight(state, environment, input = {}, delta = 0) {
  if (state.paused) return state;
  const duration = Number.isFinite(delta) ? clamp(delta, 0, 0.08) : 0;
  if (!duration) return state;
  if ((input.throttle || input.steer || input.lift || input.boost) && state.mode !== 'manual') setFlightMode(state, 'manual', environment);
  const count = Math.ceil(duration / (1 / 120)), dt = duration / count;
  for (let index = 0; index < count; index++) {
    state.elapsed += dt;
    if (state.mode === 'manual') {
      const throttle = clamp(input.throttle ?? 0, -1, 1), steer = clamp(input.steer ?? 0, -1, 1), lift = clamp(input.lift ?? 0, -1, 1);
      const maximum = input.boost ? 54 : 32;
      const acceleration = throttle > 0 ? throttle * 16 : throttle < 0 ? throttle * 26 : -2.5;
      state.driveSpeed = clamp(state.driveSpeed + acceleration * dt, 0, 54);
      if (state.driveSpeed > maximum) state.driveSpeed = Math.max(maximum, state.driveSpeed - 16 * dt);
      state.yawRate = smooth(state.yawRate, -steer * 0.9, 7, dt);
      state.yaw += state.yawRate * dt;
      state.bank = smooth(state.bank, -steer * 0.18, 5, dt);
      state.velocity[0] = -Math.sin(state.yaw) * state.driveSpeed;
      state.velocity[2] = -Math.cos(state.yaw) * state.driveSpeed;
      state.velocity[1] = smooth(state.velocity[1], lift * 18, 6, dt);
      move(state, environment, dt, lift === 0);
      state.driveSpeed = Math.min(state.driveSpeed, state.speed);
    } else {
      if (state.mode === 'tour' && !state.joiningTour) state.progress = (state.progress + dt * 32 / environment.length) % 1;
      const target = assistedTarget(state, environment);
      const displacement = new Vector3(...target).sub(new Vector3(...state.position));
      const distance = displacement.length();
      const desired = displacement.multiplyScalar(1.8).clampLength(0, 38).toArray();
      desired[1] = clamp(desired[1], -14, 14);
      state.velocity = state.velocity.map((value, axis) => smooth(value, desired[axis], 5, dt));
      if (Math.hypot(desired[0], desired[2]) > 0.1) {
        const turn = wrapAngle(Math.atan2(-desired[0], -desired[2]) - state.yaw);
        state.yaw += turn * (1 - Math.exp(-2.5 * dt));
        state.bank = smooth(state.bank, clamp(turn * 0.4, -0.16, 0.16), 4, dt);
      } else state.bank = smooth(state.bank, 0, 4, dt);
      move(state, environment, dt, false);
      if (state.mode !== 'tour' && (state.mode !== 'street' || state.assist.phase === 'descend') && distance < 0.04 && Math.hypot(...state.velocity) < 0.12) {
        setFlightMode(state, 'manual', environment);
        state.driveSpeed = 0;
        state.speed = 0;
        state.velocity = [0, 0, 0];
      }
    }
  }
  return state;
}
