// The plaza regular at cribbage. Discarding, it tries all fifteen ways to lay two
// cards in the crib and keeps the four whose show is worth most on average over
// every starter it might cut, adding the two cards' own worth to the crib when it
// deals and taking it away when it does not. In the play it lays the card that
// scores most now; failing that, one that does not leave the count at 5 or 21 (a
// ten-card makes 15 or 31) or invite a pair, and otherwise its lowest card.
import { DECK } from './hearts-rules.js';
import { legalMoves, playable, rank, runningCount, scorePlay, scoreShow, value } from './cribbage-rules.js';

// What two cards are worth together in a crib: a pair, or a fifteen.
const cribWorth = ([a, b]) => (rank(a) === rank(b) ? 2 : 0) + (value(a) + value(b) === 15 ? 2 : 0) + (value(a) === 5 ? 0.5 : 0) + (value(b) === 5 ? 0.5 : 0);

export function chooseDiscard(hand, dealing) {
  let best = null, bestValue = -Infinity;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
    const kept = hand.filter((_, i) => i !== a && i !== b), laid = [hand[a], hand[b]];
    const starters = DECK.filter(card => !hand.includes(card));
    const average = starters.reduce((sum, starter) => sum + scoreShow(kept, starter).total, 0) / starters.length;
    const worth = average + (dealing ? 1 : -1) * cribWorth(laid);
    if (worth > bestValue) { bestValue = worth; best = `discard:${hand[a]},${hand[b]}`; }
  }
  return best;
}

export function choosePlay(state) {
  if (state.phase === 'discard') return chooseDiscard(state.hands[state.turn], state.dealer === state.turn);
  if (state.phase === 'show') return 'next';
  const cards = playable(state, state.turn);
  if (!cards.length) return legalMoves(state)[0] ?? null;
  const total = runningCount(state);
  const rated = cards.map(card => {
    const points = scorePlay([...state.pile, card]).reduce((sum, part) => sum + part.points, 0), after = total + value(card);
    // Leaving 5 or 21 lets a ten make 15 or 31; laying a card the next player can pair invites 2.
    const risk = (after === 5 || after === 21 ? 2 : 0) + (after < 31 && after + value(card) <= 31 ? 0.5 : 0);
    return { card, score: points * 10 - risk - value(card) * 0.05 };
  });
  rated.sort((x, y) => y.score - x.score || rank(x.card) - rank(y.card));
  return rated[0].card;
}
