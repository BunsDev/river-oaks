import test from 'node:test';
import assert from 'node:assert/strict';
import { addHand, gameWinner, legalCards, placeBid, playCard, replay, scoreHand, startHand, trickWinner } from '../src/spades-rules.js';
import { chooseBid, choosePlay } from '../src/spades-opponent.js';

test('a deal: thirteen cards each, bidding from the dealer’s left, then play from the same seat', () => {
  let state = startHand(5, 3);
  assert.deepEqual(state.hands.map(hand => hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(state.hands.flat()).size, 52);
  assert.equal(state.phase, 'bid'); assert.equal(state.turn, 0);
  for (const value of [3, 0, 4, 2]) state = placeBid(state, value);
  assert.equal(state.phase, 'play'); assert.equal(state.turn, 0); assert.deepEqual(state.bids, [3, 0, 4, 2]);
  assert.throws(() => placeBid(state, 2), /Illegal bid/);
  assert.throws(() => placeBid(startHand(5), 14), /Illegal bid/);
});

test('spades may not be led until broken, unless a hand holds only spades; follow suit when you can', () => {
  const base = { ...startHand(1), phase: 'play', bids: [1, 1, 1, 1], turn: 0 };
  const state = { ...base, hands: [['2S', '9S', '4H'], ['3H'], ['5H'], ['6H']] };
  assert.deepEqual(legalCards(state), ['4H']);
  assert.deepEqual(legalCards({ ...state, hands: [['2S', '9S'], ['3H'], ['5H'], ['6H']] }), ['2S', '9S'], 'only spades: lead one');
  assert.deepEqual(legalCards({ ...state, spadesBroken: true }), ['2S', '9S', '4H']);
  const following = { ...state, trick: [{ player: 3, card: 'KH' }] };
  assert.deepEqual(legalCards(following), ['4H']);
  assert.deepEqual(legalCards({ ...following, trick: [{ player: 3, card: 'KD' }] }), ['2S', '9S', '4H'], 'void in the suit led: anything');
});

test('the highest spade takes the trick, else the highest of the suit led', () => {
  assert.equal(trickWinner([{ player: 0, card: 'KH' }, { player: 1, card: 'AH' }, { player: 2, card: '2S' }, { player: 3, card: 'QH' }]), 2);
  assert.equal(trickWinner([{ player: 0, card: 'KH' }, { player: 1, card: 'AD' }, { player: 2, card: '9H' }, { player: 3, card: 'QH' }]), 0);
  const end = playCard(playCard(playCard(playCard({ ...startHand(1), phase: 'play', bids: [1, 1, 1, 1], turn: 0, hands: [['KH', '2C'], ['AH', '3C'], ['2S', '4C'], ['QH', '5C']] }, 'KH'), 'AH'), '2S'), 'QH');
  assert.equal(end.turn, 2, 'the taker leads'); assert.deepEqual(end.taken, [0, 0, 1, 0]); assert.equal(end.spadesBroken, true);
});

test('scoring: bids made with bags, a set, nils made and failed, and ten bags cost a hundred', () => {
  // Team 0 bid 3 + 4, took 9: 70 and 2 bags. Team 1 bid 2 + nil; the nil took 1 (failed, a bag), partner took 1 of 2 (set).
  const [ours, theirs] = scoreHand([3, 2, 4, 0], [5, 1, 4, 1]);
  assert.deepEqual([ours.points, ours.bags, ours.set], [72, 2, false]);
  assert.deepEqual([theirs.points, theirs.bags, theirs.set], [-20 - 100 + 1, 1, true]);
  const [, nil] = scoreHand([4, 3, 4, 0], [5, 4, 4, 0]);
  assert.deepEqual([nil.points, nil.nils], [30 + 1 + 100, [{ player: 3, made: true }]]);
  let totals = [{ score: 100, bags: 8 }, { score: 0, bags: 0 }];
  totals = addHand(totals, [{ points: 63, bags: 3 }, { points: 40, bags: 0 }]);
  assert.deepEqual(totals, [{ score: 63, bags: 1 }, { score: 40, bags: 0 }], 'the tenth bag costs 100');
  assert.equal(gameWinner([{ score: 510 }, { score: 480 }]), 0);
  assert.equal(gameWinner([{ score: 300 }, { score: -210 }]), 0, 'falling to -200 loses');
  assert.equal(gameWinner([{ score: 499 }, { score: 120 }]), null);
});

test('the regulars bid sensibly and always play legal cards; hands replay exactly', () => {
  assert.equal(chooseBid(['2C', '3C', '4C', '5C', '2D', '3D', '4D', '6D', '2H', '3H', '5H', '7H', '3S']), 0, 'nothing high: nil');
  assert.ok(chooseBid(['AS', 'KS', 'QS', 'JS', '9S', 'AH', 'KH', 'AD', '2D', 'AC', '3C', '4C', '5H']) >= 8, 'a strong hand bids high');
  for (const seed of [1, 2, 3, 11, 123_456_789, 2 ** 32 - 1]) {
    let state = startHand(seed, seed % 4);
    const moves = [];
    while (state.phase === 'bid') { const value = chooseBid(state.hands[state.turn]); moves.push(`bid:${value}`); state = placeBid(state, value); }
    while (!state.over) {
      const card = choosePlay(state);
      assert.ok(legalCards(state).includes(card), `seed ${seed}: ${card} is legal`);
      assert.equal(choosePlay(state), card, 'deterministic');
      moves.push(card); state = playCard(state, card);
    }
    assert.equal(state.taken.reduce((sum, n) => sum + n, 0), 13);
    assert.deepEqual(replay(seed, seed % 4, moves).state.over, state.over);
  }
});

test('a regular keeps its own nil, ducking under the trick when it can', () => {
  const state = { ...startHand(1), phase: 'play', bids: [3, 0, 3, 3], turn: 1, trick: [{ player: 0, card: '9H' }], hands: [[], ['KH', '8H', '2C'], ['3D'], ['4D']] };
  assert.equal(choosePlay(state), '8H', 'the highest heart that still loses');
});
