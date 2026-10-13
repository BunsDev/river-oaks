// Liar's dice at the plaza café table: you and three plaza regulars, five dice each under
// a cup. Each round everyone rolls in secret, then players bid in turn, moving left, on
// how many dice of one face lie on the whole table: "five fours". Ones are wild and count
// as any face (so faces are bid from 2 to 6). Each bid must raise the last: more dice, or
// the same number of a higher face. Instead of raising, a player may call "liar" on the
// last bid: every cup is lifted, and if the table holds at least that many (counting
// ones), the caller loses a die; if not, the bidder does. Whoever lost a die opens the
// next round (or the next player still in, if they are out of dice). The last player
// with dice wins.
//
// Rolls come from a seed and the round number, so a game replays exactly from its moves:
// 'bid:5:4' (five fours) and 'liar'. Pure and dependency-free.
import { seededRandom } from './seeded-random.js';

export const PLAYERS = 4, DICE = 5, FACES = [2, 3, 4, 5, 6];

const rollFor = (seed, round, player, count) => {
  const next = seededRandom((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(round + 1, 0x85ebca6b) ^ Math.imul(player + 1, 0xc2b2ae35)) >>> 0);
  return Array.from({ length: count }, () => 1 + Math.floor(next() * 6)).sort((a, b) => a - b);
};

function roll(state, opener) {
  const round = state.round + 1, cups = state.counts.map((count, player) => rollFor(state.seed, round, player, count));
  return { ...state, round, cups, bid: null, turn: opener, bids: [], reveal: null };
}

export function startGame(seed = 1, players = PLAYERS) {
  return roll({ seed: seed >>> 0, counts: Array(players).fill(DICE), round: 0, winner: null, history: [] }, 0);
}

export const totalDice = state => state.counts.reduce((a, b) => a + b, 0);
// How many dice on the table show a face, ones counting as wild.
export const countOf = (cups, face) => cups.flat().filter(die => die === face || die === 1).length;
const nextIn = (state, from) => { for (let step = 1; step <= state.counts.length; step++) { const player = (from + step) % state.counts.length; if (state.counts[player] > 0) return player; } return from; };

export const raises = (bid, quantity, face) => !bid || quantity > bid.quantity || (quantity === bid.quantity && face > bid.face);
export function legalMoves(state) {
  if (state.winner !== null) return [];
  const moves = [], total = totalDice(state);
  for (let quantity = 1; quantity <= total; quantity++) for (const face of FACES) if (raises(state.bid, quantity, face)) moves.push(`bid:${quantity}:${face}`);
  if (state.bid) moves.push('liar');
  return moves;
}

export function play(state, move) {
  if (state.winner !== null) throw new Error('The game is over');
  if (move === 'liar') {
    if (!state.bid) throw new Error('Nothing to call');
    const { quantity, face, player: bidder } = state.bid, actual = countOf(state.cups, face), caller = state.turn;
    const loser = actual >= quantity ? caller : bidder, counts = state.counts.slice();
    counts[loser] -= 1;
    const reveal = { cups: state.cups, bid: state.bid, caller, actual, loser };
    const alive = counts.filter(count => count > 0).length;
    const next = { ...state, counts, reveal, history: [...state.history, reveal] };
    if (alive === 1) return { ...next, winner: counts.findIndex(count => count > 0) };
    const opener = counts[loser] > 0 ? loser : nextIn({ ...state, counts }, loser);
    return { ...roll(next, opener), reveal, history: next.history };
  }
  const match = /^bid:(\d+):([2-6])$/.exec(move);
  if (!match) throw new Error(`Unreadable move ${move}`);
  const quantity = Number(match[1]), face = Number(match[2]);
  if (quantity > totalDice(state) || !raises(state.bid, quantity, face)) throw new Error(`Illegal bid ${move}`);
  const bid = { quantity, face, player: state.turn };
  return { ...state, bid, bids: [...state.bids, bid], turn: nextIn(state, state.turn), reveal: null };
}

export function replay(seed, moves = [], players = PLAYERS) {
  let state = startGame(seed, players);
  for (const move of moves) state = play(state, move);
  return { state };
}
