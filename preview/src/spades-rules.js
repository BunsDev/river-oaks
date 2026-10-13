// Spades at the plaza café table: four players in two partnerships, you (0) with the
// player across (2) against the players on your left (1) and right (3). Thirteen
// cards each. Starting left of the dealer, each player bids the tricks they expect to
// take; a bid of 0 is nil. Play moves left from the same player. Players follow suit
// when they can; spades are trumps, and may not be led until one has been played
// unless a hand holds only spades. The highest spade, or else the highest card of the
// suit led, takes the trick and leads the next.
//
// A partnership that takes at least its combined bid scores 10 a trick bid and 1 a
// trick over (a "bag"); every tenth bag costs 100. Short of its bid it loses 10 a
// trick bid. A nil scores 100 if its bidder takes no trick and loses 100 if they take
// any; a nil bidder's tricks count as bags, never toward the partner's bid. The first
// partnership to 500 wins (the higher if both), and one that falls to -200 loses.
//
// Cards as in Hearts ('2C', 'TH', 'AS'). A hand comes from a seed and its dealer and
// replays exactly from its moves ('bid:4', '7S'). Pure and dependency-free.
import { DECK, rankOf, sortCards, suitOf } from './hearts-rules.js';
import { shuffled } from './seeded-random.js';

export const GAME_POINTS = 500, LOSING_POINTS = -200, BAG_LIMIT = 10, BAG_PENALTY = 100;
export const teamOf = player => player % 2;

export function startHand(seed, dealer = 3) {
  const deck = shuffled(DECK, seed), hands = [0, 1, 2, 3].map(player => sortCards(deck.slice(player * 13, player * 13 + 13)));
  return { seed, dealer, hands, bids: [null, null, null, null], phase: 'bid', turn: (dealer + 1) % 4, trick: [], tricks: 0, taken: [0, 0, 0, 0], spadesBroken: false, lastTrick: null, over: null };
}

export function placeBid(state, value) {
  if (state.phase !== 'bid' || !Number.isInteger(value) || value < 0 || value > 13) throw new Error(`Illegal bid ${value}`);
  const bids = state.bids.slice(); bids[state.turn] = value;
  const done = bids.every(item => item !== null);
  return { ...state, bids, phase: done ? 'play' : 'bid', turn: (state.turn + 1) % 4 };
}

export function legalCards(state) {
  if (state.phase !== 'play' || state.over) return [];
  const hand = state.hands[state.turn];
  if (!state.trick.length) {
    if (state.spadesBroken) return hand.slice();
    const others = hand.filter(card => suitOf(card) !== 'S');
    return others.length ? others : hand.slice();
  }
  const led = suitOf(state.trick[0].card), follow = hand.filter(card => suitOf(card) === led);
  return follow.length ? follow : hand.slice();
}

// The card that takes a full (or partial) trick: the highest spade, else the highest of the suit led.
export function trickWinner(trick) {
  const led = suitOf(trick[0].card), trumps = trick.filter(play => suitOf(play.card) === 'S');
  const field = trumps.length ? trumps : trick.filter(play => suitOf(play.card) === led);
  return field.reduce((best, play) => rankOf(play.card) > rankOf(best.card) ? play : best).player;
}

export function playCard(state, card) {
  if (!legalCards(state).includes(card)) throw new Error(`Illegal card ${card}`);
  const hands = state.hands.map(hand => hand.slice());
  hands[state.turn] = hands[state.turn].filter(held => held !== card);
  const trick = [...state.trick, { player: state.turn, card }], spadesBroken = state.spadesBroken || suitOf(card) === 'S';
  if (trick.length < 4) return { ...state, hands, trick, spadesBroken, turn: (state.turn + 1) % 4 };
  const winner = trickWinner(trick), taken = state.taken.slice(), tricks = state.tricks + 1;
  taken[winner] += 1;
  const next = { ...state, hands, trick: [], lastTrick: trick, spadesBroken, turn: winner, taken, tricks };
  return tricks < 13 ? next : { ...next, over: scoreHand(state.bids, taken) };
}

// A finished hand's points and bags for each partnership, and how each nil fared.
export function scoreHand(bids, taken) {
  return [0, 1].map(team => {
    const players = [team, team + 2], nils = players.filter(player => bids[player] === 0);
    const contract = players.reduce((sum, player) => sum + (bids[player] || 0), 0);
    const made = players.filter(player => bids[player] !== 0).reduce((sum, player) => sum + taken[player], 0);
    let points = 0, bags = nils.reduce((sum, player) => sum + taken[player], 0);
    if (contract > 0) {
      if (made >= contract) { points += 10 * contract; bags += made - contract; } else points -= 10 * contract;
    } else bags += made;
    const nilResults = nils.map(player => ({ player, made: taken[player] === 0 }));
    for (const nil of nilResults) points += nil.made ? 100 : -100;
    return { points: points + bags, bags, contract, made, set: contract > 0 && made < contract, nils: nilResults };
  });
}

// Adds a hand to the running game: points, bags carried, and a hundred off per ten bags.
export function addHand(totals, hand) {
  return totals.map((team, index) => {
    let score = team.score + hand[index].points, bags = team.bags + hand[index].bags;
    while (bags >= BAG_LIMIT) { bags -= BAG_LIMIT; score -= BAG_PENALTY; }
    return { score, bags };
  });
}
export function gameWinner(totals) {
  const [a, b] = totals.map(team => team.score);
  if (a <= LOSING_POINTS || b <= LOSING_POINTS) return a <= LOSING_POINTS && b <= LOSING_POINTS ? (a === b ? null : a > b ? 0 : 1) : a <= LOSING_POINTS ? 1 : 0;
  if (Math.max(a, b) < GAME_POINTS || a === b) return null;
  return a > b ? 0 : 1;
}

export function applyMove(state, text) {
  if (text.startsWith('bid:')) return placeBid(state, Number(text.slice(4)));
  return playCard(state, text);
}
export function replay(seed, dealer, moves = []) {
  let state = startHand(seed, dealer);
  const played = [];
  for (const text of moves) {
    played.push({ text, player: state.turn, led: state.trick[0] ? suitOf(state.trick[0].card) : null });
    state = applyMove(state, text);
  }
  return { state, played };
}
