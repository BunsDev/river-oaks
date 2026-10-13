import test from 'node:test';
import assert from 'node:assert/strict';
import { legalCards, passCards, playCard, startHand } from '../src/hearts-rules.js';
import { choosePass, choosePlay } from '../src/hearts-opponent.js';

const inPlay = (hands, { turn = 0, trick = [], tricks = 2, heartsBroken = true } = {}) =>
  ({ seed: 0, hand: 0, direction: 'hold', hands, passed: [null, null, null, null], phase: 'play', turn, trick, tricks, taken: [[], [], [], []], heartsBroken, over: null });
const play = (state, played = []) => choosePlay(state, played, legalCards(state));

test('a regular passes the queen and high spades when short in spades, else high hearts', () => {
  assert.deepEqual(choosePass(['QS', 'KS', 'AS', '2C', '3C', '4D', '5D', '6D', '7D', '8H', '9H', 'TH', '2H']).sort(), ['AS', 'KS', 'QS']);
  // With plenty of low spades the queen is safe; the high hearts go instead.
  assert.deepEqual(choosePass(['QS', '2S', '3S', '4S', '5S', '2C', '3C', '4C', '5D', '6D', 'AH', 'KH', 'QH']).sort(), ['AH', 'KH', 'QH']);
});

test('a regular ducks under the winning card and dumps the queen on a higher spade', () => {
  const duck = inPlay([['3D', '8D', 'KD', '2C']], { trick: [{ player: 3, card: '9D' }] });
  assert.equal(play(duck), '8D', 'the highest card that still loses');
  const dump = inPlay([['QS', '4S', '7D']], { trick: [{ player: 3, card: 'AS' }] });
  assert.equal(play(dump), 'QS');
  const take = inPlay([['QD', 'KD']], { trick: [{ player: 1, card: '2D' }, { player: 2, card: '3D' }, { player: 3, card: '4D' }] });
  assert.equal(play(take), 'KD', 'last on a clean trick, it takes with the highest');
});

test('void in the suit led, a regular sheds the queen, then high spades, then hearts', () => {
  assert.equal(play(inPlay([['QS', 'AH', '2C']], { trick: [{ player: 3, card: '5D' }] })), 'QS');
  assert.equal(play(inPlay([['KS', 'AH', '2C']], { trick: [{ player: 3, card: '5D' }] })), 'KS', 'the queen is still out');
  assert.equal(play(inPlay([['3H', 'AH', '2C']], { trick: [{ player: 3, card: '5D' }] })), 'AH');
});

test('a regular never leads the queen or a high spade while the queen is out', () => {
  const lead = play(inPlay([['QS', 'AS', '9D', '4C']]));
  assert.equal(lead, '4C');
});

test('whole hands: every choice is legal and repeatable', () => {
  for (let seed = 1; seed <= 25; seed++) {
    let state = startHand(seed, seed % 4);
    const played = [];
    while (state.phase === 'pass') { const cards = choosePass(state.hands[state.turn]); played.push({ text: `pass:${cards.join(',')}` }); state = passCards(state, cards); }
    while (!state.over) {
      const legal = legalCards(state), card = choosePlay(state, played, legal);
      assert.ok(legal.includes(card)); assert.equal(choosePlay(state, played, legal), card);
      played.push({ text: card, player: state.turn, led: state.trick[0]?.card[1] ?? null });
      state = playCard(state, card);
    }
  }
});
