// Xiangqi (Chinese chess) at the plaza grove table. Nine files by ten ranks of points;
// red sits at rank 0 and moves first, black at rank 9. A river runs between ranks 4 and
// 5, and each side has a palace: files d–f, its own three nearest ranks.
//
//   K general   one step along a line, never out of its palace
//   A advisor   one step diagonally, never out of its palace
//   E elephant  two steps diagonally, unless the point between is taken; never across the river
//   H horse     one step along a line then one diagonally outward, unless that first point is taken
//   R chariot   any distance along a line
//   C cannon    moves like a chariot, but captures only by jumping exactly one piece (the screen)
//   P soldier   one step forward; across the river, also one step sideways
//
// The two generals may never face each other along a file with nothing between (the
// flying general). No move may leave your own general attacked. A side with no legal
// move loses, in check or not. The same position a third time, or 120 moves without a
// capture, is a draw (the plaza's simplification of the chasing rules).
//
// Points are rank * 9 + file. Red pieces are upper case, black lower. A move is from-to
// in coordinates, 'h2e2' (files a–i, ranks 0–9). Pure and dependency-free.

export const FILES = 9, RANKS = 10;
export const VALUE = { k: 0, a: 200, e: 200, h: 400, r: 900, c: 450, p: 100 };
const FILE_LETTERS = 'abcdefghi';
export const pointName = index => `${FILE_LETTERS[index % FILES]}${Math.floor(index / FILES)}`;
export const pointOf = name => (Number(name[1]) * FILES + FILE_LETTERS.indexOf(name[0]));
const fileOf = index => index % FILES, rankOf = index => Math.floor(index / FILES);
const isRed = piece => piece !== null && piece === piece.toUpperCase();
export const sideOf = piece => (piece === null ? null : isRed(piece) ? 'r' : 'b');
const inPalace = (index, side) => { const f = fileOf(index), r = rankOf(index); return f >= 3 && f <= 5 && (side === 'r' ? r <= 2 : r >= 7); };
const ownHalf = (index, side) => (side === 'r' ? rankOf(index) <= 4 : rankOf(index) >= 5);
const at = (file, rank) => (file < 0 || file >= FILES || rank < 0 || rank >= RANKS ? -1 : rank * FILES + file);
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function startGame() {
  const board = Array(FILES * RANKS).fill(null), back = 'rheakaehr';
  [...back].forEach((piece, file) => { board[at(file, 0)] = piece.toUpperCase(); board[at(file, 9)] = piece; });
  for (const file of [1, 7]) { board[at(file, 2)] = 'C'; board[at(file, 7)] = 'c'; }
  for (const file of [0, 2, 4, 6, 8]) { board[at(file, 3)] = 'P'; board[at(file, 6)] = 'p'; }
  const state = { board, turn: 'r', plies: 0, quiet: 0, seen: {}, winner: null, draw: false, last: null };
  state.seen[positionKey(state)] = 1;
  return state;
}
export const positionKey = state => `${state.board.map(piece => piece ?? '.').join('')}${state.turn}`;

// Every move of the piece on `from`, ignoring whether it leaves its own general attacked.
function pieceMoves(board, from) {
  const piece = board[from], side = sideOf(piece), type = piece.toLowerCase(), f = fileOf(from), r = rankOf(from), out = [];
  const add = to => { if (to >= 0 && sideOf(board[to]) !== side) out.push(to); };
  switch (type) {
    case 'k': for (const [df, dr] of ORTHO) { const to = at(f + df, r + dr); if (to >= 0 && inPalace(to, side)) add(to); } break;
    case 'a': for (const [df, dr] of DIAG) { const to = at(f + df, r + dr); if (to >= 0 && inPalace(to, side)) add(to); } break;
    case 'e': for (const [df, dr] of DIAG) { const eye = at(f + df, r + dr), to = at(f + 2 * df, r + 2 * dr); if (to >= 0 && board[eye] === null && ownHalf(to, side)) add(to); } break;
    case 'h': for (const [df, dr] of ORTHO) {
      const leg = at(f + df, r + dr);
      if (leg < 0 || board[leg] !== null) continue;
      for (const side2 of [-1, 1]) add(df ? at(f + 2 * df, r + side2) : at(f + side2, r + 2 * dr));
    } break;
    case 'r': for (const [df, dr] of ORTHO) for (let k = 1; ; k++) { const to = at(f + df * k, r + dr * k); if (to < 0) break; add(to); if (board[to] !== null) break; } break;
    case 'c': for (const [df, dr] of ORTHO) {
      let screen = false;
      for (let k = 1; ; k++) {
        const to = at(f + df * k, r + dr * k);
        if (to < 0) break;
        if (!screen) { if (board[to] === null) out.push(to); else screen = true; continue; }
        if (board[to] !== null) { if (sideOf(board[to]) !== side) out.push(to); break; }
      }
    } break;
    case 'p': {
      const forward = side === 'r' ? 1 : -1;
      add(at(f, r + forward));
      if (!ownHalf(from, side)) { add(at(f - 1, r)); add(at(f + 1, r)); }
      break;
    }
    default: break;
  }
  return out;
}

// Is `side`'s general attacked (or facing the other general)?
export function inCheck(board, side) {
  const general = board.indexOf(side === 'r' ? 'K' : 'k');
  if (general < 0) return true;
  const enemy = side === 'r' ? 'b' : 'r', f = fileOf(general), r = rankOf(general);
  // Along lines: chariots, the facing general, and cannons with one screen.
  for (const [df, dr] of ORTHO) {
    let screens = 0;
    for (let k = 1; ; k++) {
      const point = at(f + df * k, r + dr * k);
      if (point < 0) break;
      const piece = board[point];
      if (piece === null) continue;
      const type = piece.toLowerCase();
      if (screens === 0) {
        if (sideOf(piece) === enemy && (type === 'r' || (type === 'k' && df === 0))) return true;
        screens = 1;
      } else { if (sideOf(piece) === enemy && type === 'c') return true; break; }
    }
  }
  // Horses: from each horse spot, the leg point next to the horse must be empty.
  for (const [df, dr] of ORTHO) for (const s of [-1, 1]) {
    const [hf, hr] = df ? [f - 2 * df, r - s] : [f - s, r - 2 * dr], horse = at(hf, hr);
    if (horse < 0 || board[horse] !== (enemy === 'r' ? 'H' : 'h')) continue;
    if (board[at(hf + df, hr + dr)] === null) return true;
  }
  // Soldiers: in front of the general, or beside it (they only attack sideways across the river, which the palace is).
  const soldier = enemy === 'r' ? 'P' : 'p', toward = enemy === 'r' ? -1 : 1;
  if (board[at(f, r + toward)] === soldier || board[at(f - 1, r)] === soldier || board[at(f + 1, r)] === soldier) return true;
  return false;
}

export function legalMoves(state) {
  if (state.winner || state.draw) return [];
  const moves = [];
  state.board.forEach((piece, from) => {
    if (sideOf(piece) !== state.turn) return;
    for (const to of pieceMoves(state.board, from)) {
      const board = state.board.slice(); board[to] = piece; board[from] = null;
      if (!inCheck(board, state.turn)) moves.push({ from, to, piece, captured: state.board[to] });
    }
  });
  return moves;
}

export const notation = move => `${pointName(move.from)}${pointName(move.to)}`;

// Plays a move without checking the end of the game (for search).
export function makeMove(state, move) {
  const board = state.board.slice(); board[move.to] = board[move.from]; board[move.from] = null;
  return { ...state, board, turn: state.turn === 'r' ? 'b' : 'r', plies: state.plies + 1, quiet: move.captured ? 0 : state.quiet + 1, last: { from: move.from, to: move.to, captured: move.captured } };
}

export function play(state, text) {
  if (state.winner || state.draw) throw new Error('The game is over');
  const move = legalMoves(state).find(option => notation(option) === text);
  if (!move) throw new Error(`Illegal move ${text}`);
  const next = makeMove(state, move), key = positionKey(next), seen = { ...state.seen, [key]: (state.seen[key] ?? 0) + 1 };
  const replies = legalMoves(next).length, check = inCheck(next.board, next.turn);
  const winner = replies === 0 ? state.turn : null, draw = !winner && (seen[key] >= 3 || next.quiet >= 120);
  return { ...next, seen, winner, draw, check, mate: replies === 0 && check };
}

export function replay(moves = []) {
  let state = startGame();
  for (const move of moves) state = play(state, move);
  return { state };
}
