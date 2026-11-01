// The shipped world as quarters (#585). Eighteen committed neighborhoods, 32 blocks,
// were rewritten from hand-authored blocks to quarters by `destination migrate`
// (increment 8; the two terraces in Phase 3). The proof is the geometry hash each lock
// recorded on the authored form (commit 8d2668af; the terraces' locks on main bea70e05),
// pinned here: the migrated recipe must put the same ground, piece for piece. The
// terrace rows were hand-placed half a metre off their lane; their quarters keep that
// with an inset.
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
// Ground hashes the migrations proved against. On 2026-10-30 street lamps that the
// generator had stood in tree pits moved half a tree spacing along the street; that
// changed the ground of the authored and quarter forms alike, so ten hashes moved with it.
// The same day, benches, a café set and the esplanade's last tree pair moved off street
// trees in three of them (Heights Boulevard North, Nineteenth and Yale, Yale Icehouse).
// Street-tree heights and crowns then widened toward the District's (7.5–14 m, 2.6–4.8 m),
// which moved every hash.
const AUTHORED_GEOMETRY = {
  'bayou-market-commons': '52e0d598a2f7ca32',
  'bayou-terrace-north': '64587cb9cfe05a23',
  'bayou-terrace-south': '312ea40a26fa8b70',
  'heights-boulevard-north': '398d0f21e3ab3f97',
  'heights-boulevard-south': 'd8e94031cc3bb3af',
  'nineteenth-and-yale': 'f00d112d4ebfdd7f',
  'studewood-north': '853d10f703cba481',
  'studewood-south': '341e5f31e73de4eb',
  'typesafe-place-green': 'ebd9f29eb6e43330',
  'typesafe-place-north': '02e65da62845f630',
  'typesafe-place-penthouse': '5b970b86a44e6be0',
  'typesafe-place-south': 'b12c7f5d72c5000f',
  'typesafe-place-uptown': '5a027ef3de7456e9',
  'woodland-heights-north': 'b860ef0e6f80ea7c',
  'woodland-heights-south': '330eaf0602357dc8',
  'yale-icehouse': '54fb404e50421eac',
  'yale-street-north': 'd71d96978a5fadd1',
  'yale-street-south': 'd5dc6664d832ea3e',
};

test('eighteen migrated neighborhoods, 32 blocks, put the same ground as their hand-authored blocks did', () => {
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
  assert.equal(blocks, 32);
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
  // The two terrace rows state theirs as well: they stand back from the lane by an inset, which the auto rule does not choose.
  assert.equal(stated, 26, 'twenty-six of thirty-two quarters still state the front the author chose; six rows take the auto rule');
});

test('the terrace studio rows stand half a metre off Terrace Lane: as quarters an inset keeps that, and a wider lane still moves them', () => {
  for (const name of ['bayou-terrace-north', 'bayou-terrace-south']) {
    const recipe = read(name), [quarter] = recipe.layout.quarters, lane = recipe.streets.find(s => s.id === 'terrace-lane');
    const kerb = lane.from[0] - lane.lane / 2 - lane.sidewalk;
    assert.equal(quarter.rect[2], kerb, `${name}: the quarter's land runs to the corridor at ${kerb}`);
    assert.deepEqual([quarter.rect[1], quarter.rect[3]], [lane.from[1], lane.to[1]].sort((a, b) => a - b), `${name}: and only as long as the lane, so a wider lane leaves no strip past its end`);
    assert.equal(quarter.inset[2], 0.5, `${name}: the row stands 0.5 m back from it, as it was hand-placed`);
    const plan = assembleNeighborhood(structuredClone(recipe)), [block] = plan.provenance.layout.blocks;
    assert.equal(block.rect[2], kerb - 0.5);
    assert.deepEqual(plan.provenance.layout.warnings, [], `${name}: the row is wholly on its street`);
    // Two metres more lane, nothing else typed: the corridor's west edge moves 1 m west and the row with it, still half a metre back.
    const wider = structuredClone(recipe);
    wider.streets.find(s => s.id === 'terrace-lane').lane += 2;
    const moved = assembleNeighborhood(wider).provenance.layout.blocks[0];
    assert.equal(moved.rect[2], kerb - 1.5, `${name}: the street edit moves the row with no rectangle retyped`);
    assert.deepEqual([moved.rect[0], moved.rect[1], moved.rect[3]], [block.rect[0], block.rect[1], block.rect[3]]);
  }
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
