// Authored blocks as quarters, without moving a wall (#585). A shipped recipe types
// a rectangle, a front and its sides for every block, each kept flush to a street
// by hand; its quarter form derives the same blocks from the streets, so a street
// edit moves them for free. `migrateRecipe` rewrites the blocks as quarters in the
// leanest form that reproduces the plan's geometry hash exactly (a loose rectangle
// out to the nearest street, plaza or neighbour when the block already fills its
// land, no stated front when the auto rule picks the same street), and refuses when
// no form does. The geometry hash is the proof: the lock records it on the authored
// form, and the migrated recipe must hash the same ground.
import { assembleNeighborhood, geometryHash } from './assemble.js';
import { streetCorridor } from './layout.js';
import { countTyped } from './effort.js';

const EPS = 1e-6;
const mm = value => Math.round(value * 1000) / 1000;
const spans = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
const WORDS = ['front', 'sides', 'split'];

// The block's land: its rectangle pushed out on each side to the nearest obstacle
// (a street corridor, plaza, context item or another block) or the site edge.
export function looseRect(block, recipe) {
  const site = recipe.site, [x0, y0, x1, y1] = block.rect;
  const obstacles = [
    ...(recipe.streets ?? []).map(street => streetCorridor(street, site)),
    ...(recipe.plazas ?? []).map(item => item.rect),
    ...(recipe.context ?? []).map(item => item.rect),
    ...(recipe.blocks ?? []).filter(other => other.id !== block.id).map(other => other.rect),
  ];
  const west = Math.max(site[0], ...obstacles.filter(r => spans(y0, y1, r[1], r[3]) && r[2] <= x0 + EPS).map(r => r[2]));
  const east = Math.min(site[2], ...obstacles.filter(r => spans(y0, y1, r[1], r[3]) && r[0] >= x1 - EPS).map(r => r[0]));
  const south = Math.max(site[1], ...obstacles.filter(r => spans(x0, x1, r[0], r[2]) && r[3] <= y0 + EPS).map(r => r[3]));
  const north = Math.min(site[3], ...obstacles.filter(r => spans(x0, x1, r[0], r[2]) && r[1] >= y1 - EPS).map(r => r[1]));
  return [west, south, east, north].map(mm);
}

const sameRect = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < EPS);
const strip = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
const words = quarters => quarters.reduce((n, quarter) => n + WORDS.filter(key => quarter[key] !== undefined).length, 0);

export function migrateRecipe(recipe) {
  if (recipe.layout) return { id: recipe.id, recipe: null, reason: 'already has a layout' };
  if (!recipe.blocks?.length) return { id: recipe.id, recipe: null, reason: 'no authored blocks' };
  const authored = assembleNeighborhood(structuredClone(recipe)), target = geometryHash(authored);
  const build = quarters => { const { blocks: _blocks, ...rest } = structuredClone(recipe); return { ...rest, layout: { open: 'ground', quarters: quarters.map(strip) } }; };
  let lastError = null;
  const reproduces = quarters => {
    try { const plan = assembleNeighborhood(build(quarters)); return geometryHash(plan) === target ? plan : null; } catch (error) { lastError = error.message; return null; }
  };
  // The full form: the authored fields, which the shipped-quarters test showed reproduce the plan or say why not.
  // A block set back from its street (the Bayou Terraces stand 0.5 m off their lane) has
  // no street on its own rectangle: its full form is then the loose land with an inset.
  const full = recipe.blocks.map(({ id, rect, style, depth, storeys, bays, names, court, front, sides }) => ({ id, rect, style, depth, storeys, bays, names, court, front, sides }));
  const insetFrom = (land, rect) => [rect[0] - land[0], rect[1] - land[1], land[2] - rect[2], land[3] - rect[3]].map(mm);
  // Land for an inset block: loose across its street, but only as long as the block along
  // it, so a wider street cuts the whole land and leaves no strip beyond the street's end.
  const across = (block, loose) => (block.front === 'north' || block.front === 'south'
    ? [block.rect[0], loose[1], block.rect[2], loose[3]] : [loose[0], block.rect[1], loose[2], block.rect[3]]);
  const insetFull = full.map((quarter, index) => {
    const block = recipe.blocks[index], land = across(block, looseRect(block, recipe));
    return sameRect(land, quarter.rect) ? quarter : { ...quarter, rect: land, inset: insetFrom(land, quarter.rect), split: 'none' };
  });
  const start = reproduces(full) ? full : reproduces(insetFull) ? insetFull : null;
  if (!start) return { id: recipe.id, recipe: null, reason: lastError ?? 'the derived blocks differ from the authored ones', geometry: target };
  const chosen = start.map(strip), forms = [];
  for (const [index, block] of recipe.blocks.entries()) {
    const { front, sides, inset: _inset, split: _split, ...rest } = chosen[index], loose = looseRect(block, recipe), tight = block.rect;
    const land = across(block, loose), inset = insetFrom(land, tight);
    // Leanest first: no rectangle at all (one quarter over the whole site), the loose
    // rectangle, the authored one; and for each, the auto rule before a stated front.
    // Land with an inset comes last of all: it types four more numbers.
    const rects = [...(recipe.blocks.length === 1 ? [['no rect', undefined]] : []), ...(sameRect(loose, tight) ? [] : [['loose', loose]]), ['tight', tight]];
    const candidates = [...rects.flatMap(([kind, rect]) => [
      [`${kind}, auto`, { ...rest, rect }], [`${kind}, auto, no split`, { ...rest, rect, split: 'none' }],
      [`${kind}, front`, { ...rest, rect, front }], [`${kind}, front and sides`, { ...rest, rect, front, sides }]]),
    ...(sameRect(land, tight) ? [] : [
      ['land, inset, auto', { ...rest, rect: land, inset, split: 'none' }],
      ['land, inset, front', { ...rest, rect: land, inset, split: 'none', front }],
      ['land, inset, front and sides', { ...rest, rect: land, inset, split: 'none', front, sides }]])];
    for (const [form, candidate] of candidates) {
      const trial = chosen.map((quarter, i) => (i === index ? strip(candidate) : quarter));
      if (reproduces(trial)) { chosen[index] = strip(candidate); forms.push({ id: block.id, form, rect: candidate.rect ?? null }); break; }
    }
  }
  const migrated = build(chosen);
  migrated.layout.migrated = { blocks: recipe.blocks.length, geometry: target };
  const plan = assembleNeighborhood(structuredClone(migrated));
  if (geometryHash(plan) !== target) throw new Error(`${recipe.id}: the migrated recipe does not reproduce its geometry`);
  const before = countTyped(recipe.blocks), after = countTyped(migrated.layout.quarters);
  return { id: recipe.id, recipe: migrated, geometry: target, hash: { before: authored.hash, after: plan.hash }, blocks: forms,
    typed: { before: { ...before, words: words(full) }, after: { ...after, words: words(chosen) } }, warnings: plan.provenance.layout.warnings };
}
