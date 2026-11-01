import { expandRibbon } from '../../shared/city-kit/ribbon-layout.js';
import { laneFixtures, storefrontBenchSpots } from './street-fixtures.js';
import districtSpine from '../../config/ribbon/district-spine.json' with { type: 'json' };

// Where the District Ribbon may not stand a post or seat (#825 slice 2a), derived from the world
// itself so a moved door, bench, lamp or building is caught at expansion rather than drawn into
// someone's way. The renderer (ribbon-graybox.js) and the route test read this one builder.
export const DISTRICT_RIBBON_LANE = 'osm-way-583333526-0';
// The side lane that meets the central lane at the arrival spawn (#827, #838).
export const DISTRICT_RIBBON_SIDE_LANE = 'osm-way-625330795-0';
// A door's clear zone: 2.4 m along the facade, 2 m out from it. The repo states no door
// clearance; these are the route's working values (docs/superpowers/plans/2026-10-31-ribbon-route-825.md).
export const RIBBON_DOOR = Object.freeze({ width: 2.4, depth: 2 });
const square = (x, y, half) => [x - half, y - half, x + half, y + half];
const round = rect => rect.map(value => Math.round(value * 1000) / 1000);

export function districtRibbonExclusions(world) {
  const out = [], add = (id, kind, rect) => out.push({ id, kind, rect: round(rect) });
  for (const store of world.stores ?? []) {
    if (!Array.isArray(store.facade) || !Array.isArray(store.outward)) continue;
    const [fx, fy] = store.facade, [nx, ny] = store.outward, { width, depth } = RIBBON_DOOR, cx = fx + nx * depth / 2, cy = fy + ny * depth / 2;
    const hx = Math.abs(nx) * depth / 2 + Math.abs(ny) * width / 2, hy = Math.abs(ny) * depth / 2 + Math.abs(nx) * width / 2;
    add(`door-${store.id.replace(/[^a-z0-9]+/g, '-')}`.slice(0, 32), 'doorway', [cx - hx, cy - hy, cx + hx, cy + hy]);
  }
  // A storefront bench and the reach in front of it.
  storefrontBenchSpots(world).forEach((bench, i) => add(`bench-${i}`, 'seat-access', square(bench.x + bench.outward[0] * 0.6, bench.north + bench.outward[1] * 0.6, 1.4)));
  // Lane fixtures are in scene coordinates: [east, height, -north].
  const { lamps, planters, bins } = laneFixtures(world);
  [...lamps.map(f => ['lamp', f]), ...planters.map(f => ['planter', f]), ...bins.map(f => ['bin', f])].forEach(([kind, f], i) => add(`${kind}-${i}`, 'no-go', square(f[0], -f[2], 0.6)));
  (world.buildings ?? []).forEach((building, i) => {
    const xs = building.ring.map(p => p[0]), ys = building.ring.map(p => p[1]);
    add(`building-${i}`, 'no-go', [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  });
  // The lane's carriageway and kerb, in pieces of at most 5 m so the boxes hug a slanting lane.
  const lane = (world.roads ?? []).find(road => road.id === DISTRICT_RIBBON_LANE);
  if (lane) {
    const half = lane.width_m / 2 + 0.15;
    let piece = 0;
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1], b = lane.points[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
      for (let j = 0; j < n; j++) {
        const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], q = [a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n];
        add(`carriageway-${piece++}`, 'no-go', [Math.min(p[0], q[0]) - half, Math.min(p[1], q[1]), Math.max(p[0], q[0]) + half, Math.max(p[1], q[1])]);
      }
    }
  }
  // The side lane that meets the central lane at the spawn (osm-way-625330795), carriageway and
  // kerb in pieces of at most 5 m, padded across its direction so the boxes suit an east-west lane.
  const side = (world.roads ?? []).find(road => road.id === DISTRICT_RIBBON_SIDE_LANE);
  if (side) {
    const sideHalf = side.width_m / 2 + 0.15;
    let sidePiece = 0;
    for (let i = 1; i < side.points.length; i++) {
      const a = side.points[i - 1], b = side.points[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
      for (let j = 0; j < n; j++) {
        const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], q = [a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n];
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]), ox = Math.abs(q[1] - p[1]) / length * sideHalf, oy = Math.abs(q[0] - p[0]) / length * sideHalf;
        add(`side-lane-${sidePiece++}`, 'no-go', [Math.min(p[0], q[0]) - ox, Math.min(p[1], q[1]) - oy, Math.max(p[0], q[0]) + ox, Math.max(p[1], q[1]) + oy]);
      }
    }
  }
  return out;
}

// The spine expanded against this world's own exclusions. Throws (ribbon-layout.js) if the world
// puts something where a post must stand; callers that draw decide what to do about that.
export const districtRibbonPlan = (world, recipe = districtSpine) => expandRibbon({ ...recipe, exclusions: districtRibbonExclusions(world) });
