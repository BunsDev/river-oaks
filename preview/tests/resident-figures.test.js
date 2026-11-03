import test from 'node:test';
import assert from 'node:assert/strict';
import { RESIDENT_APPEARANCES, RESIDENT_FIGURE_BUDGETS, RESIDENT_FIGURE_CAP, RESIDENT_FIGURE_KEEP_M, RESIDENT_FIGURE_RANGE, RESIDENT_FIGURE_SWAP_M, residentFigureBudget, residentFigures } from '../src/resident-figures.js';
import { fidelityTierForQuality } from '../src/character-fidelity-runtime.js';
import { canUseAppearance } from '../src/shared-appearances.js';
import { poseFor } from '../src/crime-poses.js';

// #640 increment 3: outdoor residents near the player are drawn like peers, with their reaction.
const local = (id, east, north, change = {}) => ({ id, name: `Neighbour ${id}`, position: [east, north, 18], indoor: false, storeId: null,
  life: { speed: 0, distance: 0, heading: Math.PI / 2, status: 'resting', action: 'continue', source: 'local_rules', blocked: false, visitId: null, helping: null, seat: null, reaction: null }, ...change });
const me = [0, 0, 18];

test('the nearest outdoor residents within range become figures, capped, in a stable order', () => {
  const locals = [
    ...Array.from({ length: 12 }, (_, i) => local(`local-${i}`, 5 + i * 9, 0)),
    local('far', RESIDENT_FIGURE_RANGE + 1, 0), local('indoor', 2, 0, { indoor: true, storeId: 'shop' }), local('no-life', 1, 0, { life: null }),
  ];
  const figures = residentFigures(locals, me);
  assert.equal(figures.length, RESIDENT_FIGURE_CAP);
  assert.deepEqual(figures.map(figure => figure.id), Array.from({ length: RESIDENT_FIGURE_CAP }, (_, i) => `resident:local-${i}`), 'nearest first, with the renderer\'s id scheme');
  for (const figure of figures) {
    assert.ok(RESIDENT_APPEARANCES.includes(figure.appearance) && canUseAppearance(figure.id, figure.appearance), 'a shipped human look anyone may wear');
    assert.deepEqual([figure.altitude, figure.vehicle, figure.movement, figure.performing, figure.interaction, figure.sitting, figure.gesture, figure.reaction], [0, null, 'upright', false, null, null, null, null]);
    assert.ok(Math.abs(figure.yaw - (Math.PI / 2 - Math.PI)) < 1e-9, 'body heading becomes camera-style yaw');
  }
  assert.equal(residentFigures(locals, me)[3].appearance, figures[3].appearance, 'a resident keeps one look');
  assert.deepEqual(residentFigures(locals, null), []);
  assert.deepEqual(residentFigures(null, me), []);
  assert.deepEqual(residentFigures([{ id: 'x', position: [1, 2] }], me), [], 'a resident without a full position or life is skipped');
});

test('the drawn set is stable while everyone walks: a newcomer must be clearly nearer, a leaver clearly farther', () => {
  const row = (changes = {}) => Array.from({ length: 12 }, (_, i) => local(`local-${i}`, changes[i] ?? 5 + i * 9, 0));
  const ids = figures => figures.map(figure => figure.id.slice('resident:'.length));
  const drawn = new Set(ids(residentFigures(row(), me)));
  assert.deepEqual([...drawn], Array.from({ length: 8 }, (_, i) => `local-${i}`));
  // local-9 (at 86 m) walks to 66 m: nearer than local-7 (68 m), but not by the swap margin.
  assert.deepEqual(ids(residentFigures(row({ 9: 66 }), me, drawn)).sort(), [...drawn].sort(), 'no swap for a marginal change');
  // To 60 m: clearly nearer than the farthest drawn, so one swap.
  const swapped = ids(residentFigures(row({ 9: 68 - RESIDENT_FIGURE_SWAP_M - .5 }), me, drawn));
  assert.ok(swapped.includes('local-9') && !swapped.includes('local-7') && swapped.length === RESIDENT_FIGURE_CAP, `one swap: ${swapped}`);
  // Two newcomers at once: still one swap per snapshot.
  const twice = ids(residentFigures(row({ 9: 40, 10: 41 }), me, drawn));
  assert.equal(twice.filter(id => ['local-9', 'local-10'].includes(id)).length, 1, 'one swap per snapshot');
  // A drawn resident past the range stays until clearly beyond it; an undrawn one is not admitted there.
  const edge = row({ 7: RESIDENT_FIGURE_RANGE + RESIDENT_FIGURE_KEEP_M - 1, 8: RESIDENT_FIGURE_RANGE + 1, 9: RESIDENT_FIGURE_RANGE + 2, 10: RESIDENT_FIGURE_RANGE + 3, 11: RESIDENT_FIGURE_RANGE + 4 });
  assert.ok(ids(residentFigures(edge, me, drawn)).includes('local-7'), 'kept just past the range while nobody nearer waits');
  assert.ok(!ids(residentFigures(edge, me, drawn)).includes('local-8'), 'an undrawn resident just past the range is not admitted');
  assert.ok(!ids(residentFigures(row({ 7: RESIDENT_FIGURE_RANGE + RESIDENT_FIGURE_KEEP_M + 1 }), me, drawn)).includes('local-7'), 'dropped well past it');
  // Without a previous set, or with an empty one, the nearest eight.
  assert.deepEqual(ids(residentFigures(row({ 9: 1 }), me, new Set())), ['local-9', ...Array.from({ length: 7 }, (_, i) => `local-${i}`)]);
});

test('a reaction becomes a readable pose: startled stands out, cowering bends over, fleeing just runs', () => {
  const figures = residentFigures([
    local('a', 3, 0, { life: { ...local('a', 0, 0).life, reaction: 'startle' } }),
    local('b', 4, 0, { life: { ...local('b', 0, 0).life, reaction: 'cower' } }),
    local('c', 5, 0, { life: { ...local('c', 0, 0).life, reaction: 'flee', speed: 2.2, status: 'fleeing' } }),
    local('d', 6, 0, { life: { ...local('d', 0, 0).life, seat: { id: 'bench:shop:0', height: .45, heading: 1 } } }),
  ], me);
  assert.deepEqual(figures.map(figure => [figure.reaction, figure.gesture]), [['startle', 'startle'], ['cower', 'cower'], ['flee', null], [null, null]]);
  assert.equal(poseFor('startle'), 'startled'); assert.equal(poseFor('cower'), 'bow');
  assert.deepEqual(figures[3].sitting, { id: 'bench:shop:0', height: .45, yaw: 1 }, 'a seated resident keeps the bench');
});

test('a low-tier or CPU-drawn client animates at most three neighbours, all within 30 m; the full tier keeps eight within 120 m', () => {
  // The hosted CPU renderer walked about 15 % slower with the full budget (heights-return A/B, 2026-10-30).
  const ids = figures => figures.map(figure => figure.id.slice('resident:'.length));
  const row = Array.from({ length: 12 }, (_, i) => local(`local-${i}`, 4 + i * 6, 0)); // 4, 10, 16, 22, 28, 34 ... 70 m
  const low = residentFigureBudget('low');
  assert.deepEqual(low, { cap: 3, range: 30 });
  assert.deepEqual(ids(residentFigures(row, me, null, low)), ['local-0', 'local-1', 'local-2']);
  assert.deepEqual(ids(residentFigures(row.slice(4), me, null, low)), ['local-4'], 'only those inside 30 m, however few');
  assert.equal(residentFigures(row, me).length, RESIDENT_FIGURE_CAP, 'the default is the full budget');
  for (const tier of ['standard', 'high', undefined]) assert.equal(residentFigureBudget(tier), RESIDENT_FIGURE_BUDGETS.full);
  // The tier is the character fidelity tier: a client that has shed render scale and occlusion is low.
  assert.equal(residentFigureBudget(fidelityTierForQuality({ mode: 'auto', scale: .5, occlusion: false })), low);
  assert.equal(residentFigureBudget(fidelityTierForQuality({ mode: 'auto', scale: 1, occlusion: true })), RESIDENT_FIGURE_BUDGETS.full);
  // Stepping down mid-walk: the cap, not only the range, drops drawn figures. local-4 (28 m) and
  // local-5 (34 m) are both inside 30 m + the keep margin, so only the cap of three removes them.
  const drawn = new Set(ids(residentFigures(row, me)));
  assert.ok(drawn.has('local-4') && drawn.has('local-5'), 'drawn on the full budget');
  assert.deepEqual(ids(residentFigures(row, me, drawn, low)), ['local-0', 'local-1', 'local-2'], 'the three nearest drawn ones stay');
  // A drawn figure just past 30 m is kept while fewer than three are nearer.
  const sparse = [local('a', 33, 0), local('b', 50, 0)];
  assert.deepEqual(ids(residentFigures(sparse, me, new Set(['a', 'b']), low)), ['a'], 'kept within the 10 m margin, dropped beyond it');
});
