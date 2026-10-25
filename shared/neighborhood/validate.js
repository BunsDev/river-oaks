import { editableRegion } from '../../preview/src/region-draft.js';
import { assertStudioBudget } from '../../preview/src/studio/limits.js';
import { STREET } from '../../preview/src/street-profile.js';
import { containsWithSetback, polygonArea, polygonsOverlap } from './polygon.js';
import { canonical } from './format.js';

const EPS = 1e-5;
const rectangle = (center, size, angle = 0) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [center[0] + x * size[0] / 2 * c - y * size[1] / 2 * s, center[1] + x * size[0] / 2 * s + y * size[1] / 2 * c]);
};
function intersects(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], axis = [p[1] - q[1], q[0] - p[0]];
    const project = ring => ring.map(point => point[0] * axis[0] + point[1] * axis[1]);
    const aa = project(a), bb = project(b);
    if (Math.max(...aa) <= Math.min(...bb) + EPS || Math.max(...bb) <= Math.min(...aa) + EPS) return false;
  }
  return true;
}

export function validateRegionContract(region, id) {
  const findings = [], add = (code, id, message) => findings.push({severity: 'error', code, id, message});
  if (!editableRegion(region)) { add('region-contract', id, 'Region fails the existing Studio schema, bounds, ID, parcel or spawn contract.'); return findings; }
  if (new TextEncoder().encode(JSON.stringify(region)).length > 128 * 1024) add('region-budget', id, 'Region exceeds 128 KiB.');
  try { assertStudioBudget(region); } catch (error) { add('road-budget', id, error.message); }
  return findings;
}

/** Independent resolved-geometry checks, including manual/approved objects. No repairs. */
export function validateNeighborhood(region, placements, recipe) {
  const findings = validateRegionContract(region, recipe.id);
  if (findings.length) return findings;
  const add = (code, id, message) => findings.push({severity: 'error', code, id, message});
  const corridors = [];
  for (const road of region.roads) for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1], b = road.points[k], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < EPS) continue;
    const margin = road.width_m / 2 + (road.kind === 'footway' ? 0 : STREET.sidewalkWidth + STREET.curbWidth);
    const ring = rectangle([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [length + 2 * margin, 2 * margin], Math.atan2(b[1] - a[1], b[0] - a[0]));
    corridors.push({id: road.id, ring});
    const [w, s, e, n] = region.bounds_m;
    if (!ring.every(([x, y]) => x >= w - EPS && x <= e + EPS && y >= s - EPS && y <= n + EPS)
      && !findings.some(item => item.code === 'road-bounds' && item.id === road.id)) add('road-bounds', road.id, 'Keep the full road and sidewalk footprint inside the region bounds.');
  }
  for (const area of recipe.reserved) {
    const [w, s, e, n] = area.bounds_m, ring = rectangle([(w + e) / 2, (s + n) / 2], [e - w, n - s]);
    for (const corridor of corridors) if (intersects(ring, corridor.ring)) add('reserved-road', area.id, `${corridor.id} crosses this handcrafted reservation.`);
  }
  for (const area of recipe.reference?.protected ?? []) for (const corridor of corridors) {
    const road = region.roads.find(item => item.id === corridor.id), source = recipe.reference.roads.find(item => item.id === road.id);
    const geometry = value => value && ({points: value.points, width_m: value.width_m, kind: value.kind});
    // Existing source access paths may meet source building footprints. Only an
    // explicit new/changed road is tested as new work against those frozen features.
    if (canonical(geometry(road)) !== canonical(geometry(source)) && polygonsOverlap(area, corridor.ring)
      && !findings.some(item => item.code === 'protected-road' && item.id === road.id)) add('protected-road', road.id, `New road geometry overlaps protected source feature ${area.source_id}.`);
  }
  const footprints = region.buildings.map(building => ({building, ring: rectangle(building.center, building.size, building.yaw_deg * Math.PI / 180)}));
  for (let i = 0; i < footprints.length; i++) {
    const {building, ring} = footprints[i], id = building.id;
    for (const protectedArea of recipe.reference?.protected ?? []) if (polygonsOverlap(protectedArea, ring)) add('protected-footprint', id, `Building overlaps protected source feature ${protectedArea.source_id}.`);
    if (building.size[2] > recipe.constraints.max_height_m) add('height-limit', id, `Height exceeds ${recipe.constraints.max_height_m} m.`);
    const placement = placements.find(item => item.id === id);
    if (placement) {
      const referenceParcel = recipe.reference?.parcels.find(item => item.id === placement.parcelId);
      const parcel = referenceParcel ?? region.parcels.find(item => item.id === placement.parcelId), setback = recipe.constraints.setback_m;
      const contained = referenceParcel ? containsWithSetback(referenceParcel, ring, setback) : parcel && ring.every(([x, y]) => x >= parcel.bounds_m[0] + setback - EPS && x <= parcel.bounds_m[2] - setback + EPS
        && y >= parcel.bounds_m[1] + setback - EPS && y <= parcel.bounds_m[3] - setback + EPS);
      if (!contained) add('parcel-setback', id, `Keep the building inside ${placement.parcelId} with ${setback} m setbacks, including holes.`);
      const area = referenceParcel ? polygonArea(referenceParcel) : parcel ? (parcel.bounds_m[2] - parcel.bounds_m[0]) * (parcel.bounds_m[3] - parcel.bounds_m[1]) : 0;
      if (parcel && building.size[0] * building.size[1] > area * recipe.constraints.max_coverage + EPS) add('parcel-coverage', id, 'Building exceeds the parcel coverage limit.');
    }
    const roads = new Set(corridors.filter(corridor => intersects(ring, corridor.ring)).map(corridor => corridor.id));
    for (const road of roads) add('road-clearance', id, `Building overlaps ${road} or its sidewalk. Move the candidate road or explicitly edit the building.`);
    for (let j = i + 1; j < footprints.length; j++) if (intersects(ring, footprints[j].ring)) add('building-overlap', id, `Building overlaps ${footprints[j].building.id}.`);
  }
  return findings;
}
