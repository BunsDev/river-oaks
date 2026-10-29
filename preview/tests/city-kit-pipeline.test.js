// The whole pipeline on one neighborhood (#585): the Studio neighborhood compiler's
// drawing becomes a kit recipe (streets and quarters from its roads and parcels),
// the recipe becomes a locked plan with buildings, and the plan becomes a Studio
// region the server compiles. Repeatable from scratch, with the author's typing counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood } from '../../shared/city-kit/assemble.js';
import { referenceRecipe } from '../../shared/city-kit/reference.js';
import { studioRegion } from '../../shared/city-kit/studio.js';
import { parseRegion } from '../src/studio/document.js';
import { compileRegionPackage } from '../../server/region-package.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const committed = read(join(root, 'config/destinations/garden-blocks-kit.json')), lock = read(join(root, 'config/destinations/garden-blocks-kit.lock.json'));
const run = (script, args, cwd) => execFileSync(process.execPath, [join(root, script), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const numbers = value => typeof value === 'number' ? 1 : Array.isArray(value) ? value.reduce((n, v) => n + numbers(v), 0) : value && typeof value === 'object' ? Object.values(value).reduce((n, v) => n + numbers(v), 0) : 0;
const scratch = mkdtempSync(join(tmpdir(), 'city-kit-pipeline-'));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

test('the compiler drawing, the reference step and the build reproduce the committed example from scratch', () => {
  const candidate = join(scratch, 'candidate');
  const built = JSON.parse(run('scripts/neighborhood.mjs', ['build', '--recipe', 'config/neighborhoods/garden-blocks.json', '--out', candidate], root).trim().split('\n').pop());
  assert.deepEqual(built.counts, { blocks: 4, buildings: 16, parcels: 16, roads: 6 });
  const recipePath = join(scratch, 'garden-blocks-kit.json');
  const log = run('scripts/destination.mjs', ['reference', join(candidate, 'region.json'), '--site=-8,-8,84,84', '--id=garden-blocks-kit', '--title=x', '--style=garden-court', '--trees=8', '--lamps=14', `--out=${recipePath}`], root);
  assert.match(log, /4 mapped parcels are quarters/);
  assert.match(log, /budget: 130384 of 260000 triangles; 4 blocks/);
  const derived = read(recipePath);
  for (const street of derived.streets) assert.deepEqual([street.trees, street.lamps], [{ offset: 4, spacing: 8 }, { offset: 8, spacing: 14 }], `${street.id} carries the typed spacings`);
  assert.throws(() => referenceRecipe(read(join(candidate, 'region.json')), { site: [-8, -8, 84, 84], trees: 2 }), /Invalid reference: trees 2/);
  // The author typed the site, the style, two spacings and eight names; everything else the tools wrote.
  const authored = structuredClone(derived);
  authored.title = committed.title; authored.inspiration = committed.inspiration;
  for (const quarter of authored.layout.quarters) quarter.names = committed.layout.quarters.find(q => q.id === quarter.id).names;
  assert.deepEqual(authored, committed);
  const plan = assembleNeighborhood(structuredClone(committed));
  assert.equal(plan.hash, lock.hash);
  // Before the names were typed, the plan already placed the same 32 shells on the same ground; only the names on them differ.
  const placeholder = assembleNeighborhood(structuredClone(derived));
  assert.deepEqual(placeholder.pieces.map(p => [p.id, p.piece, p.rect ?? p.at]), plan.pieces.map(p => [p.id, p.piece, p.rect ?? p.at]));
  assert.notEqual(placeholder.hash, plan.hash);
});

test('the locked plan places buildings on every parcel and becomes a Studio region the server compiles', () => {
  const plan = assembleNeighborhood(structuredClone(committed));
  const shells = plan.pieces.filter(piece => piece.piece.startsWith('building/')), counts = [];
  assert.equal(shells.length, 32);
  for (const quarter of committed.layout.quarters) {
    const [w, s, e, n] = quarter.rect, inside = shells.filter(p => p.rect[0] >= w - 1e-6 && p.rect[2] <= e + 1e-6 && p.rect[1] >= s - 1e-6 && p.rect[3] <= n + 1e-6);
    assert.ok(inside.length >= 6, `${quarter.id} holds a block of shells inside the parcel (${inside.length})`);
    counts.push(inside.length);
  }
  assert.deepEqual(counts, [6, 10, 8, 8]);
  assert.equal(plan.stats.triangles, 130384);
  assert.equal(plan.solids.filter(solid => solid.kind === 'street-tree').length, 56);
  assert.equal(plan.solids.filter(solid => solid.kind === 'lamp').length, 16);
  const { region, summary } = studioRegion(committed, plan);
  assert.deepEqual(summary, { roads: 4, buildings: 32, omitted: 0, trees: 56, places: 4, parcels: 4, spawn: [21, 13.95] });
  const parsed = parseRegion(JSON.stringify(region));
  assert.equal(parsed.buildings.length, 32);
  const pkg = compileRegionPackage(parsed, 'Garden Blocks (kit)');
  assert.ok(pkg && typeof pkg === 'object');
});

test('what the author typed: four site numbers, a style, two spacings and eight names, against the 70 of the hand-authored crossroads', () => {
  const yale = read(join(root, 'config/destinations/nineteenth-and-yale.json'));
  const typedByHand = numbers({ streets: yale.streets, plazas: yale.plazas, blocks: yale.blocks, landmarks: yale.landmarks, furniture: yale.furniture });
  const generated = numbers({ streets: committed.streets, layout: committed.layout });
  assert.equal(typedByHand, 70, 'Nineteenth & Yale types 70 numbers for its streets, plaza, 4 blocks, landmark and furniture');
  assert.equal(generated, 80, 'the tools wrote the streets, their furnishing and the quarters of the example');
  assert.equal(committed.layout.quarters.flatMap(q => q.names).length, 8);
  console.log(`typed by hand for Nineteenth & Yale: ${typedByHand} numbers; typed for Garden Blocks (kit): 4 site numbers, 1 style, 2 spacings, 8 names; tools wrote ${generated} numbers and placed 32 buildings, 56 trees and 16 lamps`);
});
