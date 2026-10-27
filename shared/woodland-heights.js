// Woodland Heights (land proposal A′, toward 3×): a residential garden strip east of
// Studewood, composed onto a composed Bayou Terraces layout (shared/bayou-terraces.js).
// Live Oak Lane runs the length of the strip between bungalow gardens; Twentieth and
// Eighteenth Streets continue east to it from Studewood, with shops at their corners. The
// Woodland green, with its game table, is the destination. Client rendering and server
// movement both compose here; Heights streams the two neighborhoods as more of its own
// (preview/src/heights-stream.js).
import north from '../config/destinations/woodland-heights-north.json' with { type: 'json' };
import south from '../config/destinations/woodland-heights-south.json' with { type: 'json' };
import { assembleNeighborhood, insideRect, placePlan } from './city-kit/assemble.js';
import { TERRACES_REVISION } from './bayou-terraces-layout.js';
import { WOODLAND_FRAME, WOODLAND_ID, WOODLAND_REVISION, WOODLAND_SEAM_WEST, WOODLAND_SEAMS, WOODLAND_TABLE } from './woodland-heights-layout.js';

export * from './woodland-heights-layout.js';
export const WOODLAND_RECIPES = Object.freeze([north, south]);
const CENTRELINE = -1335;
// Authored seams and features, in the frame. Each seam overlaps the end of a Studewood
// cross street by a metre so the walking radius does not wall the two off; it is ground
// only, so the kit paving of the two streets meets without overlapping.
export const WOODLAND_FEATURES = Object.freeze({
  seams: { twentieth: [506.5, 104.5, 508.5, 117.5], eighteenth: [506.5, -77.5, 508.5, -64.5] },
  // The game table stands in the green's paved court, between its two lawns.
  table: { at: [545, 77] },
  // The manifest entry: Twentieth Street at the location's west edge.
  entryNorth: 111,
});
const mm = value => Math.round(value * 1000) / 1000;
const plans = new Map();

export function woodlandPlans(edge) {
  if (!Number.isFinite(edge)) throw new Error('Woodland Heights needs the District edge');
  if (!plans.has(edge)) plans.set(edge, WOODLAND_RECIPES.map(recipe => placePlan(assembleNeighborhood(recipe), [edge, CENTRELINE])));
  return plans.get(edge);
}

const frameRect = (edge, [x0, y0, x1, y1]) => [mm(edge + x0), CENTRELINE + y0, mm(edge + x1), CENTRELINE + y1];
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Append Woodland Heights to a composed Bayou Terraces layout. Earlier surfaces, solids and plans keep their indices. */
export function composeWoodlandHeights(layout) {
  if (layout?.revision !== TERRACES_REVISION || !layout.terraces || !layout.studewood || layout.woodland) throw new Error('Woodland Heights needs the composed Bayou Terraces');
  const { edge, studewood } = layout, placed = woodlandPlans(edge), rect = value => frameRect(edge, value);
  // The location shares Studewood's east edge exactly (the manifest compares edges exactly).
  if (!(Math.abs(studewood.bounds[2] - (edge + WOODLAND_FRAME.west)) < 1e-6)) throw new Error('Woodland Heights must start at the Studewood east edge');
  const bounds = [studewood.bounds[2], layout.districtBounds[1], edge + WOODLAND_FRAME.east, layout.districtBounds[3]];
  const seams = Object.entries(WOODLAND_FEATURES.seams).map(([name, value]) => ({ id: `${WOODLAND_ID}/${name}-seam`, rect: rect(value) }));
  const surfaces = [...placed.flatMap(plan => plan.surfaces), ...seams], solids = placed.flatMap(plan => plan.solids);
  // Ground stays inside the registered location. Only the two cross streets and their seams
  // reach back into Studewood, where its streets end, and they cross no earlier building.
  const seamIds = new Set([...WOODLAND_SEAMS, ...seams.map(seam => seam.id)]), west = edge + WOODLAND_SEAM_WEST;
  const buildings = layout.heights.plans.flatMap(plan => plan.pieces.filter(piece => piece.piece === 'building/shell').map(piece => piece.rect));
  for (const { id, rect: [w, s, e, n] } of surfaces) {
    if (e > bounds[2] || s < bounds[1] || n > bounds[3] || w < (seamIds.has(id) ? west : bounds[0])) throw new Error(`Woodland Heights ground ${id} leaves its location`);
    if (w < bounds[0] && buildings.some(building => overlaps(building, [w, s, Math.min(e, bounds[0]), n]))) throw new Error(`Woodland Heights seam ${id} crosses an earlier building`);
    // Everywhere else Woodland ground touches nothing earlier: Studewood's hedged edge stays closed.
    if (!seamIds.has(id) && layout.surfaces.some(other => overlaps(other.rect, [w, s, e, n]))) throw new Error(`Woodland Heights ground ${id} joins earlier ground`);
  }
  const table = [mm(edge + WOODLAND_FEATURES.table.at[0]), CENTRELINE + WOODLAND_FEATURES.table.at[1]];
  if (!surfaces.some(surface => insideRect(surface.rect, ...table, 2))) throw new Error('The Woodland table must stand on walkable ground');
  return { ...layout, revision: WOODLAND_REVISION,
    bounds: [layout.bounds[0], layout.bounds[1], bounds[2], layout.bounds[3]],
    surfaces: [...layout.surfaces, ...surfaces], solids: [...layout.solids, ...solids],
    // Heights streams Woodland as two more of its neighborhoods, and draws their trees.
    heights: { ...layout.heights, plans: [...layout.heights.plans, ...placed] },
    woodland: { id: WOODLAND_ID, revision: WOODLAND_REVISION, base: layout.revision, bounds, terracesBounds: [...layout.bounds],
      surfaceStart: layout.surfaces.length, solidStart: layout.solids.length, planStart: layout.heights.plans.length, plans: placed,
      entry: [bounds[0], CENTRELINE + WOODLAND_FEATURES.entryNorth, layout.ground], seams: seams.map(seam => seam.rect),
      table: { tableId: WOODLAND_TABLE, at: table } } };
}

/** The approved Bayou Terraces layout under Woodland Heights, exactly as it was composed. */
export function terracesBaseLayout(layout) {
  const { woodland, ...base } = layout;
  if (layout?.revision !== WOODLAND_REVISION || !woodland) throw new Error('Not a Woodland Heights layout');
  return { ...base, revision: woodland.base, bounds: [...woodland.terracesBounds],
    heights: { ...layout.heights, plans: layout.heights.plans.slice(0, woodland.planStart) },
    surfaces: layout.surfaces.slice(0, woodland.surfaceStart), solids: layout.solids.slice(0, woodland.solidStart) };
}
