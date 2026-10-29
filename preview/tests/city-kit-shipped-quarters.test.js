// The shipped world as quarters (#585). Sixteen committed neighborhoods, 30 blocks,
// were rewritten from hand-authored blocks to quarters by `destination migrate`
// (increment 8). The proof is the geometry hash each lock recorded on the authored
// form in commit 8d2668af, pinned here: the migrated recipe must put the same
// ground, piece for piece. The two terrace recipes stay authored because their row
// was hand-placed half a metre off its lane, so no quarter form reproduces it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood, geometryHash, validateRecipe } from '../../shared/city-kit/assemble.js';
import { expandLayout } from '../../shared/city-kit/layout.js';
import { frozenForm } from '../../shared/city-kit/effort.js';
import { looseRect, migrateRecipe } from '../../shared/city-kit/migrate.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), dir = join(root, 'config/destinations');
const read = name => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const names = readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.lock.json')).map(n => n.slice(0, -5));
const shells = plan => plan.pieces.filter(piece => piece.piece.startsWith('building/'));

// What the hand-authored blocks put on the ground, recorded by `destination build --lock` before the migration.
const AUTHORED_GEOMETRY = {
  'bayou-market-commons': 'f0c1ce10921e2c7a',
  'heights-boulevard-north': 'fcd0476b880c4c99',
  'heights-boulevard-south': 'faa0cc8b542c3705',
  'nineteenth-and-yale': '2e05bf8475d0be92',
  'studewood-north': '7d97beb81f558c1a',
  'studewood-south': '5e3f03e0d88a273e',
  'typesafe-place-green': '6cabe31bb88f45dd',
  'typesafe-place-north': '957c39f17f50971f',
  'typesafe-place-penthouse': 'd9c496480ad1a43a',
  'typesafe-place-south': '3d7fd1c6189c3df0',
  'typesafe-place-uptown': 'ca693b37e58d6b15',
  'woodland-heights-north': 'f96a8c08ba90ae6a',
  'woodland-heights-south': 'a165e847736c5775',
  'yale-icehouse': 'b2fff3a812887f3e',
  'yale-street-north': '2fe550e1d513f36b',
  'yale-street-south': 'e9cbe520dbc54b0a',
};

test('sixteen migrated neighborhoods, 30 blocks, put the same ground as their hand-authored blocks did', () => {
  let blocks = 0;
  for (const [name, geometry] of Object.entries(AUTHORED_GEOMETRY)) {
    const recipe = read(name), lock = read(`${name}.lock`);
    assert.equal(recipe.blocks, undefined, `${name} types no authored block`);
    assert.equal(recipe.layout.open, 'ground', `${name}: its seams and verges are ground by design`);
    assert.equal(recipe.layout.migrated.geometry, geometry, `${name} records the authored geometry it must reproduce`);
    const plan = assembleNeighborhood(structuredClone(recipe));
    assert.equal(geometryHash(plan), geometry, `${name}: the same pieces, surfaces, solids, lanterns and stats as the authored blocks`);
    assert.equal(lock.geometry, geometry);
    assert.equal(lock.hash, plan.hash);
    assert.equal(plan.provenance.layout.blocks.length, recipe.layout.migrated.blocks, `${name} derives one block per authored block`);
    blocks += recipe.layout.migrated.blocks;
  }
  assert.equal(blocks, 30);
  const migrated = names.filter(name => read(name).layout?.migrated).sort();
  assert.deepEqual(migrated, Object.keys(AUTHORED_GEOMETRY).sort(), 'no other recipe carries a migration record');
});

test('migrate is the reverse of freeze: the derived blocks frozen as authored ones reproduce the ground, and migrate back to the same quarters', () => {
  const yale = read('nineteenth-and-yale'), lock = read('nineteenth-and-yale.lock'), frozen = frozenForm(yale);
  assert.equal(frozen.layout, undefined);
  assert.equal(frozen.blocks.length, 4);
  assert.equal(geometryHash(assembleNeighborhood(structuredClone(frozen))), lock.geometry);
  const again = migrateRecipe(frozen);
  assert.deepEqual(again.recipe.layout.quarters, yale.layout.quarters);
  assert.equal(again.hash.after, lock.hash);
  assert.deepEqual(again.typed, { before: { numbers: 43, names: 21, words: 8 }, after: { numbers: 43, names: 21, words: 1 } }, 'the four fronts and four sides became one stated front');
  assert.deepEqual(again.blocks.map(block => block.form), ['tight, auto', 'tight, auto', 'tight, auto', 'tight, front']);
});

test('the migration kept every rectangle: no shipped block fills its land out to the streets, so a loose rectangle would move its walls', () => {
  // The loose rectangle reaches the nearest street corridor, plaza, context item, neighbour or site edge.
  const yale = frozenForm(read('nineteenth-and-yale')), [northwest] = yale.blocks;
  assert.deepEqual(northwest.rect, [0, 71.5, 50.5, 128]);
  assert.deepEqual(looseRect(northwest, yale), [0, 71.5, 50.5, 128], 'the crossroads rows already fill their land');
  const commons = frozenForm(read('bayou-market-commons')), row = commons.blocks.find(block => block.id === 'market-row');
  assert.notDeepEqual(looseRect(row, commons), row.rect, 'the market row stops short of its land by design');
  let loose = 0, stated = 0;
  for (const name of Object.keys(AUTHORED_GEOMETRY)) for (const quarter of read(name).layout.quarters) { if (quarter.rect === undefined) loose++; if (quarter.front !== undefined) stated++; }
  assert.equal(loose, 0);
  assert.equal(stated, 24, 'twenty-four of thirty quarters still state the front the author chose; six rows take the auto rule');
});

test('the terrace studio rows sit half a metre off Terrace Lane by hand, so they stay authored; flush to the lane, every shell moves that half metre and six rear wings gain a bay', () => {
  const deeper = [];
  for (const name of ['bayou-terrace-north', 'bayou-terrace-south']) {
    const recipe = read(name), [block] = recipe.blocks, lane = recipe.streets.find(s => s.id === 'terrace-lane'), kerb = lane.from[0] - lane.lane / 2 - lane.sidewalk;
    assert.equal(kerb - block.rect[2], 0.5, `${name}: the authored row stops 0.5 m short of the corridor at ${kerb}`);
    const refused = migrateRecipe(recipe);
    assert.equal(refused.recipe, null);
    assert.match(refused.reason, /studio-row: land .* has no street on its east side/, 'as authored, no street bounds the land');
    const quarter = { id: block.id, rect: [block.rect[0], block.rect[1], kerb, block.rect[3]], style: block.style, depth: block.depth, storeys: block.storeys, bays: block.bays, names: block.names, front: block.front, sides: block.sides };
    const flush = { ...structuredClone(recipe), blocks: [], layout: { quarters: [quarter], reserved: [] } };
    const authored = shells(assembleNeighborhood(structuredClone(recipe))), derived = shells(assembleNeighborhood(flush));
    assert.equal(derived.length, authored.length);
    for (const [i, piece] of authored.entries()) {
      const moved = derived[i];
      assert.equal(moved.id, piece.id);
      // A shell moves with its front; a rear wing keeps its back on the block's back edge and only its front moves.
      assert.deepEqual(moved.rect.map((v, k) => Math.round((v - piece.rect[k]) * 1000) / 1000), piece.id.endsWith('/rear') ? [0, 0, 0.5, 0] : [0.5, 0, 0.5, 0], `${piece.id} moves 0.5 m east`);
      const { rect: _a, bays: bays0, ...rest0 } = piece, { rect: _b, bays: bays1, ...rest1 } = moved;
      assert.deepEqual(rest1, rest0, `${piece.id} is otherwise the same shell`);
      if (bays1 !== bays0) { assert.ok(piece.id.endsWith('/rear'), `${piece.id}: only a rear wing, half a metre deeper, may gain a bay`); deeper.push(piece.id.split('/').slice(1).join('/')); }
    }
  }
  assert.deepEqual(deeper, ['studio-row/parcel-5/rear', 'studio-row/parcel-9/rear', 'studio-row/parcel-12/rear', 'studio-row/parcel-16/rear', 'studio-row/parcel-0/rear', 'studio-row/parcel-4/rear'], 'six rear wings (four north, two south), half a metre deeper, gain a bay');
});

test('court furniture may stand in a derived court, and a stated front on the site edge faces the neighbouring recipe', () => {
  const commons = read('bayou-market-commons'), court = commons.layout.quarters.find(q => q.id === 'garden-court');
  // lantern-court stands at [24, -13.5], inside the 12 m court centred at x 24 that runs 10 m in from the north front.
  assert.ok(commons.landmarks.concat(commons.furniture).some(item => item.id === 'lantern-court'));
  assert.equal(court.court.depth, 10);
  const outside = structuredClone(commons);
  outside.furniture.push({ id: 'stray-bench', piece: 'furniture/bench', at: [8, -20], yaw: 0 });
  assert.throws(() => expandLayout(validateRecipe(outside)), /stray-bench stands inside derived block garden-court/);
  const icehouse = read('yale-icehouse'), { diagnostics } = expandLayout(validateRecipe(structuredClone(icehouse)));
  assert.ok(diagnostics.warnings.some(w => /icehouse-row .*faces the site edge on its north side/.test(w)), diagnostics.warnings.join('\n'));
  assert.ok(!diagnostics.warnings.some(w => w.startsWith('open land')), 'open: ground keeps the seams and verges quiet');
  const unstated = structuredClone(icehouse);
  unstated.layout.quarters.find(q => q.id === 'icehouse-row').front = 'auto';
  // Without the stated front the row would face the greenway to its west, and the patio would stand in its shells.
  assert.throws(() => expandLayout(validateRecipe(unstated)), /patio-picnic-0 stands inside derived block icehouse-row/);
});

test('migrate refuses what it cannot prove or need not touch', () => {
  assert.equal(migrateRecipe(read('garden-blocks-kit')).reason, 'already has a layout');
  assert.equal(migrateRecipe(read('bayou-greenway')).reason, 'no authored blocks');
  const yale = frozenForm(read('nineteenth-and-yale'));
  yale.landmarks.push({ id: 'stray-tower', piece: 'landmark/water-tower', at: [25, 100], name: 'Stray' });
  assert.throws(() => assembleNeighborhood(structuredClone(yale)), /stray-tower/, 'a landmark on a block is refused in both forms');
});
