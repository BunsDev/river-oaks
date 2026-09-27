import { clearOfRoads } from './street-furniture.js';

// Arriving outside a storefront, or stepping back out of it, should put the
// visitor on the pavement. The authored points sat a fixed distance out from
// the door, which for most storefronts was in the middle of the street.
// Candidates run from the authored spot back toward the shopfront and along
// it; the first one clear of every vehicle lane (walkways are pavement) and
// free to stand on wins.
const ARRIVE = { distances: [4, 3.2, 2.4, 1.8, 1.2], laterals: [0, 2, -2, 4, -4] };
const LEAVE = { distances: [2.6, 2, 1.6, 1.2], laterals: [0, 1.5, -1.5, 3, -3] };

export function storefrontSpot(world, store, mode = 'arrive', { isFree = () => true, clearance = 0.5 } = {}) {
  const leaving = mode === 'leave';
  const [nx, ny] = store.outward, { distances, laterals } = leaving ? LEAVE : ARRIVE;
  // Authored visit points often lie out in the lane already, so arrivals also
  // search outward from the shopfront itself.
  const bases = leaving ? [store.facade] : [store.visit ?? store.facade, store.facade];
  const at = (base, distance, lateral) => [base[0] + nx * distance - ny * lateral, base[1] + ny * distance + nx * lateral, ...(store.visit ?? store.facade).slice(2)];
  for (const base of bases) for (const distance of distances) for (const lateral of laterals) {
    const spot = at(base, distance, lateral);
    if (clearOfRoads(world, spot[0], -spot[1], clearance, { vehiclesOnly: true }) && isFree(spot[0], -spot[1])) return spot;
  }
  return at(bases[0], distances[0], 0);
}
