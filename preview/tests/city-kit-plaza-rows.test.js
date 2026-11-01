// Plaza benches and lamps by the row (#585): one line and a spacing derive the items,
// with stable ids that overrides address, instead of a furniture entry each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleNeighborhood, validateRecipe, canonicalJSON } from '../../shared/city-kit/assemble.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const recipe = (changes = {}) => ({
  id: 'rows', title: 'Plaza rows', kit: 'city-kit-1', seed: 3, site: [0, 0, 80, 60],
  streets: [{ id: 'main', from: [0, 6], to: [80, 6], lane: 6, sidewalk: 3 }],
  plazas: [{ id: 'green', rect: [10, 9, 70, 55], lawns: [[20, 20, 60, 44]],
    treeRows: [{ x: 66, from: 14, to: 50, spacing: 12 }],
    benchRows: [{ y: 16, from: 22, to: 58, spacing: 12, yaw: 0 }, { x: 14, from: 24, to: 40, spacing: 16, yaw: 1.5708 }],
    lampRows: [{ y: 52, from: 14, to: 66, spacing: 13 }] }],
  blocks: [], landmarks: [], furniture: [], context: [], overrides: {}, additions: [], ...changes,
});

test('rows derive benches, lamps and north-running tree rows with stable ids on the plaza ground', () => {
  const plan = assembleNeighborhood(recipe());
  const benches = plan.pieces.filter(piece => piece.piece === 'furniture/bench'), lamps = plan.pieces.filter(piece => piece.piece === 'furniture/lamp'), trees = plan.pieces.filter(piece => piece.piece === 'landscape/street-tree');
  assert.deepEqual(benches.map(piece => [piece.id, ...piece.at, piece.yaw]), [
    ['rows/green/bench-row-0-0', 22, 16, 0], ['rows/green/bench-row-0-1', 34, 16, 0], ['rows/green/bench-row-0-2', 46, 16, 0], ['rows/green/bench-row-0-3', 58, 16, 0],
    ['rows/green/bench-row-1-0', 14, 24, 1.571], ['rows/green/bench-row-1-1', 14, 40, 1.571]]);
  assert.deepEqual(lamps.map(piece => [piece.id, ...piece.at]), [['rows/green/lamp-row-0-0', 14, 52], ['rows/green/lamp-row-0-1', 27, 52], ['rows/green/lamp-row-0-2', 40, 52], ['rows/green/lamp-row-0-3', 53, 52], ['rows/green/lamp-row-0-4', 66, 52]]);
  assert.deepEqual(trees.map(piece => piece.at), [[66, 14], [66, 26], [66, 38], [66, 50]], 'a tree row can run north too');
  assert.equal(plan.solids.filter(solid => solid.kind === 'bench').length, 6);
  assert.equal(plan.solids.filter(solid => solid.kind === 'lamp').length, 5);
  assert.equal(canonicalJSON(assembleNeighborhood(recipe())), canonicalJSON(plan), 'deterministic');
});

test('an override addresses a derived bench by its row id, and a suppressed one leaves the row otherwise whole', () => {
  const turned = recipe({ overrides: { 'rows/green/bench-row-0-1': { set: { yaw: 3.141593 }, note: 'face the lawn' }, 'rows/green/bench-row-0-3': { suppress: true } } });
  const plan = assembleNeighborhood(turned);
  assert.equal(plan.pieces.find(piece => piece.id === 'rows/green/bench-row-0-1').yaw, 3.142);
  assert.equal(plan.pieces.some(piece => piece.id === 'rows/green/bench-row-0-3'), false);
  assert.deepEqual(plan.provenance.overrides.applied.sort(), ['rows/green/bench-row-0-1', 'rows/green/bench-row-0-3']);
  assert.equal(plan.pieces.filter(piece => piece.piece === 'furniture/bench').length, 5);
});

test('rows are validated, and a row off the plaza ground is refused by the solids check', () => {
  for (const [row, message] of [
    [{ from: 1, to: 2, spacing: 1 }, /benchRows 0/], [{ x: 1, y: 2, from: 1, to: 2, spacing: 1 }, /benchRows 0/], [{ y: 2, from: 5, to: 2, spacing: 1 }, /benchRows 0/],
    [{ y: 2, from: 1, to: 2, spacing: 0 }, /benchRows 0/], [{ y: 2, from: 0, to: 80, spacing: 1 }, /benchRows 0/], [{ y: 2, from: 1, to: 2, spacing: 1, yaw: 'east' }, /benchRows 0/],
  ]) assert.throws(() => validateRecipe(recipe({ plazas: [{ id: 'green', rect: [10, 9, 70, 55], benchRows: [row] }] })), message);
  assert.throws(() => validateRecipe(recipe({ plazas: [{ id: 'green', rect: [10, 9, 70, 55], lampRows: [{ x: 'a', from: 1, to: 2, spacing: 1 }] }] })), /lampRows 0/);
  assert.throws(() => assembleNeighborhood(recipe({ plazas: [{ id: 'green', rect: [10, 9, 70, 55], benchRows: [{ y: 58, from: 20, to: 20, spacing: 5 }] }] })), /solid rows\/green\/bench-row-0-0 is not inside walkable ground/);
});

test('no committed recipe changes: the shipped plans keep their hashes', () => {
  for (const name of ['nineteenth-and-yale', 'bayou-market-commons', 'bayou-greenway']) {
    const source = JSON.parse(readFileSync(join(root, 'config/destinations', `${name}.json`), 'utf8')), lock = JSON.parse(readFileSync(join(root, 'config/destinations', `${name}.lock.json`), 'utf8'));
    assert.equal(assembleNeighborhood(source).hash, lock.hash, name);
  }
});
