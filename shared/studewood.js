// Studewood (#586 continuation toward 3×): the east side of Bayou Heights, composed
// onto a composed Heights layout (shared/bayou-heights.js). Studewood Street runs the
// length of the strip behind Heights Boulevard's frontage; Twentieth and Eighteenth
// Streets continue east to it through the frontage gaps. Studewood Park, with its
// water tower, night market and game table, is the destination. Client rendering and
// server movement both compose here, so walking ground and solids are identical on
// both sides. Both neighborhoods are city-kit recipes; Heights streams them as two
// more of its neighborhoods (preview/src/heights-stream.js).
import north from '../config/destinations/studewood-north.json' with { type: 'json' };
import south from '../config/destinations/studewood-south.json' with { type: 'json' };
import { assembleNeighborhood, insideRect, placePlan } from './city-kit/assemble.js';
import { HEIGHTS_REVISION } from './bayou-heights-layout.js';
import { STUDEWOOD_FRAME, STUDEWOOD_ID, STUDEWOOD_REVISION, STUDEWOOD_SEAM_WEST, STUDEWOOD_SEAMS, STUDEWOOD_TABLE } from './studewood-layout.js';

export * from './studewood-layout.js';
export const STUDEWOOD_RECIPES = Object.freeze([north, south]);
const CENTRELINE = -1335;
// Authored seams and features, in the frame. Each seam overlaps the end of a Heights
// cross street by a metre so the walking radius does not wall the two off; it is ground
// only, so the kit paving of the two streets meets without overlapping.
export const STUDEWOOD_FEATURES = Object.freeze({
  seams: { twentieth: [404, 104.5, 407, 117.5], eighteenth: [404, -77.5, 407, -64.5] },
  // The game table stands on the park's north lawn, clear of the market and its benches.
  table: { at: [472, 81] },
  // The manifest entry: Twentieth Street at the location's west edge.
  entryNorth: 111,
});
const mm = value => Math.round(value * 1000) / 1000;
const plans = new Map();

export function studewoodPlans(edge) {
  if (!Number.isFinite(edge)) throw new Error('Studewood needs the District edge');
  if (!plans.has(edge)) plans.set(edge, STUDEWOOD_RECIPES.map(recipe => placePlan(assembleNeighborhood(recipe), [edge, CENTRELINE])));
  return plans.get(edge);
}

const frameRect = (edge, [x0, y0, x1, y1]) => [mm(edge + x0), CENTRELINE + y0, mm(edge + x1), CENTRELINE + y1];
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Append Studewood to a composed Heights layout. Heights surfaces, solids and plans keep their indices. */
export function composeStudewood(layout) {
  if (layout?.revision !== HEIGHTS_REVISION || !layout.heights || layout.studewood) throw new Error('Studewood needs the composed Bayou Heights');
  const { edge, heights } = layout, placed = studewoodPlans(edge), rect = value => frameRect(edge, value);
  // The location shares the Heights east edge exactly (the manifest compares edges exactly).
  if (!(Math.abs(heights.bounds[2] - (edge + STUDEWOOD_FRAME.west)) < 1e-6)) throw new Error('Studewood must start at the Heights east edge');
  const bounds = [heights.bounds[2], layout.districtBounds[1], edge + STUDEWOOD_FRAME.east, layout.districtBounds[3]];
  const seams = Object.entries(STUDEWOOD_FEATURES.seams).map(([name, value]) => ({ id: `${STUDEWOOD_ID}/${name}-seam`, rect: rect(value) }));
  const surfaces = [...placed.flatMap(plan => plan.surfaces), ...seams], solids = placed.flatMap(plan => plan.solids);
  // Ground stays inside the registered location. Only the two cross streets and their
  // seams reach back into Heights, through frontage gaps that hold no Heights building.
  const seamIds = new Set([...STUDEWOOD_SEAMS, ...seams.map(seam => seam.id)]), west = edge + STUDEWOOD_SEAM_WEST;
  const buildings = heights.plans.flatMap(plan => plan.pieces.filter(piece => piece.piece === 'building/shell').map(piece => piece.rect));
  for (const { id, rect: [w, s, e, n] } of surfaces) {
    if (e > bounds[2] || s < bounds[1] || n > bounds[3] || w < (seamIds.has(id) ? west : bounds[0])) throw new Error(`Studewood ground ${id} leaves its location`);
    if (w < bounds[0] && buildings.some(building => overlaps(building, [w, s, Math.min(e, bounds[0]), n]))) throw new Error(`Studewood seam ${id} crosses a Heights building`);
  }
  const table = [mm(edge + STUDEWOOD_FEATURES.table.at[0]), CENTRELINE + STUDEWOOD_FEATURES.table.at[1]];
  if (!surfaces.some(surface => insideRect(surface.rect, ...table, 2))) throw new Error('The Studewood table must stand on walkable ground');
  return { ...layout, revision: STUDEWOOD_REVISION,
    bounds: [layout.bounds[0], layout.bounds[1], bounds[2], layout.bounds[3]],
    surfaces: [...layout.surfaces, ...surfaces], solids: [...layout.solids, ...solids],
    // Heights streams Studewood as two more of its neighborhoods, and draws their trees.
    heights: { ...heights, plans: [...heights.plans, ...placed] },
    studewood: { id: STUDEWOOD_ID, revision: STUDEWOOD_REVISION, base: layout.revision, bounds, heightsBounds: [...layout.bounds],
      surfaceStart: layout.surfaces.length, solidStart: layout.solids.length, planStart: heights.plans.length, plans: placed,
      entry: [bounds[0], CENTRELINE + STUDEWOOD_FEATURES.entryNorth, layout.ground], seams: seams.map(seam => seam.rect),
      table: { tableId: STUDEWOOD_TABLE, at: table } } };
}

/** The approved Heights layout under Studewood, exactly as it was composed. */
export function heightsBaseLayout(layout) {
  const { studewood, ...base } = layout;
  if (layout?.revision !== STUDEWOOD_REVISION || !studewood) throw new Error('Not a Studewood layout');
  return { ...base, revision: studewood.base, bounds: [...studewood.heightsBounds],
    heights: { ...layout.heights, plans: layout.heights.plans.slice(0, studewood.planStart) },
    surfaces: layout.surfaces.slice(0, studewood.surfaceStart), solids: layout.solids.slice(0, studewood.solidStart) };
}
