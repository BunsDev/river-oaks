// Cribbage for two at the plaza's walnut backgammon table. Each hand deals six cards
// to each player; each lays two away face down in the dealer's crib. The card under
// the cut is the starter (a jack there scores the dealer 2, "his heels"). In the play
// the players lay cards in turn, the non-dealer first, keeping a running count no
// higher than 31: a count of 15 or 31 scores 2, a pair 2 (three alike 6, four 12), and
// a run of three or more its length. A player who cannot play says go; the other plays
// on while they can, and the last card under 31 scores 1 (31 itself scores only its 2).
// The count then starts again, led by the player who did not lay the last card. Then
// the show: the non-dealer's hand, the dealer's, and the crib, each with the starter:
// 2 for every combination making 15, 2 for every pair, each run its length (doubled
// for every way it can be made), four of a suit in the hand 4 (5 with the starter; the
// crib only counts all five), and the jack of the starter's suit 1 ("nobs"). The first
// to 121 wins, the moment they reach it. The deal alternates.
//
// Cards as in Hearts ('5H', 'TC', 'JD', 'AS'). A game replays exactly from its seed and
// moves: 'discard:5H,TC', a card in the play, and 'next' to deal the next hand.
import { DECK, suitOf } from './hearts-rules.js';
import { shuffled } from './seeded-random.js';

export const GAME_POINTS = 121;
const ORDER = 'A23456789TJQK';
export const rank = card => ORDER.indexOf(card[0]) + 1;
export const value = card => Math.min(10, rank(card));
const sortCards = cards => cards.slice().sort((a, b) => rank(a) - rank(b) || 'CDHS'.indexOf(suitOf(a)) - 'CDHS'.indexOf(suitOf(b)));

// A hand's (or the crib's) show, with the starter: { total, parts: [{ kind, points, cards }] }.
export function scoreShow(hand, starter, crib = false) {
  const cards = [...hand, starter], parts = [];
  for (let mask = 1; mask < 32; mask++) {
    const subset = cards.filter((_, i) => mask & (1 << i));
    if (subset.length >= 2 && subset.reduce((sum, card) => sum + value(card), 0) === 15) parts.push({ kind: 'fifteen', points: 2, cards: subset });
  }
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) if (rank(cards[a]) === rank(cards[b])) parts.push({ kind: 'pair', points: 2, cards: [cards[a], cards[b]] });
  const counts = Array(14).fill(0);
  for (const card of cards) counts[rank(card)] += 1;
  for (let start = 1; start <= 13; start++) {
    if (!counts[start] || counts[start - 1]) continue;
    let end = start;
    while (end + 1 <= 13 && counts[end + 1]) end += 1;
    const length = end - start + 1;
    if (length >= 3) {
      let ways = 1;
      for (let r = start; r <= end; r++) ways *= counts[r];
      parts.push({ kind: 'run', points: length * ways, cards: cards.filter(card => rank(card) >= start && rank(card) <= end) });
    }
  }
  const suit = suitOf(hand[0]);
  if (hand.every(card => suitOf(card) === suit)) {
    if (suitOf(starter) === suit) parts.push({ kind: 'flush', points: 5, cards });
    else if (!crib) parts.push({ kind: 'flush', points: 4, cards: hand });
  }
  const nobs = hand.find(card => card[0] === 'J' && suitOf(card) === suitOf(starter));
  if (nobs) parts.push({ kind: 'nobs', points: 1, cards: [nobs] });
  return { total: parts.reduce((sum, part) => sum + part.points, 0), parts };
}

// Points for the card just laid on a pile (the current count's cards, in order).
export function scorePlay(pile) {
  const count = pile.reduce((sum, card) => sum + value(card), 0), parts = [];
  if (count === 15) parts.push({ kind: 'fifteen', points: 2 });
  if (count === 31) parts.push({ kind: 'thirty-one', points: 2 });
  let same = 1;
  while (same < pile.length && rank(pile[pile.length - 1 - same]) === rank(pile[pile.length - 1])) same += 1;
  if (same >= 2) parts.push({ kind: same === 2 ? 'pair' : same === 3 ? 'pair royal' : 'double pair royal', points: same * (same - 1) });
  for (let length = pile.length; length >= 3; length--) {
    const ranks = pile.slice(-length).map(rank).sort((a, b) => a - b);
    if (ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) { parts.push({ kind: 'run', points: length }); break; }
  }
  return parts;
}

const handSeed = (seed, hand) => (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(hand + 1, 0x85ebca6b)) >>> 0;
function deal(state, hand) {
  const deck = shuffled(DECK, handSeed(state.seed, hand)), dealer = (state.firstDealer + hand) % 2, pone = 1 - dealer;
  const hands = [[], []];
  // Six each, the non-dealer (pone) first.
  for (let i = 0; i < 12; i++) hands[i % 2 === 0 ? pone : dealer].push(deck[i]);
  return { ...state, hand, dealer, hands: hands.map(sortCards), kept: [null, null], crib: [], starter: null, starterCard: deck[12],
    phase: 'discard', turn: pone, pile: [], played: [[], []], said: [false, false], lastPlayer: null, show: null, events: [] };
}

export function startGame(seed = 1, firstDealer = 0) {
  return deal({ seed: seed >>> 0, firstDealer, scores: [0, 0], winner: null }, 0);
}

const count = state => state.pile.reduce((sum, card) => sum + value(card), 0);
const inHand = (state, player) => state.kept[player].filter(card => !state.played[player].includes(card));
export const playable = (state, player) => inHand(state, player).filter(card => count(state) + value(card) <= 31);

// Adds points, recording why, and ends the game the moment someone reaches 121.
function award(state, player, points, reason) {
  if (!points || state.winner !== null) return state;
  const scores = state.scores.slice(); scores[player] += points;
  const winner = scores[player] >= GAME_POINTS ? player : null;
  return { ...state, scores, winner, phase: winner === null ? state.phase : 'over', events: [...state.events, { player, points, reason }] };
}

export function legalMoves(state) {
  if (state.winner !== null) return [];
  if (state.phase === 'discard') {
    const cards = state.hands[state.turn], moves = [];
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) moves.push(`discard:${cards[a]},${cards[b]}`);
    return moves;
  }
  if (state.phase === 'play') return playable(state, state.turn);
  if (state.phase === 'show') return ['next'];
  return [];
}

// After a card (or at the start of the play): settles goes, resets, last card, and the show.
function advance(state) {
  for (let guard = 0; guard < 20 && state.phase === 'play' && state.winner === null; guard++) {
    const left = [0, 1].map(player => inHand(state, player).length);
    if (!left[0] && !left[1]) {
      // Last card: 1, unless the count stands at 31 (already scored).
      if (count(state) !== 31 && state.lastPlayer !== null) state = award(state, state.lastPlayer, 1, 'last card');
      if (state.winner !== null) break;
      return showHands(state);
    }
    if (playable(state, state.turn).length) return state;
    const other = 1 - state.turn;
    if (playable(state, other).length) { state = { ...state, said: Object.assign(state.said.slice(), { [state.turn]: true }), turn: other }; return state; }
    // Neither can play: a go to the last player (unless 31), and the count starts again.
    if (count(state) !== 31 && state.lastPlayer !== null) state = award(state, state.lastPlayer, 1, 'go');
    if (state.winner !== null) break;
    const lead = state.lastPlayer === null ? state.turn : 1 - state.lastPlayer;
    state = { ...state, pile: [], said: [false, false], turn: inHand(state, lead).length ? lead : 1 - lead };
  }
  return state;
}

function showHands(state) {
  const pone = 1 - state.dealer, order = [[pone, state.kept[pone], false], [state.dealer, state.kept[state.dealer], false], [state.dealer, state.crib, true]];
  const show = [];
  for (const [player, cards, crib] of order) {
    const scored = scoreShow(cards, state.starter, crib);
    show.push({ player, crib, cards, ...scored });
    state = award(state, player, scored.total, crib ? 'crib' : 'hand');
    if (state.winner !== null) break;
  }
  return { ...state, phase: state.winner === null ? 'show' : 'over', show };
}

export function play(state, move) {
  if (!legalMoves(state).includes(move)) throw new Error(`Illegal move ${move}`);
  state = { ...state, events: [] };
  if (state.phase === 'discard') {
    const [a, b] = move.slice(8).split(','), player = state.turn;
    const kept = state.kept.slice(); kept[player] = state.hands[player].filter(card => card !== a && card !== b);
    state = { ...state, kept, crib: sortCards([...state.crib, a, b]), turn: 1 - player };
    if (kept[0] && kept[1]) {
      state = { ...state, starter: state.starterCard, phase: 'play', turn: 1 - state.dealer };
      if (state.starter[0] === 'J') state = award(state, state.dealer, 2, 'his heels');
      if (state.winner === null) state = advance(state);
    }
    return state;
  }
  if (state.phase === 'play') {
    const player = state.turn, pile = [...state.pile, move], played = state.played.map(cards => cards.slice());
    played[player].push(move);
    state = { ...state, pile, played, lastPlayer: player };
    for (const part of scorePlay(pile)) state = award(state, player, part.points, part.kind);
    if (state.winner !== null) return state;
    // Play passes to the other player unless they have said go (and still cannot play).
    const other = 1 - player;
    state = { ...state, turn: other };
    if (count(state) === 31) state = { ...state, pile: [], said: [false, false], turn: inHand(state, other).length ? other : player };
    return advance(state);
  }
  // 'next': deal the next hand.
  return deal(state, state.hand + 1);
}

export const runningCount = count;
export const cardsLeft = inHand;
export function replay(seed, moves = [], firstDealer = 0) {
  let state = startGame(seed, firstDealer);
  for (const move of moves) state = play(state, move);
  return { state };
}
