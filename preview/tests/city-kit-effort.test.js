// Production effort, measured on the shipped world (#585): what each committed recipe
// makes an author type, and what one art-direction change (every street 2 m wider)
// costs in the authored form against the quarter form. The committed report is the
// evidence the docs quote; this test holds it to the recipes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood } from '../../shared/city-kit/assemble.js';
import { changeCost, countTyped, measureEffort, measureWorld, quarterForm, typedValues, widenStreets } from '../../shared/city-kit/effort.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), dir = join(root, 'config/destinations');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const recipes = readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.lock.json')).map(n => read(join(dir, n)));
const world = measureWorld(recipes), byId = Object.fromEntries(world.recipes.map(entry => [entry.id, entry]));

test('the committed report reproduces from the committed recipes', () => {
  const { generatedBy, ...committed } = read(join(root, 'data/reports/city-kit-effort.json'));
  assert.equal(generatedBy, 'pnpm run destination effort --write');
  assert.deepEqual(committed, world, 'run pnpm run destination effort --write after changing a recipe');
});

test('every shipped neighborhood with authored blocks needs its rectangles retyped after the edit or leaves shells in the street; as quarters, nothing is retyped and nothing stands in the street', () => {
  const shipped = world.recipes.filter(entry => (entry.form === 'authored' || entry.form === 'migrated') && entry.change);
  assert.equal(shipped.length, 18);
  assert.deepEqual(world.migrated, { recipes: 18, blocks: 32, frontageWords: 45 }, 'eighteen recipes migrated to quarters keep 45 of their 64 frontage words');
  for (const entry of shipped) {
    assert.equal(entry.change.authored.blocksToRetype, entry.blocks, `${entry.id}: every block, authored or frozen from its quarters, sits flush to a street`);
    assert.ok(entry.change.authored.shellsInStreet > 0, `${entry.id}: unedited, shells stand in the wider street`);
    assert.equal(entry.change.quarters.blocksToRetype, 0, entry.id);
    assert.equal(entry.change.quarters.shellsInStreet, 0, entry.id);
    assert.ok(entry.change.quarters.shells > 0 && entry.change.quarters.shells <= entry.change.shellsBefore, `${entry.id}: the wider street leaves less land, never more`);
  }
  // The terraces' quarters type eight numbers more than their blocks did (an inset each) and two words (split none).
  assert.deepEqual(world.shipped, { recipes: 18, blocks: 32, shells: 354, typed: { numbers: 2617, names: 205, words: 45 }, massing: { numbers: 707, names: 175, words: 45 },
    authored: { blocksToRetype: 32, numbersToRetype: 128, shellsInStreet: 180 }, quarters: { blocksToRetype: 0, numbersToRetype: 0, shellsInStreet: 0, shells: 314 } });
});

test('the assembler does not refuse a shell in a widened street, which is why the authored cost is real', () => {
  const yale = recipes.find(recipe => recipe.id === 'nineteenth-and-yale'), wider = widenStreets(yale);
  const plan = assembleNeighborhood(structuredClone(wider));
  assert.equal(plan.pieces.filter(piece => piece.piece.startsWith('building/')).length, 43, 'all 43 shells still assemble');
  assert.deepEqual(changeCost(yale).authored, { blocksToRetype: 4, numbersToRetype: 16, shells: 43, shellsInStreet: 25, warnings: 0 });
  assert.deepEqual(changeCost(yale).quarters, { blocksToRetype: 0, numbersToRetype: 0, shells: 43, shellsInStreet: 0, warnings: 0 });
  // The crossroads is migrated: its quarter form is the recipe itself, and its authored form is the frozen one the edit is measured against.
  assert.equal(quarterForm(yale).layout.quarters.length, 4);
  assert.equal(quarterForm(yale).blocks, undefined);
});

test('a reference recipe splits what the author typed from what the tools wrote', () => {
  const kit = byId['garden-blocks-kit'], yale = byId['nineteenth-and-yale'];
  assert.equal(kit.form, 'reference');
  assert.deepEqual(kit.typed.options, ['site', 'trees', 'lamps', 'style']);
  assert.deepEqual(kit.typed.author, { numbers: 6, names: 8, words: 0 }, 'four site numbers, two spacings, eight names');
  assert.deepEqual(kit.typed.tools, { numbers: 80, names: 0, words: 0 });
  assert.deepEqual([kit.blocks, kit.shells, kit.perShell], [4, 32, 0.19]);
  assert.deepEqual([yale.form, yale.blocks, yale.shells, yale.typed.massing.numbers, yale.typed.massing.words, yale.perShell], ['migrated', 4, 43, 63, 1, 1.47]);
  assert.ok(yale.perShell / kit.perShell > 7, 'the crossroads types seven times the massing numbers per shell of the reference example');
  // A layout recipe without a reference typed its quarters by hand.
  assert.equal(byId['layout-grid-example'].form, 'layout');
  assert.deepEqual(byId['layout-grid-example'].typed.tools, { numbers: 0, names: 0, words: 0 });
});

test('counting is by value: numbers everywhere, names only in name fields, frontage words once per field', () => {
  assert.deepEqual(countTyped({ id: 'x', rect: [0, 1, 2, 3], names: ['A', 'B'], piece: 'landmark/water-tower', name: 'Tower', nested: { spacing: 8, note: 'no' }, front: 'south', sides: ['east', 'west'] }), { numbers: 5, names: 3, words: 2 });
  const typed = typedValues({ streets: [{ id: 's', from: [0, 0], to: [10, 0], lane: 6, sidewalk: 3 }], blocks: [{ rect: [0, 0, 1, 1], names: ['A'] }] });
  assert.deepEqual([typed.sections.streets.numbers, typed.sections.blocks, typed.massing, typed.tools], [6, { numbers: 4, names: 1, words: 0 }, { numbers: 10, names: 1, words: 0 }, { numbers: 0, names: 0, words: 0 }]);
  assert.equal(measureEffort(recipes.find(recipe => recipe.id === 'bayou-greenway')).change, null, 'a recipe without blocks or quarters has no change to measure');
});
