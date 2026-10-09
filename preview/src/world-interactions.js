import { winstonBed } from './reference-planting.js';
import { storefrontBenchSpots, laneFixtures } from './street-fixtures.js';
import { SEAT_REACH, resolveSeat, seatSlots } from './shared-seating.js';

// Places a character can sit and planters they can water, shared by the
// browser, the townspeople and the authoritative town. Positions are world
// [east, north]; a heading is the direction a body faces, in the same
// convention as resident and avatar headings (atan2(dx, -dnorth)). A seat's
// height is its surface above the ground, which the seated pose stands its
// feet from. IDs are stable across processes: benches by store, builds by
// build ID, lane planters by position.
//
// Seats use the shared seating model (shared-seating.js): a player sits on
// {buildId, slot}. A storefront bench is the seat 'bench:<store>' with slots
// 0 and 1; a seat's id is `${buildId}:${slot}` either way.

export const SIT_REACH = SEAT_REACH;
export const WATER_REACH = 2.2;
export const WATER_MS = 3600;
const BENCH_HEIGHT = 0.53, GARDEN_SEAT_HEIGHT = 0.71, ARMCHAIR_HEIGHT = 0.6;

export const headingTo = (from, to) => Math.atan2(to[0] - from[0], -(to[1] - from[1]));
const offset = ([x, north], heading, forward, right = 0) =>
  [x + Math.sin(heading) * forward + Math.cos(heading) * right, north - Math.cos(heading) * forward + Math.sin(heading) * right];

// Two places on every storefront bench, facing the street. Townspeople and
// players share them.
export function benchSeats(world) {
  const seats = [];
  for (const { storeId, x, north, outward: [nx, ny] } of storefrontBenchSpots(world)) {
    const heading = Math.atan2(nx, -ny);
    [-0.45, 0.45].forEach((right, slot) => {
      const [sx, sn] = offset([x, north], heading, -0.05, right);
      seats.push({ id: `bench:${storeId}:${slot}`, buildId: `bench:${storeId}`, slot, kind: 'bench', storeId, x: sx, north: sn, heading, height: BENCH_HEIGHT,
        approach: offset([sx, sn], heading, 0.75) });
    });
  }
  return seats;
}

// Jevica's garden seats hold two, her lounge chairs one, placed exactly as
// the shared seating model places them.
export function buildSeats(builds = []) {
  return builds.filter(item => item && Array.isArray(item.position)).flatMap(item => seatSlots(item.kind).map(slot => {
    const seat = resolveSeat(item, slot);
    return { id: `${item.id}:${slot}`, buildId: item.id, slot, kind: item.kind, x: seat.position[0], north: seat.position[1],
      heading: seat.yaw, height: seat.height, approach: offset(seat.position, seat.yaw, item.kind === 'seat' ? 0.8 : 0.95) };
  }));
}

// A storefront bench place as the shared seating model resolves a seat:
// {buildId, slot, height, yaw, position: [east, north, ground]}.
export function resolveBenchSeat(benches, buildId, slot, groundAt) {
  const seat = benches.find(item => item.buildId === buildId && item.slot === slot);
  return seat ? { buildId, slot, height: seat.height, yaw: seat.heading, position: [seat.x, seat.north, groundAt(seat.x, seat.north)] } : null;
}

// Boxwood planters flank each boutique entrance (district.js draws them).
export function boutiquePlanters(world) {
  const planters = [];
  for (const store of world.stores ?? []) {
    const dining = ['restaurant', 'ice_cream'].includes(store.category);
    if (dining || store.name === 'Le Colonial' || !Array.isArray(store.facade) || !Array.isArray(store.outward)) continue;
    const bed=store.name==='Harry Winston' && winstonBed(world);
    if(bed) {
      [bed.shrubs[0],bed.shrubs.at(-1)].forEach(({position:[x,north]},index)=>planters.push({id:`planter:${store.id}:${index}`,kind:'boxwood',x,north}));
      continue;
    }
    const [x, north] = store.facade, [nx, ny] = store.outward;
    [-1.6, 1.6].forEach((across, index) => planters.push({ id: `planter:${store.id}:${index}`, kind: 'boxwood',
      x: x - ny * across + nx * 1.05, north: north + nx * across + ny * 1.05 }));
  }
  return planters;
}

// Street planters between the lamp columns (street-furniture.js draws them).
// `isFree(x, z)` is the same open-pavement test the browser draws them with.
export function lanePlanters(world, isFree) {
  return laneFixtures(world, isFree).planters.map(([x, , z]) =>
    ({ id: `planter:lane:${Math.round(x * 10)}:${Math.round(-z * 10)}`, kind: 'street', x, north: -z }));
}

export function buildPlanters(builds = []) {
  return builds.filter(item => item?.kind === 'planter' && Array.isArray(item.position))
    .map(item => ({ id: `planter:${item.id}`, kind: 'build', buildId: item.id, x: item.position[0], north: item.position[1] }));
}

const within = (position, site, reach) => Math.hypot(site.x - position[0], site.north - position[1]) <= reach;

// The closest seat place in reach that nobody holds.
export function nearestSeat(seats, position, { reach = SIT_REACH, taken = new Set() } = {}) {
  let best = null, distance = Infinity;
  for (const seat of seats) {
    if (taken.has(seat.id) || !within(position, seat, reach)) continue;
    const d = Math.hypot(seat.x - position[0], seat.north - position[1]);
    if (d < distance) { best = seat; distance = d; }
  }
  return best;
}

export function nearestPlanter(planters, position, reach = WATER_REACH) {
  let best = null, distance = Infinity;
  for (const planter of planters) {
    const d = Math.hypot(planter.x - position[0], planter.north - position[1]);
    if (d <= reach && d < distance) { best = planter; distance = d; }
  }
  return best;
}
