import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGRAMS, GUIDE, createGuideMemory, figureMarkup, guideGame, guideStep } from '../src/salon-guide-content.js';
import * as chess from '../src/chess-rules.js';
import * as checkers from '../src/checkers-rules.js';
import * as four from '../src/connect-four-rules.js';
import * as dominoes from '../src/dominoes-rules.js';
import * as hearts from '../src/hearts-rules.js';
import * as backgammon from '../src/backgammon-rules.js';

// The Salon Guide teaches the plaza table games. Its pictures are played on the real
// rules and its numbers come from the rules modules, so the book cannot drift from
// the games it describes.
const text = id => guideGame(id).pages.flatMap(page => [page.title, ...page.text]).join(' ');

test('every plaza table game has a guide of illustrated pages', () => {
  assert.deepEqual(GUIDE.map(game => game.id), ['chess', 'checkers', 'connectFour', 'dominoes', 'hearts', 'spades', 'backgammon', 'mancala']);
  for (const game of GUIDE) {
    assert.ok(game.pages.length >= 4, game.id);
    assert.equal(game.pages[0].title, 'Taking a seat', `${game.id} starts at the table`);
    assert.equal(game.pages.at(-1).title, 'At the table', `${game.id} ends with the keys`);
    for (const page of game.pages) {
      const markup = figureMarkup(page.figure, game);
      assert.ok(markup.length > 40, `${game.id}: ${page.title} has a figure`);
      if (markup.startsWith('<svg')) assert.match(markup, /role="img" aria-label="[^"]{20,}"/, `${game.id}: ${page.title} describes its picture`);
      assert.doesNotMatch(markup, /undefined|NaN/, `${game.id}: ${page.title}`);
    }
  }
});

test('the chess pictures are a real mate and a real knight move', () => {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let line = '', empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = DIAGRAMS.chessMate.pieces[`${'abcdefgh'[file]}${8 - row}`];
      if (piece) { line += (empty || '') + piece; empty = 0; } else empty++;
    }
    return line + (empty || '');
  }).join('/');
  assert.equal(chess.outcome(chess.fromFEN(`${placement} ${DIAGRAMS.chessMate.toMove} - - 0 1`)).reason, 'checkmate');
  const { from, targets } = DIAGRAMS.chessKnight;
  const moves = chess.legalMoves(chess.fromFEN('7k/8/8/8/3N4/8/8/K7 w - - 0 1')).filter(move => chess.squareName(move.from) === from);
  assert.deepEqual(moves.map(move => chess.squareName(move.to)).sort(), [...targets].sort());
  assert.match(text('chess'), /fifty moves/); assert.match(text('chess'), /three times/);
});

test('the checkers pictures are a compulsory double jump and a crowning that ends the move', () => {
  const diagram = ({ dark, light }) => checkers.fromDiagram(Array.from({ length: 8 }, (_, row) => [...'abcdefgh'].map(file => {
    const name = `${file}${8 - row}`;
    return dark.includes(name) ? 'd' : light.includes(name) ? 'l' : '.';
  }).join('')));
  const jump = DIAGRAMS.checkersJump, moves = checkers.legalMoves(diagram(jump));
  assert.ok(moves.length && moves.every(move => move.captures.length), 'captures are compulsory');
  assert.ok(moves.some(move => checkers.notation(move) === jump.path.join('x')), moves.map(checkers.notation).join(' '));
  const crown = DIAGRAMS.checkersCrown, state = diagram(crown);
  const step = checkers.legalMoves(state).find(move => checkers.notation(move) === `${crown.from}-${crown.to}`);
  assert.ok(step);
  assert.equal(checkers.makeMove(state, step).board[checkers.squareOf(crown.to)], 'D', 'the man is crowned');
  assert.equal(checkers.startPosition().turn, 'd'); assert.match(text('checkers'), /dark moves first/);
  assert.equal(checkers.DRAW_PLIES / 2, 40); assert.match(text('checkers'), /Forty moves each/);
});

test('the Connect Four pictures are a real diagonal win and a real drop', () => {
  const win = four.winningLine(four.fromDiagram(DIAGRAMS.fourWin.rows).board);
  assert.deepEqual(win.cells.map(four.cellName).sort(), [...DIAGRAMS.fourWin.line].sort());
  assert.equal(win.side, 'r');
  const drop = four.fromDiagram(DIAGRAMS.fourDrop.rows);
  assert.equal(drop.turn, 'r');
  assert.equal(four.cellName(four.dropCell(drop.board, DIAGRAMS.fourDrop.column)), DIAGRAMS.fourDrop.lands);
  assert.equal(four.startPosition().turn, 'r'); assert.match(text('connectFour'), /Red moves first/);
});

test('the dominoes pages match the set, the deal and the match', () => {
  const { line, hand } = DIAGRAMS.dominoesLine;
  line.slice(1).forEach(([left], index) => assert.equal(left, line[index][1], 'the line joins end to end'));
  assert.equal(hand[0], line.at(-1)[1], 'the tile in hand matches the open end');
  assert.equal(dominoes.TILES.length, 28); assert.match(text('dominoes'), /28 tiles/);
  assert.equal(dominoes.MATCH_POINTS, 100); assert.match(text('dominoes'), /100 points/);
  const two = dominoes.deal(7, 2), four_ = dominoes.deal(7, 4);
  assert.deepEqual([two.hands.map(cards => cards.length), two.boneyard.length > 0], [[7, 7], true]);
  assert.deepEqual([four_.hands.map(cards => cards.length), four_.boneyard.length], [[7, 7, 7, 7], 0]);
});

test('the hearts pages match the scoring, the passing and the trick', () => {
  for (const code of DIAGRAMS.heartsPoints) assert.equal(hearts.points(code), code === 'QS' ? 13 : 1, code);
  assert.equal(hearts.DECK.reduce((sum, code) => sum + hearts.points(code), 0), 26); assert.match(text('hearts'), /all 26 points/);
  assert.equal(hearts.GAME_POINTS, 100); assert.match(text('hearts'), /reaches 100/);
  assert.deepEqual([0, 1, 2, 3].map(hearts.passDirection), ['left', 'right', 'across', 'hold']);
  const trick = DIAGRAMS.heartsTrick.cards.map((card, player) => ({ card, player }));
  assert.equal(DIAGRAMS.heartsTrick.cards[hearts.trickWinner(trick)], DIAGRAMS.heartsTrick.winner);
});

test('the backgammon pictures are a legal opening and a real hit, with a closed point', () => {
  const opening = DIAGRAMS.backgammonOpening;
  let state = backgammon.fromPosition(opening.layout, { dice: opening.dice });
  assert.equal(backgammon.checkersOf(state, backgammon.WHITE), 15); assert.match(text('backgammon'), /fifteen/);
  for (const [from, to] of opening.moves) state = backgammon.move(state, { from, to });
  assert.equal(state.points[5], 2, 'both checkers made the five-point');
  const hit = DIAGRAMS.backgammonHit;
  const before = backgammon.fromPosition(hit.layout, { dice: hit.dice });
  assert.ok(!backgammon.legalMoves(before).some(step => step.to === hit.closed), 'a point held by two is closed');
  const after = backgammon.move(before, { from: hit.move[0], to: hit.move[1] });
  assert.equal(after.bar[backgammon.BLACK], 1, 'the blot goes to the bar');
});

test('the book pages through each game and on into the next', () => {
  assert.deepEqual(guideStep({ game: 0, page: 0 }, { type: 'next' }), { game: 0, page: 1 });
  assert.deepEqual(guideStep({ game: 0, page: GUIDE[0].pages.length - 1 }, { type: 'next' }), { game: 1, page: 0 });
  assert.deepEqual(guideStep({ game: 1, page: 0 }, { type: 'previous' }), { game: 0, page: GUIDE[0].pages.length - 1 });
  assert.deepEqual(guideStep({ game: 0, page: 0 }, { type: 'previous' }), { game: 0, page: 0 });
  const end = { game: GUIDE.length - 1, page: GUIDE.at(-1).pages.length - 1 };
  assert.deepEqual(guideStep(end, { type: 'next' }), end);
  assert.deepEqual(guideStep({ game: 2, page: 3 }, { type: 'game', game: 4 }), { game: 4, page: 0 });
  assert.deepEqual(guideStep({ game: 2, page: 0 }, { type: 'page', page: Infinity }), { game: 2, page: GUIDE[2].pages.length - 1 });
});

test('the guides a player has read are remembered, and storage failures are harmless', () => {
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const memory = createGuideMemory(storage);
  assert.equal(memory.has('chess'), false);
  memory.add('chess');
  assert.equal(createGuideMemory(storage).has('chess'), true, 'remembered on this device');
  const broken = { getItem() { throw new Error('private window'); }, setItem() { throw new Error('quota'); } };
  const forgetful = createGuideMemory(broken);
  assert.doesNotThrow(() => forgetful.add('hearts'));
  assert.equal(forgetful.has('hearts'), true, 'this visit still remembers');
  store.set('river-oaks-salon-guide-seen', '{not json'); assert.equal(createGuideMemory(storage).has('chess'), false);
});

test('the Spades pictures are a real trump and a real score', async () => {
  const { trickWinner, scoreHand } = await import('../src/spades-rules.js');
  const { cards, winner } = DIAGRAMS.spadesTrump;
  assert.equal(cards[trickWinner(cards.map((card, player) => ({ player, card })))], winner);
  const { bids, taken } = DIAGRAMS.spadesBids, [ours, theirs] = scoreHand(bids, taken);
  assert.deepEqual([ours.points, ours.bags], [71, 1], 'bid 7, took 8: 70 and a bag');
  assert.deepEqual(theirs.nils, [{ player: 3, made: true }]);
});

test('the mancala pictures follow the rules', async () => {
  const { sow, startGame } = await import('../src/mancala-rules.js');
  const sown = sow(startGame(), DIAGRAMS.mancalaSow.pit);
  assert.deepEqual(sown.last.path, [3, 4, 5, 6]); assert.equal(sown.last.again, true);
  const capture = sow({ ...startGame(), board: DIAGRAMS.mancalaCapture.board.slice() }, DIAGRAMS.mancalaCapture.pit);
  assert.equal(capture.last.captured, 8);
});
