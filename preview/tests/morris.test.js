import test from 'node:test';
import assert from 'node:assert/strict';
import * as morris from '../src/morris-rules.js';
import { chooseMove } from '../src/morris-opponent.js';
import { MORRIS } from '../src/morris-adapter.js';

const names = cells => cells.map(morris.cellName).sort();
const perft = (state, depth) => {
  if (!depth) return 1;
  let nodes = 0;
  for (const move of morris.legalMoves(state)) nodes += perft(morris.makeMove(state, move), depth - 1);
  return nodes;
};

test('the board has 24 points on three squares, sixteen mills, and lines between neighbours', () => {
  assert.equal(morris.POINTS.length, 24);
  assert.equal(morris.MILLS.length, 16);
  const degree = point => morris.NEIGHBOURS.get(morris.cellOf(point)).length;
  assert.deepEqual(['a1', 'd1', 'd2', 'd3'].map(degree), [2, 3, 4, 3], 'a corner, an outer midpoint, the middle midpoint, an inner midpoint');
  assert.deepEqual(names(morris.NEIGHBOURS.get(morris.cellOf('d2'))), ['b2', 'd1', 'd3', 'f2']);
  assert.equal(morris.cellOf('d4') in morris.POINTS, false, 'the centre is not a point');
});

test('white places first, nine each; placements multiply until a mill is possible', () => {
  const start = morris.startPosition();
  assert.deepEqual([start.turn, start.hand], ['w', { w: 9, b: 9 }]);
  assert.deepEqual([1, 2, 3].map(depth => perft(start, depth)), [24, 24 * 23, 24 * 23 * 22]);
});

test('a mill takes a piece, never one standing in a mill unless every piece does', () => {
  const placing = morris.fromDiagram(['.......', '.......', '.......', '.......', '.......', '...b.b.', 'w..w...'], { turn: 'w', hand: { w: 7, b: 7 } });
  assert.deepEqual(morris.legalMoves(placing).filter(move => move.to === morris.cellOf('g1')).map(move => move.notation).sort(), ['g1xd2', 'g1xf2']);
  // Black's d5–d6–d7 is a mill; only the loose b4 may be taken.
  const guarded = morris.fromDiagram(['...b...', '...b...', '...b...', 'wb.....', '.......', '.......', 'w..w...'], { turn: 'w', hand: { w: 6, b: 5 } });
  assert.deepEqual([...new Set(morris.legalMoves(guarded).filter(move => move.take !== null).map(move => morris.cellName(move.take)))], ['b4']);
  const allInMills = morris.fromDiagram(['...b...', '...b...', '...b...', 'w......', '.......', '.......', 'w..w...'], { turn: 'w', hand: { w: 6, b: 6 } });
  assert.deepEqual(names([...new Set(morris.legalMoves(allInMills).filter(move => move.take !== null).map(move => move.take))]), ['d5', 'd6', 'd7']);
});

test('pieces move along lines, fly at three, and lose at two or when blocked', () => {
  const moving = morris.fromDiagram(['w.....b', '.......', '.......', 'b.....w', '.......', '.b.w.b.', 'w.....b'], { turn: 'w' });
  assert.deepEqual(morris.legalMoves(moving).filter(move => move.from === morris.cellOf('a7')).map(move => morris.cellName(move.to)).sort(), ['d7']);
  const flying = morris.fromDiagram(['w.....b', '.......', '.......', 'b......', '.......', '.b...b.', 'w.....w'], { turn: 'w' });
  assert.equal(new Set(morris.legalMoves(flying).filter(move => move.from === morris.cellOf('a7')).map(move => move.to)).size, 24 - 7, 'three pieces fly to any empty point');
  const two = morris.fromDiagram(['w.....b', '.......', '.......', 'b......', '.......', '.b...b.', 'w......'], { turn: 'w' });
  assert.deepEqual(morris.outcome(two), { winner: 'b', reason: 'down to two pieces' });
  // White holds the four outer corners, black every point beside them: white cannot step.
  const blocked = morris.fromDiagram(['w..b..w', '.......', '.......', 'b.....b', '.......', '.......', 'w..b..w'], { turn: 'w' });
  assert.deepEqual([morris.legalMoves(blocked).length, morris.outcome(blocked)], [0, { winner: 'b', reason: 'no move left' }]);
});

test('a game is drawn after fifty moves each without a mill, or the same position three times', () => {
  const quiet = morris.fromDiagram(['w.....b', '.......', '.......', 'b.....w', '.......', '.b.w.b.', 'w.....b'], { turn: 'w', quiet: morris.DRAW_PLIES });
  assert.deepEqual(morris.outcome(quiet), { winner: null, reason: 'fifty moves each without a mill' });
  const key = morris.positionKey(quiet);
  assert.equal(morris.outcome({ ...quiet, quiet: 0 }, [key, 'x', key, 'y', key]).reason, 'the same position three times');
});

test('the sheet adapter places with one click, then moves, and asks for the piece a mill takes', () => {
  const start = MORRIS.replay([]).state;
  assert.equal(MORRIS.drop(start), true);
  assert.equal(MORRIS.dropAt(MORRIS.moves(start), morris.cellOf('d1')).key, 'd1');
  assert.equal(MORRIS.playable(morris.cellOf('d4')), false);
  assert.equal(MORRIS.alert(start).text, 'To place: White 9 · Black 9. ');
  const millSoon = morris.fromDiagram(['.......', '.......', '.......', '.......', '.......', '...b.b.', 'w..w...'], { turn: 'w', hand: { w: 7, b: 7 } });
  const options = MORRIS.moves(millSoon).filter(move => move.to === morris.cellOf('g1'));
  assert.deepEqual(options.map(move => morris.cellName(move.take)).sort(), ['d2', 'f2'], 'one option per piece the mill may take');
  assert.equal(MORRIS.takeLabel(millSoon), 'Choose a black piece to take.');
  const moving = morris.fromDiagram(['w.....b', '.......', '.......', 'b.....w', '.......', '.b.w.b.', 'w.....b'], { turn: 'w' });
  assert.equal(MORRIS.drop(moving), false);
  assert.ok(MORRIS.moves(moving).every(move => move.from !== undefined));
  const { played } = MORRIS.replay(['d1', 'd7']);
  assert.deepEqual(played.map(move => [move.text, 'from' in move]), [['d1', false], ['d7', false]]);
});

test('the regular completes a mill, blocks one, and plays only legal moves within its budget', () => {
  const mill = morris.fromDiagram(['.......', '.......', '.......', '.......', '.......', '...b.b.', 'w..w...'], { turn: 'w', hand: { w: 7, b: 7 } });
  assert.match(chooseMove(mill).move, /^g1x/);
  const threat = morris.fromDiagram(['b..b...', '.......', '.......', '.......', '.......', '.......', 'w.....w'], { turn: 'w', hand: { w: 7, b: 7 } });
  assert.equal(chooseMove(threat).move, 'g7');
  let { state, keys } = morris.replay([]), slowest = 0;
  for (let ply = 0; ply < 24 && !morris.outcome(state, keys); ply++) {
    const started = Date.now(), choice = chooseMove(state, { budget: 8000, history: keys });
    slowest = Math.max(slowest, Date.now() - started);
    const move = morris.findMove(state, choice.move);
    assert.ok(move, `ply ${ply}: ${choice.move} is legal`);
    state = morris.makeMove(state, move); keys = [...keys, morris.positionKey(state)];
  }
  assert.ok(slowest < 3000, `each reply stays bounded (${slowest} ms)`);
});
