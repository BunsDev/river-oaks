// Hearts at the plaza café table: four players, thirteen cards each. Before a hand
// each player passes three cards: left, then right, then across, and every fourth
// hand nobody passes. The 2♣ leads the first trick, and players follow suit when
// they can. Nobody may play points on the first trick (a heart or the Q♠) unless
// their hand holds nothing else. Hearts may not be led until one has been played,
// unless a hand holds only hearts. The highest card of the suit led takes the
// trick and leads the next. Each heart scores 1 and the Q♠ 13. Taking all 26
// "shoots the moon": the shooter scores 0 and everyone else 26. The game ends
// when someone reaches 100, and the lowest score wins.
//
// Players sit 0–3 and play moves left, to (p + 1) % 4. Cards are rank then suit:
// '2C', 'TH', 'QS'. A hand comes from a seed and its number, and replays exactly
// from them and its moves. Pure and dependency-free, like the other table games.
import { shuffled } from './seeded-random.js';

export const SUITS = ['C', 'D', 'S', 'H'], RANKS = '23456789TJQKA', GAME_POINTS = 100;
export const DECK = SUITS.flatMap(suit => [...RANKS].map(rank => rank + suit));
export const rankOf = card => RANKS.indexOf(card[0]);
export const suitOf = card => card[1];
export const points = card => suitOf(card) === 'H' ? 1 : card === 'QS' ? 13 : 0;
export const passDirection = hand => ['left', 'right', 'across', 'hold'][hand % 4];
export const passTarget = (player, direction) => (player + { left: 1, right: 3, across: 2 }[direction]) % 4;
const order = (a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankOf(a) - rankOf(b);
export const sortCards = cards => cards.slice().sort(order);

const holderOf = (hands, card) => hands.findIndex(hand => hand.includes(card));

export function startHand(seed, hand = 0) {
  const deck = shuffled(DECK, seed), hands = [0, 1, 2, 3].map(player => sortCards(deck.slice(player * 13, player * 13 + 13)));
  const direction = passDirection(hand), passing = direction !== 'hold';
  return { seed, hand, direction, hands, passed: [null, null, null, null], phase: passing ? 'pass' : 'play',
    turn: passing ? 0 : holderOf(hands, '2C'), trick: [], tricks: 0, taken: [[], [], [], []], heartsBroken: false, over: null };
}

// Passing: each player in turn sets aside three cards; when all four have, they change hands.
export function canPass(state, cards) {
  return state.phase === 'pass' && cards.length === 3 && new Set(cards).size === 3 && cards.every(card => state.hands[state.turn].includes(card));
}
export function passCards(state, cards) {
  if (!canPass(state, cards)) throw new Error('Pass three of your own cards');
  const passed = state.passed.slice(); passed[state.turn] = sortCards(cards);
  if (state.turn < 3) return { ...state, passed, turn: state.turn + 1 };
  const hands = state.hands.map((hand, player) => hand.filter(card => !passed[player].includes(card)));
  passed.forEach((cards, player) => hands[passTarget(player, state.direction)].push(...cards));
  const sorted = hands.map(sortCards);
  return { ...state, passed, hands: sorted, phase: 'play', turn: holderOf(sorted, '2C') };
}

export function legalCards(state) {
  if (state.phase !== 'play' || state.over) return [];
  const hand = state.hands[state.turn], first = state.tricks === 0;
  if (!state.trick.length) {
    if (first) return ['2C'];
    if (state.heartsBroken) return hand.slice();
    const safe = hand.filter(card => suitOf(card) !== 'H');
    return safe.length ? safe : hand.slice();
  }
  const led = suitOf(state.trick[0].card), follow = hand.filter(card => suitOf(card) === led);
  if (follow.length) return follow;
  if (first) { const clean = hand.filter(card => !points(card)); return clean.length ? clean : hand.slice(); }
  return hand.slice();
}

// Which card of a full trick takes it: the highest of the suit led.
export const trickWinner = trick => trick.reduce((best, play) => suitOf(play.card) === suitOf(trick[0].card) && rankOf(play.card) > rankOf(best.card) ? play : best).player;

export function playCard(state, card) {
  if (!legalCards(state).includes(card)) throw new Error(`Illegal card ${card}`);
  const hands = state.hands.map(hand => hand.slice());
  hands[state.turn] = hands[state.turn].filter(held => held !== card);
  const trick = [...state.trick, { player: state.turn, card }], heartsBroken = state.heartsBroken || suitOf(card) === 'H';
  if (trick.length < 4) return { ...state, hands, trick, heartsBroken, turn: (state.turn + 1) % 4 };
  const winner = trickWinner(trick), taken = state.taken.map(cards => cards.slice()), tricks = state.tricks + 1;
  taken[winner].push(...trick.map(play => play.card));
  const next = { ...state, hands, trick: [], lastTrick: trick, heartsBroken, turn: winner, taken, tricks };
  if (tricks < 13) return next;
  const scored = taken.map(cards => cards.reduce((sum, held) => sum + points(held), 0)), moon = scored.indexOf(26);
  return { ...next, over: { points: moon >= 0 ? scored.map((_, player) => player === moon ? 0 : 26) : scored, moon: moon >= 0 ? moon : null } };
}

// 'pass:2C,3C,4C' while passing, or a card while playing.
export function applyMove(state, text) {
  if (text.startsWith('pass:')) return passCards(state, text.slice(5).split(','));
  return playCard(state, text);
}
export function replay(seed, hand, moves = []) {
  let state = startHand(seed, hand);
  const played = [];
  for (const text of moves) {
    played.push({ text, player: state.turn, led: state.trick[0] ? suitOf(state.trick[0].card) : null });
    state = applyMove(state, text);
  }
  return { state, played };
}

// What a player may know: their hand, the trick, every card already played, the
// cards they passed, the points each player has taken, and which suits each player
// is known to lack (from not following).
export function publicView(state, played, player) {
  const voids = [0, 1, 2, 3].map(() => new Set()), seen = [];
  for (const move of played) {
    if (move.text.startsWith('pass:')) continue;
    seen.push(move.text);
    if (move.led && suitOf(move.text) !== move.led) voids[move.player].add(move.led);
  }
  return { hand: state.hands[player].slice(), trick: state.trick, seen, passed: state.passed[player], heartsBroken: state.heartsBroken,
    taken: state.taken.map(cards => cards.reduce((sum, card) => sum + points(card), 0)), voids: voids.map(set => [...set]), tricks: state.tricks };
}
