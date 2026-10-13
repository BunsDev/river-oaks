// The plaza regulars at Spades. They bid by counting sure and likely tricks (aces,
// guarded kings, high spades, long spades, and short side suits they can trump),
// and bid nil on a hand with nothing high in it. In play they read only what a
// player at the table could: their own hand, the trick, the bids, and the tricks
// each player has taken. They win cheaply while the partnership still needs tricks,
// duck once it has its bid (bags cost), cover a partner's nil, and keep their own.
import { rankOf, suitOf } from './hearts-rules.js';
import { legalCards, teamOf, trickWinner } from './spades-rules.js';

const A = rankOf('AS'), K = rankOf('KS'), Q = rankOf('QS');

export function chooseBid(hand) {
  const suits = { C: [], D: [], H: [], S: [] };
  for (const card of hand) suits[suitOf(card)].push(rankOf(card));
  const spades = suits.S;
  if (!spades.some(rank => rank >= rankOf('TS')) && !hand.some(card => rankOf(card) >= K) && spades.length <= 3) return 0;
  let tricks = 0;
  for (const rank of spades) tricks += rank === A ? 1 : rank === K ? (spades.length >= 2 ? 1 : 0.5) : rank === Q ? (spades.length >= 3 ? 1 : 0.4) : 0;
  tricks += Math.max(0, spades.length - 3);
  for (const suit of ['C', 'D', 'H']) {
    const ranks = suits[suit];
    if (ranks.includes(A)) tricks += 1;
    if (ranks.includes(K)) tricks += ranks.length >= 2 ? 0.8 : 0.3;
    // A void or singleton lets a spade ruff, if there are spades to spare.
    if (ranks.length <= 1 && spades.length >= 3) tricks += ranks.length === 0 ? 0.8 : 0.4;
  }
  return Math.max(1, Math.min(13, Math.round(tricks)));
}

// Lowest: side suits before spades (trumps are worth keeping), then by rank.
const cost = card => (suitOf(card) === 'S' ? 100 : 0) + rankOf(card);
const lowest = cards => cards.reduce((low, card) => cost(card) < cost(low) ? card : low);
const highest = cards => cards.reduce((high, card) => rankOf(card) > rankOf(high) ? card : high);
// Would this card, played now, take the trick so far?
const wins = (trick, player, card) => trickWinner([...trick, { player, card }]) === player;

export function choosePlay(state) {
  const player = state.turn, legal = legalCards(state), partner = (player + 2) % 4, team = teamOf(player);
  if (legal.length === 1) return legal[0];
  const nil = state.bids[player] === 0, partnerNil = state.bids[partner] === 0;
  const contract = [team, team + 2].reduce((sum, seat) => sum + (state.bids[seat] || 0), 0);
  const made = [team, team + 2].filter(seat => state.bids[seat] !== 0).reduce((sum, seat) => sum + state.taken[seat], 0);
  const need = contract - made;
  const winning = legal.filter(card => !state.trick.length || wins(state.trick, player, card));
  const losing = legal.filter(card => !winning.includes(card));
  const partnerWinning = state.trick.length && trickWinner(state.trick) === partner;
  const last = state.trick.length === 3;

  // Keeping one's own nil: the highest card that still loses, else the lowest.
  if (nil) return losing.length ? highest(losing) : lowest(legal);
  // Covering a partner's nil: take the trick when the partner might otherwise.
  if (partnerNil && state.trick.length && trickWinner(state.trick) === partner && winning.length) return lowest(winning);
  if (!state.trick.length) {
    // Leading: a high card of a side suit while tricks are needed, else something low.
    const sides = legal.filter(card => suitOf(card) !== 'S');
    if (need > 0) { const aces = legal.filter(card => rankOf(card) === A); if (aces.length) return aces[0]; }
    return lowest(sides.length ? sides : legal);
  }
  if (partnerWinning && !partnerNil) return lowest(losing.length ? losing : legal);
  if (need > 0 && winning.length) {
    // Win as cheaply as possible; in second or third seat, a winner that the rest may beat is still worth it.
    return last ? lowest(winning) : lowest(winning.filter(card => suitOf(card) === suitOf(state.trick[0].card)).length ? winning.filter(card => suitOf(card) === suitOf(state.trick[0].card)) : winning);
  }
  // The bid is made (or out of reach): duck with the highest card that still loses, to shed danger without a bag.
  return losing.length ? highest(losing) : lowest(legal);
}
