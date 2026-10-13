import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK, canPass, legalCards, passCards, passDirection, passTarget, playCard, points, replay, publicView, startHand, trickWinner } from '../src/hearts-rules.js';

// A hand in play from hand-made cards, for positions a seed would take long to find.
const inPlay = (hands, { turn = 0, trick = [], tricks = 1, heartsBroken = false } = {}) =>
  ({ seed: 0, hand: 0, direction: 'hold', hands, passed: [null, null, null, null], phase: 'play', turn, trick, tricks, taken: [[], [], [], []], heartsBroken, over: null });
const passAll = state => { for (let i = 0; i < 4; i++) state = passCards(state, state.hands[state.turn].slice(-3)); return state; };

test('a 52-card deck with 26 points: thirteen hearts and the queen of spades', () => {
  assert.equal(new Set(DECK).size, 52);
  assert.equal(DECK.reduce((sum, card) => sum + points(card), 0), 26);
  assert.equal(points('QS'), 13); assert.equal(points('AH'), 1); assert.equal(points('KS'), 0);
});

test('deals: thirteen each from a seed; passing goes left, right, across, then holds', () => {
  const state = startHand(9, 0);
  assert.deepEqual(state.hands.map(hand => hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(state.hands.flat()).size, 52);
  assert.deepEqual(startHand(9, 0).hands, state.hands, 'the same seed deals the same hands');
  assert.deepEqual([0, 1, 2, 3, 4].map(passDirection), ['left', 'right', 'across', 'hold', 'left']);
  assert.deepEqual(['left', 'right', 'across'].map(direction => passTarget(0, direction)), [1, 3, 2]);
  const held = startHand(9, 3);
  assert.equal(held.phase, 'play');
  assert.ok(held.hands[held.turn].includes('2C'), 'with no passing, the 2♣ holder leads at once');
});

test('passing: three of your own cards each, then the cards change hands and the 2♣ leads', () => {
  let state = startHand(4, 0);
  assert.equal(canPass(state, state.hands[0].slice(0, 2)), false);
  assert.equal(canPass(state, [state.hands[0][0], state.hands[0][0], state.hands[0][1]]), false);
  assert.equal(canPass(state, state.hands[1].slice(0, 3)), false, 'only your own cards');
  const given = state.hands[0].slice(-3);
  state = passAll(state);
  assert.equal(state.phase, 'play');
  assert.deepEqual(state.hands.map(hand => hand.length), [13, 13, 13, 13]);
  assert.ok(given.every(card => state.hands[1].includes(card)), 'the first hand passes to the left');
  assert.ok(state.hands[state.turn].includes('2C'));
  assert.deepEqual(legalCards(state), ['2C']);
});

test('follow suit; on the first trick a void hand may not throw points unless it must', () => {
  const first = inPlay([['3C', 'AD'], ['QS', 'AH', '5D'], ['KS', '9H'], ['2H', '3H']], { turn: 1, tricks: 0, trick: [{ player: 0, card: '2C' }] });
  assert.deepEqual(legalCards(first), ['5D'], 'void in clubs on the first trick: no heart and no Q♠ while a clean card remains');
  const forced = { ...first, turn: 3 };
  assert.deepEqual(legalCards(forced), ['2H', '3H'], 'a hand of only points may play them');
  const follow = inPlay([['3C', 'KC', 'AH']], { trick: [{ player: 3, card: '9C' }], turn: 0 });
  assert.deepEqual(legalCards(follow), ['3C', 'KC']);
});

test('hearts are not led until broken, unless a hand holds nothing else', () => {
  assert.deepEqual(legalCards(inPlay([['4H', '9D', 'KH']])), ['9D']);
  assert.deepEqual(legalCards(inPlay([['4H', 'KH']])), ['4H', 'KH']);
  assert.deepEqual(legalCards(inPlay([['4H', '9D']], { heartsBroken: true })), ['4H', '9D']);
});

test('the highest card of the suit led takes the trick and leads next', () => {
  assert.equal(trickWinner([{ player: 2, card: '9D' }, { player: 3, card: 'AS' }, { player: 0, card: 'KD' }, { player: 1, card: '2D' }]), 0);
  let state = inPlay([['9D', '2S'], ['AS', '3S'], ['KD', '4S'], ['2D', '5S']], { turn: 0 });
  for (const card of ['9D', 'AS', 'KD', '2D']) state = playCard(state, card);
  assert.equal(state.turn, 2, 'the K♦ takes it and leads');
  assert.deepEqual(state.taken[2].sort(), ['2D', '9D', 'AS', 'KD'].sort());
  assert.throws(() => playCard(state, 'AS'), /Illegal card/);
});

test('points, and shooting the moon', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let state = passAll(startHand(seed, 0));
    while (!state.over) state = playCard(state, legalCards(state)[0]);
    const total = state.over.points.reduce((sum, value) => sum + value, 0);
    assert.ok(total === 26 || (state.over.moon !== null && total === 78), `seed ${seed}: ${state.over.points}`);
    assert.equal(state.taken.flat().length, 52);
  }
  // One player takes every point card: 0 for them, 26 for the rest.
  const all = DECK.filter(card => points(card));
  const shoot = { ...inPlay([['2C'], ['3C'], ['4C'], ['5C']], { tricks: 12 }), taken: [all, [], [], DECK.filter(card => !points(card)).slice(0, 4)] };
  const done = ['2C', '3C', '4C', '5C'].reduce((state, card) => playCard(state, card), shoot);
  assert.deepEqual(done.over, { points: [0, 26, 26, 26], moon: 0 }, 'the 5♣ takes the last trick, but every point is player 0’s');
});

test('hands replay from seed and moves; a player sees what was played and who is void', () => {
  let state = startHand(21, 1);
  const moves = [];
  for (let i = 0; i < 4; i++) { const text = `pass:${state.hands[state.turn].slice(0, 3).join(',')}`; moves.push(text); state = passCards(state, text.slice(5).split(',')); }
  while (!state.over) { const card = legalCards(state).at(-1); moves.push(card); state = playCard(state, card); }
  const again = replay(21, 1, moves);
  assert.deepEqual(again.state, state);
  const view = publicView(again.state, again.played, 0);
  assert.equal(view.seen.length, 52);
  // Anyone who did not follow the suit led is known to be void in it.
  again.played.filter(move => !move.text.startsWith('pass:') && move.led && move.text[1] !== move.led)
    .forEach(move => assert.ok(view.voids[move.player].includes(move.led)));
});
