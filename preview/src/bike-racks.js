import { plazaSalonPlan, plazaSalonRack } from './plaza-salon-plan.js';

// The District's bike racks beyond the plaza's (plaza-salon-plan.js keeps that
// one): curbside racks on the access lanes, spread so a bike is a short walk
// from most of the District. Each has the plaza rack's shape, a bronze bar
// `length` long near the curb with `slots` bikes `pitch` apart, parked
// `setback` off the bar on the footway side; `heading` is the way the bikes
// point (0 = south) and `approach` is where a rider walks up, beyond the bike.
// Every spot is clear of the lanes, crossings, doors, seats, planters, lamps
// and tree pits in each District revision (bike-racks.test.js).
const SHAPE = { slots: 4, pitch: 0.9, length: 3.2, setback: 1.1, approach: 0.9 };
const CITY_RACKS = [
  // North, across the lane from Amorino. It stood at (-2760, -1210.5) parking east, with its
  // bikes on the Five Rooms Ribbon's post line; the footway between curb and posts is ~1.75 m,
  // so it moved to the nearest spot that keeps every rule here and 1 m off the Ribbon walk
  // (#841). The id stays, so saved slots keep their names.
  { id: 'amorino-rack', x: -2775.5, north: -1203.0, heading: -Math.PI / 2 },
  // East, by Cartier.
  { id: 'cartier-rack', x: -2744.0, north: -1295.5, heading: 0 },
  // South, by Harry Winston.
  { id: 'harry-winston-rack', x: -2762.0, north: -1355.0, heading: Math.PI / 2 },
  // Southeast, by Saint Bernard.
  { id: 'saint-bernard-rack', x: -2683.0, north: -1405.0, heading: Math.PI / 2 },
  // Southwest, by Steak 48.
  { id: 'steak-48-rack', x: -2877.0, north: -1427.0, heading: Math.PI },
  // West, between Diptyque and Baccarat.
  { id: 'diptyque-rack', x: -2823.5, north: -1316.0, heading: -Math.PI / 2 },
].map(rack => Object.freeze({ ...SHAPE, ...rack }));

const along = ([x, north], angle, distance) => [x + Math.sin(angle) * distance, north - Math.cos(angle) * distance];
const across = (rack, offset) => [rack.x + Math.cos(rack.heading) * offset, rack.north + Math.sin(rack.heading) * offset];

// The curbside racks stand in the District only, where the plaza rack does.
export function cityBikeRacks(world) {
  return plazaSalonPlan(world) ? CITY_RACKS : [];
}

// A rack's slots, as plazaSalonRack lays out the plaza's: `${rack.id}:${n}`.
export function rackSlots(rack) {
  const slots = [];
  for (let slot = 0; slot < rack.slots; slot++) {
    const [x, north] = across(rack, -(rack.slots - 1) / 2 * rack.pitch + slot * rack.pitch);
    const [bx, bn] = along([x, north], rack.heading, rack.setback);
    slots.push({ id: `${rack.id}:${slot}`, rackId: rack.id, slot, x: bx, north: bn, heading: rack.heading, approach: along([bx, bn], rack.heading, rack.approach) });
  }
  return slots;
}

// Every slot a rider may take: the plaza's first, then the curbside racks'.
// The town arbitrates these (server/world.js); the browser offers the nearest.
export function bikeRackSlots(world) {
  return [...plazaSalonRack(world), ...cityBikeRacks(world).flatMap(rackSlots)];
}

// Each curbside bar as the walking model blocks it: [east, north, radius,
// height] discs every 0.4 m or less, as the plaza bar (plazaSalonFootprints).
// One list per rack, so the walking model can box each rack on its own.
export function cityBikeRackFootprints(world) {
  return cityBikeRacks(world).map(rack => {
    const steps = Math.ceil(rack.length / 0.4), discs = [];
    for (let step = 0; step <= steps; step++) discs.push([...across(rack, -rack.length / 2 + rack.length * step / steps), 0.22, 0.8]);
    return discs;
  });
}
