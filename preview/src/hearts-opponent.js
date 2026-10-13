// The plaza regulars at Hearts. A regular sees only a player's view: its hand, the
// trick, the cards already played, who has shown a void, and the points taken.
// It passes the cards most likely to cost it, ducks under the card winning the
// trick, saves the Q♠ for a trick another player is taking (ideally the A♠ or K♠),
// and sheds dangerous cards when it cannot follow. It never tries to shoot the moon.
// Deterministic: ties go to the card earlier in the deck's order.
import { publicView, rankOf, sortCards, suitOf } from './hearts-rules.js';

const HIGH_SPADES = ['AS', 'KS'];
const deckOrder = (a, b) => sortCards([a, b])[0] === a ? -1 : 1;
const highest = cards => cards.slice().sort((a, b) => rankOf(b) - rankOf(a) || deckOrder(a, b))[0];
const lowest = cards => cards.slice().sort((a, b) => rankOf(a) - rankOf(b) || deckOrder(a, b))[0];

// Three cards to pass: the most dangerous by a simple count.
export function choosePass(hand) {
  const count = suit => hand.filter(card => suitOf(card) === suit).length;
  const lowSpades = hand.filter(card => suitOf(card) === 'S' && rankOf(card) < rankOf('QS')).length, hasQueen = hand.includes('QS');
  const danger = card => {
    if (card === 'QS') return lowSpades < 4 ? 100 : 5;
    // The A♠ and K♠ catch the queen: dangerous without her, or when she is being passed on too.
    if (HIGH_SPADES.includes(card)) return (!hasQueen || lowSpades < 4) && lowSpades < 3 ? 80 : 10;
    if (suitOf(card) === 'H') return 30 + rankOf(card);
    return rankOf(card) * 2 + (count(suitOf(card)) <= 2 ? 20 : 0);
  };
  return hand.slice().sort((a, b) => danger(b) - danger(a) || deckOrder(a, b)).slice(0, 3);
}

export function choosePlay(state, played, legal) {
  if (legal.length === 1) return legal[0];
  const view = publicView(state, played, state.turn), queenOut = view.seen.includes('QS') || state.trick.some(play => play.card === 'QS');
  if (!state.trick.length) {
    // Lead low from a safe suit: never the Q♠, and no high spade while the queen is out there.
    const safe = legal.filter(card => card !== 'QS' && (queenOut || !HIGH_SPADES.includes(card)));
    const plain = safe.filter(card => suitOf(card) !== 'H');
    return lowest(plain.length ? plain : safe.length ? safe : legal);
  }
  const led = suitOf(state.trick[0].card);
  const winning = state.trick.filter(play => suitOf(play.card) === led).reduce((best, play) => rankOf(play.card) > rankOf(best.card) ? play : best).card;
  const trickPoints = state.trick.some(play => suitOf(play.card) === 'H' || play.card === 'QS'), last = state.trick.length === 3;
  if (suitOf(legal[0]) === led) {
    // Spades led and a higher spade is already winning: the queen goes to them.
    if (led === 'S' && legal.includes('QS') && rankOf(winning) > rankOf('QS')) return 'QS';
    const under = legal.filter(card => rankOf(card) < rankOf(winning) && card !== 'QS');
    if (under.length) return highest(under);
    // Must take it: last to play on a clean trick, take it with the highest; otherwise as cheaply as possible.
    const clean = legal.filter(card => card !== 'QS');
    if (last && !trickPoints) return highest(clean.length ? clean : legal);
    return lowest(clean.length ? clean : legal);
  }
  // Cannot follow: shed the queen, then high spades while she is out, then the highest heart, then the highest card.
  if (legal.includes('QS')) return 'QS';
  const spades = legal.filter(card => HIGH_SPADES.includes(card));
  if (!queenOut && spades.length) return highest(spades);
  const hearts = legal.filter(card => suitOf(card) === 'H');
  if (hearts.length) return highest(hearts);
  return highest(legal);
}
