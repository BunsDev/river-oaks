// The plaza regulars at liar's dice reason from what is under their own cup. For any
// face, the dice they cannot see each show it (or a wild one) a third of the time, so
// they expect their own matches plus a third of the rest. They call "liar" when the bid
// is well beyond that expectation, and otherwise raise: preferring the face they hold
// most of, at the lowest quantity that beats the bid, stretching a little with a seeded
// nerve so they don't always stop at the safe bid.
import { FACES, legalMoves, raises, totalDice } from './liars-dice-rules.js';
import { seededRandom } from './seeded-random.js';

const expected = (state, player, face) => {
  const mine = state.cups[player], held = mine.filter(die => die === face || die === 1).length, unseen = totalDice(state) - mine.length;
  return held + unseen / 3;
};

export function chooseMove(state) {
  const player = state.turn, moves = legalMoves(state), next = seededRandom((Math.imul(state.seed >>> 0, 0x27d4eb2f) ^ Math.imul(state.round * 31 + state.bids.length + 1, 0x165667b1) ^ Math.imul(player + 1, 0x9e3779b1)) >>> 0);
  if (state.bid) {
    const margin = expected(state, player, state.bid.face) - state.bid.quantity;
    if (margin < -1.2 - next() * 0.6) return 'liar';
  }
  // The face it can best support, and the lowest raise on it.
  const best = FACES.slice().sort((a, b) => expected(state, player, b) - expected(state, player, a) || b - a)[0];
  const nerve = next() < 0.25 ? 1 : 0, target = Math.max(1, Math.floor(expected(state, player, best)) + nerve);
  for (let quantity = 1; quantity <= totalDice(state); quantity++) {
    if (raises(state.bid, quantity, best) && quantity <= target + 1) return `bid:${quantity}:${best}`;
    if (raises(state.bid, quantity, best)) break;
  }
  // Can't raise its best face plausibly: the smallest raise of any face, or a call.
  const smallest = moves.find(move => move.startsWith('bid:'));
  if (!state.bid) return smallest;
  const [, q, f] = smallest.split(':').map(Number);
  return expected(state, player, f) - q >= -0.5 ? smallest : 'liar';
}
