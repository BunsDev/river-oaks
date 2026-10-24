#!/usr/bin/env node
// Neighborhood production pipeline (#585). One command assembles a recipe into a
// canonical plan, a top-down SVG preview and a report (budgets, connectivity,
// overrides); `check` proves committed locks still reproduce; `override` records a
// manual edit by stable piece ID without touching generated output.
//   pnpm run destination build config/destinations/bayou-market-commons.json [--seed N] [--out DIR] [--lock]
//   pnpm run destination check
//   pnpm run destination override <recipe.json> <piece-id> (--set key=value ... | --suppress) [--note text]
//   pnpm run destination preview <recipe.json>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood, canonicalJSON, walkableConnectivity } from '../shared/city-kit/assemble.js';
import { KIT_CONVENTIONS, KIT_PIECES } from '../shared/city-kit/catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), recipesDir = join(root, 'config/destinations');
const [command, ...rest] = process.argv.slice(2);
const flag = name => { const i = rest.indexOf(name); return i < 0 ? null : rest[i + 1]; };
const has = name => rest.includes(name);
const readRecipe = path => JSON.parse(readFileSync(resolve(path), 'utf8'));
const lockPath = path => resolve(path).replace(/\.json$/, '.lock.json');
const recipePaths = () => readdirSync(recipesDir).filter(name => name.endsWith('.json') && !name.endsWith('.lock.json')).map(name => join(recipesDir, name));
// Recipes with a hand-authored gateway outside their own walkable ground name it here.
const ENTRIES = { 'bayou-market-commons': { entry: [0, 0], extraSurfaces: [{ id: 'east-garden-commons/promenade', rect: [-3, -3, 82, 3] }] } };

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
  };
}

export function svg(plan) {
  const [w, s, e, n] = plan.site, pad = 8, scale = 6, width = (e - w + pad * 2) * scale, height = (n - s + pad * 2) * scale;
  const X = x => ((x - w + pad) * scale).toFixed(1), Y = y => ((n + pad - y) * scale).toFixed(1);
  const box = (r, fill, extra = '') => `<rect x="${X(r[0])}" y="${Y(r[3])}" width="${((r[2] - r[0]) * scale).toFixed(1)}" height="${((r[3] - r[1]) * scale).toFixed(1)}" fill="${fill}" ${extra}/>`;
  const colours = { 'street/shared-lane': '#8f7f78', 'street/intersection': '#8f7f78', 'street/crosswalk': '#a59a92', 'street/sidewalk': '#d6d2c9', 'street/court': '#e8e1d2', 'landscape/lawn': '#9fbf86', 'landscape/bayou': '#5f8d84', 'landscape/hedge': '#4d6b4a', 'building/context': '#c9c2b6', 'landscape/planter': '#7f9d6c' };
  const walls = { 'brick-rose': '#c98e88', 'brick-umber': '#a9826e', 'stucco-ivory': '#efe5d0', 'stucco-apricot': '#e3b48c' };
  const body = [];
  for (const piece of plan.pieces) if (piece.rect && colours[piece.piece]) body.push(box(piece.rect, colours[piece.piece]));
  for (const piece of plan.pieces) if (piece.piece === 'building/shell') {
    body.push(box(piece.rect, walls[piece.wall] ?? '#ccc', `stroke="#1f454a" stroke-width="1.5"><title>${piece.id} · ${piece.storeys} storeys · ${piece.roof}${piece.sign ? ` · ${piece.sign}` : ''}</title></rect`.replace(/\/>$/, '>')));
    for (const face of piece.faces ?? []) {
      const [a, b, c, d] = piece.rect, line = { south: [a, b, c, b], north: [a, d, c, d], east: [c, b, c, d], west: [a, b, a, d] }[face];
      body.push(`<line x1="${X(line[0])}" y1="${Y(line[1])}" x2="${X(line[2])}" y2="${Y(line[3])}" stroke="#317b7d" stroke-width="4"/>`);
    }
  }
  for (const solid of plan.solids) body.push(box(solid.rect, '#3b352e'));
  for (const piece of plan.pieces) if (piece.at && piece.piece === 'landscape/street-tree') body.push(`<circle cx="${X(piece.at[0])}" cy="${Y(piece.at[1])}" r="${(piece.radius * scale).toFixed(1)}" fill="#5c7f4c" fill-opacity=".45"/>`);
  for (const lantern of plan.lanterns) body.push(`<circle cx="${X(lantern.at[0])}" cy="${Y(lantern.at[1])}" r="9" fill="#ffbf66" stroke="#1f454a" stroke-width="2"><title>${lantern.name}</title></circle>`);
  for (const piece of plan.pieces) if (piece.piece === 'landmark/water-tower') body.push(`<circle cx="${X(piece.at[0])}" cy="${Y(piece.at[1])}" r="${(4 * scale).toFixed(1)}" fill="none" stroke="#317b7d" stroke-width="5"/>`);
  for (const piece of plan.pieces) if (piece.override) {
    const [x, y] = piece.at ?? [(piece.rect[0] + piece.rect[2]) / 2, (piece.rect[1] + piece.rect[3]) / 2];
    body.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="6" fill="#c0392b"><title>manual ${piece.override}: ${piece.id}</title></circle>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}"><title>${plan.id} · seed ${plan.seed} · ${plan.hash}</title><rect width="100%" height="100%" fill="#f4efe6"/>${body.join('')}</svg>\n`;
}

function build(path) {
  const recipe = readRecipe(path), seed = flag('--seed') === null ? recipe.seed : Number(flag('--seed'));
  const plan = assembleNeighborhood(recipe, { seed }), out = resolve(flag('--out') ?? join(root, '.runtime/destinations', `${plan.id}-${seed}`));
  mkdirSync(out, { recursive: true });
  const summary = report(plan);
  writeFileSync(join(out, 'plan.json'), `${canonicalJSON(plan)}\n`);
  writeFileSync(join(out, 'plan.svg'), svg(plan));
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (has('--lock')) {
    if (seed !== recipe.seed) throw new Error('Lock only the recipe seed');
    writeFileSync(lockPath(path), `${JSON.stringify({ id: plan.id, kit: plan.kit, seed, hash: plan.hash, recipeHash: plan.provenance.recipeHash, overridesHash: plan.provenance.overridesHash, stats: plan.stats }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ out, hash: plan.hash, seed, stats: plan.stats, budgetsWithin: summary.budgets.within, connectivity: summary.connectivity.ratio, overrides: plan.provenance.overrides }, null, 2));
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

const pieceCount = Object.keys(KIT_PIECES).length;
if (command === 'build') build(rest.find(arg => arg.endsWith('.json')) ?? fail());
else if (command === 'check') check();
else if (command === 'override') override(rest[0], rest[1]);
else if (command === 'preview') {
  const recipe = readRecipe(rest[0] ?? join(recipesDir, 'bayou-market-commons.json'));
  console.log(`In-engine kit preview: pnpm run dev, then open /e2e/fixtures/city-kit.html?recipe=${recipe.id}`);
  if (recipe.id === 'bayou-market-commons') console.log('Playable in the town: RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-market-1 pnpm run dev, then walk east from the District arrival.');
} else { console.error(`usage: destination build|check|override|preview (${pieceCount} kit pieces)`); process.exitCode = 2; }
function fail() { throw new Error('Pass a recipe .json path'); }
