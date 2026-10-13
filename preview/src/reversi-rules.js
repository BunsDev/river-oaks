// Reversi (Othello) for the plaza chess tables: an 8×8 board, black first, starting
// from the four centre discs. A disc must be placed so that it outflanks at least one
// straight line of the other colour, across, up or along a diagonal, and every
// outflanked disc turns over. A side with no such move passes, and the turn returns;
// when neither side can move the game ends and the most discs wins. Pure and
// dependency-free, like chess-rules.js and connect-four-rules.js.
//
// Squares match chess-rules.js (a1 = 0, h8 = 63). Discs are 'd' (black, which the
// table mirror draws like a dark checkers disc) and 'l' (white), '' is empty. A move
// is its square's name, 'a1'-'h8'.

export const SIZE = 8, SQUARES = 64;
const FILES = 'abcdefgh';
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const other = side => side === 'd' ? 'l' : 'd';
export const squareName = square => `${FILES[square % SIZE]}${Math.floor(square / SIZE) + 1}`;
export function squareOf(name) {
  const file = FILES.indexOf(name?.[0]), rank = Number(name?.slice(1)) - 1;
  return file >= 0 && Number.isInteger(rank) && rank >= 0 && rank < SIZE && name.length === 2 ? rank * SIZE + file : -1;
}

export function startPosition() {
  const board = Array(SQUARES).fill('');
  board[squareOf('d4')] = board[squareOf('e5')] = 'l';
  board[squareOf('e4')] = board[squareOf('d5')] = 'd';
  return { board, turn: 'd', passed: false };
}

// The discs a placement on `square` would turn over for `side`, line by line.
export function flipsFor(board, square, side) {
  if (board[square]) return [];
  const file = square % SIZE, rank = Math.floor(square / SIZE), flips = [];
  for (const [df, dr] of DIRECTIONS) {
    const line = [];
    for (let f = file + df, r = rank + dr; f >= 0 && f < SIZE && r >= 0 && r < SIZE; f += df, r += dr) {
      const disc = board[r * SIZE + f];
      if (disc === other(side)) { line.push(r * SIZE + f); continue; }
      if (disc === side && line.length) flips.push(...line);
      break;
    }
  }
  return flips;
}

const movesFor = (board, side) => {
  const moves = [];
  for (let square = 0; square < SQUARES; square++) {
    const flips = flipsFor(board, square, side);
    if (flips.length) moves.push({ to: square, flips, notation: squareName(square) });
  }
  return moves;
};
export const legalMoves = state => movesFor(state.board, state.turn);

// How many squares `side` could play on, without working out the flips: one
// outflanked line is enough. The regular counts this for every position it weighs.
export function mobility(board, side) {
  const them = other(side);
  let total = 0;
  for (let square = 0; square < SQUARES; square++) {
    if (board[square]) continue;
    const file = square % SIZE, rank = (square - file) / SIZE;
    for (const [df, dr] of DIRECTIONS) {
      let f = file + df, r = rank + dr, seen = 0;
      while (f >= 0 && f < SIZE && r >= 0 && r < SIZE && board[r * SIZE + f] === them) { f += df; r += dr; seen++; }
      if (seen && f >= 0 && f < SIZE && r >= 0 && r < SIZE && board[r * SIZE + f] === side) { total++; break; }
    }
  }
  return total;
}

// Places the disc and turns the outflanked ones. If the other side then has no move but
// this side does, the other side passes: the turn stays, and `passed` says so.
export function makeMove(state, move) {
  const board = state.board.slice(), side = state.turn;
  board[move.to] = side;
  for (const square of move.flips) board[square] = side;
  const opponent = other(side);
  if (movesFor(board, opponent).length) return { board, turn: opponent, passed: false };
  return { board, turn: side, passed: movesFor(board, side).length > 0 };
}

export const findMove = (state, text) => legalMoves(state).find(move => move.notation === text) ?? null;
export const positionKey = state => state.turn + state.board.map(disc => disc || '.').join('');
export const count = (board, side) => board.filter(disc => disc === side).length;

// The game is over when neither side can move: the most discs wins, equal is a draw.
// The reason reads as the final count ("36 to 28", "32 discs each").
export function outcome(state) {
  if (movesFor(state.board, state.turn).length) return null;
  const dark = count(state.board, 'd'), light = count(state.board, 'l');
  const reason = dark === light ? `${dark} discs each` : `${Math.max(dark, light)} to ${Math.min(dark, light)}`;
  return { winner: dark > light ? 'd' : light > dark ? 'l' : null, reason, score: { d: dark, l: light } };
}

export function replay(moves = [], start = startPosition()) {
  let state = start;
  const played = [];
  for (const text of moves) {
    const move = findMove(state, text);
    if (!move) break;
    played.push({ ...move, side: state.turn });
    state = makeMove(state, move);
  }
  return { state, played };
}

// A position from a diagram: rows from rank 8 down, 'd' / 'l' / '.', for tests and lessons.
export function fromDiagram(rows, turn = 'd') {
  const board = Array(SQUARES).fill('');
  rows.forEach((row, index) => [...row.replace(/\s+/g, '')].forEach((char, file) => { if (char !== '.') board[(SIZE - 1 - index) * SIZE + file] = char; }));
  return { board, turn, passed: false };
}
