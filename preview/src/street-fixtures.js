import { STREET, isWalkway, streetSection, crossingDistance } from './street-profile.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { groundSurfaceHeight } from './world-surface.js';
import { localToScene, routeSegments, sampleRoute } from './geometry.js';

// Where street furniture stands, derived only from world data. The browser
// draws from these placements and the authoritative town checks interactions
// against them, so both must import this module rather than copy it.
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

// No fixture may stand on any mapped road or walkway, whatever its width.
// With `vehiclesOnly`, walkways count as pavement (for where people arrive).
export function clearOfRoads(world, x, z, clearance = 0.7, { vehiclesOnly = false } = {}) {
  return !(world.roads ?? []).some(road => !(vehiclesOnly && isWalkway(road)) && distanceToRoad(road, x, z) < road.width_m / 2 + clearance);
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

// A bench and lamp column beside every third storefront, on the pavement: the
// first of a few spots off the shopfront that clears every drawn road, lamp
// arm included. A storefront with no clear spot simply goes without.
export function storefrontBenchSpots(world) {
  const spots = [];
  (world.stores ?? []).forEach((store, index) => {
    if (index % 3 || !Array.isArray(store.visit) || !Array.isArray(store.outward)) return;
    const [nx, ny] = store.outward;
    const candidates = [];
    for (const out of [2.8, 1.8, 1.1]) for (const along of [4, -4, 6.5, -6.5, 9, -9]) candidates.push([out, along]);
    for (const [out, along] of candidates) {
      const x = store.visit[0] + nx * out + ny * along, north = store.visit[1] + ny * out - nx * along;
      const lamp = [x + nx * 1.2, north + ny * 1.2];
      if (clearOfRoads(world, x, -north, 1.2) && clearOfRoads(world, lamp[0], -lamp[1], 0.9)) { spots.push({ storeId: store.id, x, north, outward: [nx, ny] }); return; }
    }
  });
  return spots;
}

