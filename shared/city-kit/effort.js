// Production effort, measured (#585). The goal of the kit is less typing for the
// same artistic control, so this module counts two things an author can act on:
// what a recipe makes them type, and what one art-direction change costs them.
//
// `typedValues` counts the numbers and shop names in each section of a recipe and
// splits them between the author and the tools: a recipe built by `destination
// reference` carries its streets and quarter rectangles from the mapped roads,
// so only the site, the spacings, the style and the names were typed.
//
// `changeCost` applies one standard edit, every street two metres wider, to the
// recipe as authored and to the same recipe with its blocks rewritten as quarters
// (the rewrite that `city-kit-shipped-quarters.test.js` proves reproduces every
// shipped plan). As authored, every block rectangle kept flush to a street by hand
// now stands in the street, and the assembler does not refuse a shell in a lane:
// the author must retype those rectangles. As quarters, the blocks re-derive on
// the land the wider streets leave and nothing is retyped.
//
// Pure arithmetic on the recipe, so the committed report reproduces.
import { assembleNeighborhood } from './assemble.js';
import { streetCorridor } from './layout.js';

const EPS = 1e-6;
export const WIDEN_METRES = 2;

const overlaps = (a, b) => a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;
const NAME_KEYS = new Set(['names', 'name', 'lettering', 'sign']);

// Numbers and names anywhere under a value. `ids`, `piece`, `style` and the frontage
// words are choices too, but each is one word picked from a short list, not a value
// that must agree with the geometry around it.
export function countTyped(value, key = null) {
  if (typeof value === 'number') return { numbers: 1, names: 0 };
  if (typeof value === 'string') return { numbers: 0, names: NAME_KEYS.has(key) ? 1 : 0 };
  if (Array.isArray(value)) return value.reduce((n, v) => add(n, countTyped(v, key)), { numbers: 0, names: 0 });
  if (value && typeof value === 'object') return Object.entries(value).reduce((n, [k, v]) => add(n, countTyped(v, k)), { numbers: 0, names: 0 });
  return { numbers: 0, names: 0 };
}
const add = (a, b) => ({ numbers: a.numbers + b.numbers, names: a.names + b.names });
const sum = counts => counts.reduce(add, { numbers: 0, names: 0 });

const SECTIONS = ['streets', 'plazas', 'blocks', 'layout', 'landmarks', 'furniture', 'additions', 'overrides'];
const REFERENCE_DEFAULTS = { trees: null, lamps: null, lane: 6, sidewalk: 3.5, tolerance: 5, minimumLength: 20 };

// What the recipe makes an author type, by section, and who typed it. `massing` is
// the part the kit can derive: streets, blocks and quarters; plazas, landmarks and
// furniture stay hand-typed by design in every form.
export function typedValues(recipe) {
  const sections = Object.fromEntries(SECTIONS.map(section => [section, countTyped(recipe[section] ?? null)]));
  const total = sum(Object.values(sections));
  let tools = { numbers: 0, names: 0 }, author = total, options = null;
  if (recipe.reference) {
    // The reference step wrote the streets with their furnishing and the quarters'
    // rectangles and ranges; the author typed the site, the spacings they asked
    // for, and the names (placeholders until then).
    const quarters = recipe.layout?.quarters ?? [];
    const written = sum([countTyped(recipe.streets ?? []), ...quarters.map(({ rect, depth, storeys, bays }) => countTyped({ rect, depth, storeys, bays }))]);
    tools = { numbers: written.numbers, names: 0 };
    // Spacings are typed when asked for; the other knobs count only when they left their defaults.
    options = Object.entries(REFERENCE_DEFAULTS).filter(([name, fallback]) => Number.isFinite(recipe.reference[name]) && recipe.reference[name] !== fallback).map(([name]) => name);
    author = { numbers: total.numbers - written.numbers + 4 + options.length, names: total.names };
  }
  const massing = recipe.reference ? { numbers: 4 + options.length, names: author.names } : sum([sections.streets, sections.blocks, sections.layout]);
  return { sections, total, massing, author, tools, ...(options ? { options: ['site', ...options, 'style'] } : {}) };
}

// A block as a quarter: its land and its artistic choices, nothing about where shells go.
export const quarterOf = ({ id, rect, style, depth, storeys, bays, names, court, front, sides }) => ({ id, rect, style, depth, storeys, bays, names, ...(court ? { court } : {}), front, sides });
export function quarterForm(recipe) {
  if (recipe.layout || !recipe.blocks?.length) return structuredClone(recipe);
  return { ...structuredClone(recipe), blocks: [], layout: { quarters: recipe.blocks.map(quarterOf), reserved: [] } };
}

export function widenStreets(recipe, metres = WIDEN_METRES) {
  const edited = structuredClone(recipe);
  for (const street of edited.streets ?? []) street.lane += metres;
  return edited;
}

const shells = plan => plan.pieces.filter(piece => piece.piece.startsWith('building/'));
const tryAssemble = recipe => { try { return { plan: assembleNeighborhood(recipe) }; } catch (error) { return { error: error.message }; } };

// What one edit costs in each form. `blocksToRetype` are authored rectangles that
// intersect a corridor after the edit (4 numbers each); `shellsInStreet` are the
// shells the unedited recipe leaves standing in a lane or sidewalk.
export function changeCost(recipe, metres = WIDEN_METRES) {
  const before = shells(assembleNeighborhood(structuredClone(recipe))).length;
  const edited = widenStreets(recipe, metres), corridors = (edited.streets ?? []).map(street => streetCorridor(street, edited.site));
  const inStreet = plan => shells(plan).filter(piece => corridors.some(corridor => overlaps(piece.rect, corridor))).length;
  const form = (candidate, authoredBlocks) => {
    const hit = authoredBlocks.filter(block => corridors.some(corridor => overlaps(block.rect, corridor)));
    const { plan, error } = tryAssemble(candidate);
    return { blocksToRetype: hit.length, numbersToRetype: hit.length * 4, ...(plan ? { shells: shells(plan).length, shellsInStreet: inStreet(plan), warnings: plan.provenance?.layout?.warnings?.length ?? 0 } : { error }) };
  };
  return { edit: `every street ${metres} m wider`, shellsBefore: before, authored: form(edited, edited.blocks ?? []), quarters: form(widenStreets(quarterForm(recipe), metres), []) };
}

export function measureEffort(recipe) {
  const plan = assembleNeighborhood(structuredClone(recipe)), typed = typedValues(recipe), placed = shells(plan).length;
  return { id: recipe.id, form: recipe.layout ? (recipe.reference ? 'reference' : 'layout') : 'authored', blocks: (recipe.blocks ?? []).length + (plan.provenance?.layout?.blocks?.length ?? 0),
    shells: placed, typed, perShell: placed ? Math.round(typed.massing.numbers / placed * 100) / 100 : null, change: recipe.blocks?.length || recipe.layout ? changeCost(recipe) : null };
}

// Every recipe at once, with the totals the docs quote.
export function measureWorld(recipes) {
  const entries = recipes.map(measureEffort).sort((a, b) => a.id.localeCompare(b.id));
  const authored = entries.filter(entry => entry.form === 'authored' && entry.change);
  const total = key => authored.reduce((n, entry) => n + (entry.change[key.form][key.field] ?? 0), 0);
  return { edit: `every street ${WIDEN_METRES} m wider`, recipes: entries, shipped: { recipes: authored.length, blocks: authored.reduce((n, e) => n + e.blocks, 0), shells: authored.reduce((n, e) => n + e.shells, 0),
    typed: sum(authored.map(e => e.typed.author)), massing: sum(authored.map(e => e.typed.massing)),
    authored: { blocksToRetype: total({ form: 'authored', field: 'blocksToRetype' }), numbersToRetype: total({ form: 'authored', field: 'numbersToRetype' }), shellsInStreet: total({ form: 'authored', field: 'shellsInStreet' }) },
    quarters: { blocksToRetype: total({ form: 'quarters', field: 'blocksToRetype' }), numbersToRetype: 0, shellsInStreet: total({ form: 'quarters', field: 'shellsInStreet' }), shells: total({ form: 'quarters', field: 'shells' }) } } };
}
