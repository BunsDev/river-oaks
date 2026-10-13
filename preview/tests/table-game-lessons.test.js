import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_GAMES } from '../src/table-game-adapters.js';
import { LESSONS, lessonAt } from '../src/table-game-lessons.js';
import { squareOf as chessSquareOf } from '../src/chess-rules.js';

// Every lesson, played through its game's real rules: each scripted move is legal for the
// side whose turn it is, you always play the first side, and the regular answers.
// Square names as the sheet reads them: 8×8 games use chess names unless they say otherwise.
const squareOf = (adapter, name) => (adapter.squareOf ?? chessSquareOf)(name);
const script = lesson => lesson.steps.flatMap(step => (step.reply ? [step.move, step.reply] : [step.move]));

test('every table game has a lesson, and nothing else does', () => {
  assert.deepEqual(Object.keys(LESSONS).sort(), Object.keys(TABLE_GAMES).sort());
});

for (const [kind, lesson] of Object.entries(LESSONS)) {
  const adapter = TABLE_GAMES[kind];
  test(`${kind}: the lesson replays move for move, alternating from the first side`, () => {
    const moves = script(lesson);
    assert.ok(lesson.steps.length >= 4 && lesson.steps.length <= 6, 'a short game');
    for (let ply = 0; ply < moves.length; ply++) {
      const { state, result } = adapter.replay(moves.slice(0, ply));
      assert.equal(result, null, `the game is still on before ${moves[ply]}`);
      // The player moves on even plies; no step passes a turn.
      assert.equal(adapter.turn(state), adapter.sides[ply % 2], `${moves[ply]} is played by ${adapter.sides[ply % 2]}`);
      assert.ok(adapter.moves(state).some(move => move.key === moves[ply]), `${moves[ply]} is legal at ply ${ply}`);
    }
    assert.equal(adapter.replay(moves).played.length, moves.length);
    for (const step of lesson.steps) assert.ok(step.say.length > 20 && step.say.length < 200, `${step.move} explains itself briefly`);
    assert.match(lesson.done, /Lesson done/);
  });
}

test('the lessons end where their captions say', () => {
  const end = kind => TABLE_GAMES[kind].replay(script(LESSONS[kind]));
  assert.deepEqual(end('chess').result, { winner: 'w', reason: 'checkmate' });
  assert.equal(end('connectFour').result.winner, 'r');
  assert.deepEqual(end('connectFour').result.cells.map(cell => TABLE_GAMES.connectFour.squareName(cell)), ['b1', 'c1', 'd1', 'e1']);
  // Checkers: a trade, then the shot takes two men for one, so dark is a man ahead.
  const checkers = end('checkers').state.board;
  assert.equal(checkers.filter(piece => piece?.toLowerCase() === 'd').length, 10);
  assert.equal(checkers.filter(piece => piece?.toLowerCase() === 'l').length, 9);
  // Reversi: the corner turned the whole diagonal.
  const reversi = TABLE_GAMES.reversi, board = end('reversi').state;
  for (const name of ['a1', 'b2', 'c3', 'd4', 'e5']) assert.equal(reversi.piece(board, squareOf(reversi, name)).side, 'd', `${name} is dark`);
  // Morris: the mill took a7 and the last placement blocks the regular's top line.
  const morris = TABLE_GAMES.morris, placed = end('morris').state;
  assert.equal(morris.piece(placed, squareOf(morris, 'a7')).side, 'w');
  assert.equal(morris.piece(placed, squareOf(morris, 'g7')).side, 'b');
});

test('the morris mill step chooses its take on the board', () => {
  const step = LESSONS.morris.steps.find(item => item.take);
  const moves = TABLE_GAMES.morris.moves(TABLE_GAMES.morris.replay(['a1', 'a7', 'd1', 'd7']).state);
  const closing = moves.filter(move => move.to === squareOf(TABLE_GAMES.morris, 'g1'));
  // More than one piece could be taken; the lesson names one of them.
  assert.ok(closing.length > 1 && closing.some(move => move.key === step.move));
});

test('lessonAt follows the script: the move it wants, the reply, done, or off the script', () => {
  const lesson = LESSONS.connectFour;
  assert.deepEqual(lessonAt(lesson, []), { index: 0, step: lesson.steps[0], next: 'd' });
  assert.deepEqual(lessonAt(lesson, ['d']), { index: 0, step: lesson.steps[0], reply: 'd' });
  assert.deepEqual(lessonAt(lesson, ['d', 'd']), { index: 1, step: lesson.steps[1], next: 'e' });
  assert.deepEqual(lessonAt(lesson, ['d', 'd', 'e', 'e', 'c', 'f']), { index: 3, step: lesson.steps[3], next: 'b' });
  assert.deepEqual(lessonAt(lesson, ['d', 'd', 'e', 'e', 'c', 'f', 'b']), { index: 4, done: true });
  assert.equal(lessonAt(lesson, ['a']), null);
  assert.equal(lessonAt(lesson, ['d', 'a']), null);
  assert.equal(lessonAt(lesson, ['d', 'd', 'e', 'e', 'c', 'f', 'b', 'a']), null);
  assert.equal(lessonAt(undefined, []), null);
});
