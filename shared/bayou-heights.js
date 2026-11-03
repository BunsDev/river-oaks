// Bayou Heights (#586 continuation): the next connected district, composed onto
// Bayou Market Commons (shared/commons-destination.js). The Lantern Footbridge
// carries the Market Street axis over the bayou behind the Bayou Lantern to the
// east bank: the Bayou Greenway, Heights Green, the icehouse patio, the promoted
// Nineteenth & Yale crossroads and Heights Boulevard. Client rendering and server
// movement both compose here, so walking ground and solids are identical on both
// sides. Every neighborhood is a city-kit recipe; the footbridge structure, the
// bandstand and Heights Hall are authored landmarks drawn by the client
// (preview/src/bayou-heights.js) over the ground declared here.
import greenway from '../config/destinations/bayou-greenway.json' with { type: 'json' };
import icehouse from '../config/destinations/yale-icehouse.json' with { type: 'json' };
import crossroads from '../config/destinations/nineteenth-and-yale.json' with { type: 'json' };
import yaleNorth from '../config/destinations/yale-street-north.json' with { type: 'json' };
import yaleSouth from '../config/destinations/yale-street-south.json' with { type: 'json' };
import boulevardNorth from '../config/destinations/heights-boulevard-north.json' with { type: 'json' };
import boulevardSouth from '../config/destinations/heights-boulevard-south.json' with { type: 'json' };
import { assembleNeighborhood, insideRect, placePlan } from './city-kit/assemble.js';
import { COMMONS_DESTINATION_RECIPE, commonsDestinationPlan } from './commons-destination.js';
import { COMMONS_REVISION } from './east-garden-commons-layout.js';
import { HEIGHTS_FRAME, HEIGHTS_ID, HEIGHTS_REVISION, HEIGHTS_TABLE } from './bayou-heights-layout.js';

export * from './bayou-heights-layout.js';
export const HEIGHTS_RECIPES = Object.freeze([greenway, icehouse, crossroads, yaleNorth, yaleSouth, boulevardNorth, boulevardSouth]);
const CENTRELINE = -1335;
// Where a recipe's site-local origin sits in the frame. The crossroads keeps the local
// frame it was authored in; every new recipe is authored in the frame itself.
const ORIGINS = { 'nineteenth-and-yale': [250, -64] };
// Authored landmarks and seams, in the frame.
export const HEIGHTS_FEATURES = Object.freeze({
  // The deck spans the bayou. Its paving is bayou-greenway's first plaza; the landing
  // joins that paving to the greenway crossing without overlapping its paving.
  footbridge: { deck: [115, -3, 152, 3], landing: [150, -3, 154, 3] },
  // A raised bandstand on the green, on the axis of the great lawn. The stage is solid:
  // it blocks bodies and low flight, as the water tower's legs do.
  bandstand: { rect: [200.5, 116.5, 209.5, 125.5], height: 7.4 },
  // Heights Hall closes the view down Nineteenth Street, between the boulevard's
  // frontage blocks. Its clock tower is the district's landmark from the bridge. It
  // stands on block land, which is neither walkable nor flyable, so it needs no solid.
  hall: { rect: [406, -7.5, 420.5, 7.5], tower: [410.75, -2.5, 415.75, 2.5], height: 26.5 },
  icehouse: { at: [201, -16] },
});
// This revision opens the Commons bayou edge for the footbridge. The replacement
// railing and bayou come from bayou-greenway and yale-icehouse; the Commons recipe
// and its lock are unchanged.
const COMMONS_OPENING = {
  'bayou-market-commons/bayou': { suppress: true, note: 'Bayou Heights: the bayou continues north and south of the footbridge (bayou-greenway, yale-icehouse).' },
  'bayou-market-commons/bayou-railing': { suppress: true, note: 'Bayou Heights: the railing parts for the footbridge (bayou-greenway).' },
};
const mm = value => Math.round(value * 1000) / 1000;
const plans = new Map(), openings = new Map();

export function heightsPlans(edge) {
  if (!Number.isFinite(edge)) throw new Error('Bayou Heights needs the District edge');
  if (!plans.has(edge)) plans.set(edge, HEIGHTS_RECIPES.map(recipe => {
    const [x, y] = ORIGINS[recipe.id] ?? [0, 0];
    return placePlan(assembleNeighborhood(recipe), [mm(edge + x), CENTRELINE + y]);
  }));
  return plans.get(edge);
}

export function commonsPlanForHeights(edge) {
  if (!openings.has(edge)) openings.set(edge, placePlan(assembleNeighborhood({ ...COMMONS_DESTINATION_RECIPE,
    overrides: { ...COMMONS_DESTINATION_RECIPE.overrides, ...COMMONS_OPENING } }), [edge, CENTRELINE]));
  return openings.get(edge);
}

const frameRect = (edge, [x0, y0, x1, y1]) => [mm(edge + x0), CENTRELINE + y0, mm(edge + x1), CENTRELINE + y1];

/** Append the district to a composed Commons layout. Commons surfaces and solids keep their indices. */
export function composeBayouHeights(layout) {
  if (layout?.revision !== COMMONS_REVISION || !layout.destination || layout.heights) throw new Error('Bayou Heights needs the composed Commons');
  const { edge } = layout, placed = heightsPlans(edge), commons = commonsPlanForHeights(edge), features = HEIGHTS_FEATURES;
  // The opening removes only visual edge pieces: Commons ground, solids and lanterns are unchanged.
  const same = (a, b) => JSON.stringify([a.surfaces, a.solids, a.lanterns]) === JSON.stringify([b.surfaces, b.solids, b.lanterns]);
  if (!same(commons, layout.destination)) throw new Error('The Commons opening must not move walking ground');
  const rect = value => frameRect(edge, value);
  // The location shares the Commons east edge exactly (the manifest compares edges exactly).
  const west = layout.surfaces.find(surface => surface.id === `${layout.id}/plaza`)?.rect[2];
  if (!(Math.abs(west - (edge + HEIGHTS_FRAME.west)) < 1e-6)) throw new Error('Bayou Heights must start at the Commons east edge');
  const bounds = [west, layout.districtBounds[1], edge + HEIGHTS_FRAME.east, layout.districtBounds[3]];
  const landing = { id: `${HEIGHTS_ID}/footbridge-landing`, rect: rect(features.footbridge.landing) };
  const bandstand = { id: `${HEIGHTS_ID}/bandstand`, kind: 'stage', rect: rect(features.bandstand.rect), height: features.bandstand.height };
  const surfaces = [...placed.flatMap(plan => plan.surfaces), landing], solids = [...placed.flatMap(plan => plan.solids), bandstand];
  const onGround = ([w, s, e, n]) => surfaces.some(surface => insideRect(surface.rect, w, s) && insideRect(surface.rect, e, n));
  if (!onGround(bandstand.rect)) throw new Error('The bandstand must stand on walkable ground');
  // Ground stays inside the registered location; only the footbridge reaches back onto the Commons plaza.
  for (const { id, rect: [w, s, e, n] } of surfaces) {
    if (w < bounds[0] - 2 || e > bounds[2] || s < bounds[1] || n > bounds[3]) throw new Error(`Bayou Heights ground ${id} leaves its location`);
  }
  return { ...layout, revision: HEIGHTS_REVISION, destination: commons,
    bounds: [layout.bounds[0], layout.bounds[1], bounds[2], layout.bounds[3]],
    surfaces: [...layout.surfaces, ...surfaces], solids: [...layout.solids, ...solids],
    heights: { id: HEIGHTS_ID, revision: HEIGHTS_REVISION, base: layout.revision, bounds, commonsBounds: [...layout.bounds],
      surfaceStart: layout.surfaces.length, solidStart: layout.solids.length, plans: placed,
      entry: [bounds[0], CENTRELINE, layout.ground],
      footbridge: { deck: rect(features.footbridge.deck), landing: landing.rect },
      bandstand: { rect: bandstand.rect, height: bandstand.height },
      hall: { rect: rect(features.hall.rect), tower: rect(features.hall.tower), height: features.hall.height },
      icehouse: { tableId: HEIGHTS_TABLE, at: [mm(edge + features.icehouse.at[0]), CENTRELINE + features.icehouse.at[1]] } } };
}

/** The approved Commons layout under a composed district, exactly as it was composed. */
export function commonsBaseLayout(layout) {
  const { heights, ...base } = layout;
  if (layout?.revision !== HEIGHTS_REVISION || !heights) throw new Error('Not a Bayou Heights layout');
  return { ...base, revision: heights.base, destination: commonsDestinationPlan(layout.edge), bounds: [...heights.commonsBounds],
    surfaces: layout.surfaces.slice(0, heights.surfaceStart), solids: layout.solids.slice(0, heights.solidStart) };
}
