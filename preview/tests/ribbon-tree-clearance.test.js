import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateVegetation } from '../src/vegetation.js';
import { matureTreePlacements } from '../src/landscape-models.js';
import { treePits, TREE_GRATE, TREE_FRAME } from '../src/street-furniture.js';
import { DISTRICT_RIBBON_TREE_DECLARED, RIBBON_TREE_RULES, districtRibbonTreeClearance } from '../src/ribbon-tree-clearance.js';

// Street trees against the District Ribbon spine (#840 increment 1, Val's decision 2 on #835).
// The trees are rebuilt from source data the way the client loads them: district.json plus the
// LiDAR branch supports in district-vegetation.json (main.js), placed and sized by
// matureTreePlacements, the placements that draw the crowns and lay the pits. The crown model is
// the #838 contract's, so this check and five-rooms-layout.js name the same trees.
//
// Assertions key on tree identity (stem position) and measured gap, never on Ribbon post or module
// IDs or on where the spine starts, so the #827 side-lane fix can move the start and renumber.
// This test does not certify the spine's posts against roads: posts 002-004 standing in side lane
// osm-way-625330795 are #827's finding (ribbon-route-district.test.js), not hidden here.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const district = read('../public/data/district.json'), vegetation = read('../public/data/district-vegetation.json');
const spine = read('../../config/ribbon/district-spine.json').segments[0];
// treeSupports caches per world object, so every world here is a fresh object.
const runtimeWorld = (veg = vegetation) => ({ ...district, vegetation: validateVegetation(district, veg) });
const key = stem => stem.join(',');

// Every tree that blocks the spine is declared, with its crown gap to the centimetre, and blocks
// only in the ways its entry allows. An entry whose tree no longer blocks is reported, not failed,
// so a shorter or moved spine needs no edit here; the ledger lists it for pruning.
function assertClearOrDeclared(rows, declared = DISTRICT_RIBBON_TREE_DECLARED) {
  const entries = new Map(declared.map(entry => [key(entry.stem), entry]));
  const blocking = rows.filter(row => row.blocks);
  assert.deepEqual(blocking.filter(row => !entries.has(key(row.stem))).map(row => `${row.tree} at ${key(row.stem)}: crown gap ${row.crownGapCm} cm${row.through ? ' through the canopy' : ''}${row.pit ? `, pit under the ${row.pit}` : ''}`), [], 'street trees blocking the Ribbon spine without a declaration');
  for (const row of blocking) {
    const entry = entries.get(key(row.stem));
    assert.ok(Math.abs(entry.crownGapCm - row.crownGapCm) <= 1, `${key(row.stem)}: declared crown gap ${entry.crownGapCm} cm, measured ${row.crownGapCm} cm`);
    assert.ok(!row.through || entry.through, `${key(row.stem)}: crown passes through the canopy, declared as clearing it`);
    assert.ok(!row.pit || entry.pit, `${key(row.stem)}: pit under the ${row.pit}, not declared`);
    assert.ok(typeof entry.reason === 'string' && entry.reason.length > 20, `${key(row.stem)} needs a reason`);
  }
  return declared.filter(entry => !blocking.some(row => key(row.stem) === key(entry.stem))).map(entry => key(entry.stem));
}

test('the rules are the drawn pit and the #838 crown model', () => {
  assert.equal(RIBBON_TREE_RULES.pitGrate, TREE_GRATE);
  assert.equal(RIBBON_TREE_RULES.pitFrame, TREE_FRAME);
  assert.deepEqual({ slab: RIBBON_TREE_RULES.slab, crownBaseShare: RIBBON_TREE_RULES.crownBaseShare }, { slab: 0.4, crownBaseShare: 0.55 });
});

test('every drawn tree is measured, and its crown base is its lowest LiDAR branch end', () => {
  const world = runtimeWorld(), placements = matureTreePlacements(world);
  assert.equal(placements.length, 199);
  assert.equal(treePits(world).length, 198, 'one tree sits in the Harry Winston bed and gets no pit');
  const rows = districtRibbonTreeClearance(world, { within: Infinity });
  assert.equal(rows.length, 199);
  const support = vegetation.branch_supports.find(item => key(item.position) === '-2761,-1279');
  assert.equal(rows.find(row => key(row.stem) === '-2761,-1279').crownBase, Math.min(...support.endpoints.map(p => p[2])));
});

test('every street tree clears the spine or is declared with its measured crown gap', t => {
  const rows = districtRibbonTreeClearance(runtimeWorld());
  const stale = assertClearOrDeclared(rows);
  if (stale.length) t.diagnostic(`declared but no longer blocking: ${stale.join('; ')}`);
  // Agreement with #838 (layout.md, 2026-11-01): seven crowns through the spine canopy and seven
  // pits in its walk (tree-pit-36, under a post, depends on where posts stand and is not pinned).
  const through = rows.filter(row => row.through), pits = rows.filter(row => row.pit === 'walk');
  assert.deepEqual(through.map(row => row.tree).sort(), ['tree-104', 'tree-127', 'tree-153', 'tree-37', 'tree-77', 'tree-84', 'tree-85']);
  assert.deepEqual(pits.map(row => row.pitId).sort(), ['tree-pit-103', 'tree-pit-126', 'tree-pit-152', 'tree-pit-27', 'tree-pit-76', 'tree-pit-83', 'tree-pit-84']);
  // Crown undersides below the 4.0 m slab top, in centimetres.
  assert.deepEqual(Object.fromEntries(through.map(row => [row.tree, row.crownGapCm])), { 'tree-104': -81, 'tree-77': -18, 'tree-37': -28, 'tree-85': -11, 'tree-153': -47, 'tree-127': -21, 'tree-84': -38 });
});

test('the District without its LiDAR supports has no tree near the spine', () => {
  assert.deepEqual(districtRibbonTreeClearance({ ...district }), []);
  assert.ok(districtRibbonTreeClearance({ ...district }, { within: Infinity }).every(row => !row.blocks && row.planGap > 10), 'the four mapped OSM trees stand more than 10 m off');
});

test('moving a tree into the spine, or lowering a declared crown, fails the check', () => {
  // A clear tree moved beside the walk, 1.6 m east of the spine's line at 60 % of its second run.
  const moved = structuredClone(vegetation), tree = moved.branch_supports.find(item => key(item.position) === '-2755,-1297');
  assert.ok(tree, 'the clear tree beside the spine start');
  const [a, b] = [spine.points[1], spine.points[2]], at = [a[0] + (b[0] - a[0]) * 0.6 + 1.6, a[1] + (b[1] - a[1]) * 0.6].map(Math.round);
  const dx = at[0] - tree.position[0], dy = at[1] - tree.position[1];
  tree.position = at; tree.endpoints = tree.endpoints.map(([x, y, z]) => [x + dx, y + dy, z]);
  assert.throws(() => assertClearOrDeclared(districtRibbonTreeClearance(runtimeWorld(moved))), error => error.message.includes(`at ${key(at)}`));
  // A declared tree whose crown clears the slab, lowered below it.
  const lowered = structuredClone(vegetation), pitOnly = lowered.branch_supports.find(item => key(item.position) === '-2759,-1205');
  pitOnly.endpoints = pitOnly.endpoints.map(([x, y, z], i) => [x, y, i ? z : 3.5]);
  assert.throws(() => assertClearOrDeclared(districtRibbonTreeClearance(runtimeWorld(lowered))), /-2759,-1205: (declared crown gap 24 cm, measured -50 cm|crown passes through)/);
  // And a declaration whose gap has drifted.
  const drifted = DISTRICT_RIBBON_TREE_DECLARED.map(entry => key(entry.stem) === '-2761,-1279' ? { ...entry, crownGapCm: -76 } : entry);
  assert.throws(() => assertClearOrDeclared(districtRibbonTreeClearance(runtimeWorld()), drifted), /declared crown gap -76 cm, measured -81 cm/);
});
