import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { chessCell, chessCellPosition, plazaSalonPlan } from '../src/plaza-salon-plan.js';
import { replay } from '../src/chess-rules.js';

// The planters' shared planting loads its model asynchronously and reports to the page.
globalThis.document ??= { querySelector: () => null, dispatchEvent: () => true };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { buildPlazaSalon } = await import('../src/plaza-salon.js');

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const plan = plazaSalonPlan(district);
const group = buildPlazaSalon(district), chess = group.userData.chess;
const meshes = Object.fromEntries(group.children.filter(child => child.name?.startsWith('Chess ')).map(mesh => [mesh.name.slice(6), mesh]));
const instances = type => Array.from({ length: meshes[type].count }, (_, index) => {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), colour = new THREE.Color();
  meshes[type].getMatrixAt(index, matrix); matrix.decompose(position, rotation, new THREE.Vector3()); meshes[type].getColorAt(index, colour);
  return { position, yaw: new THREE.Euler().setFromQuaternion(rotation, 'YXZ').y, white: colour.r > 0.5 };
});
// The piece standing on a square of a table, if any.
const at = (type, table, square, whiteChair) => {
  const [east, north] = chessCellPosition(table, chessCell(square, whiteChair));
  return instances(type).find(({ position }) => Math.hypot(position.x - east, position.z + north) < 0.01);
};

test('idle chess tables show the opening position, six draw calls for every piece', () => {
  assert.equal(Object.keys(meshes).length, 6);
  const counts = Object.fromEntries(Object.entries(meshes).map(([type, mesh]) => [type, mesh.count]));
  assert.deepEqual(counts, { p: 32, r: 8, n: 8, b: 8, q: 4, k: 4 });
  for (const table of plan.chess) {
    assert.ok(at('k', table, 4, 0)?.white, `${table.id}: white king on e1`);
    assert.equal(at('k', table, 60, 0)?.white, false, `${table.id}: black king on e8`);
  }
});

test('a game shown at one table moves its pieces, and the other table keeps its own', () => {
  const [west, east] = plan.chess;
  const { state } = replay(['e2e4', 'e7e5']);
  assert.ok(chess.show(east.id, state.board, 1));
  assert.ok(at('p', east, 28, 1)?.white, 'white pawn on e4 at the east table');
  assert.equal(at('p', east, 12, 1), undefined, 'e2 is empty there');
  assert.equal(at('p', east, 36, 1)?.white, false, 'black pawn on e5');
  assert.ok(at('p', west, 12, 0)?.white, 'the west table still shows the opening');
  assert.deepEqual(chess.board(east.id), state.board);
  chess.show(east.id, null);
  assert.ok(at('p', east, 12, 0)?.white, 'showing no game returns the table to the opening');
  assert.equal(chess.show('chess-nowhere', state.board), false);
});

test('pieces face the other player, whichever chair white takes', () => {
  const [west] = plan.chess;
  for (const whiteChair of [0, 1]) {
    chess.show(west.id, null, whiteChair);
    const knight = at('n', west, 1, whiteChair), black = at('n', west, 57, whiteChair);
    // Chair 0 is east of the table: white sitting there looks west (-x), a yaw of -π/2.
    const towardWest = whiteChair === 0;
    assert.ok(Math.abs(knight.yaw - (towardWest ? -Math.PI / 2 : Math.PI / 2)) < 1e-6, `white knight faces away from chair ${whiteChair}`);
    assert.ok(Math.abs(black.yaw + knight.yaw) < 1e-6, 'black faces the other way');
  }
  chess.show(west.id, null);
});
