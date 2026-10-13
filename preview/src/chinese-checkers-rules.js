// Chinese checkers (Sternhalma) for two at the plaza grove table. The board is a six-
// pointed star of 121 holes: a hexagon of 61 with a triangle of ten on each side. Each
// player starts with ten marbles filling the point nearest them, and races them all into
// the point opposite. A move is either a step to a neighbouring empty hole, or a chain of
// hops: over one neighbouring marble (anyone's) to the empty hole straight beyond, again
// and again, stopping where the player likes. Nothing is captured. The first to fill the
// opposite point wins; marbles the other player has left there count toward filling it,
// so long as at least one of the player's own is among them. After MAX_PLIES moves
// without a winner, the one with more marbles home wins, or it is a draw.
//
// Holes are axial coordinates [q, r] (the third cube coordinate is -q-r). r grows toward
// the first player, so their point is r > 4 and their goal is r < -4. Holes are numbered
// from the far tip, row by row, west to east; a move is the path of holes it visits,
// '12-24' (a step) or '96-74-52' (two hops). Pure and dependency-free.

export const MARBLES = 10, MAX_PLIES = 400;
export const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// The star: the two big triangles (every cube coordinate ≥ -4, or every one ≤ 4).
export const HOLES = [];
for (let r = -8; r <= 8; r++) for (let q = -8; q <= 8; q++) {
  const s = -q - r, inLow = q >= -4 && r >= -4 && s >= -4, inHigh = q <= 4 && r <= 4 && s <= 4;
  if (inLow || inHigh) HOLES.push([q, r]);
}
const INDEX = new Map(HOLES.map(([q, r], index) => [`${q},${r}`, index]));
export const holeAt = (q, r) => INDEX.get(`${q},${r}`) ?? -1;
// Each player's start and goal: the first player's point is toward them (r > 4).
export const HOME = [HOLES.flatMap(([, r], i) => (r > 4 ? [i] : [])), HOLES.flatMap(([, r], i) => (r < -4 ? [i] : []))];
export const GOAL = [HOME[1], HOME[0]];
// How far a hole is from a player's far tip, counted in rows.
export const rowsToGo = (player, hole) => (player === 0 ? HOLES[hole][1] + 8 : 8 - HOLES[hole][1]);
export const NEIGHBOURS = HOLES.map(([q, r]) => DIRECTIONS.map(([dq, dr]) => holeAt(q + dq, r + dr)));
// The hole two along each direction (the landing of a hop), or -1.
const BEYOND = HOLES.map(([q, r]) => DIRECTIONS.map(([dq, dr]) => holeAt(q + 2 * dq, r + 2 * dr)));

export function startGame() {
  const board = Array(HOLES.length).fill(null);
  for (const player of [0, 1]) for (const hole of HOME[player]) board[hole] = player;
  return { board, turn: 0, plies: 0, winner: null, draw: false, last: null };
}

// Every move of the marble on `from`: steps, and each hole a chain of hops can end on
// (by its shortest chain). Returns [{ to, path }].
export function movesFrom(board, from) {
  const moves = [], lifted = board.slice();
  lifted[from] = null;
  for (const to of NEIGHBOURS[from]) if (to >= 0 && lifted[to] === null) moves.push({ to, path: [from, to] });
  // The marble is in the hand while it hops, so it never hops over its own hole.
  const seen = new Set([from]), queue = [[from]];
  while (queue.length) {
    const path = queue.shift(), at = path.at(-1);
    DIRECTIONS.forEach((_, d) => {
      const over = NEIGHBOURS[at][d], land = BEYOND[at][d];
      if (over < 0 || land < 0 || lifted[over] === null || lifted[land] !== null || seen.has(land)) return;
      seen.add(land); const next = [...path, land]; queue.push(next); moves.push({ to: land, path: next });
    });
  }
  return moves;
}

export function legalMoves(state) {
  if (state.winner !== null || state.draw) return [];
  return state.board.flatMap((owner, from) => (owner === state.turn ? movesFrom(state.board, from) : []));
}

const filled = (board, player) => GOAL[player].every(hole => board[hole] !== null) && GOAL[player].some(hole => board[hole] === player);
export const homeCount = (board, player) => GOAL[player].filter(hole => board[hole] === player).length;

export function play(state, move) {
  if (state.winner !== null || state.draw) throw new Error('The game is over');
  const path = String(move).split('-').map(Number), from = path[0], to = path.at(-1);
  if (path.length < 2 || path.some(hole => !(hole >= 0 && hole < HOLES.length))) throw new Error(`Unreadable move ${move}`);
  if (state.board[from] !== state.turn) throw new Error(`No marble of yours on ${from}`);
  const board = state.board.slice();
  board[from] = null;
  // A step, or every leg a hop over a marble onto an empty hole.
  const step = path.length === 2 && NEIGHBOURS[from].includes(to) && board[to] === null;
  if (!step) for (let i = 1; i < path.length; i++) {
    const d = BEYOND[path[i - 1]].indexOf(path[i]);
    if (d < 0 || board[NEIGHBOURS[path[i - 1]][d]] === null || board[path[i]] !== null) throw new Error(`Illegal move ${move}`);
  }
  board[to] = state.turn;
  const plies = state.plies + 1, other = 1 - state.turn;
  let winner = filled(board, state.turn) ? state.turn : null, draw = false;
  if (winner === null && plies >= MAX_PLIES) { const [a, b] = [homeCount(board, 0), homeCount(board, 1)]; if (a === b) draw = true; else winner = a > b ? 0 : 1; }
  return { board, turn: other, plies, winner, draw, last: { player: state.turn, path } };
}

export const notation = path => path.join('-');
export function replay(moves = []) {
  let state = startGame();
  for (const move of moves) state = play(state, move);
  return { state };
}
