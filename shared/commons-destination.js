// Bayou Market Commons (#586): the approved East Garden Commons composed with the
// neighborhood assembled from config/destinations/bayou-market-commons.json.
// Client rendering and server movement both compose here, so walkable ground,
// solids and lantern positions are identical on both sides.
import recipe from '../config/destinations/bayou-market-commons.json' with { type: 'json' };
import { assembleNeighborhood, placePlan } from './city-kit/assemble.js';

export const COMMONS_DESTINATION_RECIPE = recipe;
// The Lantern Walk (server/lantern-walk.js): reach from a lantern's centre, on foot.
export const LANTERN_REACH = 2.4;
// Site-local y = 0 is the promenade centreline; x = 0 is the District's east edge.
const CENTRELINE = -1335;
const assembled = new Map();

export function commonsDestinationPlan(edge) {
  if (!Number.isFinite(edge)) throw new Error('Commons destination needs the District edge');
  if (!assembled.has(edge)) assembled.set(edge, placePlan(assembleNeighborhood(recipe), [edge, CENTRELINE]));
  return assembled.get(edge);
}

// Base surfaces and solids keep their indices; the destination appends to them.
export function composeCommonsDestination(layout) {
  const plan = commonsDestinationPlan(layout.edge);
  return { ...layout, destination: plan, surfaces: [...layout.surfaces, ...plan.surfaces], solids: [...layout.solids, ...plan.solids] };
}
