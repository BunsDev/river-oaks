import contract from '../../config/ribbon/five-rooms.json' with { type: 'json' };
import { DISTRICT_RIBBON_LANE } from './ribbon-district.js';

// Seat clusters (#825 slice 3): the sets of seats whose sitters may talk privately. Each sits at
// its venue's `seat-cluster` attachment in the Five Rooms contract: two short benches facing
// each other, four places, shared by the browser and the authoritative town as bench places
// ({buildId, slot}). The District only, for every finish: a comparison finish never changes
// where someone can sit. Starlight Screen's attachment stands inside the IPIC lounge's furniture,
// so its cluster waits for that venue's interior.
export const SEAT_CLUSTER_VENUES = Object.freeze(['venue:counter', 'venue:shade-garden']);
export const SEAT_CLUSTER_RULES = Object.freeze({ across: 0.95, along: 0.45, height: 0.46, depth: 0.42, length: 1.4 });
// Each cluster sits on open floor in its mapped room, the smallest move from its attachment that
// keeps every seat more than a metre beyond sitting reach of the room's arrival spot, door, facade
// and outside visit spot: entering a shop or talking at its door never also offers a seat (east,
// north metres). The Shade Garden's attachment also stands between the Hermès room's displays.
export const SEAT_CLUSTER_SHIFT = Object.freeze({ 'venue:counter': Object.freeze([-1, -2]), 'venue:shade-garden': Object.freeze([-1, 3]) });
const SHIFT = SEAT_CLUSTER_SHIFT;
const buildIdOf = venueId => `bench:seat-cluster-${venueId.slice('venue:'.length)}`;

export function seatClusters(world, source = contract) {
  if (!(world?.roads ?? []).some(road => road.id === DISTRICT_RIBBON_LANE)) return [];
  const clusters = [];
  for (const venueId of SEAT_CLUSTER_VENUES) {
    const venue = source.venues.find(item => item.id === venueId), attachment = venue?.attachments?.find(item => item.role === 'seat-cluster');
    if (!attachment) continue;
    const shift = SHIFT[venueId] ?? [0, 0], x = attachment.position[0] + shift[0], north = attachment.position[1] + shift[1], yaw = attachment.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw), { across, along } = SEAT_CLUSTER_RULES;
    // Local axes: `along` runs east, `across` runs north; the contract's yaw turns both.
    const place = (a, b) => [x + a * c - b * s, north + a * s + b * c];
    const buildId = buildIdOf(venueId), seats = [];
    [[-across, 1], [across, -1]].forEach(([b, faces], side) => [-along, along].forEach((a, index) => {
      const [sx, sn] = place(a, b), [ax, an] = place(a, b + faces * 0.7), slot = side * 2 + index;
      seats.push({ id: `${buildId}:${slot}`, buildId, slot, kind: 'bench', storeId: null, title: `${venue.label} seats`, x: sx, north: sn,
        heading: Math.atan2(ax - sx, -(an - sn)), height: SEAT_CLUSTER_RULES.height, approach: [ax, an] });
    }));
    clusters.push({ id: buildId.slice('bench:'.length), venueId, label: venue.label, buildId, center: [x, north], yaw, seats });
  }
  return clusters;
}

export const seatClusterSeats = world => seatClusters(world).flatMap(cluster => cluster.seats);

// { buildId -> cluster id }, so a town can place a sitter without walking every seat.
export const seatClusterIndex = world => new Map(seatClusters(world).map(cluster => [cluster.buildId, cluster.id]));
