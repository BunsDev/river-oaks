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

test('backgammon: the table shows the opening, and a game’s points, bar and trays', async () => {
  const { fromPosition } = await import('../src/backgammon-rules.js');
  const { backgammonSpot } = await import('../src/plaza-salon-plan.js');
  const mirror = group.userData.backgammon, mesh = group.children.find(child => child.name === 'Backgammon checkers');
  assert.equal(mirror.count(), 30, 'idle, the board is set up');
  const centre = index => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); };
  const near = ([east, north]) => Array.from({ length: mesh.count }, (_, i) => centre(i)).some(p => Math.hypot(p.x - east, p.z + north) < 0.002);
  // White's two back checkers stand on point 24 at the far edge from white's chair.
  assert.ok(near(backgammonSpot(plan.backgammon, 24, 0, 0).position) && near(backgammonSpot(plan.backgammon, 24, 1, 0).position));
  mirror.show(fromPosition({ 6: 3, 1: -2 }, { bar: [1, 0], off: [11, 13] }), 1);
  assert.equal(mirror.count(), 3 + 2 + 1 + 11 + 13);
  assert.ok(near(backgammonSpot(plan.backgammon, 'bar-white', 0, 1).position), 'the hit checker waits on the bar');
  mirror.show(null);
  assert.equal(mirror.count(), 30, 'cleared, the table is set up again');
});

test('jenga: the drum shows the game’s tower, and the blocks scattered once it falls', async () => {
  const { JENGA, jengaBlock } = await import('../src/plaza-salon-plan.js');
  const { pull, startTower } = await import('../src/jenga-rules.js');
  const mirror = group.userData.jenga, mesh = group.children.find(child => child.name === 'Jenga blocks');
  const blocks = () => Array.from({ length: mesh.count }, (_, i) => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); });
  const ground = blocks()[0].y - jengaBlock(plan.bench, 0, 0).height;
  assert.equal(mirror.count(), 54, 'idle, the full tower stands');
  const near = (level, slot) => { const spot = jengaBlock(plan.bench, level, slot); return blocks().some(p => Math.hypot(p.x - spot.position[0], p.z + spot.position[1]) < 0.001 && Math.abs(p.y - ground - spot.height) < 0.001); };
  assert.ok(near(0, 0) && near(17, 2), 'bottom and top levels in place');
  let state = pull(startTower(), { level: 4, slot: 1 });
  mirror.show(state);
  assert.equal(mirror.count(), 54);
  assert.ok(!near(4, 1) && near(18, 1), 'the pulled block now lies on top');
  // The drum's lanterns and bowl stay clear of the tower's footprint.
  const centre = jengaBlock(plan.bench, 0, 1).position, reach = Math.hypot(JENGA.length, JENGA.length) / 2;
  for (const [east, north, radius] of [[-0.16, -0.08, 0.07], [0.15, 0.1, 0.07], [0.05, 0.16, 0.08]])
    assert.ok(Math.hypot(centre[0] - (plan.bench.x + east), centre[1] - (plan.bench.north + north)) > reach + radius, `clear of the drum's ornament at ${east}, ${north}`);
  assert.ok(Math.hypot(centre[0] - plan.bench.x, centre[1] - plan.bench.north) + reach < JENGA.drumRadius, 'the tower stands on the drum');
  state = pull(state, { level: 7, slot: 0, steady: false });
  mirror.show(state);
  assert.equal(mirror.count(), 54, 'every block is somewhere after the fall');
  assert.equal(mirror.fallen(), true);
  const scattered = blocks();
  assert.ok(scattered.every(p => p.y - ground < JENGA.drumTop + 0.1), 'nothing is left standing tall');
  assert.ok(scattered.filter(p => p.y - ground < 0.05).length > 10, 'many land on the paving');
  mirror.show(state);
  assert.deepEqual(blocks().map(p => p.toArray()), scattered.map(p => p.toArray()), 'the same fall lands the same way');
  mirror.show(null);
  assert.equal(mirror.fallen(), false);
});

test('wine pong: twelve glasses racked at the table ends, hit glasses gone, and the ball in flight', async () => {
  const { winePongPoint } = await import('../src/plaza-salon-plan.js');
  const { glassAt, play, aimAt, startGame, TABLE } = await import('../src/wine-pong-rules.js');
  const mirror = group.userData.winePong, mesh = group.children.find(child => child.name === 'Wine pong glasses');
  const centres = () => Array.from({ length: mesh.count }, (_, i) => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); });
  assert.equal(mirror.glasses(), 12, 'idle, both racks are full');
  const at = (side, k) => { const [east, north] = winePongPoint(plan.winePong, glassAt(side, k)); return centres().some(p => Math.hypot(p.x - east, p.z + north) < 0.001); };
  assert.ok(at(0, 0) && at(1, 5), 'both racks at their own ends');
  let state = startGame(3);
  for (const k of [5, 2]) { const { aim, power } = aimAt(state.turn, glassAt(1 - state.turn, k)); state = play(state, aim, power); }
  mirror.show(state);
  assert.equal(mirror.glasses(), 10);
  assert.ok(!at(1, 5) && !at(1, 2) && at(1, 4), 'the hit glasses leave the table');
  const heights = centres().map(p => p.y);
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1e-6, 'every glass stands on the table top');
  mirror.ball([0, 0, TABLE.height + 0.5]);
  assert.equal(mirror.ballVisible(), true);
  mirror.ball(null);
  assert.equal(mirror.ballVisible(), false);
  mirror.show(null);
  assert.equal(mirror.glasses(), 12);
});

test('mancala: the grove table holds the opening, and a game’s seeds in their pits and stores', async () => {
  const { mancalaSpot } = await import('../src/plaza-salon-plan.js');
  const { sow, startGame } = await import('../src/mancala-rules.js');
  const mirror = group.userData.mancala, mesh = group.children.find(child => child.name === 'Mancala seeds');
  const beads = () => Array.from({ length: mesh.count }, (_, i) => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); });
  const inPit = (index, chair = 0) => { const [east, north] = mancalaSpot(plan.grove, index, chair); return beads().filter(p => Math.hypot(p.x - east, (p.z + north) / (index === 6 || index === 13 ? 2.2 : 1)) < 0.03).length; };
  assert.equal(mirror.count(), 48, 'idle, four seeds in every pit');
  assert.equal(inPit(0), 4); assert.equal(inPit(6), 0);
  const state = sow(startGame(), 3);
  mirror.show(state, 0);
  assert.equal(mirror.count(), 48);
  assert.equal(inPit(2), 0, 'the sown pit is empty'); assert.equal(inPit(6), 1, 'one seed in the store');
  // From the other chair the board turns round: side 0's store is at the other end.
  mirror.show(state, 1);
  assert.equal(inPit(6, 1), 1);
  mirror.show(null);
  assert.equal(mirror.count(), 48);
});

test('go: the grove table swaps the mancala board for a goban, and the stones sit on their points', async () => {
  const { goSpot } = await import('../src/plaza-salon-plan.js');
  const { play, pointOf, startGame } = await import('../src/go-rules.js');
  const go = group.userData.go, mancala = group.userData.mancala, mesh = group.children.find(child => child.name === 'Goban').children.find(child => child.name === 'Go stones');
  assert.equal(go.visible(), false, 'the table starts as mancala'); assert.equal(mancala.visible(), true);
  mancala.setVisible(false); go.setVisible(true);
  assert.equal(go.visible(), true); assert.equal(mancala.visible(), false);
  const state = play(play(startGame(), pointOf('e5')), pointOf('c3'));
  for (const chair of [0, 1]) {
    go.show(state, chair);
    assert.equal(go.count(), 2);
    const centres = Array.from({ length: mesh.count }, (_, i) => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); });
    for (const name of ['e5', 'c3']) { const [east, north] = goSpot(plan.grove, pointOf(name), chair); assert.ok(centres.some(p => Math.hypot(p.x - east, p.z + north) < 0.001), `${name} from chair ${chair}`); }
  }
  // Seen from the other chair, the board turns round: c3 moves to the far side of the centre.
  assert.notDeepEqual(goSpot(plan.grove, pointOf('c3'), 0), goSpot(plan.grove, pointOf('c3'), 1));
  go.show(null); assert.equal(go.count(), 0);
  go.setVisible(false); mancala.setVisible(true);
});

test('cribbage: the walnut table swaps the checkers for a pegging board, and the pegs follow the scores', () => {
  const cribbage = group.userData.cribbage, backgammon = group.userData.backgammon;
  const board = group.children.find(child => child.name === 'Cribbage board'), pegs = board.children.find(child => child.isInstancedMesh && child.count <= 2 && child.geometry.type === 'CylinderGeometry');
  assert.equal(cribbage.visible(), false, 'the table starts as backgammon'); assert.equal(backgammon.visible(), true);
  backgammon.setVisible(false); cribbage.setVisible(true);
  assert.equal(cribbage.visible(), true); assert.equal(backgammon.visible(), false);
  const at = () => Array.from({ length: pegs.count }, (_, i) => { const matrix = new THREE.Matrix4(); pegs.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); });
  cribbage.show([10, 70], 0);
  assert.equal(cribbage.pegs(), 2);
  const [mine, theirs] = at();
  assert.ok(mine.x > plan.backgammon.x && theirs.x < plan.backgammon.x, 'from chair 0 (east), your lane is the east one');
  cribbage.show([10, 70], 1);
  const [mine1] = at();
  assert.ok(mine1.x < plan.backgammon.x, 'from chair 1 (west), your lane is the west one');
  const early = at()[0].z; cribbage.show([40, 70], 1); assert.notEqual(at()[0].z, early, 'a higher score moves the peg along');
  cribbage.show(null); assert.equal(cribbage.pegs(), 0);
  cribbage.setVisible(false); backgammon.setVisible(true);
});
test('darts: the board on its post faces the throwing line, and the turn’s darts stand where they landed', async () => {
  const { DARTS, atDartsLine, dartSpot, dartsStand } = await import('../src/plaza-salon-plan.js');
  const { targetPoint } = await import('../src/darts-rules.js');
  const board = plan.darts, mirror = group.userData.darts, mesh = group.children.find(child => child.name === 'Darts in the board');
  const stand = dartsStand(board);
  assert.ok(Math.abs(Math.hypot(stand[0] - board.x, stand[1] - board.north) - DARTS.line) < 1e-9, 'the line is 2.37 m from the board');
  assert.ok(atDartsLine(board, stand) && !atDartsLine(board, [board.x, board.north]));
  mirror.show([targetPoint(20, 'treble'), [0, 0], targetPoint(6, 'double')]);
  assert.equal(mirror.count(), 3);
  const at = i => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix); };
  const ground = at(1).y - DARTS.bull;
  assert.ok(at(0).y - ground > DARTS.bull + 0.09, 'the treble 20 is high on the board');
  // From the line the thrower faces south, so the 6 (on their right) is to the west of the bull.
  assert.ok(at(2).x < at(1).x, 'the double 6 lies on the thrower’s right, west');
  assert.deepEqual(dartSpot(board, [0, 0]).slice(0, 2).map(v => Math.round(v * 100)), [Math.round(board.x * 100), Math.round((board.north + 0.035) * 100)]);
  mirror.show([]); assert.equal(mirror.count(), 0);
});
test('liar’s dice: cups before each player still in, lifted on a call to show dice with their value up', () => {
  const mirror = group.userData.dice, mesh = group.children.find(child => child.name === 'Liar’s dice');
  mirror.show({ cups: [{ chair: 0, dice: [1, 2, 3, 4, 5], open: false }, { chair: 1, dice: [6, 6], open: false }, { chair: 2, dice: [], open: false }, { chair: 3, dice: [3], open: false }] });
  assert.deepEqual(mirror.count(), { cups: 3, dice: 0 }, 'a player out of dice has no cup');
  mirror.show({ cups: [{ chair: 0, dice: [1, 2, 3, 4, 5, 6].slice(0, 5), open: true }, { chair: 1, dice: [6], open: true }] });
  assert.deepEqual(mirror.count(), { cups: 0, dice: 6 });
  // Each die's top face (+y after its rotation) shows its value: check via the face's local normal.
  const values = [1, 2, 3, 4, 5, 6], faceOf = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
  for (let i = 0; i < mesh.count; i++) {
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(); mesh.getMatrixAt(i, matrix); matrix.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
    const value = values[i === 5 ? 5 : i], normal = new THREE.Vector3(...faceOf[value]).applyQuaternion(rotation);
    assert.ok(normal.y > 0.99, `die ${i} shows ${value} on top`);
  }
  mirror.show(null); assert.deepEqual(mirror.count(), { cups: 0, dice: 0 });
});

test('yacht: the drum swaps the tower for five dice, each showing its value face up, kept ones lined up', async () => {
  const { JENGA } = await import('../src/plaza-salon-plan.js');
  const yacht = group.userData.yacht, jenga = group.userData.jenga, mesh = group.children.find(child => child.name === 'Yacht dice');
  assert.equal(yacht.visible(), false, 'idle, the drum shows the tower');
  jenga.setVisible(false); yacht.setVisible(true);
  assert.equal(jenga.visible(), false); assert.equal(mesh.visible, true);
  // Faces in BoxGeometry order (+x, −x, +y, −y, +z, −z) show 3, 4, 1, 6, 2, 5: read the one turned up.
  const faces = [[1, 0, 0, 3], [-1, 0, 0, 4], [0, 1, 0, 1], [0, -1, 0, 6], [0, 0, 1, 2], [0, 0, -1, 5]];
  const dice = () => Array.from({ length: mesh.count }, (_, i) => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion();
    mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, new THREE.Vector3());
    const up = faces.find(([x, y, z]) => new THREE.Vector3(x, y, z).applyQuaternion(rotation).y > 0.99);
    return { position, value: up?.[3] };
  });
  const values = [6, 2, 5, 3, 4];
  yacht.show(values, [true, false, true, false, false]);
  const shown = dice();
  assert.deepEqual(shown.map(die => die.value), values, 'every die shows its value face up');
  const ground = plan.bench, [kept, rolled] = [shown.filter((_, i) => [0, 2].includes(i)), shown.filter((_, i) => ![0, 2].includes(i))];
  assert.ok(Math.abs(kept[0].position.z - kept[1].position.z) < 1e-9, 'the kept dice stand in a line');
  assert.ok(kept.every(die => rolled.every(other => die.position.z < other.position.z)), 'kept dice sit nearer the bench');
  for (const die of shown) assert.ok(Math.hypot(die.position.x - ground.x, -die.position.z - ground.north) < JENGA.drumRadius - 0.05, 'on the drum');
  for (const die of shown) for (const [east, north, radius] of [[-0.16, -0.08, 0.07], [0.15, 0.1, 0.07], [0.05, 0.16, 0.08]])
    assert.ok(Math.hypot(die.position.x - (ground.x + east), -die.position.z - (ground.north + north)) > radius + 0.015, `clear of the drum's ornament at ${east}, ${north}`);
  yacht.show(values, [true, false, true, false, false]);
  assert.deepEqual(dice().map(die => die.position.toArray()), shown.map(die => die.position.toArray()), 'the same roll lies the same way');
  yacht.show(null);
  assert.equal(yacht.dice(), 5, 'before the first roll, five dice wait in a row');
  yacht.setVisible(false); jenga.setVisible(true);
});
