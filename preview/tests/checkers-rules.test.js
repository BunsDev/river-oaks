import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAW_PLIES, findMove, fromDiagram, legalMoves, makeMove, notation, outcome, perft, playable, replay, squareOf, startPosition } from '../src/checkers-rules.js';

test('perft from the opening matches the published English draughts counts', () => {
  // Aart Bik's checkers perft; captures compulsory, jump sequences counted as one move.
  const start = startPosition();
  [7, 49, 302, 1469, 7361, 36768].forEach((count, index) => assert.equal(perft(start, index + 1), count, `depth ${index + 1}`));
});

test('the opening: twelve men a side on the dark squares, dark to move', () => {
  const { board, turn } = startPosition();
  assert.equal(turn, 'd');
  assert.equal(board.filter(piece => piece === 'd').length, 12);
  assert.equal(board.filter(piece => piece === 'l').length, 12);
  assert.ok(board.every((piece, square) => !piece || playable(square)));
  assert.ok(playable(squareOf('a1')) && !playable(squareOf('h1')), 'a1 is a playing square, as in the plaza inlay');
  assert.deepEqual(legalMoves(startPosition()).map(notation).sort(), ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4']);
});

test('captures are compulsory and a jump sequence is finished', () => {
  // The dark man on b2 can jump c3, then e5: the only legal move is the whole double jump.
  const position = fromDiagram([
    '........',
    '........',
    '........',
    '....l...',
    '........',
    '..l.....',
    '.d......',
    '........',
  ]);
  const moves = legalMoves(position).map(notation);
  assert.deepEqual(moves, ['b2xd4xf6'], 'the man must take both pieces');
  const after = makeMove(position, findMove(position, 'b2xd4xf6'));
  assert.equal(after.board.filter(Boolean).join(''), 'd', 'both light men are removed');
});

test('a man crowned by a jump stops there; kings move both ways', () => {
  const crowning = fromDiagram([
    '........',
    '......l.',
    '.....d..',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  // The man on f6 jumps g7 to land on h8, is crowned, and the turn ends.
  const jump = legalMoves(crowning);
  assert.deepEqual(jump.map(notation), ['f6xh8']);
  assert.ok(jump[0].crowned);
  const crowned = makeMove(crowning, jump[0]);
  assert.equal(crowned.board[squareOf('h8')], 'D');
  const king = fromDiagram(['........', '........', '........', '....D...', '........', '........', '........', '........']);
  assert.deepEqual(legalMoves(king).map(notation).sort(), ['e5-d4', 'e5-d6', 'e5-f4', 'e5-f6']);
});

test('a side with no move loses; quiet king moves and repetition draw', () => {
  // The dark man on a1 is blocked by b2, and c3 behind it is held, so dark cannot move.
  const stuck = fromDiagram(['........', '........', '........', '........', '........', '..l.....', '.l......', 'd.......']);
  assert.deepEqual(outcome(stuck), { winner: 'l', reason: 'no moves left' });
  assert.deepEqual(outcome(fromDiagram(['........', '........', '........', '........', '........', '........', '........', '.......L'])), { winner: 'l', reason: 'no pieces left' });
  const kingRows = ['.D......', '........', '........', '........', '........', '........', '........', '......L.'];
  assert.equal(outcome(fromDiagram(kingRows, 'd', DRAW_PLIES)).reason, 'the forty-move rule');
  const shuffle = replay(['b8-a7', 'g1-h2', 'a7-b8', 'h2-g1', 'b8-a7', 'g1-h2', 'a7-b8', 'h2-g1'], fromDiagram(kingRows, 'd'));
  assert.equal(shuffle.outcome.reason, 'threefold repetition');
});

test('illegal moves are refused', () => {
  assert.throws(() => replay(['a3-a4']), /Illegal move a3-a4/);
  assert.throws(() => replay(['c3-d4', 'b6-c5', 'd4-e5']), /Illegal move d4-e5/, 'a capture was available, so a step is illegal');
});
