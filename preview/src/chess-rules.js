// Chess rules for the plaza tables: legal moves (castling, en passant,
// promotion), check, mate, stalemate and the draw rules, FEN in and out, and
// SAN for the move list. Pure and dependency-free, so the browser, a worker and
// (later) the town server can share one implementation; perft tests pin it.
//
// Squares are 0..63: a1 = 0, h1 = 7, a8 = 56. Pieces are FEN letters, white in
// upper case; an empty square is ''. A move is { from, to, promotion? } plus the
// flags legalMoves() adds: piece, captured, castle ('k' | 'q'), enPassant, double.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]], BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SLIDES = { r: ROOK, b: BISHOP, q: [...ROOK, ...BISHOP] };

export const squareName = square => FILES[square & 7] + (1 + (square >> 3));
export const squareOf = name => FILES.indexOf(name[0]) + 8 * (Number(name[1]) - 1);
const colourOf = piece => piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null;
const other = colour => colour === 'w' ? 'b' : 'w';
const step = (square, [df, dr]) => {
  const file = (square & 7) + df, rank = (square >> 3) + dr;
  return file < 0 || file > 7 || rank < 0 || rank > 7 ? -1 : rank * 8 + file;
};

export function fromFEN(fen = START_FEN) {
  const [placement, turn = 'w', castling = '-', ep = '-', halfmove = '0', fullmove = '1'] = fen.trim().split(/\s+/);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('A position needs eight ranks');
  const board = Array(64).fill('');
  rows.forEach((row, index) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) file += Number(char);
      else if (/[pnbrqk]/i.test(char) && file < 8) board[(7 - index) * 8 + file++] = char;
      else throw new Error(`Unexpected '${char}' in the position`);
    }
    if (file !== 8) throw new Error('Each rank needs eight squares');
  });
  if (!['w', 'b'].includes(turn)) throw new Error('The side to move is w or b');
  return { board, turn, castling: castling === '-' ? '' : castling, ep: ep === '-' ? -1 : squareOf(ep),
    halfmove: Number(halfmove) || 0, fullmove: Number(fullmove) || 1 };
}

export function toFEN(state) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '', empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = state.board[rank * 8 + file];
      if (!piece) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += piece;
    }
    rows.push(row + (empty || ''));
  }
  return `${rows.join('/')} ${state.turn} ${state.castling || '-'} ${state.ep < 0 ? '-' : squareName(state.ep)} ${state.halfmove} ${state.fullmove}`;
}

// Whether `by` attacks `square`.
export function attacked(state, square, by) {
  const { board } = state, upper = by === 'w';
  const is = (target, type) => target >= 0 && board[target] === (upper ? type.toUpperCase() : type);
  const pawnRank = upper ? -1 : 1;
  if (is(step(square, [-1, pawnRank]), 'p') || is(step(square, [1, pawnRank]), 'p')) return true;
  if (KNIGHT.some(offset => is(step(square, offset), 'n'))) return true;
  if (KING.some(offset => is(step(square, offset), 'k'))) return true;
  for (const [type, directions] of [['r', ROOK], ['b', BISHOP]]) for (const direction of directions) {
    for (let target = step(square, direction); target >= 0; target = step(target, direction)) {
      if (!board[target]) continue;
      if (is(target, type) || is(target, 'q')) return true;
      break;
    }
  }
  return false;
}

export const kingSquare = (state, colour) => state.board.indexOf(colour === 'w' ? 'K' : 'k');
export const inCheck = (state, colour = state.turn) => attacked(state, kingSquare(state, colour), other(colour));

function pseudoMoves(state) {
  const { board, turn } = state, moves = [];
  const add = (from, to, extra = {}) => moves.push({ from, to, piece: board[from], captured: board[to] || null, ...extra });
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (colourOf(piece) !== turn) continue;
    const type = piece.toLowerCase();
    if (type === 'p') {
      const forward = turn === 'w' ? 1 : -1, lastRank = turn === 'w' ? 7 : 0, startRank = turn === 'w' ? 1 : 6;
      const push = (to, extra) => (to >> 3) === lastRank ? 'qrbn'.split('').forEach(promotion => add(from, to, { ...extra, promotion })) : add(from, to, extra);
      const one = step(from, [0, forward]);
      if (one >= 0 && !board[one]) {
        push(one);
        const two = step(one, [0, forward]);
        if ((from >> 3) === startRank && !board[two]) add(from, two, { double: true });
      }
      for (const side of [-1, 1]) {
        const to = step(from, [side, forward]);
        if (to < 0) continue;
        if (board[to] && colourOf(board[to]) !== turn) push(to);
        else if (to === state.ep) add(from, to, { enPassant: true, captured: turn === 'w' ? 'p' : 'P' });
      }
    } else if (type === 'n' || type === 'k') {
      for (const offset of type === 'n' ? KNIGHT : KING) {
        const to = step(from, offset);
        if (to >= 0 && colourOf(board[to]) !== turn) add(from, to);
      }
      if (type === 'k') {
        const home = turn === 'w' ? 4 : 60, [king, queen] = turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (from === home && state.castling.includes(king) && !board[home + 1] && !board[home + 2]) add(from, home + 2, { castle: 'k' });
        if (from === home && state.castling.includes(queen) && !board[home - 1] && !board[home - 2] && !board[home - 3]) add(from, home - 2, { castle: 'q' });
      }
    } else {
      for (const direction of SLIDES[type]) {
        for (let to = step(from, direction); to >= 0; to = step(to, direction)) {
          if (colourOf(board[to]) === turn) break;
          add(from, to);
          if (board[to]) break;
        }
      }
    }
  }
  return moves;
}

// The position after a move (pseudo-legal or legal); the input is not changed.
export function makeMove(state, move) {
  const board = state.board.slice(), piece = board[move.from], type = piece.toLowerCase(), turn = state.turn;
  board[move.to] = move.promotion ? (turn === 'w' ? move.promotion.toUpperCase() : move.promotion) : piece;
  board[move.from] = '';
  if (move.enPassant) board[move.to + (turn === 'w' ? -8 : 8)] = '';
  if (move.castle) {
    const home = turn === 'w' ? 0 : 56, [rookFrom, rookTo] = move.castle === 'k' ? [home + 7, home + 5] : [home, home + 3];
    board[rookTo] = board[rookFrom]; board[rookFrom] = '';
  }
  let castling = state.castling;
  const lose = squares => { for (const [square, rights] of squares) if (move.from === square || move.to === square) castling = castling.replace(new RegExp(`[${rights}]`, 'g'), ''); };
  lose([[4, 'KQ'], [60, 'kq'], [0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]);
  const captured = move.enPassant || Boolean(state.board[move.to]);
  return { board, turn: other(turn), castling, ep: move.double ? (move.from + move.to) / 2 : -1,
    halfmove: type === 'p' || captured ? 0 : state.halfmove + 1, fullmove: state.fullmove + (turn === 'b' ? 1 : 0) };
}

export function legalMoves(state) {
  return pseudoMoves(state).filter(move => {
    if (move.castle) {
      const pass = move.from + (move.castle === 'k' ? 1 : -1);
      if (inCheck(state) || attacked(state, pass, other(state.turn))) return false;
    }
    return !inCheck(makeMove(state, move), state.turn);
  });
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  return moves.reduce((total, move) => total + perft(makeMove(state, move), depth - 1), 0);
}

// Only the parts of a position that decide repetition (FEN minus the clocks).
export const positionKey = state => toFEN(state).split(' ').slice(0, 4).join(' ');

function insufficientMaterial({ board }) {
  const pieces = board.map((piece, square) => ({ piece: piece.toLowerCase(), square })).filter(({ piece }) => piece && piece !== 'k');
  if (pieces.some(({ piece }) => ['p', 'r', 'q'].includes(piece))) return false;
  if (pieces.length <= 1) return true;
  // Only bishops, all on one colour of square.
  const shade = square => ((square >> 3) + (square & 7)) & 1;
  return pieces.every(({ piece }) => piece === 'b') && new Set(pieces.map(({ square }) => shade(square))).size === 1;
}

// The game result for a position reached through `keys` (positionKey of every
// position so far, this one included): null while the game goes on.
export function outcome(state, keys = [positionKey(state)]) {
  const moves = legalMoves(state);
  if (!moves.length) return inCheck(state) ? { result: state.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' } : { result: '1/2-1/2', reason: 'stalemate' };
  if (state.halfmove >= 100) return { result: '1/2-1/2', reason: 'fifty-move rule' };
  const current = keys[keys.length - 1];
  if (keys.filter(key => key === current).length >= 3) return { result: '1/2-1/2', reason: 'threefold repetition' };
  if (insufficientMaterial(state)) return { result: '1/2-1/2', reason: 'insufficient material' };
  return null;
}

export function san(state, move) {
  const type = move.piece.toLowerCase(), after = makeMove(state, move);
  let text;
  if (move.castle) text = move.castle === 'k' ? 'O-O' : 'O-O-O';
  else if (type === 'p') text = (move.captured ? FILES[move.from & 7] + 'x' : '') + squareName(move.to) + (move.promotion ? '=' + move.promotion.toUpperCase() : '');
  else {
    const rivals = legalMoves(state).filter(other => other.piece === move.piece && other.to === move.to && other.from !== move.from);
    let hint = '';
    if (rivals.length) {
      const sameFile = rivals.some(other => (other.from & 7) === (move.from & 7)), sameRank = rivals.some(other => (other.from >> 3) === (move.from >> 3));
      hint = !sameFile ? FILES[move.from & 7] : !sameRank ? String(1 + (move.from >> 3)) : squareName(move.from);
    }
    text = type.toUpperCase() + hint + (move.captured ? 'x' : '') + squareName(move.to);
  }
  if (inCheck(after)) text += legalMoves(after).length ? '+' : '#';
  return text;
}

export const uci = move => squareName(move.from) + squareName(move.to) + (move.promotion ?? '');
// The legal move matching a UCI string such as 'e2e4' or 'e7e8q', or null.
export const findMove = (state, text) => legalMoves(state).find(move => uci(move) === text) ?? null;

// A game from its starting position and its moves (UCI), replayed and checked.
export function replay(moves = [], fen = START_FEN) {
  let state = fromFEN(fen);
  const keys = [positionKey(state)], played = [];
  for (const text of moves) {
    const move = findMove(state, text);
    if (!move) throw new Error(`Illegal move ${text}`);
    played.push({ ...move, san: san(state, move), uci: text });
    state = makeMove(state, move); keys.push(positionKey(state));
  }
  return { state, played, keys, outcome: outcome(state, keys) };
}
