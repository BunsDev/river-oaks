import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_POINTS, legalMoves, play, replay, scorePlay, scoreShow, startGame } from '../src/cribbage-rules.js';
import { chooseDiscard, choosePlay } from '../src/cribbage-opponent.js';

const total = (hand, starter, crib) => scoreShow(hand, starter, crib).total;
const parts = pile => scorePlay(pile).map(part => `${part.kind}:${part.points}`);

test('the show: fifteens, pairs, runs (doubled), flushes and nobs', () => {
  assert.equal(total(['5H', '5D', '5S', 'JC'], '5C'), 29, 'the perfect hand');
  assert.equal(total(['7H', '8H', '8C', '9S'], '7C'), 24, 'a double-double run: 8 in fifteens, 4 in pairs, 12 in runs');
  assert.equal(total(['AH', '2C', '3D', 'KS'], '9H'), 7, 'a run of three, 2+3+K and A+2+3+9');
  const flush = ['2H', '4H', '6H', '8H'];
  assert.ok(scoreShow(flush, 'KC').parts.some(part => part.kind === 'flush' && part.points === 4), 'four of a suit in the hand');
  assert.ok(!scoreShow(flush, 'KC', true).parts.some(part => part.kind === 'flush'), 'the crib needs all five');
  assert.ok(scoreShow(flush, 'QH', true).parts.some(part => part.kind === 'flush' && part.points === 5));
  assert.equal(total(['JD', '3C', '7S', '9H'], '4D'), 1, 'nobs: the jack of the starter’s suit, and nothing else');
  assert.equal(total(['2C', '4D', '6S', '8H'], 'QC'), 0, 'nineteen: a hand of nothing');
});

test('the play: fifteen, thirty-one, pairs and runs as the cards fall', () => {
  assert.deepEqual(parts(['5H', 'TC']), ['fifteen:2']);
  assert.deepEqual(parts(['7H', '7C']), ['pair:2']);
  assert.deepEqual(parts(['7H', '7C', '7D']), ['pair royal:6']);
  assert.deepEqual(parts(['4H', '6C', '5D']), ['fifteen:2', 'run:3']);
  assert.deepEqual(parts(['KH', 'QH', 'TC', 'AS']), ['thirty-one:2']);
  assert.deepEqual(parts(['3H', '4C', '3D']), [], 'a run must be the last cards together');
});

test('a hand runs through discards, the cut, the play and the show, and the deal alternates', () => {
  let state = startGame(7, 0);
  assert.equal(state.phase, 'discard'); assert.deepEqual(state.hands.map(hand => hand.length), [6, 6]);
  assert.equal(state.turn, 1, 'the non-dealer discards first');
  while (state.phase === 'discard') state = play(state, chooseDiscard(state.hands[state.turn], state.turn === state.dealer));
  assert.equal(state.crib.length, 4); assert.ok(state.starter);
  let guard = 0;
  while (state.phase === 'play' && guard++ < 40) state = play(state, choosePlay(state));
  assert.ok(['show', 'over'].includes(state.phase));
  if (state.phase === 'show') {
    assert.deepEqual(state.show.map(part => [part.player, part.crib]), [[1, false], [0, false], [0, true]], 'pone, dealer, then the crib');
    state = play(state, 'next');
    assert.equal(state.dealer, 1, 'the deal passes'); assert.equal(state.phase, 'discard');
  }
});

test('his heels: a jack cut as the starter scores the dealer two', () => {
  for (let seed = 1; seed < 400; seed++) {
    let state = startGame(seed, 0);
    if (state.starterCard[0] !== 'J') continue;
    while (state.phase === 'discard') state = play(state, legalMoves(state)[0]);
    assert.ok(state.events.some(event => event.reason === 'his heels' && event.player === 0 && event.points === 2) || state.scores[0] >= 2);
    return;
  }
  assert.fail('no seed cut a jack');
});

test('whole games: the regulars reach 121, every move legal, and games replay exactly', () => {
  for (const seed of [1, 2, 3, 123_456_789, 2 ** 32 - 1]) {
    let state = startGame(seed, seed % 2), moves = [];
    for (let guard = 0; guard < 3000 && state.winner === null; guard++) {
      const move = choosePlay(state);
      assert.ok(legalMoves(state).includes(move), `seed ${seed}: ${move}`);
      moves.push(move); state = play(state, move);
    }
    assert.notEqual(state.winner, null, `seed ${seed} ends`);
    assert.ok(state.scores[state.winner] >= GAME_POINTS && state.scores[1 - state.winner] < GAME_POINTS);
    assert.deepEqual(replay(seed, moves, seed % 2).state.scores, state.scores);
  }
});

test('the regular keeps a strong hand and lays the scoring card', () => {
  // Keeping 5 5 5 J beats anything else in this six.
  const choice = chooseDiscard(['5H', '5D', '5S', 'JC', '2C', '9D'], false);
  assert.equal(choice, 'discard:2C,9D');
  const state = { ...startGame(1), phase: 'play', turn: 0, dealer: 1, kept: [['TH', '2C', '3D', '9S'], ['AS', 'AH', 'AC', 'AD']], played: [[], []], pile: ['5D'], lastPlayer: 1, said: [false, false] };
  assert.equal(choosePlay(state), 'TH', 'ten on five makes fifteen');
});
