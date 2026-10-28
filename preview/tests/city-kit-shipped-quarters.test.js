// Quarters against the shipped world (#585): every committed neighborhood's
// hand-authored blocks, rewritten as quarters with the same artistic fields
// (style, ranges, names, front, sides, court), derive the same plan piece for
// piece. The two that do not were hand-placed half a metre off their lane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood, canonicalJSON, validateRecipe } from '../../shared/city-kit/assemble.js';
import { expandLayout } from '../../shared/city-kit/layout.js';

const root = fileURLToPath(new URL('../..', import.meta.url)), dir = join(root, 'config/destinations');
const read = name => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const names = readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.lock.json')).map(n => n.slice(0, -5));
const geometry = plan => canonicalJSON({ pieces: plan.pieces, surfaces: plan.surfaces, solids: plan.solids, lanterns: plan.lanterns, stats: plan.stats });
// The quarter form of an authored block: its land and its artistic choices, nothing about where shells go.
const quarterOf = ({ id, rect, style, depth, storeys, bays, names, court, front, sides }) => ({ id, rect, style, depth, storeys, bays, names, ...(court ? { court } : {}), front, sides });
const byQuarters = (recipe, quarters = recipe.blocks.map(quarterOf)) => ({ ...structuredClone(recipe), blocks: [], layout: { quarters, reserved: [] } });
const shells = plan => plan.pieces.filter(piece => piece.piece.startsWith('building/'));

test('eleven shipped neighborhoods, 24 blocks, derive the same plan from quarters as from their authored blocks', () => {
  // The plan hash covers the recipe too, so it differs by construction; the geometry is the proof.
  const identical = [], authoredBlocks = [];
  for (const name of names) {
    const recipe = read(name);
    if (!recipe.blocks?.length || name.startsWith('bayou-terrace')) continue;
    const authored = assembleNeighborhood(structuredClone(recipe)), derived = assembleNeighborhood(byQuarters(recipe));
    assert.equal(geometry(derived), geometry(authored), name);
    identical.push(name); authoredBlocks.push(recipe.blocks.length);
  }
  assert.deepEqual(identical, ['bayou-market-commons', 'heights-boulevard-north', 'heights-boulevard-south', 'nineteenth-and-yale', 'studewood-north', 'studewood-south', 'woodland-heights-north', 'woodland-heights-south', 'yale-icehouse', 'yale-street-north', 'yale-street-south']);
  assert.equal(authoredBlocks.reduce((a, b) => a + b, 0), 24);
});

test('the terrace studio rows sit half a metre off Terrace Lane by hand; a quarter flush to the lane moves every shell that half metre, and six rear wings gain a bay', () => {
  const deeper = [];
  for (const name of ['bayou-terrace-north', 'bayou-terrace-south']) {
    const recipe = read(name), [block] = recipe.blocks, lane = recipe.streets.find(s => s.id === 'terrace-lane'), kerb = lane.from[0] - lane.lane / 2 - lane.sidewalk;
    assert.equal(kerb - block.rect[2], 0.5, `${name}: the authored row stops 0.5 m short of the corridor at ${kerb}`);
    assert.throws(() => expandLayout(validateRecipe(byQuarters(recipe))), /has no street on its east side/, 'as authored, no street bounds the land');
    const flush = byQuarters(recipe, [{ ...quarterOf(block), rect: [block.rect[0], block.rect[1], kerb, block.rect[3]] }]);
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
  const commons = read('bayou-market-commons'), court = commons.blocks.find(b => b.id === 'garden-court');
  // lantern-court stands at [24, -13.5], inside the 12 m court centred at x 24 that runs 10 m in from the north front.
  assert.ok(commons.landmarks.concat(commons.furniture).some(item => item.id === 'lantern-court'));
  const outside = structuredClone(commons);
  outside.furniture.push({ id: 'stray-bench', piece: 'furniture/bench', at: [8, -20], yaw: 0 });
  assert.throws(() => expandLayout(validateRecipe(byQuarters(outside))), /stray-bench stands inside derived block garden-court/);
  const icehouse = read('yale-icehouse'), { diagnostics } = expandLayout(validateRecipe(byQuarters(icehouse)));
  assert.ok(diagnostics.warnings.some(w => /icehouse-row .*faces the site edge on its north side/.test(w)), diagnostics.warnings.join('\n'));
  const unstated = byQuarters(icehouse, icehouse.blocks.map(b => ({ ...quarterOf(b), front: 'auto' })));
  // Without the stated front the row would face the greenway to its west, and the patio would stand in its shells.
  assert.throws(() => expandLayout(validateRecipe(unstated)), /patio-picnic-0 stands inside derived block icehouse-row/);
  assert.equal(court.court.depth, 10);
});
