// Mancala (Kalah) at the small grove table: two players, six pits each and a store at
// each end, four seeds in every pit. On your turn you lift all the seeds from one of
// your pits and sow them one by one, counter-clockwise, into the following pits and
// your own store, never the opponent's. If the last seed lands in your store you move
// again. If it lands in one of your own pits that was empty and the pit opposite holds
// seeds, you capture both into your store. When either side has no seeds left the game
// ends: each player banks the seeds still on their own side, and the fuller store wins.
//
// The board is fourteen places counter-clockwise: 0–5 are side 0's pits (left to right
// as side 0 sees them), 6 is side 0's store, 7–12 are side 1's pits, 13 is side 1's
// store. A move is a pit number 1–6 counted from the mover's left, so a game replays
// exactly from its moves ('3', '6', …). Pure and dependency-free.

export const PITS = 6, SEEDS = 4;
export const STORE = [6, 13];
export const pitIndex = (side, pit) => side * 7 + pit - 1;
export const opposite = index => 12 - index;

export const startGame = (seeds = SEEDS) => ({ board: Array.from({ length: 14 }, (_, index) => (index === 6 || index === 13 ? 0 : seeds)), turn: 0, over: null, moves: 0, last: null });

const sideOf = index => (index < 7 ? 0 : 1);
const ownPit = (side, index) => sideOf(index) === side && index !== STORE[side];

export function legalMoves(state) {
  if (state.over) return [];
  return Array.from({ length: PITS }, (_, i) => i + 1).filter(pit => state.board[pitIndex(state.turn, pit)] > 0);
}

// Sows from a pit. Returns the next state, with `last` describing the sowing for drawing:
// the pit lifted, every place a seed fell (in order), whether it captured, and whether
// the mover goes again.
export function sow(state, pit) {
  if (!legalMoves(state).includes(pit)) throw new Error(`Illegal move ${pit}`);
  const side = state.turn, board = state.board.slice(), from = pitIndex(side, pit), skip = STORE[1 - side], path = [];
  let seeds = board[from], at = from;
  board[from] = 0;
  while (seeds > 0) {
    at = (at + 1) % 14;
    if (at === skip) continue;
    board[at] += 1; seeds -= 1; path.push(at);
  }
  let captured = 0;
  if (ownPit(side, at) && board[at] === 1 && board[opposite(at)] > 0) {
    captured = board[opposite(at)] + 1;
    board[STORE[side]] += captured; board[at] = 0; board[opposite(at)] = 0;
  }
  const again = at === STORE[side];
  let next = { ...state, board, turn: again ? side : 1 - side, moves: state.moves + 1, last: { side, pit, from, path, captured, again } };
  // Either side empty: each banks what is left on their own side.
  const empty = [0, 1].map(s => board.slice(s * 7, s * 7 + PITS).every(n => n === 0));
  if (empty[0] || empty[1]) {
    const banked = board.slice();
    for (const s of [0, 1]) for (let i = 0; i < PITS; i++) { banked[STORE[s]] += banked[s * 7 + i]; banked[s * 7 + i] = 0; }
    const scores = [banked[STORE[0]], banked[STORE[1]]];
    next = { ...next, board: banked, over: { scores, winner: scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1 } };
  }
  return next;
}

export const score = (state, side) => state.board[STORE[side]];
export function replay(moves = [], seeds = SEEDS) {
  let state = startGame(seeds);
  for (const text of moves) state = sow(state, Number(text));
  return { state };
}
