import { terrainHeight } from './geometry.js';

const RADIUS = 0.35, EYE_HEIGHT = 1.68;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

function overlaps(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (distanceToSegment(x, z, a, b) < RADIUS) return true;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function createWalkingEnvironment(world) {
  const [west, south, east, north] = world.bounds_m;
  const polygons = (world.collisionPolygons ?? []).map((ring) => ring.map(([x, y]) => [x, -y]));
  if (!world.collisionPolygons) for (const building of world.buildings ?? []) {
    const angle = (building.yaw_deg ?? 0) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle), w = building.size[0] / 2, d = building.size[1] / 2;
    polygons.push([[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => [building.center[0] + x * c - y * s, -(building.center[1] + x * s + y * c)]));
  }
  const obstacles = polygons.map((ring) => ({ ring, minX: Math.min(...ring.map(p => p[0])) - RADIUS, maxX: Math.max(...ring.map(p => p[0])) + RADIUS, minZ: Math.min(...ring.map(p => p[1])) - RADIUS, maxZ: Math.max(...ring.map(p => p[1])) + RADIUS }));
  const groundAt = (x, z) => terrainHeight(world.terrain, x, -z) + (world.walkSurfaceOffset ?? 0);
  const isFree = (x, z) => x >= west + RADIUS && x <= east - RADIUS && z >= -north + RADIUS && z <= -south - RADIUS && !obstacles.some(o => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ && overlaps(x, z, o.ring));
  return { groundAt, isFree, bounds: [west, -north, east, -south], spawn: world.walkSpawn ?? [(west + east) / 2, (south + north) / 2, 0] };
}

export function createWalkingState(environment, position = environment.spawn, yaw = 0) {
  let [x, north] = position, z = -north;
  if (!environment.isFree(x, z)) {
    let found = false;
    for (let radius = 1; radius < 150 && !found; radius++) for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2, px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      if (environment.isFree(px, pz)) { x = px; z = pz; found = true; break; }
    }
    if (!found) throw new Error('No accessible walking position near this destination');
  }
  return { position: [x, environment.groundAt(x, z) + EYE_HEIGHT, z], yaw, pitch: 0, distance: 0, speed: 0, velocity: [0, 0] };
}

export function stepWalking(state, environment, input, delta) {
  if (!Number.isFinite(delta) || delta <= 0) return state;
  const duration = Math.min(delta, 0.08), steps = Math.ceil(duration * 120), dt = duration / steps;
  const forward = clamp(input.forward ?? 0, -1, 1), strafe = clamp(input.strafe ?? 0, -1, 1), norm = Math.max(1, Math.hypot(forward, strafe));
  const speed = input.fast ? 3.2 : 1.65;
  for (let i = 0; i < steps; i++) {
    state.yaw += clamp(input.turn ?? 0, -1, 1) * 1.6 * dt;
    const vx = (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * strafe) * speed / norm;
    const vz = (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * strafe) * speed / norm;
    state.velocity[0] += (vx - state.velocity[0]) * (1 - Math.exp(-12 * dt));
    state.velocity[1] += (vz - state.velocity[1]) * (1 - Math.exp(-12 * dt));
    const [x, y, z] = state.position;
    let nextX = x, nextZ = z;
    const canStep = (px, pz) => environment.isFree(px, pz) && Math.abs(environment.groundAt(px, pz) + EYE_HEIGHT - y) < 0.4;
    if (canStep(x + state.velocity[0] * dt, z)) nextX += state.velocity[0] * dt;
    if (canStep(nextX, z + state.velocity[1] * dt)) nextZ += state.velocity[1] * dt;
    const distance = Math.hypot(nextX - x, nextZ - z);
    state.distance += distance;
    state.speed = distance / dt;
    state.position = [nextX, environment.groundAt(nextX, nextZ) + EYE_HEIGHT, nextZ];
  }
  return state;
}
