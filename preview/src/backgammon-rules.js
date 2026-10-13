// Backgammon at the plaza's backgammon table. Two players, fifteen checkers each.
// White moves from point 24 down to 1 and bears off below 1; black moves the other
// way. Points are numbered from white's side: points[p] > 0 holds white checkers,
// < 0 black. A roll moves checkers by each die (doubles give four moves). You
// must use both dice when you can; when only one can be used, the higher one. A
// checker on the bar must enter before any other move. A point held by two or more
// opposing checkers is closed; a single one (a blot) is hit and goes to the bar.
// When all fifteen are home a player bears off, by the exact number or, from the
// highest point held, by a higher one. The first to bear off all fifteen wins:
// 1 point, 2 for a gammon (the loser has borne none off), 3 for a backgammon (none
// off and a checker on the bar or in the winner's home board).
//
// The dice come from a seed, so a game replays exactly from its seed and its moves
// ('24-18', 'bar-20', '3-off'). Pure and dependency-free, like the other table games.
import { seededRandom } from './seeded-random.js';

export const WHITE = 0, BLACK = 1;
const DIRECTION = [-1, 1], OPPONENT = [BLACK, WHITE];
const sign = player => player === WHITE ? 1 : -1;
const mine = (state, player, point) => state.points[point] * sign(player) > 0;
const count = (state, player, point) => Math.max(0, state.points[point] * sign(player));
const inHome = (player, point) => player === WHITE ? point >= 1 && point <= 6 : point >= 19 && point <= 24;

// One die from the seed, for a turn and a slot, so a game's dice never depend on play.
// Integer maths throughout: a float product of a 32-bit seed passes 2^53 and rounds the
// turn and slot away, so every die of a large seed would match.
const die = (seed, turn, slot) => 1 + Math.floor(seededRandom((Math.imul(seed >>> 0, 2654435761) ^ Math.imul(turn + 1, 0x85ebca6b) ^ Math.imul(slot + 1, 0xc2b2ae35)) >>> 0)() * 6);
export function openingRoll(seed) {
  for (let attempt = 0; ; attempt++) {
    const white = die(seed, 1000 + attempt, 0), black = die(seed, 1000 + attempt, 1);
    if (white !== black) return { first: white > black ? WHITE : BLACK, dice: [white, black] };
  }
}
export const rollFor = (seed, turn) => { const a = die(seed, turn, 0), b = die(seed, turn, 1); return a === b ? [a, a, a, a] : [a, b]; };

export function startGame(seed) {
  const points = Array(26).fill(0);
  for (const [point, checkers] of [[24, 2], [13, 5], [8, 3], [6, 5]]) { points[point] = checkers; points[25 - point] = -checkers; }
  const { first, dice } = openingRoll(seed);
  return withPlays({ seed, points, bar: [0, 0], off: [0, 0], turn: first, turnIndex: 0, rolled: dice.slice(), dice: dice.slice(), played: [], over: null });
}

// A position set up by hand ({ point: count }, white positive) with a roll to play,
// for tests, lessons and a future shared table.
export function fromPosition(layout, { turn = WHITE, dice = [3, 1], bar = [0, 0], off = [0, 0], seed = 1, turnIndex = 1 } = {}) {
  const points = Array(26).fill(0);
  for (const [point, value] of Object.entries(layout)) points[Number(point)] = value;
  return withPlays({ seed, points, bar: bar.slice(), off: off.slice(), turn, turnIndex, rolled: dice.slice(), dice: dice.slice(), played: [], over: null });
}

export const pips = (state, player) => state.points.reduce((sum, value, point) => sum + Math.max(0, value * sign(player)) * (player === WHITE ? point : 25 - point), 0)
  + state.bar[player] * 25;
const allHome = (state, player) => !state.bar[player] && state.points.every((value, point) => value * sign(player) <= 0 || inHome(player, point));

// Single moves for one die, ignoring the rule about using both dice.
function stepsFor(state, player, value) {
  const steps = [], direction = DIRECTION[player], opponent = OPPONENT[player];
  const open = point => count(state, opponent, point) < 2;
  if (state.bar[player]) {
    const to = player === WHITE ? 25 - value : value;
    if (open(to)) steps.push({ from: 'bar', to, die: value, hit: count(state, opponent, to) === 1 });
    return steps;
  }
  const bearing = allHome(state, player);
  for (let from = 1; from <= 24; from++) {
    if (!mine(state, player, from)) continue;
    const to = from + direction * value;
    if (to >= 1 && to <= 24) { if (open(to)) steps.push({ from, to, die: value, hit: count(state, opponent, to) === 1 }); continue; }
    if (!bearing) continue;
    // Off by the exact number, or by a higher one from the farthest point held.
    const exact = player === WHITE ? to === 0 : to === 25;
    const farther = player === WHITE ? [...Array(6).keys()].some(i => i + 1 > from && mine(state, player, i + 1)) : [...Array(6).keys()].some(i => 24 - i < from && mine(state, player, 24 - i));
    if (exact || !farther) steps.push({ from, to: 'off', die: value, hit: false });
  }
  return steps;
}

function apply(state, player, step) {
  const points = state.points.slice(), bar = state.bar.slice(), off = state.off.slice(), opponent = OPPONENT[player];
  if (step.from === 'bar') bar[player]--; else points[step.from] -= sign(player);
  if (step.to === 'off') off[player]++;
  else {
    if (step.hit) { points[step.to] += sign(player); bar[opponent]++; }
    points[step.to] += sign(player);
  }
  return { ...state, points, bar, off };
}

// Every way to play the remaining dice from here: sequences of steps, deepest first.
function sequences(state, player, dice) {
  if (!dice.length) return [[]];
  const results = [], tried = new Set();
  for (let i = 0; i < dice.length; i++) {
    if (tried.has(dice[i])) continue;
    tried.add(dice[i]);
    const rest = dice.slice(0, i).concat(dice.slice(i + 1));
    for (const step of stepsFor(state, player, dice[i])) {
      const after = apply(state, player, step);
      if (after.off[player] === 15) { results.push([step]); continue; }
      for (const tail of sequences(after, player, rest)) results.push([step, ...tail]);
    }
  }
  return results.length ? results : [[]];
}

// The plays the rules allow this turn: as many dice as possible, and the higher die
// when only one of two can be used.
function legalPlays(state) {
  let plays = sequences(state, state.turn, state.dice);
  const most = Math.max(...plays.map(play => play.length));
  plays = plays.filter(play => play.length === most);
  if (most === 1 && state.dice.length === 2 && state.dice[0] !== state.dice[1]) {
    const high = Math.max(...state.dice);
    if (plays.some(play => play[0].die === high)) plays = plays.filter(play => play[0].die === high);
  }
  return plays.filter(play => play.length);
}
function withPlays(state) { return { ...state, plays: state.over ? [] : legalPlays(state) }; }

const same = (a, b) => a.from === b.from && a.to === b.to && a.die === b.die;
export const notation = step => `${step.from}-${step.to}`;

// The single moves open now: the next step of any legal play.
export function legalMoves(state) {
  if (state.over) return [];
  const depth = state.played.length, seen = new Map();
  for (const play of state.plays) {
    if (play.length <= depth || !state.played.every((step, i) => same(step, play[i]))) continue;
    const step = play[depth], key = `${notation(step)}:${step.die}`;
    if (!seen.has(key)) seen.set(key, step);
  }
  return [...seen.values()];
}

function scoreFor(state, winner) {
  const loser = OPPONENT[winner];
  if (state.off[loser] > 0) return { points: 1, kind: 'single' };
  const trapped = state.bar[loser] > 0 || state.points.some((value, point) => value * sign(loser) > 0 && inHome(winner, point));
  return trapped ? { points: 3, kind: 'backgammon' } : { points: 2, kind: 'gammon' };
}

// Plays one checker. The turn passes on by itself when the dice are used or nothing else can move.
export function move(state, step) {
  const legal = legalMoves(state).find(option => same(option, step) || (option.from === step.from && option.to === step.to && step.die === undefined));
  if (!legal) throw new Error(`Illegal move ${notation(step)}`);
  let next = apply(state, state.turn, legal);
  const dice = state.dice.slice(); dice.splice(dice.indexOf(legal.die), 1);
  const played = [...state.played, legal];
  if (next.off[state.turn] === 15) return { ...next, dice: [], played, plays: [], over: { winner: state.turn, ...scoreFor(next, state.turn) } };
  next = { ...next, dice, played };
  const more = state.plays.some(play => play.length > played.length && played.every((step, i) => same(step, play[i])));
  if (dice.length && more) return next;
  return endTurn(next);
}

function endTurn(state) {
  const turnIndex = state.turnIndex + 1, dice = rollFor(state.seed, turnIndex);
  let next = withPlays({ ...state, turn: OPPONENT[state.turn], turnIndex, rolled: dice.slice(), dice, played: [] });
  // A player with no legal play passes at once.
  while (!next.plays.length && !next.over) {
    const after = next.turnIndex + 1, roll = rollFor(state.seed, after);
    next = withPlays({ ...next, turn: OPPONENT[next.turn], turnIndex: after, rolled: roll.slice(), dice: roll, played: [], passed: [...(next.passed ?? []), next.turnIndex] });
  }
  return next;
}

export function parse(text) {
  const [from, to] = text.split('-');
  return { from: from === 'bar' ? 'bar' : Number(from), to: to === 'off' ? 'off' : Number(to) };
}
// A game from its seed and moves, replayed and checked.
export function replay(seed, moves = []) {
  let state = startGame(seed);
  const history = [];
  for (const text of moves) {
    const player = state.turn, before = state.rolled;
    state = move(state, parse(text));
    history.push({ player, text, rolled: before });
  }
  return { state, history };
}
export const checkersOf = (state, player) => state.points.reduce((sum, value) => sum + Math.max(0, value * sign(player)), 0) + state.bar[player] + state.off[player];
