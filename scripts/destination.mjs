#!/usr/bin/env node
// Neighborhood production pipeline (#585). One command assembles a recipe into a
// canonical plan, a top-down SVG preview and a report (budgets, connectivity,
// overrides); `check` proves committed locks still reproduce; `override` records a
// manual edit by stable piece ID without touching generated output.
//   pnpm run destination build config/destinations/bayou-market-commons.json [--seed N] [--out DIR] [--lock]
//   pnpm run destination check
//   pnpm run destination override <recipe.json> <piece-id> (--set key=value ... | --suppress) [--note text]
//   pnpm run destination preview <recipe.json>
//   pnpm run destination layout <recipe.json> [--freeze]   # the land each quarter claims and the blocks it derives
//   pnpm run destination reference <world.json> --site w,s,e,n --id <id> [--parcels ignore] [--out recipe.json]   # a recipe skeleton from mapped roads (and parcels)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood, canonicalJSON, validateRecipe, walkableConnectivity } from '../shared/city-kit/assemble.js';
import { expandLayout } from '../shared/city-kit/layout.js';
import { referenceRecipe, dominantRotation } from '../shared/city-kit/reference.js';
import { studioRegion } from '../shared/city-kit/studio.js';
import { KIT_CONVENTIONS, KIT_PIECES } from '../shared/city-kit/catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), recipesDir = join(root, 'config/destinations');
const [command, ...rest] = process.argv.slice(2);
const flag = name => { const i = rest.indexOf(name); if (i >= 0) return rest[i + 1]; const joined = rest.find(arg => arg.startsWith(`${name}=`)); return joined ? joined.slice(name.length + 1) : null; };
const has = name => rest.includes(name);
const readRecipe = path => JSON.parse(readFileSync(resolve(path), 'utf8'));
const lockPath = path => resolve(path).replace(/\.json$/, '.lock.json');
const recipePaths = () => readdirSync(recipesDir).filter(name => name.endsWith('.json') && !name.endsWith('.lock.json')).map(name => join(recipesDir, name));
// Recipes with a hand-authored gateway outside their own walkable ground name it here.
const ENTRIES = { 'bayou-market-commons': { entry: [0, 0], extraSurfaces: [{ id: 'east-garden-commons/promenade', rect: [-3, -3, 82, 3] }] },
  // Bayou Heights (shared/bayou-heights.js): the footbridge landing and Nineteenth Street are composed seams.
  'bayou-greenway': { entry: [115.5, 0], extraSurfaces: [{ id: 'bayou-heights/footbridge-landing', rect: [150, -3, 154, 3] }] },
  'yale-icehouse': { entry: [156.5, -62.5], extraSurfaces: [{ id: 'bayou-greenway/greenway/walk', rect: [152, -8, 161, 7.5] }, { id: 'bayou-greenway/nineteenth-west/walk', rect: [152, -7.5, 251, 7.5] }] } };

export function report(plan) {
  const entry = ENTRIES[plan.id] ?? { entry: plan.surfaces[0] ? [(plan.surfaces[0].rect[0] + plan.surfaces[0].rect[2]) / 2, (plan.surfaces[0].rect[1] + plan.surfaces[0].rect[3]) / 2] : [0, 0] };
  const connectivity = walkableConnectivity(plan, entry);
  const budgets = KIT_CONVENTIONS.budgets;
  return {
    id: plan.id, kit: plan.kit, seed: plan.seed, hash: plan.hash, stats: plan.stats, provenance: plan.provenance,
    budgets: { triangles: [plan.stats.triangles, budgets.trianglesPerNeighborhood], solids: [plan.stats.solids, budgets.solidsPerNeighborhood], materials: [plan.stats.materials, budgets.materialsPerNeighborhood],
      within: plan.stats.triangles <= budgets.trianglesPerNeighborhood && plan.stats.solids <= budgets.solidsPerNeighborhood && plan.stats.materials <= budgets.materialsPerNeighborhood },
    connectivity: { reached: connectivity.reached, walkableSamples: connectivity.total, ratio: Number(connectivity.ratio.toFixed(5)),
      lanterns: plan.lanterns.map(lantern => ({ id: lantern.id, reachable: [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => connectivity.reachable([lantern.at[0] + dx, lantern.at[1] + dy])) })) },
    unsigned: plan.pieces.filter(piece => piece.piece === 'building/shell' && piece.faces?.length && piece.sign === null && !piece.id.endsWith('/rear')).map(piece => piece.id),
    ...(plan.provenance.layout ? { layout: plan.provenance.layout } : {}),
  };
}

// The land a layout found, its bounding streets and what became of it; null without a layout.
export function layoutDiagnostics(recipe) {
  const layout = expandLayout(validateRecipe(structuredClone(recipe)));
  return layout ? { ...layout.diagnostics, derived: layout.blocks } : null;
}

// Shop names such as "Iron & Ivy" must be escaped inside SVG titles.
const text = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function svg(plan, layout = null) {
  const [w, s, e, n] = plan.site, pad = 8, scale = 6, width = (e - w + pad * 2) * scale, height = (n - s + pad * 2) * scale;
  const X = x => ((x - w + pad) * scale).toFixed(1), Y = y => ((n + pad - y) * scale).toFixed(1);
  // A titled rectangle closes with </rect>; an untitled one is self-closing. Titles are escaped text.
  const box = (r, fill, extra = '', title = null) => `<rect x="${X(r[0])}" y="${Y(r[3])}" width="${((r[2] - r[0]) * scale).toFixed(1)}" height="${((r[3] - r[1]) * scale).toFixed(1)}" fill="${fill}" ${extra}${title === null ? '/>' : `><title>${text(title)}</title></rect>`}`;
  const colours = { 'street/shared-lane': '#8f7f78', 'street/intersection': '#8f7f78', 'street/crosswalk': '#a59a92', 'street/sidewalk': '#d6d2c9', 'street/court': '#e8e1d2', 'landscape/lawn': '#9fbf86', 'landscape/bayou': '#5f8d84', 'landscape/hedge': '#4d6b4a', 'building/context': '#c9c2b6', 'landscape/planter': '#7f9d6c' };
  const walls = { 'brick-rose': '#c98e88', 'brick-umber': '#a9826e', 'stucco-ivory': '#efe5d0', 'stucco-apricot': '#e3b48c' };
  const body = [];
  for (const piece of plan.pieces) if (piece.rect && colours[piece.piece]) body.push(box(piece.rect, colours[piece.piece]));
  for (const piece of plan.pieces) if (piece.piece === 'building/shell') {
    body.push(box(piece.rect, walls[piece.wall] ?? '#ccc', 'stroke="#1f454a" stroke-width="1.5"', `${piece.id} · ${piece.storeys} storeys · ${piece.roof}${piece.sign ? ` · ${piece.sign}` : ''}`));
    for (const face of piece.faces ?? []) {
      const [a, b, c, d] = piece.rect, line = { south: [a, b, c, b], north: [a, d, c, d], east: [c, b, c, d], west: [a, b, a, d] }[face];
      body.push(`<line x1="${X(line[0])}" y1="${Y(line[1])}" x2="${X(line[2])}" y2="${Y(line[3])}" stroke="#317b7d" stroke-width="4"/>`);
    }
  }
  for (const solid of plan.solids) body.push(box(solid.rect, '#3b352e'));
  for (const piece of plan.pieces) if (piece.at && piece.piece === 'landscape/street-tree') body.push(`<circle cx="${X(piece.at[0])}" cy="${Y(piece.at[1])}" r="${(piece.radius * scale).toFixed(1)}" fill="#5c7f4c" fill-opacity=".45"/>`);
  for (const lantern of plan.lanterns) body.push(`<circle cx="${X(lantern.at[0])}" cy="${Y(lantern.at[1])}" r="9" fill="#ffbf66" stroke="#1f454a" stroke-width="2"><title>${text(lantern.name)}</title></circle>`);
  for (const piece of plan.pieces) if (piece.piece === 'landmark/water-tower') body.push(`<circle cx="${X(piece.at[0])}" cy="${Y(piece.at[1])}" r="${(4 * scale).toFixed(1)}" fill="none" stroke="#317b7d" stroke-width="5"/>`);
  for (const piece of plan.pieces) if (piece.override) {
    const [x, y] = piece.at ?? [(piece.rect[0] + piece.rect[2]) / 2, (piece.rect[1] + piece.rect[3]) / 2];
    body.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="6" fill="#c0392b"><title>manual ${piece.override}: ${text(piece.id)}</title></circle>`);
  }
  // Derived blocks are outlined with dashes; land a layout left open or skipped is outlined in red.
  for (const block of plan.provenance.layout?.blocks ?? []) body.push(box(block.rect, 'none', 'stroke="#1f454a" stroke-width="2" stroke-dasharray="8 5"', `derived ${block.id} · faces ${block.front}${block.sides.length ? ` · sides ${block.sides.join(', ')}` : ''}`));
  for (const cell of layout?.cells ?? []) if (cell.result === 'open' || cell.result === 'skipped') body.push(box(cell.rect, 'none', 'stroke="#c0392b" stroke-width="2" stroke-dasharray="3 4"', `${cell.result} land${cell.quarter ? ` (${cell.quarter})` : ''}${cell.reason ? `: ${cell.reason}` : ''}`));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}"><title>${text(plan.id)} · seed ${plan.seed} · ${plan.hash}</title><rect width="100%" height="100%" fill="#f4efe6"/>${body.join('')}</svg>\n`;
}

function build(path) {
  const recipe = readRecipe(path), seed = flag('--seed') === null ? recipe.seed : Number(flag('--seed'));
  const plan = assembleNeighborhood(recipe, { seed }), out = resolve(flag('--out') ?? join(root, '.runtime/destinations', `${plan.id}-${seed}`));
  mkdirSync(out, { recursive: true });
  const summary = report(plan), layout = layoutDiagnostics(recipe);
  writeFileSync(join(out, 'plan.json'), `${canonicalJSON(plan)}\n`);
  writeFileSync(join(out, 'plan.svg'), svg(plan, layout));
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (layout) { writeFileSync(join(out, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`); for (const warning of layout.warnings) console.warn(`layout: ${warning}`); }
  // The plan as a World Studio region, for review by walking and marking places (docs/city-kit.md, "Open a plan in World Studio").
  // Build's stdout is one JSON object; the Studio summary joins it, and hints go to stderr.
  let studio = null;
  try {
    const exported = studioRegion(recipe, plan);
    writeFileSync(join(out, 'studio-region.json'), `${JSON.stringify(exported.region, null, 2)}\n`);
    for (const entry of exported.omitted) console.warn(`studio: omitted ${entry.id} (${entry.size.join(' × ')} m): ${entry.reason}`);
    console.warn(`studio: ${exported.summary.roads} roads, ${exported.summary.buildings} buildings, ${exported.summary.trees} trees, ${exported.summary.places} places, ${exported.summary.parcels} parcels, arrival ${exported.summary.spawn.join(',')}; open studio-region.json in World Studio with Open JSON`);
    studio = { ...exported.summary, bytes: exported.bytes, file: 'studio-region.json' };
  } catch (error) { console.warn(`studio: no region written: ${error.message}`); studio = { error: error.message }; }
  if (has('--lock')) {
    if (seed !== recipe.seed) throw new Error('Lock only the recipe seed');
    writeFileSync(lockPath(path), `${JSON.stringify({ id: plan.id, kit: plan.kit, seed, hash: plan.hash, recipeHash: plan.provenance.recipeHash, overridesHash: plan.provenance.overridesHash, stats: plan.stats }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ out, hash: plan.hash, seed, stats: plan.stats, budgetsWithin: summary.budgets.within, studio, connectivity: summary.connectivity.ratio, overrides: plan.provenance.overrides,
    ...(layout ? { layout: { cells: layout.cells.length, derived: layout.derived.map(block => block.id), warnings: layout.warnings.length } } : {}) }, null, 2));
  if (!summary.budgets.within || summary.connectivity.ratio < 1 || summary.connectivity.lanterns.some(item => !item.reachable)) process.exitCode = 1;
}

function check() {
  let failed = 0;
  for (const path of recipePaths()) {
    if (!existsSync(lockPath(path))) continue;
    const lock = JSON.parse(readFileSync(lockPath(path), 'utf8')), plan = assembleNeighborhood(readRecipe(path));
    const ok = lock.hash === plan.hash;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'DIFF'} ${basename(path)} ${plan.hash}${ok ? '' : ` (lock ${lock.hash}; recipe ${lock.recipeHash === plan.provenance.recipeHash ? 'same' : 'changed'}, overrides ${lock.overridesHash === plan.provenance.overridesHash ? 'same' : 'changed'}; rerun build --lock after review)`}`);
  }
  if (failed) process.exitCode = 1;
}

function override(path, id) {
  const recipe = readRecipe(path);
  if (!id?.startsWith(`${recipe.id}/`)) throw new Error(`Piece IDs start with ${recipe.id}/`);
  const entry = { ...(recipe.overrides?.[id] ?? {}) };
  if (has('--suppress')) { entry.suppress = true; delete entry.set; }
  rest.forEach((arg, i) => {
    if (arg !== '--set') return;
    const [key, ...value] = rest[i + 1].split('='), raw = value.join('=');
    let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    entry.set = { ...(entry.set ?? {}), [key]: parsed };
  });
  if (flag('--note')) entry.note = flag('--note');
  recipe.overrides = { ...(recipe.overrides ?? {}), [id]: entry };
  const plan = assembleNeighborhood(recipe);
  if (plan.provenance.overrides.orphaned.includes(id)) throw new Error(`${id} is not a generated piece for seed ${recipe.seed}`);
  writeFileSync(resolve(path), `${JSON.stringify(recipe, null, 2)}\n`);
  console.log(`Recorded override for ${id}; plan ${plan.hash}. Review, then run build --lock.`);
}

// Show the land a layout claims and the blocks it derives. `--freeze` writes those
// blocks into the recipe as authored blocks and removes the layout: the plan's
// pieces, surfaces and solids stay identical, and later edits are by hand.
function layoutCommand(path) {
  const recipe = readRecipe(path), layout = layoutDiagnostics(recipe);
  if (!layout) { console.log(`${basename(path)} has no layout; its ${recipe.blocks?.length ?? 0} blocks are authored.`); return; }
  const side = (cell, name) => cell.streets?.[name]?.streets.map(street => `${street.id}${cell.streets[name].coverage < 1 - 1e-6 ? ` (${Math.round(cell.streets[name].coverage * 100)}%)` : ''}`).join('+') || '-';
  console.log(['land (w,s,e,n)', 'quarter', 'north', 'south', 'east', 'west', 'result', 'blocks'].join('\t'));
  for (const cell of layout.cells) console.log([cell.rect.join(','), cell.quarter ?? '-', side(cell, 'north'), side(cell, 'south'), side(cell, 'east'), side(cell, 'west'), cell.result + (cell.reason ? ` (${cell.reason})` : ''), cell.blocks.join(' ') || '-'].join('\t'));
  for (const block of layout.derived) console.log(`derived ${block.id}: ${block.style}, faces ${block.front}${block.sides ? `, sides ${block.sides.join(', ')}` : ''}, ${block.names.length} names, rect ${block.rect.join(',')}`);
  for (const warning of layout.warnings) console.warn(`warning: ${warning}`);
  if (!has('--freeze')) return;
  const before = assembleNeighborhood(recipe), frozen = { ...recipe, blocks: [...(recipe.blocks ?? []), ...layout.derived] };
  delete frozen.layout;
  const after = assembleNeighborhood(frozen), geometry = plan => canonicalJSON({ pieces: plan.pieces, surfaces: plan.surfaces, solids: plan.solids, lanterns: plan.lanterns });
  if (geometry(before) !== geometry(after)) throw new Error('Frozen blocks do not reproduce the derived plan; nothing written');
  writeFileSync(resolve(path), `${JSON.stringify(frozen, null, 2)}\n`);
  console.log(`Froze ${layout.derived.length} derived blocks into ${basename(path)} and removed its layout; identical pieces, surfaces and solids. Review, then run build --lock.`);
}

// Turn the mapped roads inside a site into a recipe skeleton: streets on the kit grid,
// one quarter with placeholder names, and a `reference` record of what was kept,
// merged, dropped and why. The author then names the shops, adds plazas and
// landmarks, and runs build. Nothing in the source file is changed.
function reference(path) {
  const site = (flag('--site') ?? fail('--site w,s,e,n')).split(',').map(Number), id = flag('--id') ?? 'reference';
  const number = (name, fallback) => flag(name) === null ? fallback : Number(flag(name));
  const bytes = readFileSync(resolve(path)), world = JSON.parse(bytes.toString('utf8'));
  const options = { id, site, title: flag('--title') ?? undefined, style: flag('--style') ?? undefined, rotation: flag('--rotation') === null || flag('--rotation') === 'auto' ? 'auto' : Number(flag('--rotation')),
    tolerance: number('--tolerance', undefined), sidewalk: number('--sidewalk', undefined), lane: number('--lane', undefined), minimumLength: number('--min-length', undefined),
    kinds: flag('--kinds') ? flag('--kinds').split(',') : null, parcels: flag('--parcels') ?? undefined, source: { name: basename(path), sha256: createHash('sha256').update(bytes).digest('hex') } };
  for (const key of Object.keys(options)) if (options[key] === undefined) delete options[key];
  const grid = dominantRotation(world, site), recipe = referenceRecipe(world, options), ref = recipe.reference;
  console.log(`${basename(path)}: ${world.roads.length} mapped roads; grid turned ${ref.rotation}° (${Math.round(grid.aligned * 100)}% of ${grid.length} m of road inside the site runs with it); site ${recipe.site[2]}×${recipe.site[3]} m; ${ref.buildings} mapped buildings inside, counted only.`);
  console.log(['street', 'from', 'to', 'lane', 'roads'].join('\t'));
  for (const street of recipe.streets) { const roads = ref.streets.find(entry => entry.id === street.id); console.log([street.id, street.from.join(','), street.to.join(','), street.lane, `${roads.roads.length}× ${roads.name ?? roads.roads[0]}`].join('\t')); }
  for (const entry of ref.dropped) console.warn(`dropped ${entry.name ?? entry.road} (${entry.road}, ${entry.length} m): ${entry.reason}`);
  if (ref.parcels.quarters.length) {
    console.log(`parcels: ${ref.parcels.quarters.length} mapped parcels are quarters (${ref.parcels.quarters.map(entry => entry.id).join(', ')}); ${ref.openLand} m² outside them stays open`);
    for (const entry of ref.parcels.quarters) for (const note of entry.snapped) console.log(`parcel ${entry.parcel}: ${note} edge snapped to the street`);
  }
  for (const entry of ref.parcels.dropped) console.warn(`parcel ${entry.parcel} not a quarter: ${entry.reason}`);
  if (ref.layoutError) console.warn(`layout: ${ref.layoutError}`);
  const openWarnings = ref.layoutWarnings.filter(warning => warning.startsWith('open land '));
  for (const warning of ref.layoutWarnings) if (!openWarnings.includes(warning) || !ref.parcels.quarters.length) console.warn(`layout: ${warning}`);
  if (openWarnings.length && ref.parcels.quarters.length) console.warn(`layout: ${openWarnings.length} pieces of land outside the parcels stay open (listed in reference.layoutWarnings)`);
  // The budget outlook before anyone names a shop: the kit holds about four blocks per recipe.
  try {
    const plan = assembleNeighborhood(structuredClone(recipe)), limit = KIT_CONVENTIONS.budgets.trianglesPerNeighborhood;
    console.log(`budget: ${plan.stats.triangles} of ${limit} triangles${plan.stats.triangles > limit ? ' (over: narrow the site or split it into several recipes)' : ''}; ${ref.blocks} blocks (about four fit the draw-call budget)`);
  } catch (error) { console.warn(`budget: the skeleton does not assemble: ${error.message}`); }
  const out = resolve(flag('--out') ?? join(root, '.runtime/destinations', `${id}-reference`, 'recipe.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(recipe, null, 2)}\n`);
  console.log(`${recipe.streets.length} streets, ${ref.dropped.length} roads dropped, ${ref.blocks} blocks from one quarter with placeholder names. Wrote ${out}; name the shops, add plazas and landmarks, then run build.`);
}

const pieceCount = Object.keys(KIT_PIECES).length;
if (command === 'build') build(rest.find(arg => arg.endsWith('.json')) ?? fail());
else if (command === 'check') check();
else if (command === 'override') override(rest[0], rest[1]);
else if (command === 'layout') layoutCommand(rest.find(arg => arg.endsWith('.json')) ?? fail());
else if (command === 'reference') reference(rest.find(arg => arg.endsWith('.json')) ?? fail());
else if (command === 'preview') {
  const recipe = readRecipe(rest[0] ?? join(recipesDir, 'bayou-market-commons.json'));
  console.log(`In-engine kit preview: pnpm run dev, then open /e2e/fixtures/city-kit.html?recipe=${recipe.id}`);
  console.log(`World Studio: pnpm run destination build ${rest[0] ?? 'config/destinations/bayou-market-commons.json'}, then Open JSON on studio-region.json from the build directory.`);
  if (recipe.id === 'bayou-market-commons') console.log('Playable in the town: pnpm run dev serves it (the development town defaults to the full expansion), then walk east from the District arrival.');
} else { console.error(`usage: destination build|check|override|preview|layout|reference (${pieceCount} kit pieces)`); process.exitCode = 2; }
function fail(what = 'a recipe .json path') { throw new Error(`Pass ${what}`); }
