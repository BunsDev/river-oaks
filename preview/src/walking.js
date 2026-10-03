import { terrainHeight } from './geometry.js';
import { groundSurfaceHeight } from './world-surface.js';
import { storeRoomsFor, roomAt, roomBlocked } from './store-rooms.js';
import { roomBlocksConversation } from './conversation-sight.js';
import { beastTraversal } from './beast-traversal.js';

const RADIUS = 0.35, EYE_HEIGHT = 1.68;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

function overlaps(x, z, ring, radius = RADIUS) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (distanceToSegment(x, z, a, b) < radius) return true;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function createWalkingEnvironment(world, placedObjects = []) {
  const [west, south, east, north] = world.bounds_m;
  const polygons = (world.collisionPolygons ?? []).map((ring) => ring.map(([x, y]) => [x, -y]));
  if (!world.collisionPolygons) for (const building of world.buildings ?? []) {
    const angle = (building.yaw_deg ?? 0) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle), w = building.size[0] / 2, d = building.size[1] / 2;
    polygons.push([[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => [building.center[0] + x * c - y * s, -(building.center[1] + x * s + y * c)]));
  }
  const obstacles = polygons.map((ring) => ({ ring, minX: Math.min(...ring.map(p => p[0])) - RADIUS, maxX: Math.max(...ring.map(p => p[0])) + RADIUS, minZ: Math.min(...ring.map(p => p[1])) - RADIUS, maxZ: Math.max(...ring.map(p => p[1])) + RADIUS }));
  // Boutique interiors are free pockets inside footprints, entered through the mapped door.
  const rooms = storeRoomsFor(world);
  const roomFor = (x, z, shrink) => rooms.length ? roomAt(rooms, x, -z, shrink) : null;
  const groundAt = (x, z) => roomFor(x, z, 0)?.floor ?? groundSurfaceHeight(world,x,z);
  // Match the rendered roof outline, including mapped nonrectangular buildings.
  // The 3.1m margin clears the 2.6m roof bulkhead plus the bubble's lower arc.
  const flightRadius=1.3, roofs=(world.buildings??[]).map(building=>{
    const angle=(building.yaw_deg??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const ring=building.ring?.map(([x,y])=>[x,-y])??[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[building.center[0]+x*building.size[0]/2*c-y*building.size[1]/2*s,-building.center[1]-x*building.size[0]/2*s-y*building.size[1]/2*c]);
    return {ring,top:(building.center[2]??terrainHeight(world.terrain,building.center[0],building.center[1]))+building.size[2]+3.1};
  });
  // Imported collision-only worlds have no roof metadata; retain a finite safe cap.
  if(!roofs.length)for(const ring of polygons)roofs.push({ring,top:Math.max(...ring.map(([x,z])=>terrainHeight(world.terrain,x,-z)))+23.1});
  for(const roof of roofs)Object.assign(roof,{minX:Math.min(...roof.ring.map(p=>p[0]))-flightRadius,maxX:Math.max(...roof.ring.map(p=>p[0]))+flightRadius,minZ:Math.min(...roof.ring.map(p=>p[1]))-flightRadius,maxZ:Math.max(...roof.ring.map(p=>p[1]))+flightRadius});
  // A stable district altitude ceiling prevents corrections as terrain changes
  // beneath the bubble. Client motion and shared pose/checkpoint validation use it.
  const flightCeiling=Math.max(32,...roofs.map(roof=>roof.top+5-Math.min(...roof.ring.map(([x,z])=>groundAt(x,z)))));
  const baseIsFree = (x, z) => {
    if (x < west + RADIUS || x > east - RADIUS || z < -north + RADIUS || z > -south - RADIUS) return false;
    const room = roomFor(x, z, RADIUS);
    if (room) return !roomBlocked(room, x, -z, RADIUS);
    return !obstacles.some(o => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ && overlaps(x, z, o.ring));
  };
  const isFree = (x,z) => {
    if(!baseIsFree(x,z))return false;
    if(!placedObjects.length)return true;
    // Every obstacle tests the same candidate position. Resolve its surface
    // once, while keeping later queries fresh for moving objects and terrain.
    const y=groundAt(x,z)+.9;
    return !placedObjects.some(object=>object.contains(x,y,z,RADIUS));
  };
  const canFly = (x, altitude, z) => {
    if(x<west+flightRadius || x>east-flightRadius || z<-north+flightRadius || z>-south-flightRadius) return false;
    if(placedObjects.some(object=>object.contains(x,altitude,z,flightRadius)))return false;
    return !roofs.some(roof=>altitude<=roof.top && x>roof.minX && x<roof.maxX && z>roof.minZ && z<roof.maxZ && overlaps(x,z,roof.ring,flightRadius));
  };
  const hasSightLine=(from,to)=>{
    const room=roomFor(from[0],-from[1],0),targetRoom=roomFor(to[0],-to[1],0);
    if((room?.storeId??null)!==(targetRoom?.storeId??null))return false;
    if(room)return !roomBlocksConversation(room,from,to);
    const steps=Math.max(1,Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/0.15));
    for(let i=0;i<=steps;i++) {
      const t=i/steps,x=from[0]+(to[0]-from[0])*t,z=-from[1]-(to[1]-from[1])*t,y=from[2]+(to[2]-from[2])*t;
      if(!baseIsFree(x,z)||roomFor(x,z,0)||placedObjects.some(object=>object.contains(x,y,z,.035)))return false;
    }
    return true;
  };
  return { groundAt, isFree, canFly, flightCeiling, hasSightLine, roomAt: (x, z) => roomFor(x, z, 0), rooms, bounds: [west, -north, east, -south], spawn: world.walkSpawn ?? [(west + east) / 2, (south + north) / 2, 0] };
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
  return { position: [x, environment.groundAt(x, z) + EYE_HEIGHT, z], yaw, pitch: 0, distance: 0, speed: 0, velocity: [0, 0], acceleration: [0, 0] };
}

// Velocity follows the input as a critically damped spring, so a key press
// builds acceleration over a few frames instead of jumping to it. The first
// frame of a step used to carry the whole peak at once, which read as a jolt.
// Semi-implicit Euler on the fixed 120 Hz substep keeps it frame-rate stable.
export const WALK_RESPONSE = 16;
export function trackVelocity(state, vx, vz, dt) {
  const acceleration = state.acceleration ?? (state.acceleration = [0, 0]), omega = WALK_RESPONSE;
  acceleration[0] += (-2 * omega * acceleration[0] - omega * omega * (state.velocity[0] - vx)) * dt;
  acceleration[1] += (-2 * omega * acceleration[1] - omega * omega * (state.velocity[1] - vz)) * dt;
  state.velocity[0] += acceleration[0] * dt;
  state.velocity[1] += acceleration[1] * dt;
}

export function stepWalking(state, environment, input, delta) {
  if (!Number.isFinite(delta) || delta <= 0) return state;
  const duration = Math.min(delta, 0.08), steps = Math.ceil(duration * 120), dt = duration / steps;
  const forward = clamp(input.forward ?? 0, -1, 1), strafe = clamp(input.strafe ?? 0, -1, 1), norm = Math.max(1, Math.hypot(forward, strafe));
  const beast=beastTraversal(input.beastKind);
  const turning=Math.abs(clamp(input.turn??0,-1,1));
  const speed=(beast?(input.fast?beast.sprint:beast.walk):(input.fast?3.2:1.65))*(beast&&input.fast?1-beast.turnSlowdown*turning:1);
  for (let i = 0; i < steps; i++) {
    state.yaw += clamp(input.turn ?? 0, -1, 1) * (beast?.turn??1.6) * dt;
    const vx = (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * strafe) * speed / norm;
    const vz = (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * strafe) * speed / norm;
    trackVelocity(state, vx, vz, dt);
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

export function steerWalkingToward(state, point, delta) {
  const desired = Math.atan2(state.position[0] - point[0], state.position[2] + point[1]);
  const difference = Math.atan2(Math.sin(desired - state.yaw), Math.cos(desired - state.yaw));
  state.yaw += Math.max(-delta * 1.6, Math.min(delta * 1.6, difference));
  state.pitch *= Math.exp(-4 * delta);
  // Turn in place at corners so inertia cannot cut through fixture clearance.
  if (Math.abs(difference) > 0.08) { state.velocity = [0, 0]; state.acceleration = [0, 0]; return { forward: 0 }; }
  const distance = Math.hypot(state.position[0] - point[0], state.position[2] + point[1]);
  return { forward: Math.min(1, distance / 0.4) };
}
