// TypeSafe Place Residential Heights (beyond 3×, Val 2026-10-28): elevated living east of
// Woodland Heights, composed onto a composed Woodland Heights layout (shared/woodland-heights.js).
// Place Avenue runs the length of the strip between two 20-storey towers, garden-roofed
// residences and shop rows; Twentieth and Eighteenth Streets continue east to it from
// Woodland's lane. The Neighborhood Green, with its ribbon sculpture, is the destination.
// Client rendering and server movement both compose here; Heights streams the five
// neighborhoods as more of its own (preview/src/heights-stream.js).
import north from '../config/destinations/typesafe-place-north.json' with { type: 'json' };
import penthouse from '../config/destinations/typesafe-place-penthouse.json' with { type: 'json' };
import uptown from '../config/destinations/typesafe-place-uptown.json' with { type: 'json' };
import green from '../config/destinations/typesafe-place-green.json' with { type: 'json' };
import south from '../config/destinations/typesafe-place-south.json' with { type: 'json' };
import { assembleNeighborhood, insideRect, placePlan } from './city-kit/assemble.js';
import { WOODLAND_RECIPES, WOODLAND_REVISION } from './woodland-heights.js';
import { TYPESAFE_FRAME, TYPESAFE_ID, TYPESAFE_REVISION, TYPESAFE_SEAM_WEST, TYPESAFE_SEAMS } from './typesafe-place-layout.js';

export * from './typesafe-place-layout.js';
// Five neighborhoods, each a Heights chunk under its 16 MiB ceiling: Luxury Living and Penthouse
// Row either side of Place Avenue, uptown north of Twentieth, and the green and south residences.
export const TYPESAFE_RECIPES = Object.freeze([north, penthouse, uptown, green, south]);
const CENTRELINE = -1335;
// Authored seams and features, in the frame. The cross-street seams overlap the ends of
// Woodland's streets by a metre so the walking radius does not wall the two off. The rest join
// TypeSafe's own neighborhoods: each cross street where it meets Place Avenue's crossing, and
// the avenue across Twentieth's north sidewalk. All are ground only, so kit paving meets
// without overlapping.
export const TYPESAFE_FEATURES = Object.freeze({
  seams: { twentieth: [551.5, 104.5, 553.5, 117.5], eighteenth: [551.5, -77.5, 553.5, -64.5],
    'twentieth-avenue': [618, 104.5, 620, 117.5], 'eighteenth-avenue': [618, -77.5, 620, -64.5], avenue: [619, 116.5, 637, 118.5] },
  // The ribbon sculpture at the heart of the Neighborhood Green.
  ribbon: { at: [588, -34] },
  // The manifest entry: Twentieth Street at the location's west edge.
  entryNorth: 111,
});
// Woodland closed the east ends of its two cross streets with hedges, as nothing lay beyond.
// This revision opens them: Woodland's plans draw without the two hedges, and their solids
// leave the composed layout. Woodland's recipes, locks and own revision are unchanged, and
// detaching puts both back exactly.
export const WOODLAND_OPENINGS = Object.freeze(['woodland-heights-north/twentieth-east-end', 'woodland-heights-south/eighteenth-east-end']);
const mm = value => Math.round(value * 1000) / 1000;
const plans = new Map(), opened = new Map();

export function typesafePlans(edge) {
  if (!Number.isFinite(edge)) throw new Error('TypeSafe Place needs the District edge');
  if (!plans.has(edge)) plans.set(edge, TYPESAFE_RECIPES.map(recipe => placePlan(assembleNeighborhood(recipe), [edge, CENTRELINE])));
  return plans.get(edge);
}

/** Woodland's plans with its street-end hedges suppressed, placed as Woodland places them. */
export function openedWoodlandPlans(edge) {
  if (!opened.has(edge)) opened.set(edge, WOODLAND_RECIPES.map(recipe => placePlan(assembleNeighborhood({ ...recipe, overrides: { ...recipe.overrides,
    ...Object.fromEntries(WOODLAND_OPENINGS.filter(id => id.startsWith(`${recipe.id}/`)).map(id => [id, { suppress: true, note: 'TypeSafe Place: the street continues east.' }])) } }), [edge, CENTRELINE])));
  return opened.get(edge);
}

const frameRect = (edge, [x0, y0, x1, y1]) => [mm(edge + x0), CENTRELINE + y0, mm(edge + x1), CENTRELINE + y1];
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Append TypeSafe Place to a composed Woodland Heights layout. Earlier surfaces, solids and plans keep their indices. */
export function composeTypeSafePlace(layout) {
  if (layout?.revision !== WOODLAND_REVISION || !layout.woodland || layout.typesafe) throw new Error('TypeSafe Place needs the composed Woodland Heights');
  const { edge, woodland } = layout, placed = typesafePlans(edge), rect = value => frameRect(edge, value);
  // The location shares Woodland's east edge exactly (the manifest compares edges exactly).
  if (!(Math.abs(woodland.bounds[2] - (edge + TYPESAFE_FRAME.west)) < 1e-6)) throw new Error('TypeSafe Place must start at the Woodland Heights east edge');
  const bounds = [woodland.bounds[2], layout.districtBounds[1], edge + TYPESAFE_FRAME.east, layout.districtBounds[3]];
  const seams = Object.entries(TYPESAFE_FEATURES.seams).map(([name, value]) => ({ id: `${TYPESAFE_ID}/${name}-seam`, rect: rect(value) }));
  const surfaces = [...placed.flatMap(plan => plan.surfaces), ...seams], solids = placed.flatMap(plan => plan.solids);
  // Ground stays inside the registered location. Only the two cross streets and their seams
  // reach back into Woodland, where its streets end, and they cross no earlier building.
  const seamIds = new Set([...TYPESAFE_SEAMS, ...seams.map(seam => seam.id)]), west = edge + TYPESAFE_SEAM_WEST;
  const buildings = layout.heights.plans.flatMap(plan => plan.pieces.filter(piece => piece.piece === 'building/shell').map(piece => piece.rect));
  for (const { id, rect: [w, s, e, n] } of surfaces) {
    if (e > bounds[2] || s < bounds[1] || n > bounds[3] || w < (seamIds.has(id) ? west : bounds[0])) throw new Error(`TypeSafe Place ground ${id} leaves its location`);
    if (w < bounds[0] && buildings.some(building => overlaps(building, [w, s, Math.min(e, bounds[0]), n]))) throw new Error(`TypeSafe Place seam ${id} crosses an earlier building`);
    // Everywhere else TypeSafe ground touches nothing earlier: Woodland's hedged greens stay closed.
    if (!seamIds.has(id) && layout.surfaces.some(other => overlaps(other.rect, [w, s, e, n]))) throw new Error(`TypeSafe Place ground ${id} joins earlier ground`);
  }
  // Shells stand outside walkable ground: their faces are the walkable edge.
  for (const plan of placed) for (const piece of plan.pieces) {
    if (piece.piece === 'building/shell' && surfaces.some(surface => overlaps(surface.rect, piece.rect))) throw new Error(`TypeSafe Place building ${piece.id} stands on walkable ground`);
  }
  const ribbon = [mm(edge + TYPESAFE_FEATURES.ribbon.at[0]), CENTRELINE + TYPESAFE_FEATURES.ribbon.at[1]];
  // Open Woodland's street ends: only the two hedges change, nothing else Woodland walks on.
  const openings = layout.solids.flatMap((solid, index) => WOODLAND_OPENINGS.includes(solid.id) ? [{ index, solid }] : []);
  const woodlandPlans = openedWoodlandPlans(edge), kept = layout.solids.filter(solid => !WOODLAND_OPENINGS.includes(solid.id));
  if (openings.length !== WOODLAND_OPENINGS.length) throw new Error('TypeSafe Place opens both Woodland street ends');
  if (JSON.stringify(woodlandPlans.map(plan => [plan.surfaces, plan.lanterns])) !== JSON.stringify(woodland.plans.map(plan => [plan.surfaces, plan.lanterns]))
    || JSON.stringify(woodlandPlans.flatMap(plan => plan.solids)) !== JSON.stringify(woodland.plans.flatMap(plan => plan.solids).filter(solid => !WOODLAND_OPENINGS.includes(solid.id)))) {
    throw new Error('The Woodland opening must remove only its two hedges');
  }
  const heightsPlans = layout.heights.plans.map((plan, index) => index >= woodland.planStart && index < woodland.planStart + woodlandPlans.length ? woodlandPlans[index - woodland.planStart] : plan);
  return { ...layout, revision: TYPESAFE_REVISION,
    bounds: [layout.bounds[0], layout.bounds[1], bounds[2], layout.bounds[3]],
    surfaces: [...layout.surfaces, ...surfaces], solids: [...kept, ...solids],
    // Heights streams TypeSafe Place as five more of its neighborhoods, and draws their trees.
    heights: { ...layout.heights, plans: [...heightsPlans, ...placed] },
    woodland: { ...woodland, plans: woodlandPlans },
    typesafe: { id: TYPESAFE_ID, revision: TYPESAFE_REVISION, base: layout.revision, bounds, woodlandBounds: [...layout.bounds],
      surfaceStart: layout.surfaces.length, solidStart: kept.length, planStart: layout.heights.plans.length, plans: placed,
      openings, woodlandPlans: woodland.plans,
      entry: [bounds[0], CENTRELINE + TYPESAFE_FEATURES.entryNorth, layout.ground], seams: seams.map(seam => seam.rect), ribbon } };
}

/** The approved Woodland Heights layout under TypeSafe Place, exactly as it was composed. */
export function woodlandBaseLayout(layout) {
  const { typesafe, ...base } = layout;
  if (layout?.revision !== TYPESAFE_REVISION || !typesafe) throw new Error('Not a TypeSafe Place layout');
  const solids = layout.solids.slice(0, typesafe.solidStart), { planStart } = layout.woodland;
  for (const { index, solid } of typesafe.openings) solids.splice(index, 0, solid);
  return { ...base, revision: typesafe.base, bounds: [...typesafe.woodlandBounds],
    heights: { ...layout.heights, plans: layout.heights.plans.slice(0, typesafe.planStart)
      .map((plan, index) => index >= planStart && index < planStart + typesafe.woodlandPlans.length ? typesafe.woodlandPlans[index - planStart] : plan) },
    woodland: { ...layout.woodland, plans: typesafe.woodlandPlans },
    surfaces: layout.surfaces.slice(0, typesafe.surfaceStart), solids };
}
