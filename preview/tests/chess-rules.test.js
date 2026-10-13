import test from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN, findMove, fromFEN, legalMoves, makeMove, outcome, perft, positionKey, replay, san, squareOf, toFEN } from '../src/chess-rules.js';

// Published perft counts (chessprogramming.org "Perft Results"); they pin every
// move rule at once, including castling through check, en passant pins and promotion.
const PERFT = [
  ['start', START_FEN, [20, 400, 8902]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
  ['en passant pins', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
  ['promotions and castling', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264]],
  ['discovered checks', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
];
for (const [name, fen, counts] of PERFT) {
  test(`perft matches the published counts: ${name}`, () => {
    const state = fromFEN(fen);
    counts.forEach((count, index) => assert.equal(perft(state, index + 1), count, `depth ${index + 1}`));
  });
}

test('FEN round-trips, including castling rights and the en passant square', () => {
  for (const [, fen] of PERFT) assert.equal(toFEN(fromFEN(fen)), fen);
  const { state } = replay(['e2e4', 'c7c5']);
  assert.equal(toFEN(state), 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2');
});

test('castling moves the rook and is refused through an attacked square', () => {
  const open = fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(toFEN(makeMove(open, findMove(open, 'e1g1'))).split(' ').slice(0, 3).join(' '), 'r3k2r/8/8/8/8/8/8/R4RK1 b kq');
  const guarded = fromFEN('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
  assert.equal(findMove(guarded, 'e1g1'), null, 'f1 is attacked, so the king cannot pass it');
  assert.ok(findMove(guarded, 'e1c1'));
});

test('en passant captures the passed pawn and promotion offers all four pieces', () => {
  const { state } = replay(['e2e4', 'a7a6', 'e4e5', 'd7d5']);
  const capture = findMove(state, 'e5d6');
  assert.ok(capture?.enPassant);
  assert.equal(makeMove(state, capture).board[squareOf('d5')], '');
  const promoting = fromFEN('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  assert.deepEqual(legalMoves(promoting).filter(move => move.from === squareOf('a7')).map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
});

test('the game ends by mate, stalemate, the fifty-move rule, repetition or bare kings', () => {
  assert.deepEqual(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']).outcome, { result: '0-1', reason: 'checkmate' });
  assert.equal(outcome(fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason, 'stalemate');
  assert.equal(outcome(fromFEN('7k/8/6K1/8/8/8/8/R7 w - - 100 80')).reason, 'fifty-move rule');
  assert.equal(replay(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']).outcome.reason, 'threefold repetition');
  assert.equal(outcome(fromFEN('7k/8/6K1/8/8/8/8/2B5 w - - 0 1')).reason, 'insufficient material');
  assert.equal(outcome(fromFEN('7k/8/6K1/8/8/8/8/2B2B2 w - - 0 1')), null, 'bishops on both colours can still mate');
});

test('SAN names captures, checks, mates, castling, promotion and ambiguous knights', () => {
  assert.deepEqual(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']).played.map(move => move.san), ['f3', 'e5', 'g4', 'Qh4#']);
  const knights = fromFEN('7k/8/8/8/8/8/8/1N3N1K w - - 0 1');
  assert.equal(san(knights, findMove(knights, 'b1d2')), 'Nbd2');
  const castle = fromFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(san(castle, findMove(castle, 'e1g1')), 'O-O');
  const promote = fromFEN('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(san(promote, findMove(promote, 'a7a8q')), 'a8=Q+');
});

test('illegal moves and malformed positions are refused', () => {
  assert.throws(() => replay(['e2e5']), /Illegal move e2e5/);
  assert.throws(() => fromFEN('8/8/8 w - - 0 1'), /eight ranks/);
  assert.equal(positionKey(fromFEN(START_FEN)), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
});
