// Yacht, the five-dice game, on the travertine drum by the plaza's curved bench. Each
// turn a player rolls five dice, then may roll again up to twice, setting aside any dice
// they want to keep between rolls. After the last roll (or sooner) they must score the
// dice in one of twelve boxes not yet used, even for nothing. When every player has
// filled all twelve, the highest total wins.
//
// The boxes (classic Yacht, no bonus):
//   ones … sixes      the sum of the dice showing that face
//   full house        three of one face and two of another: the sum of all five
//   four of a kind    at least four alike: the sum of those four
//   little straight   1-2-3-4-5: 30
//   big straight      2-3-4-5-6: 30
//   choice            any dice: the sum of all five
//   yacht             five alike: 50
//
// Dice come from the seed, the turn and the roll, so a game replays exactly from its
// moves: 'roll' (the first roll of a turn), 'roll:10010' (roll again, keeping the dice
// marked 1) and 'score:fourKind'. Pure and dependency-free.
import { seededRandom } from './seeded-random.js';

export const DICE = 5, ROLLS = 3;
export const BOXES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'fullHouse', 'fourKind', 'littleStraight', 'bigStraight', 'choice', 'yacht'];
export const BOX_NAMES = { ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes', fullHouse: 'Full house', fourKind: 'Four of a kind', littleStraight: 'Little straight', bigStraight: 'Big straight', choice: 'Choice', yacht: 'Yacht' };

const counts = dice => { const tally = [0, 0, 0, 0, 0, 0, 0]; for (const die of dice) tally[die] += 1; return tally; };
const sum = dice => dice.reduce((a, b) => a + b, 0);

// What the dice would score in a box.
export function scoreFor(box, dice) {
  const tally = counts(dice), face = BOXES.indexOf(box) + 1;
  if (face >= 1 && face <= 6) return tally[face] * face;
  switch (box) {
    case 'fullHouse': return tally.includes(3) && tally.includes(2) ? sum(dice) : 0;
    case 'fourKind': { const four = tally.findIndex(n => n >= 4); return four > 0 ? four * 4 : 0; }
    case 'littleStraight': return [1, 2, 3, 4, 5].every(n => tally[n] === 1) ? 30 : 0;
    case 'bigStraight': return [2, 3, 4, 5, 6].every(n => tally[n] === 1) ? 30 : 0;
    case 'choice': return sum(dice);
    case 'yacht': return tally.includes(5) ? 50 : 0;
    default: throw new Error(`No box ${box}`);
  }
}

const rollDice = (seed, turn, roll) => {
  const next = seededRandom((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(turn + 1, 0x85ebca6b) ^ Math.imul(roll + 1, 0xc2b2ae35)) >>> 0);
  return Array.from({ length: DICE }, () => 1 + Math.floor(next() * 6));
};

export function startGame(seed = 1, players = 2) {
  return { seed: seed >>> 0, players, sheets: Array.from({ length: players }, () => ({})), turn: 0, turns: 0, dice: null, rolls: 0, winners: null, last: null };
}

export const totalOf = sheet => Object.values(sheet).reduce((a, b) => a + b, 0);
export const openBoxes = sheet => BOXES.filter(box => !(box in sheet));

export function legalMoves(state) {
  if (state.winners) return [];
  if (state.rolls === 0) return ['roll'];
  const moves = openBoxes(state.sheets[state.turn]).map(box => `score:${box}`);
  if (state.rolls < ROLLS) for (let mask = 0; mask < 2 ** DICE - 1; mask++) moves.push(`roll:${mask.toString(2).padStart(DICE, '0')}`);
  return moves;
}

export function play(state, move) {
  if (state.winners) throw new Error('The game is over');
  if (move === 'roll') {
    if (state.rolls !== 0) throw new Error('Already rolled');
    return { ...state, dice: rollDice(state.seed, state.turns, 0), rolls: 1, last: null };
  }
  const reroll = /^roll:([01]{5})$/.exec(move);
  if (reroll) {
    if (state.rolls === 0 || state.rolls >= ROLLS) throw new Error(`No roll left: ${move}`);
    const keep = [...reroll[1]].map(bit => bit === '1');
    if (keep.every(Boolean)) throw new Error('Keeping every die is not a roll');
    const fresh = rollDice(state.seed, state.turns, state.rolls);
    return { ...state, dice: state.dice.map((die, i) => (keep[i] ? die : fresh[i])), rolls: state.rolls + 1 };
  }
  const scoring = /^score:([a-zA-Z]+)$/.exec(move);
  if (!scoring) throw new Error(`Unreadable move ${move}`);
  const box = scoring[1], sheet = state.sheets[state.turn];
  if (state.rolls === 0) throw new Error('Roll first');
  if (!BOXES.includes(box) || box in sheet) throw new Error(`Box ${box} is not open`);
  const points = scoreFor(box, state.dice), sheets = state.sheets.slice();
  sheets[state.turn] = { ...sheet, [box]: points };
  const last = { player: state.turn, box, points, dice: state.dice };
  const turns = state.turns + 1, done = turns === state.players * BOXES.length;
  let winners = null;
  if (done) { const totals = sheets.map(totalOf), best = Math.max(...totals); winners = totals.flatMap((total, player) => (total === best ? [player] : [])); }
  return { ...state, sheets, turn: (state.turn + 1) % state.players, turns, dice: null, rolls: 0, winners, last };
}

export function replay(seed, moves = [], players = 2) {
  let state = startGame(seed, players);
  for (const move of moves) state = play(state, move);
  return { state };
}
