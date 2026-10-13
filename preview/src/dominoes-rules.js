// Dominoes at the plaza café table, with a double-six set of 28 tiles. Two players
// play the draw game: seven tiles each, and the rest is a boneyard you draw from
// when you cannot play. Four play the block game: seven each, no boneyard, so a
// player who cannot play passes. The holder of the highest double leads it (with
// no double out, the heaviest tile). A round ends when someone plays their last
// tile, or when nobody can play (blocked) and the lightest hand wins. The round's
// winner scores the pips left in every other hand; a match goes to 100.
//
// A tile is 'a-b' with a ≤ b. The line is a list of placed tiles { id, left, right },
// read left to right, so its open ends are line[0].left and line.at(-1).right.
// Deals come from a seed, so a round replays exactly from its seed and moves.
// Pure and dependency-free, like the chess and checkers rules.

export const MATCH_POINTS = 100;
export const TILES = Array.from({ length: 7 }, (_, a) => Array.from({ length: 7 - a }, (_, i) => `${a}-${a + i}`)).flat();
export const values = id => id.split('-').map(Number);
export const pips = id => values(id).reduce((sum, value) => sum + value, 0);
const isDouble = id => { const [a, b] = values(id); return a === b; };

// Mulberry32: a small, well-mixed generator, so a seed always deals the same hands.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deal(seed, players = 2) {
  if (![2, 4].includes(players)) throw new Error('Dominoes is played by two or four');
  const next = random(seed), tiles = TILES.slice();
  for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  const hands = Array.from({ length: players }, (_, player) => tiles.slice(player * 7, player * 7 + 7));
  return { hands, boneyard: tiles.slice(players * 7) };
}

// The highest double in any hand leads; with none dealt, the heaviest tile does.
function leader(hands) {
  for (let value = 6; value >= 0; value--) {
    const player = hands.findIndex(hand => hand.includes(`${value}-${value}`));
    if (player >= 0) return { player, tile: `${value}-${value}` };
  }
  let best = null;
  hands.forEach((hand, player) => hand.forEach(tile => {
    const high = values(tile)[1];
    if (!best || pips(tile) > pips(best.tile) || (pips(tile) === pips(best.tile) && high > values(best.tile)[1])) best = { player, tile };
  }));
  return best;
}

export function startRound(seed, players = 2) {
  const { hands, boneyard } = deal(seed, players), lead = leader(hands);
  return { seed, players, hands, boneyard, line: [], turn: lead.player, lead: lead.tile, passes: 0, over: null };
}

export const ends = state => state.line.length ? [state.line[0].left, state.line.at(-1).right] : null;
export const handPips = hand => hand.reduce((sum, tile) => sum + pips(tile), 0);

export function legalMoves(state) {
  if (state.over) return [];
  const hand = state.hands[state.turn];
  if (!state.line.length) return [{ kind: 'play', tile: state.lead, end: 'right' }];
  const [left, right] = ends(state), plays = [];
  for (const tile of hand) {
    const [a, b] = values(tile);
    if (a === left || b === left) plays.push({ kind: 'play', tile, end: 'left' });
    // With both ends showing one value, either side gives the same game: offer the left only.
    if ((a === right || b === right) && left !== right) plays.push({ kind: 'play', tile, end: 'right' });
  }
  if (plays.length) return plays;
  return [state.boneyard.length ? { kind: 'draw' } : { kind: 'pass' }];
}

// 'L:3-5' or 'R:3-5' for a play, 'draw', 'pass'.
export const notation = move => move.kind === 'play' ? `${move.end === 'left' ? 'L' : 'R'}:${move.tile}` : move.kind;
export const findMove = (state, text) => legalMoves(state).find(move => notation(move) === text) ?? null;

export function makeMove(state, move) {
  const hands = state.hands.map(hand => hand.slice()), next = (state.turn + 1) % state.players;
  if (move.kind === 'draw') {
    const [drawn, ...boneyard] = state.boneyard;
    hands[state.turn].push(drawn);
    return { ...state, hands, boneyard };
  }
  if (move.kind === 'pass') {
    const passes = state.passes + 1;
    if (passes < state.players) return { ...state, turn: next, passes };
    // Nobody can play: the lightest hand takes the others' pips; a shared lightest scores nothing.
    const totals = hands.map(handPips), lightest = Math.min(...totals), winners = totals.flatMap((total, player) => total === lightest ? [player] : []);
    const winner = winners.length === 1 ? winners[0] : null;
    return { ...state, turn: next, passes, over: { winner, reason: 'blocked', points: winner === null ? 0 : totals.reduce((sum, total, player) => player === winner ? sum : sum + total, 0) } };
  }
  hands[state.turn] = hands[state.turn].filter(tile => tile !== move.tile);
  const [a, b] = values(move.tile), line = state.line.slice();
  if (!line.length) line.push({ id: move.tile, left: a, right: b });
  else if (move.end === 'left') { const left = line[0].left; line.unshift(b === left ? { id: move.tile, left: a, right: b } : { id: move.tile, left: b, right: a }); }
  else { const right = line.at(-1).right; line.push(a === right ? { id: move.tile, left: a, right: b } : { id: move.tile, left: b, right: a }); }
  const over = hands[state.turn].length ? null
    : { winner: state.turn, reason: 'domino', points: hands.reduce((sum, hand, player) => player === state.turn ? sum : sum + handPips(hand), 0) };
  return { ...state, hands, line, turn: over ? state.turn : next, passes: 0, over };
}

// A round from its seed and moves (notation), replayed and checked.
export function replay(seed, players, moves = []) {
  let state = startRound(seed, players);
  const played = [];
  for (const text of moves) {
    const move = findMove(state, text);
    if (!move) throw new Error(`Illegal move ${text}`);
    played.push({ ...move, player: state.turn, notation: text, ends: ends(state) });
    state = makeMove(state, move);
  }
  return { state, played };
}

// What a player may know: their own hand, the line, the boneyard's size, the other
// hands' sizes, and which end values each player could not follow. A draw or a pass
// shows the player holds neither number then open (`ends`, as replay records them).
export function publicView(state, played, player) {
  const lacks = Array.from({ length: state.players }, () => new Set());
  for (const move of played) if (move.kind !== 'play') for (const value of move.ends ?? []) lacks[move.player].add(value);
  return { hand: state.hands[player].slice(), line: state.line, boneyard: state.boneyard.length, sizes: state.hands.map(hand => hand.length), lacks: lacks.map(set => [...set]) };
}
