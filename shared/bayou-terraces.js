// Bayou Terraces (#586 continuation toward 3×): the west bank of the bayou north and
// south of Bayou Market Commons, composed onto a composed Studewood layout
// (shared/studewood.js). Each terrace has a studio lane along the District edge,
// bank gardens with a small market, and a riverside walk. A footbridge over the bayou
// continues Twentieth (north) or Eighteenth (south) Street from the Heights greenway.
// The Commons keeps its hedged green: the terraces are reached only over the bridges.
// Client rendering and server movement both compose here; Heights streams the two
// terraces as more of its neighborhoods (preview/src/heights-stream.js).
import north from '../config/destinations/bayou-terrace-north.json' with { type: 'json' };
import south from '../config/destinations/bayou-terrace-south.json' with { type: 'json' };
import { assembleNeighborhood, insideRect, placePlan } from './city-kit/assemble.js';
import { STUDEWOOD_REVISION } from './studewood-layout.js';
import { TERRACE_BANK, TERRACE_BRIDGE_EAST, TERRACE_BRIDGES, TERRACES_ID, TERRACES_REVISION, TERRACES_TABLE } from './bayou-terraces-layout.js';

export * from './bayou-terraces-layout.js';
export const TERRACE_RECIPES = Object.freeze([north, south]);
const CENTRELINE = -1335;
// The north gardens' game table, on the east lawn clear of the market and its café tables.
export const TERRACE_FEATURES = Object.freeze({ table: { at: [89, 140] } });
const mm = value => Math.round(value * 1000) / 1000;
const plans = new Map();

export function terracePlans(edge) {
  if (!Number.isFinite(edge)) throw new Error('The Bayou Terraces need the District edge');
  if (!plans.has(edge)) plans.set(edge, TERRACE_RECIPES.map(recipe => placePlan(assembleNeighborhood(recipe), [edge, CENTRELINE])));
  return plans.get(edge);
}

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Append the terraces to a composed Studewood layout. Earlier surfaces, solids and plans keep their indices. */
export function composeBayouTerraces(layout) {
  if (layout?.revision !== STUDEWOOD_REVISION || !layout.studewood || layout.terraces) throw new Error('The Bayou Terraces need the composed Studewood');
  const { edge } = layout, placed = terracePlans(edge), [, south, , north] = layout.districtBounds;
  // The strips beside the Commons: from the District edge to the bank, north and south of the Commons (y ±40).
  // The bank is the Heights west edge exactly (the manifest compares edges exactly).
  const bank = layout.heights.bounds[0];
  if (!(Math.abs(bank - (edge + TERRACE_BANK)) < 1e-6)) throw new Error('The Bayou Terraces must end at the Heights west edge');
  const bounds = [[edge, CENTRELINE + 40, bank, north], [edge, south, bank, CENTRELINE - 40]];
  const surfaces = placed.flatMap(plan => plan.surfaces), solids = placed.flatMap(plan => plan.solids);
  // Each terrace's ground stays inside its own strip, except its footbridge, which
  // crosses the bayou and overlaps the greenway trail by a metre.
  const bridges = new Set(Object.values(TERRACE_BRIDGES)), east = edge + TERRACE_BRIDGE_EAST;
  const earlier = layout.surfaces;
  for (const [index, plan] of placed.entries()) {
    const [w, s, e, n] = bounds[index];
    for (const { id, rect } of plan.surfaces) {
      const bridge = bridges.has(id);
      // Placed plans round to the millimetre.
      if (rect[0] < w - 1e-3 || rect[1] < s - 1e-3 || rect[3] > n + 1e-3 || rect[2] > (bridge ? east : e) + 1e-3) throw new Error(`Bayou Terraces ground ${id} leaves its location`);
      // Only a footbridge may touch earlier ground: the Commons hedge keeps the green closed.
      if (!bridge && earlier.some(other => overlaps(other.rect, rect))) throw new Error(`Bayou Terraces ground ${id} joins earlier ground`);
      if (bridge && !earlier.some(other => other.id.endsWith('/greenway/walk') || other.id.endsWith('/greenway-south/walk') ? overlaps(other.rect, [bank, rect[1], rect[2], rect[3]]) : false)) throw new Error(`Bayou Terraces footbridge ${id} does not land on the greenway`);
    }
  }
  const table = [mm(edge + TERRACE_FEATURES.table.at[0]), CENTRELINE + TERRACE_FEATURES.table.at[1]];
  if (!surfaces.some(surface => insideRect(surface.rect, ...table, 2))) throw new Error('The terrace table must stand on walkable ground');
  return { ...layout, revision: TERRACES_REVISION,
    surfaces: [...layout.surfaces, ...surfaces], solids: [...layout.solids, ...solids],
    heights: { ...layout.heights, plans: [...layout.heights.plans, ...placed] },
    terraces: { id: TERRACES_ID, revision: TERRACES_REVISION, base: layout.revision, bounds: bounds.map(item => [...item]),
      surfaceStart: layout.surfaces.length, solidStart: layout.solids.length, planStart: layout.heights.plans.length, plans: placed,
      bridges: placed.map(plan => plan.surfaces.find(surface => bridges.has(surface.id)).rect),
      entries: placed.map(plan => { const rect = plan.surfaces.find(surface => bridges.has(surface.id)).rect; return [bank, mm((rect[1] + rect[3]) / 2), layout.ground]; }),
      table: { tableId: TERRACES_TABLE, at: table } } };
}

/** The approved Studewood layout under the terraces, exactly as it was composed. */
export function studewoodBaseLayout(layout) {
  const { terraces, ...base } = layout;
  if (layout?.revision !== TERRACES_REVISION || !terraces) throw new Error('Not a Bayou Terraces layout');
  return { ...base, revision: terraces.base,
    heights: { ...layout.heights, plans: layout.heights.plans.slice(0, terraces.planStart) },
    surfaces: layout.surfaces.slice(0, terraces.surfaceStart), solids: layout.solids.slice(0, terraces.solidStart) };
}
