import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood, canonicalJSON, validateRecipe, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { expandLayout, streetCorridor, validateLayout } from '../../shared/city-kit/layout.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import { buildCityKit } from '../src/city-kit/render.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = name => JSON.parse(readFileSync(join(root, 'config/destinations', `${name}.json`), 'utf8'));
const example = read('layout-grid-example'), yale = read('nineteenth-and-yale');
// What a plan places, regardless of how its recipe was written.
const geometry = plan => canonicalJSON({ pieces: plan.pieces, surfaces: plan.surfaces, solids: plan.solids, lanterns: plan.lanterns, stats: plan.stats });
const derive = recipe => expandLayout(validateRecipe(structuredClone(recipe)));
const blocksOf = (plan, id) => plan.pieces.filter(piece => piece.id.startsWith(`${plan.id}/${id}/`));
const overlaps = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;
// A recipe like the example, with its own quarters so a test can shape them.
const grid = (changes = {}) => ({ ...structuredClone(example), ...changes });

test('quarters reproduce the hand-authored Nineteenth & Yale crossroads piece for piece', () => {
  // Three rows face Nineteenth, the main street, by the auto rule; the garden court
  // deliberately faces the quieter cross street, which its quarter states.
  const quarters = yale.blocks.map(block => ({ id: block.id, rect: block.rect, style: block.style, depth: block.depth, storeys: block.storeys, bays: block.bays, names: block.names,
    ...(block.court ? { court: block.court, front: 'yale-walk' } : {}) }));
  const byLayout = { ...yale, blocks: [], layout: { quarters } };
  const authored = assembleNeighborhood(yale), derived = assembleNeighborhood(byLayout);
  assert.equal(geometry(derived), geometry(authored));
  assert.deepEqual(derived.provenance.overrides, authored.provenance.overrides);
  assert.deepEqual(derived.provenance.layout.blocks.map(block => [block.id, block.front, block.sides]),
    [['northwest-row', 'south', ['east']], ['northeast-row', 'south', ['west']], ['southwest-row', 'north', ['east']], ['southeast-court', 'west', ['north']]]);
  assert.deepEqual(derived.provenance.layout.warnings, []);
  // Hand-authored recipes carry no layout provenance, so their committed hashes stand.
  assert.equal(authored.provenance.layout, undefined);
  assert.equal(authored.hash, read('nineteenth-and-yale.lock').hash);
});

test('the example grid derives blocks that face the main street, split back to back and face crossing streets at corners', () => {
  const plan = assembleNeighborhood(example), layout = derive(example);
  assert.equal(plan.hash, read('layout-grid-example.lock').hash);
  assert.deepEqual(layout.diagnostics.warnings, []);
  assert.equal(layout.diagnostics.cells.length, 2);
  assert.deepEqual(layout.blocks.map(block => [block.id, block.front, block.sides ?? []]), [
    ['north-row-back-lane-north-0', 'north', ['east']], ['north-row-main-south-0', 'south', ['east']], ['south-row', 'north', ['east']]]);
  // Each block is flush with the corridors that bound it, and a split pair shares its midline.
  const main = streetCorridor(example.streets[0], example.site), west = streetCorridor(example.streets[1], example.site);
  const south = layout.blocks.find(block => block.id === 'north-row-main-south-0'), north = layout.blocks.find(block => block.id === 'north-row-back-lane-north-0');
  assert.equal(south.rect[1], main[3]); assert.equal(south.rect[2], west[0]); assert.equal(south.rect[3], north.rect[1]);
  assert.equal(north.rect[3], streetCorridor(example.streets[2], example.site)[1]);
  // The quarter's name pool is shared out without repeating a name.
  for (const quarter of example.layout.quarters) {
    const names = layout.blocks.filter(block => block.id.startsWith(quarter.id)).flatMap(block => block.names);
    assert.deepEqual(names, quarter.names);
  }
  // Nothing derived overlaps a street, the green or another block, and the hand-placed tower stands in the green.
  const corridors = example.streets.map(street => streetCorridor(street, example.site));
  for (const block of layout.blocks) {
    for (const corridor of corridors) assert.ok(!overlaps(block.rect, corridor), block.id);
    for (const plaza of example.plazas) assert.ok(!overlaps(block.rect, plaza.rect), block.id);
    for (const other of layout.blocks) if (other !== block) assert.ok(!overlaps(block.rect, other.rect), `${block.id} ${other.id}`);
  }
  assert.ok(plan.pieces.some(piece => piece.id === 'layout-grid-example/green-water-tower'));
  // The pinned corner shop is a derived parcel; overrides address derived pieces like authored ones.
  const corner = plan.pieces.find(piece => piece.id === 'layout-grid-example/south-row/parcel-0');
  assert.equal(corner.sign, 'Corner Pecan'); assert.equal(corner.override, 'edited');
  assert.ok(plan.stats.triangles <= KIT_CONVENTIONS.budgets.trianglesPerNeighborhood);
  const connectivity = walkableConnectivity(plan, { entry: [2, 50] });
  assert.equal(connectivity.ratio, 1);
  // The derived plan renders through the same kit renderer within the draw-call budget.
  const kit = buildCityKit(plan, { groundAt: () => 0, ground: 0 }), meshes = [];
  kit.traverse(item => { if (item.isMesh) meshes.push(item); });
  assert.ok(meshes.length > 0 && meshes.length <= KIT_CONVENTIONS.budgets.drawCallsPerNeighborhood, `draw calls ${meshes.length}`);
  assert.ok(kit.userData.tower, 'the hand-placed water tower is drawn');
  kit.userData.dispose();
});

test('derivation is deterministic, key-order independent and local to the quarter that changed', () => {
  const base = assembleNeighborhood(example);
  assert.equal(assembleNeighborhood(structuredClone(example)).hash, base.hash);
  const reordered = { ...example, layout: { reserved: [], quarters: example.layout.quarters.map(quarter => Object.fromEntries(Object.entries(quarter).reverse())) } };
  assert.equal(assembleNeighborhood(reordered).hash, base.hash);
  // Changing the south row's style leaves every north-row piece untouched.
  const restyled = grid(); restyled.layout.quarters[1].style = 'garden-court';
  const other = assembleNeighborhood(restyled);
  assert.notEqual(other.hash, base.hash);
  for (const id of ['north-row-main-south-0', 'north-row-back-lane-north-0']) assert.deepEqual(blocksOf(other, id), blocksOf(base, id));
  assert.notDeepEqual(blocksOf(other, 'south-row'), blocksOf(base, 'south-row'));
  // Moving the cross street resizes the south row; its single block keeps its name, so the pinned corner shop still applies.
  const moved = grid(); moved.streets[1].from = [56, 0]; moved.streets[1].to = [56, 107];
  const shifted = assembleNeighborhood(moved);
  assert.deepEqual(shifted.provenance.layout.blocks.find(block => block.id === 'south-row').rect, [0, 0, 49.5, 42.5]);
  assert.deepEqual(shifted.provenance.overrides.applied, ['layout-grid-example/south-row/parcel-0']);
  assert.deepEqual(blocksOf(shifted, 'green'), blocksOf(base, 'green'));
  // Building on the lawn splits the row into two named blocks; the override is orphaned and reported, never dropped from the recipe.
  const built = grid(); built.plazas = built.plazas.filter(plaza => plaza.id !== 'lawn'); built.furniture = built.furniture.filter(item => !item.id.startsWith('lawn-'));
  const two = assembleNeighborhood(built);
  assert.deepEqual(two.provenance.layout.blocks.filter(block => block.id.startsWith('south-row')).map(block => block.id), ['south-row-main-north-0', 'south-row-main-north-67']);
  assert.deepEqual(two.provenance.overrides.orphaned, ['layout-grid-example/south-row/parcel-0']);
  assert.deepEqual(built.overrides, example.overrides, 'the recipe keeps the override as intent');
});

test('authored blocks, plazas, reservations, landmarks and furniture are never moved or covered', () => {
  // A reservation inside the south-west cell keeps its ground; the block is cut around it.
  const reserved = grid(); reserved.layout.reserved = [{ id: 'chapel-yard', rect: [0, 0, 33.5, 14] }];
  // The L-shaped remainder becomes a row on Main and a small block on the cross street.
  const cut = derive(reserved);
  assert.deepEqual(cut.blocks.filter(block => block.id.startsWith('south-row')).map(block => [block.id, block.rect, block.front]),
    [['south-row-main-north-0', [0, 14, 53.5, 42.5], 'north'], ['south-row-cross-east-0', [33.5, 0, 53.5, 14], 'east']]);
  for (const block of cut.blocks) assert.ok(!overlaps(block.rect, [0, 0, 33.5, 14]), block.id);
  // An authored block keeps its place and its own entry; derived blocks fill the rest of the cell.
  const authored = grid(); authored.blocks = [{ id: 'corner-hall', style: 'garden-court', rect: [0, 0, 20, 42.5], front: 'north', sides: ['west'], depth: [14, 16], storeys: [2, 3], bays: [5, 7], names: ['Corner Hall'] }];
  const kept = assembleNeighborhood(authored);
  assert.ok(kept.pieces.some(piece => piece.id === 'layout-grid-example/corner-hall/parcel-0'));
  const beside = kept.provenance.layout.blocks.find(block => block.id === 'south-row');
  assert.deepEqual([beside.rect, beside.front, beside.sides], [[20, 0, 53.5, 42.5], 'north', ['east']]);
  assert.ok(kept.provenance.layout.blocks.every(block => !overlaps(block.rect, authored.blocks[0].rect)));
  // A hand-placed landmark on land is refused with the block's name and the remedy, instead of being built over.
  const onLand = grid(); onLand.landmarks.push({ id: 'misplaced-tower', piece: 'landmark/water-tower', at: [16, 20], name: 'Misplaced', lettering: 'NO' });
  assert.throws(() => assembleNeighborhood(onLand), /misplaced-tower stands inside derived block south-row; .*layout\.reserved/);
  // A reservation for that ground makes the same landmark buildable only where assembly's own walkable-ground rule allows it.
  onLand.layout.reserved = [{ id: 'tower-ground', rect: [10, 14, 22, 26] }];
  assert.throws(() => assembleNeighborhood(onLand), /not inside walkable ground/);
});

test('diagnostics name open land, land too shallow or narrow, partial frontages and the split that could not happen', () => {
  const open = grid(); open.layout.quarters[1].rect = [0, 0, 30, 42.5];
  const diagnostics = derive(open).diagnostics;
  assert.ok(diagnostics.cells.some(cell => cell.result === 'open' && cell.quarter === null && cell.rect[0] === 30));
  assert.match(diagnostics.warnings.join('\n'), /open land 30,0,53\.5,42\.5: no quarter claims it/);
  const shallow = grid(); shallow.layout.quarters[0].depth = [25, 30];
  const warnings = derive(shallow).diagnostics.warnings.join('\n');
  assert.match(warnings, /streets on both sides but too shallow to split \(39\.5 m < 50 m\)/);
  assert.ok(derive(shallow).blocks.every(block => !block.id.startsWith('north-row-back-lane')), 'the deep cells face the main street alone');
  const narrow = grid(); narrow.layout.reserved = [{ id: 'sliver', rect: [3, 0, 53.5, 42.5] }];
  assert.match(derive(narrow).diagnostics.warnings.join('\n'), /0,0,3,42\.5: too narrow for a bay \(3 m\)/);
  // A street that ends inside the site leaves part of a frontage off the street; the land is split so the rest faces its own street.
  const short = grid(); short.streets[2].to = [30, 102];
  const partial = derive(short);
  assert.match(partial.diagnostics.warnings.join('\n'), /only \d+% of its north frontage is on a street|open land|too shallow/);
  assert.ok(partial.blocks.length >= 3);
  // Explicit fronts: a side with no street, or a street that does not bound the land, is an error that names the land.
  const sideless = grid(); sideless.layout.quarters[1].front = 'south';
  assert.throws(() => assembleNeighborhood(sideless), /quarter south-row: land 0,0,53\.5,42\.5 has no street on its south side/);
  const elsewhere = grid(); elsewhere.layout.quarters[1].front = 'back-lane';
  assert.throws(() => assembleNeighborhood(elsewhere), /street back-lane does not bound land/);
  // `split: none` keeps one block facing the main street even between two streets.
  const unsplit = grid(); unsplit.layout.quarters[0].split = 'none';
  assert.deepEqual(derive(unsplit).blocks.filter(block => block.id.startsWith('north-row')).map(block => [block.id, block.front]), [['north-row', 'south']]);
});

test('invalid layouts fail with a reason instead of deriving a broken plan', () => {
  const cases = [
    [recipe => { recipe.layout.quarters[0].style = 'brutalist'; }, /quarter north-row style/],
    [recipe => { recipe.layout.quarters[0].front = 'ninth'; }, /front must be auto, a side or a street id/],
    [recipe => { recipe.layout.quarters[0].bays = [3, 7]; }, /quarter north-row ranges/],
    [recipe => { recipe.layout.quarters[1].id = 'north-row'; }, /quarter id north-row/],
    [recipe => { recipe.layout.quarters[0].setback = 2; }, /unknown key setback/],
    [recipe => { recipe.layout.quarters[0].names = []; }, /quarter north-row names/],
    [recipe => { recipe.layout.quarters[0].names = ['Only One']; }, /quarter north-row yields 2 blocks but has 1 name; add names/],
    [recipe => { recipe.layout.reserved = [{ id: 'north-row', rect: [0, 0, 1, 1] }]; }, /reserved id north-row/],
    [recipe => { recipe.layout.reserved = [{ id: 'yard', rect: [5, 5, 1, 1] }]; }, /reserved yard rect/],
    [recipe => { recipe.layout.quarters[0].split = 'half'; }, /split must be auto or none/],
    [recipe => { recipe.layout.quarters = []; }, /at least one quarter/],
    [recipe => { recipe.layout = []; }, /layout must be an object/],
  ];
  for (const [change, message] of cases) {
    const recipe = grid(); change(recipe);
    assert.throws(() => assembleNeighborhood(recipe), message);
  }
  assert.equal(validateLayout({ streets: [] }), null);
});

test('destination build and layout report the derivation; --freeze writes the same blocks as authored ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'city-kit-layout-')), recipePath = join(dir, 'grid.json'), out = join(dir, 'out');
  writeFileSync(recipePath, `${JSON.stringify(example, null, 2)}\n`);
  const cli = (...args) => execFileSync(process.execPath, [join(root, 'scripts/destination.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const built = JSON.parse(cli('build', recipePath, '--out', out));
  assert.deepEqual(built.layout, { cells: 2, derived: derive(example).blocks.map(block => block.id), warnings: 0 });
  const layout = JSON.parse(readFileSync(join(out, 'layout.json'), 'utf8'));
  assert.equal(layout.derived.length, 3);
  assert.ok(layout.cells.every(cell => cell.streets && ['block', 'split'].includes(cell.result)));
  assert.equal(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).layout.blocks.length, 3);
  const drawing = readFileSync(join(out, 'plan.svg'), 'utf8');
  assert.match(drawing, /derived north-row-main-south-0 · faces south · sides east/);
  // Shop names such as "Pecan & Pearl" are escaped, so the drawing parses.
  assert.match(drawing, /Pecan &amp; Pearl/); assert.doesNotMatch(drawing, /&(?!amp;|lt;|gt;|#)/);
  // Every titled rectangle closes properly: the file is XML a viewer can open.
  assert.doesNotMatch(drawing, /<\/(rect|circle)\//); assert.match(drawing, /<\/title><\/rect>/);
  const table = cli('layout', recipePath);
  assert.match(table, /0,57\.5,53\.5,97\tnorth-row\tback-lane\tmain\tcross\t-\tsplit\tnorth-row-back-lane-north-0 north-row-main-south-0/);
  const before = assembleNeighborhood(example);
  assert.match(cli('layout', recipePath, '--freeze'), /Froze 3 derived blocks/);
  const frozen = JSON.parse(readFileSync(recipePath, 'utf8'));
  assert.equal(frozen.layout, undefined); assert.equal(frozen.blocks.length, 3);
  const after = assembleNeighborhood(frozen);
  assert.equal(geometry(after), geometry(before));
  assert.equal(after.provenance.layout, undefined);
  assert.ok(!existsSync(join(dir, 'missing')));
});
