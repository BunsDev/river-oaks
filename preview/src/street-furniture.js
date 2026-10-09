import { winstonBed, insideReferenceBed } from './reference-planting.js';
import { STREET, isWalkway, streetSection, sidewalkOffset, crossingDistance } from './street-profile.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { buildPlanterPlanting, matureTreePlacements } from './landscape-models.js';
import * as THREE from 'three';
import { groundSurfaceHeight } from './world-surface.js';
import { RETRO } from './retro-palette.js';
import { localToScene, routeSegments, sampleRoute, terrainHeight } from './geometry.js';
import { distanceToRoad, clearOfRoads, laneFixtures, LAMP_SPACING } from './street-fixtures.js';

// Placement lives in a module without rendering imports, so the authoritative
// town can list the same benches and planters the browser draws.
export { distanceToRoad, clearOfRoads, laneFixtures, LAMP_SPACING };

// Street-scale detail derived from the mapped road centrelines: kerbs along
// every vehicular lane, lamp columns and planters on alternating sides, and
// mulched pits under every mapped or scanned trunk. Nothing here is surveyed;
// positions follow the source lines so the furniture cannot leave the streets.
export const LANE_WIDTH_MIN = 5;

// Walkways are paved paths for people; every other mapped road carries cars.
export { WALKWAY_KINDS, isWalkway } from './street-profile.js';

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

// One flush, square tree pit per rendered trunk, its grate square to the
// nearest street like a set paving unit: [x, y, z, size, yaw]. Pits follow
// the same placements that draw the trees, so none is empty or doubled.
export const TREE_GRATE = 1.3, TREE_FRAME = 0.1;
export function treePits(world) {
  const segments = (world.roads ?? []).flatMap(road => (road.points ?? []).slice(1).map((b, i) => [road.points[i], b]));
  const streetYaw = (x, north) => {
    let best = Infinity, yaw = 0;
    for (const [a, b] of segments) {
      const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dy) / length2));
      const gap = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - north);
      if (gap < best) { best = gap; yaw = Math.atan2(dy, dx); }
    }
    return yaw;
  };
  const bed=winstonBed(world);
  return matureTreePlacements(world).filter(({position:[x,,z]})=>!insideReferenceBed(bed,x,-z)).map(({ position: [x, y, z] }) => [x, y, z, TREE_GRATE, streetYaw(x, -z)]);
}

// Cast-iron grate: concentric square slot rings broken by radial ties, a
// solid rim, and a round opening where the trunk rises through soil.
export function treeGrateTexture(size = 64) {
  const data = new Uint8Array(size * size * 4), iron = [52, 54, 52], slot = [16, 17, 16], soil = [40, 32, 25];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, ring = Math.max(Math.abs(u), Math.abs(v)), r = Math.hypot(u, v);
    const tie = Math.abs(Math.abs(u) - Math.abs(v)) < 0.06 || Math.abs(u) < 0.035 || Math.abs(v) < 0.035;
    const color = r < 0.3 ? soil : r < 0.36 ? iron : ring > 0.9 ? iron : !tie && (ring * 9) % 1 < 0.42 ? slot : iron;
    data.set([...color, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
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
  const grate = new THREE.MeshStandardMaterial({ color: '#4a4b48', roughness: 0.6, metalness: 0.55 });
  // Tree pits sit flush in the paving: a pale stone frame and an iron grate.
  const flush = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
  const pitStone = new THREE.MeshStandardMaterial({ color: '#bdb3a2', roughness: 0.86, ...flush });
  const treeGrate = new THREE.MeshStandardMaterial({ map: treeGrateTexture(), roughness: 0.55, metalness: 0.6, ...flush });
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
  for (const [x, y, z, yaw] of bins) {
    const bin=new THREE.Group();bin.name='Street bin';bin.position.set(x,y,z);bin.rotation.y=yaw;
    for(const [material,height,width,depth]of [[bronze,.48,.5,.95],[grate,.98,.54,.05]]) {
      const mesh=new THREE.Mesh(post,material);mesh.position.y=height;mesh.scale.set(width,depth,width);mesh.castShadow=mesh.receiveShadow=true;bin.add(mesh);
    }
    group.add(bin);
  }
  for (const [x, y, z, size, yaw] of treePits(world)) {
    add(box, pitStone, [x, y + 0.004, z], [size + TREE_FRAME * 2, 0.008, size + TREE_FRAME * 2], yaw);
    add(box, treeGrate, [x, y + 0.006, z], [size, 0.008, size], yaw);
  }
  for (const { geometry, material, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    // A per-build texture is released with the world (see the reload teardown in main.js).
    if (material === treeGrate) mesh.userData.texture = treeGrate.map;
    parts.forEach((p, i) => { dummy.position.fromArray(p.position); dummy.scale.fromArray(p.scale); dummy.rotation.set(0, p.yaw, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); if (p.color) mesh.setColorAt(i, p.color); });
    mesh.castShadow = material !== pitStone && material !== treeGrate && material !== lampGlow; mesh.receiveShadow = true; group.add(mesh);
  }
  group.userData.counts = { kerbs: kerbStrips(world).length, lamps: lamps.length, planters: planters.length, bins: bins.length, pits: treePits(world).length };
  return group;
}
