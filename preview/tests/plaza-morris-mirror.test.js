import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { CHESS_CELL_M, chessCellPosition, plazaSalonPlan } from '../src/plaza-salon-plan.js';
import { cellOf, fromDiagram } from '../src/morris-rules.js';

// The planters' shared planting loads its model asynchronously and reports to the page.
globalThis.document ??= { querySelector: () => null, dispatchEvent: () => true };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { buildPlazaSalon } = await import('../src/plaza-salon.js');

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const plan = plazaSalonPlan(district), group = buildPlazaSalon(district), morris = group.userData.morris;
const holder = table => group.children.find(child => child.name === `Morris ${table.id}`);
const pieces = table => {
  const instanced = holder(table).children.find(child => child.name === `Morris pieces ${table.id}`);
  return Array.from({ length: instanced.count }, (_, index) => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), colour = new THREE.Color();
    instanced.getMatrixAt(index, matrix); position.setFromMatrixPosition(matrix); instanced.getColorAt(index, colour);
    return { east: position.x, north: -position.z, white: colour.r > 0.5 };
  });
};
// The board's centre and a point's place, in chess-cell terms (7 points span 8 cells).
const pointAt = (table, name, firstChair) => {
  let file = name.charCodeAt(0) - 97, rank = Number(name[1]) - 1;
  if (firstChair === 1) { file = 6 - file; rank = 6 - rank; }
  return chessCellPosition(table, { i: 3.5 + (file - 3) * 8 / 7, j: 3.5 + (rank - 3) * 8 / 7 });
};
const near = (piece, [east, north]) => Math.hypot(piece.east - east, piece.north - north) < 0.002;

test('each chess table has a morris board, put away until morris is played', () => {
  for (const table of plan.chess) {
    assert.equal(morris.visible(table.id), false);
    assert.equal(morris.pieces(table.id), 0);
    // A brass strip for each of the 32 joins (two along each of the sixteen mills), and a
    // stud on each of the 24 points.
    assert.deepEqual(holder(table).children.map(child => child.count ?? 1), [1, 32, 24, 0]);
  }
});

test('the morris board shows the pieces on their points, white at the first player\'s chair', () => {
  const [west, east] = plan.chess;
  const board = fromDiagram(['......b', '.......', '.......', '.......', '.......', '.......', 'w......']).board;
  assert.equal(morris.show(west.id, board, 0), true);
  assert.equal(morris.visible(west.id), true);
  let shown = pieces(west);
  assert.equal(shown.length, 2);
  assert.ok(near(shown.find(piece => piece.white), pointAt(west, 'a1', 0)), 'white a1 at the first player\'s left corner');
  assert.ok(near(shown.find(piece => !piece.white), pointAt(west, 'g7', 0)));
  // Every point stays inside the chess board's eight cells.
  const [cx, cn] = chessCellPosition(west, { i: 3.5, j: 3.5 });
  for (const piece of shown) assert.ok(Math.max(Math.abs(piece.east - cx), Math.abs(piece.north - cn)) < 4 * CHESS_CELL_M);
  // From the other chair the board turns: a1 is now the far corner.
  morris.show(west.id, board, 1);
  shown = pieces(west);
  assert.ok(near(shown.find(piece => piece.white), pointAt(west, 'a1', 1)));
  assert.equal(morris.visible(east.id), false, 'the other table keeps its own game');
  morris.show(west.id, null);
  assert.equal(morris.visible(west.id), false);
  assert.equal(board[cellOf('a1')], 'w');
});
