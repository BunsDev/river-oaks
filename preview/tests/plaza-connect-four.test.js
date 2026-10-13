import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { chessCellPosition, plazaSalonPlan } from '../src/plaza-salon-plan.js';
import { cellOf, replay } from '../src/connect-four-rules.js';

// The planters' shared planting loads its model asynchronously and reports to the page.
globalThis.document ??= { querySelector: () => null, dispatchEvent: () => true };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { buildPlazaSalon } = await import('../src/plaza-salon.js');
const { CONNECT_FOUR } = await import('../src/connect-four-adapter.js');

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const plan = plazaSalonPlan(district);
const group = buildPlazaSalon(district), four = group.userData.connectFour, table = plan.chess[0];
const holder = () => group.children.find(child => child.name === `Connect Four ${table.id}`);
// World positions (east, north) of the discs on a table's frame.
const discs = () => {
  const mesh = holder().children.find(child => child.isInstancedMesh && child.count !== 42);
  group.updateMatrixWorld(true);
  return Array.from({ length: mesh.count }, (_, index) => {
    const matrix = new THREE.Matrix4(), colour = new THREE.Color();
    mesh.getMatrixAt(index, matrix); mesh.getColorAt(index, colour);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
    return { east: position.x, north: -position.z, height: position.y, red: colour.g < 0.2 }; // linear colour: red has almost no green, yellow plenty
  });
};
const toward = ([east, north], cell) => { const [x, n] = chessCellPosition(table, cell); return Math.hypot(east - x, north - n); };

test('every chess table has a Connect Four frame, put away until it is played', () => {
  assert.equal(plan.chess.every(item => four.visible(item.id) === false), true);
  assert.equal(four.show('missing', []), false);
});

test('the frame shows the game: red and yellow discs, stacked from the bottom', () => {
  const { state } = replay(['d', 'd', 'c']);
  assert.equal(four.show(table.id, state.board, 0), true);
  assert.equal(four.visible(table.id), true);
  assert.equal(four.discs(table.id), 3);
  const placed = discs();
  assert.deepEqual(placed.map(disc => disc.red).sort(), [false, true, true]);
  // Column d holds two discs, red under yellow; c holds one red beside them.
  const column = placed.filter(disc => placed.some(other => other !== disc && Math.hypot(other.east - disc.east, other.north - disc.north) < 1e-6)).sort((a, b) => a.height - b.height);
  assert.equal(column.length, 2);
  assert.deepEqual(column.map(disc => disc.red), [true, false]);
  assert.ok(column[1].height > column[0].height + 0.05);
  assert.equal(four.show(table.id, null), true);
  assert.equal(four.visible(table.id), false);
});

test('columns run from the first player\'s left, whichever chair they sit in', () => {
  const board = Array(42).fill(''); board[cellOf('a1')] = 'r';
  // The a-file side of the chess board is the first chair's left (white's queenside).
  four.show(table.id, board, 0);
  const [fromChair0] = discs();
  assert.ok(toward([fromChair0.east, fromChair0.north], { i: 0, j: 3.5 }) < toward([fromChair0.east, fromChair0.north], { i: 7, j: 3.5 }));
  four.show(table.id, board, 1);
  const [fromChair1] = discs();
  assert.ok(toward([fromChair1.east, fromChair1.north], { i: 7, j: 3.5 }) < toward([fromChair1.east, fromChair1.north], { i: 0, j: 3.5 }));
  four.show(table.id, null);
});

test('the Connect Four sheet adapter drops any clicked cell of a column into it', () => {
  const adapter = CONNECT_FOUR;
  assert.deepEqual(adapter.size, { rows: 6, cols: 7 });
  const { state, played, result } = adapter.replay(['d', 'c']);
  assert.deepEqual(played.map(move => move.text), ['D', 'C']);
  assert.equal(result, null);
  const moves = adapter.moves(state);
  assert.equal(adapter.dropAt(moves, cellOf('d6')).to, cellOf('d2'), 'a click high in column d lands on its next free cell');
  assert.equal(adapter.squareName(adapter.dropAt(moves, cellOf('a3')).to), 'a1');
  assert.equal(adapter.piece(state, cellOf('d1')).label, 'red disc');
  const won = adapter.replay(['a', 'a', 'b', 'b', 'c', 'c', 'd']).result;
  assert.equal(won.winner, 'r');
  assert.deepEqual(won.cells, ['a1', 'b1', 'c1', 'd1'].map(cellOf));
});
