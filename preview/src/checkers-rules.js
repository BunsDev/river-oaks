// Checkers for the plaza chess tables (American checkers / English draughts):
// men move one square diagonally forward, kings one square any diagonal way;
// captures are compulsory, a jumping piece must finish its whole sequence, and a
// man reaching the far row is crowned and stops there. Dark moves first. A side
// with no move loses. Pure and dependency-free, like chess-rules.js; perft pins it.
//
// Squares match chess-rules.js (a1 = 0, h8 = 63) and the board's dark squares are
// the playable ones, so a1 is in play. Pieces: 'd' / 'D' are a dark man / king,
// 'l' / 'L' a light man / king, '' is empty. Dark starts on ranks 1–3 and moves up.

import { squareName, squareOf } from './chess-rules.js';

export const DRAW_PLIES = 80; // forty moves each without a capture or a man moving
const DIAGONALS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const step = (square, [df, dr]) => {
  const file = (square & 7) + df, rank = (square >> 3) + dr;
  return file < 0 || file > 7 || rank < 0 || rank > 7 ? -1 : rank * 8 + file;
};
export const playable = square => (((square & 7) + (square >> 3)) & 1) === 0;
export const sideOf = piece => piece ? piece.toLowerCase() : null;
const isKing = piece => piece === 'D' || piece === 'L';
const forward = side => side === 'd' ? 1 : -1;
const crownRank = side => side === 'd' ? 7 : 0;

export function startPosition() {
  const board = Array(64).fill('');
  for (let square = 0; square < 64; square++) {
    if (!playable(square)) continue;
    const rank = square >> 3;
    if (rank <= 2) board[square] = 'd';
    else if (rank >= 5) board[square] = 'l';
  }
  return { board, turn: 'd', quiet: 0 };
}

const directions = piece => isKing(piece) ? DIAGONALS : DIAGONALS.filter(([, dr]) => dr === forward(sideOf(piece)));

// Every complete jump sequence for the piece on `from`. The mover leaves its
// square at once; jumped pieces stay on the board until the sequence ends, so a
// piece cannot be taken twice.
function jumps(board, from, piece) {
  const sequences = [], side = sideOf(piece), start = board.slice();
  start[from] = '';
  const extend = (square, path, captures) => {
    let extended = false;
    for (const direction of directions(piece)) {
      const over = step(square, direction), to = over < 0 ? -1 : step(over, direction);
      if (to < 0 || !start[over] || sideOf(start[over]) === side || captures.includes(over) || start[to]) continue;
      extended = true;
      const crowned = !isKing(piece) && (to >> 3) === crownRank(side);
      if (crowned) sequences.push({ path: [...path, to], captures: [...captures, over], crowned: true });
      else extend(to, [...path, to], [...captures, over]);
    }
    if (!extended && path.length) sequences.push({ path, captures, crowned: false });
  };
  extend(from, [], []);
  return sequences;
}

export function legalMoves(state) {
  const { board, turn } = state, captures = [], quiet = [];
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (sideOf(piece) !== turn) continue;
    for (const sequence of jumps(board, from, piece)) captures.push({ from, piece, ...sequence });
    if (captures.length) continue;
    for (const direction of directions(piece)) {
      const to = step(from, direction);
      if (to >= 0 && !board[to]) quiet.push({ from, piece, path: [to], captures: [], crowned: !isKing(piece) && (to >> 3) === crownRank(turn) });
    }
  }
  return captures.length ? captures : quiet;
}

export function makeMove(state, move) {
  const board = state.board.slice(), to = move.path.at(-1), side = sideOf(move.piece);
  board[move.from] = '';
  for (const square of move.captures) board[square] = '';
  board[to] = move.crowned ? side.toUpperCase() : move.piece;
  const progress = move.captures.length > 0 || !isKing(move.piece);
  return { board, turn: side === 'd' ? 'l' : 'd', quiet: progress ? 0 : state.quiet + 1 };
}

// 'c3-d4' for a step, 'c3xe5xc7' for a jump sequence.
export const notation = move => [move.from, ...move.path].map(squareName).join(move.captures.length ? 'x' : '-');
export const findMove = (state, text) => legalMoves(state).find(move => notation(move) === text) ?? null;
export const positionKey = state => state.turn + state.board.map(piece => piece || '.').join('');

export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  return moves.reduce((total, move) => total + perft(makeMove(state, move), depth - 1), 0);
}

// The result for a position reached through `keys` (positionKey of every position
// so far, this one included): null while the game goes on.
export function outcome(state, keys = [positionKey(state)]) {
  if (!legalMoves(state).length) return { winner: state.turn === 'd' ? 'l' : 'd', reason: state.board.some(piece => sideOf(piece) === state.turn) ? 'no moves left' : 'no pieces left' };
  if (state.quiet >= DRAW_PLIES) return { winner: null, reason: 'the forty-move rule' };
  const current = keys.at(-1);
  if (keys.filter(key => key === current).length >= 3) return { winner: null, reason: 'threefold repetition' };
  return null;
}

// A game from the start and its moves (notation), replayed and checked.
export function replay(moves = [], start = startPosition()) {
  let state = start;
  const keys = [positionKey(state)], played = [];
  for (const text of moves) {
    const move = findMove(state, text);
    if (!move) throw new Error(`Illegal move ${text}`);
    played.push({ ...move, notation: text });
    state = makeMove(state, move); keys.push(positionKey(state));
  }
  return { state, played, keys, outcome: outcome(state, keys) };
}

// A position from a diagram: rows from rank 8 down, '.' for an empty square.
export function fromDiagram(rows, turn = 'd', quiet = 0) {
  const board = Array(64).fill('');
  rows.forEach((row, index) => [...row.replace(/\s+/g, '')].forEach((char, file) => { if (char !== '.') board[(7 - index) * 8 + file] = char; }));
  return { board, turn, quiet };
}
export { squareName, squareOf };
