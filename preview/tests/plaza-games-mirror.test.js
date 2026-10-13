import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { chessCell, chessCellPosition, plazaSalonPlan } from '../src/plaza-salon-plan.js';
import { replay } from '../src/chess-rules.js';
import { fromDiagram, startPosition } from '../src/checkers-rules.js';

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

test('checkers discs: twelve a side on the dark squares, a king stacked two high', () => {
  const [west] = plan.chess, disc = group.children.find(child => child.name === 'Checkers disc');
  const discs = () => Array.from({ length: disc.count }, (_, index) => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), colour = new THREE.Color();
    disc.getMatrixAt(index, matrix); position.setFromMatrixPosition(matrix); disc.getColorAt(index, colour);
    return { position, dark: colour.r < 0.5 };
  });
  assert.equal(disc.count, 0, 'idle tables show chess, not discs');
  chess.show(west.id, startPosition().board, 0);
  assert.equal(disc.count, 24);
  assert.equal(discs().filter(item => item.dark).length, 12);
  // Dark, which moves first, sits at chair 0 like white in chess: its discs are on ranks 1-3.
  const [east, north] = chessCellPosition(west, chessCell(0, 0));
  assert.ok(discs().some(item => item.dark && Math.hypot(item.position.x - east, item.position.z + north) < 0.01), 'a dark disc on a1');
  const king = fromDiagram(['........', '........', '........', '....D...', '........', '........', '........', '........']);
  chess.show(west.id, king.board, 0);
  assert.equal(disc.count, 2, 'a king is two discs');
  const [low, high] = discs().map(item => item.position.y).sort((a, b) => a - b);
  assert.ok(high - low > 0.008 && high - low < 0.011);
  chess.show(west.id, null);
  assert.equal(disc.count, 0);
});

test('dominoes on the café table: the line lies on its arc, only your hand shows its pips', () => {
  const dominoes = group.userData.dominoes, tiles = group.children.find(child => child.name === 'Domino tiles'), pips = group.children.find(child => child.name === 'Domino pips');
  const centre = (mesh, index) => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); };
  const [tx, , tz] = [plan.round.x, 0, -plan.round.north];
  const line = [{ id: '5-6', left: 5, right: 6 }, { id: '6-6', left: 6, right: 6 }, { id: '2-6', left: 6, right: 2 }];
  dominoes.show({ line, leadIndex: 1, facing: 2, hands: [{ chair: 2, tiles: ['0-1', '3-4'] }, { chair: 0, count: 5 }] });
  assert.equal(tiles.count, 3 + 2 + 5);
  // Pips: a divider per face shown, then the spots: 11 + 12 + 8 on the line, 1 + 7 in your hand.
  assert.equal(pips.count, (3 + 2) + (11 + 12 + 8) + (1 + 7));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(Math.hypot(centre(tiles, i).x - tx, centre(tiles, i).z - tz) - 0.4) < 1e-3, 'the line runs on its arc (instance matrices are float32 at world scale)');
  // Hands stand 0.64 m out towards their chairs (chair n at π/4 + n·π/2), spread along the edge.
  const outward = (index, chair) => { const angle = Math.PI / 4 + chair * Math.PI / 2, at = centre(tiles, index); return (at.x - tx) * Math.sin(angle) + (at.z - tz) * Math.cos(angle); };
  for (let i = 3; i < 5; i++) assert.ok(Math.abs(outward(i, 2) - 0.64) < 1e-3, 'your hand stands at your edge');
  for (let i = 5; i < 10; i++) assert.ok(Math.abs(outward(i, 0) - 0.64) < 1e-3, 'the regular\u2019s hand stands at theirs');
  // The lead faces your chair (chair 2), and your hand stands on that side of the table.
  const toward = angle => [Math.sin(angle), Math.cos(angle)], lead = centre(tiles, 1), yours = centre(tiles, 3), [cx, cz] = toward(Math.PI / 4 + Math.PI);
  assert.ok((lead.x - tx) * cx + (lead.z - tz) * cz > 0.39 && (yours.x - tx) * cx + (yours.z - tz) * cz > 0.6);
  dominoes.show(null);
  assert.equal(tiles.count, 0); assert.equal(pips.count, 0);
});

test('Hearts on the café table: the trick face up before its players, hands and won tricks face down', () => {
  const cards = group.userData.cards;
  assert.equal(cards.count().drawn, false, 'no canvas here, so faces are plain');
  cards.show({ trick: [{ chair: 2, card: '2C' }, { chair: 3, card: 'KC' }], hands: [{ chair: 2, count: 12 }, { chair: 3, count: 12 }, { chair: 0, count: 13 }, { chair: 1, count: 13 }], won: [{ chair: 1, tricks: 2 }] });
  assert.deepEqual(cards.count(), { faces: 2, backs: 12 + 12 + 13 + 13 + 2, drawn: false });
  const trick = group.children.filter(child => child.name?.startsWith('Card in the trick') && child.visible);
  const angle = Math.PI / 4 + 2 * Math.PI / 2, [tx, tz] = [plan.round.x, -plan.round.north];
  assert.ok((trick[0].position.x - tx) * Math.sin(angle) + (trick[0].position.z - tz) * Math.cos(angle) > 0.19, 'the first card lies before chair 2');
  cards.show(null);
  assert.deepEqual(cards.count(), { faces: 0, backs: 0, drawn: false });
});
