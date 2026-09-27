import { STREET, isWalkway, streetSection, sidewalkOffset, crossingDistance } from './street-profile.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { buildPlanterPlanting } from './landscape-models.js';
import * as THREE from 'three';
import { groundSurfaceHeight } from './world-surface.js';
import { RETRO } from './retro-palette.js';
import { localToScene, routeSegments, sampleRoute, terrainHeight } from './geometry.js';

// Street-scale detail derived from the mapped road centrelines: kerbs along
// every vehicular lane, lamp columns and planters on alternating sides, and
// mulched pits under every mapped or scanned trunk. Nothing here is surveyed;
// positions follow the source lines so the furniture cannot leave the streets.
export const LANE_WIDTH_MIN = 5;
export const LAMP_SPACING = 22;

export function distanceToRoad(road, x, z) {
  let nearest = Infinity;
  for (let i = 1; i < road.points.length; i++) {
    const a = localToScene(road.points[i - 1]), b = localToScene(road.points[i]);
    const dx = b[0] - a[0], dz = b[2] - a[2], lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz));
  }
  return nearest;
}

// Walkways are paved paths for people; every other mapped road carries cars.
export { WALKWAY_KINDS, isWalkway } from './street-profile.js';

// No fixture may stand on any mapped road or walkway, whatever its width.
// With `vehiclesOnly`, walkways count as pavement (for where people arrive).
export function clearOfRoads(world, x, z, clearance = 0.7, { vehiclesOnly = false } = {}) {
  return !world.roads.some(road => !(vehiclesOnly && isWalkway(road)) && distanceToRoad(road, x, z) < road.width_m / 2 + clearance);
}

// Kerbs stop short of junctions instead of crossing the joining lane, and
// fixtures keep clear of every lane edge, including their own at inner bends.
function crossesAnotherLane(world, road, x, z, clearance = 0.4) {
  return world.roads.some(other => other !== road && !isWalkway(other) && distanceToRoad(other, x, z) < other.width_m / 2 + clearance);
}

// Kerb strips: [x, y, z, yaw, length] per subdivided lane segment side.
export function kerbStrips(world) {
  const strips = [], network = createPedestrianNetwork(world);
  for (const road of world.roads) {
    if (isWalkway(road)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = localToScene(road.points[i - 1]), b = localToScene(road.points[i]);
      const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
      if (length < 0.5) continue;
      const half = road.width_m / 2 + STREET.curbWidth / 2, ox = -dz / length * half, oz = dx / length * half;
      const steps = Math.max(1, Math.ceil(length / 1.4)), yaw = Math.atan2(dx, dz);
      for (let step = 0; step < steps; step++) for (const side of [-1, 1]) {
        const f = (step + 0.5) / steps, x = a[0] + dx * f + ox * side, z = a[2] + dz * f + oz * side;
        if (crossesAnotherLane(world, road, x, z) || crossingDistance(network,road.id,[x,-z]) < STREET.crossingWidth/2+STREET.flareRun+length/steps/2) continue;
        strips.push([x, terrainHeight(world.terrain, x, -z) + sidewalkOffset(road.width_m,STREET.curbWidth/2)-STREET.curbReveal/2, z, yaw, length / steps + 0.02]);
      }
    }
  }
  return strips;
}

// Lamp columns and planters alternate sides along each lane, sampled by
// distance so spacing is regular even where the source polyline is dense.
export function laneFixtures(world, isFree = () => true) {
  const lamps = [], planters = [], bins = [], network = createPedestrianNetwork(world);
  const clearRamp=(road,x,z)=>crossingDistance(network,road.id,[x,-z])>STREET.crossingWidth/2+STREET.flareRun+.8;
  world.roads.forEach((road, roadIndex) => {
    if (isWalkway(road)) return;
    const route = routeSegments(road.points);
    if (!route || route.length < LAMP_SPACING) return;
    const offset = road.width_m / 2 + (STREET.curbWidth+streetSection(road).furnitureWidth)/2;
    for (let distance = LAMP_SPACING / 2, count = 0; distance < route.length - 4; distance += LAMP_SPACING, count++) {
      const { position: [x, , z], direction } = sampleRoute(route, distance);
      const side = (count + roadIndex) % 2 ? 1 : -1;
      const px = x - direction[1] * offset * side, pz = z + direction[0] * offset * side;
      if (!isFree(px, pz) || !clearOfRoads(world, px, pz) || !clearRamp(road,px,pz)) continue;
      const yaw = Math.atan2(direction[0], direction[1]);
      lamps.push([px, groundSurfaceHeight(world, px, pz), pz, yaw, side]);
      const mid = sampleRoute(route, Math.min(route.length - 2, distance + LAMP_SPACING / 2));
      const qx = mid.position[0] + mid.direction[1] * offset * side, qz = mid.position[2] - mid.direction[0] * offset * side;
      if (isFree(qx, qz) && clearOfRoads(world, qx, qz) && clearRamp(road,qx,qz)) (count % 3 === 2 ? bins : planters).push([qx, groundSurfaceHeight(world, qx, qz), qz, Math.atan2(mid.direction[0], mid.direction[1])+Math.PI/2]);
    }
  });
  return { lamps, planters, bins };
}

export function treePits(world) {
  const pits = [];
  for (const tree of world.trees ?? []) pits.push([tree.position[0], groundSurfaceHeight(world,tree.position[0],-tree.position[1]), -tree.position[1], Math.min(1.4, Math.max(0.7, tree.crown_radius_m * 0.28))]);
  for (const support of world.vegetation?.branch_supports ?? []) pits.push([support.position[0], groundSurfaceHeight(world,support.position[0],-support.position[1]), -support.position[1], Math.min(1.3, Math.max(0.65, support.radius_m * 0.32))]);
  return pits;
}

// Clipped boxwood: overlapping rounded lobes filling a planter of the given
// footprint, each [dx, dy, dz, scale, yaw]. Deterministic per call.
export function hedgeClusters(width, depth, height, seed = 7) {
  const lobes = [], columns = Math.max(1, Math.round(width / 0.3)), rows = Math.max(1, Math.round(depth / 0.3));
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
    const size = 0.5 + random() * 0.18;
    lobes.push([(column + 0.5) / columns * width - width / 2 + (random() - 0.5) * 0.1, height * (0.55 + random() * 0.2) - height * 0.5, (row + 0.5) / rows * depth - depth / 2 + (random() - 0.5) * 0.1, [width / columns * 1.35, height * size * 1.9, depth / rows * 1.35], random() * Math.PI]);
  }
  return lobes;
}

export function buildStreetFurniture(world, isFree) {
  const group = new THREE.Group(); group.name = 'Street furniture';
  const box = new THREE.BoxGeometry(1, 1, 1), disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 20), post = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const bronze = new THREE.MeshStandardMaterial({ color: RETRO.deepTeal, roughness: 0.5, metalness: 0.65 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: RETRO.light, emissive: RETRO.light, emissiveIntensity: 2.2, roughness: 0.4 });
  const stoneCast = new THREE.MeshStandardMaterial({ color: RETRO.porcelain, roughness: 0.85 });
  const mulch = new THREE.MeshStandardMaterial({ color: '#3a2d22', roughness: 1 });
  const grate = new THREE.MeshStandardMaterial({ color: '#4a4b48', roughness: 0.6, metalness: 0.55 });
  const orbital = new THREE.TorusGeometry(.52,.023,6,40);orbital.rotateX(Math.PI/2);
  const canopy = new THREE.SphereGeometry(1,20,10),brass=new THREE.MeshStandardMaterial({color:RETRO.brass,metalness:.8,roughness:.28});
  const batches = new Map(), dummy = new THREE.Object3D();
  const add = (geometry, material, position, scale, yaw = 0, color = null) => {
    const key = `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, parts: [] });
    batches.get(key).parts.push({ position, scale, yaw, color });
  };
  // Curbs now belong to the graded street surface, including ramp openings.
  const { lamps, planters, bins } = laneFixtures(world, isFree);
  for (const [x, y, z, yaw, side] of lamps) {
    add(post, bronze, [x, y + 0.12, z], [0.34, 0.24, 0.34], yaw);
    add(post, bronze, [x, y + 2.6, z], [0.11, 4.9, 0.11], yaw);
    // An opal globe and a shallow ceramic disc recall mid-century orbital lamps.
    add(canopy,stoneCast,[x,y+5.08,z],[.61,.11,.61],yaw);
    add(canopy,lampGlow,[x,y+4.93,z],[.28,.19,.28],yaw);
    add(orbital,brass,[x,y+5.02,z],[1.12,1,1.12],yaw);
    add(post,brass,[x,y+4.7,z],[.15,.065,.15],yaw);
  }
  for (const [x, y, z, yaw] of planters) {
    add(box,bronze,[x,y+.06,z],[1.38,.12,.5],yaw);
    add(box, stoneCast, [x, y + 0.36, z], [1.5, 0.5, 0.62], yaw);
    add(box,bronze,[x,y+.18,z],[1.52,.055,.64],yaw);
    add(box,brass,[x,y+.59,z],[1.52,.025,.64],yaw);
  }
  group.add(buildPlanterPlanting(planters));
  group.userData.forceObjects=[];
  group.userData.forceObstacles=[...planters.map(([x,y,z])=>({x,z,radius:.86})),...lamps.map(([x,y,z])=>({x,z,radius:.2}))];
  for (const [index,[x, y, z, yaw]] of bins.entries()) {
    const bin=new THREE.Group();bin.name='Street bin';bin.position.set(x,y,z);bin.rotation.y=yaw;
    for(const [material,height,width,depth]of [[bronze,.48,.5,.95],[grate,.98,.54,.05]]) {
      const mesh=new THREE.Mesh(post,material);mesh.position.y=height;mesh.scale.set(width,depth,width);mesh.castShadow=mesh.receiveShadow=true;bin.add(mesh);
    }
    bin.userData.forceBody={id:`street-bin-${index}`,name:'Street bin',mass:18,radius:.28,height:1.01};
    group.add(bin);group.userData.forceObjects.push(bin);
  }
  for (const [x, y, z, radius] of treePits(world)) {
    add(disc, grate, [x, y + 0.006, z], [radius * 2 + 0.3, 0.02, radius * 2 + 0.3]);
    add(disc, mulch, [x, y + 0.012, z], [radius * 2, 0.03, radius * 2]);
  }
  for (const { geometry, material, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    parts.forEach((p, i) => { dummy.position.fromArray(p.position); dummy.scale.fromArray(p.scale); dummy.rotation.set(0, p.yaw, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); if (p.color) mesh.setColorAt(i, p.color); });
    mesh.castShadow = material !== mulch && material !== lampGlow; mesh.receiveShadow = true; group.add(mesh);
  }
  group.userData.counts = { kerbs: kerbStrips(world).length, lamps: lamps.length, planters: planters.length, bins: bins.length, pits: treePits(world).length };
  return group;
}
