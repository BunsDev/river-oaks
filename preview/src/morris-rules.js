// Nine men's morris for the plaza chess tables: 24 points on three nested squares
// joined at their midpoints. Each side places nine pieces in turn, then moves one along
// a line to a neighbouring empty point; a side down to three may fly to any empty point.
// Three in a row along a line is a mill, and making one takes an opponent's piece, never
// from a mill unless all of theirs stand in mills. A side left with two pieces, or with
// no move, loses. White moves first. Pure and dependency-free, like the other table games.
//
// Points are cells of a 7×7 grid, a1 (bottom left) to g7, index = row * 7 + column; only
// the 24 points are played. Pieces are 'w' and 'b', '' is empty. A move is its notation:
// 'd1' places, 'a1-a4' moves, and 'xg7' appended takes the piece on g7.

export const SIZE = 7, PIECES = 9, DRAW_PLIES = 100;
const FILES = 'abcdefg';
export const cellName = cell => `${FILES[cell % SIZE]}${Math.floor(cell / SIZE) + 1}`;
export function cellOf(name) {
  const file = FILES.indexOf(name?.[0]), rank = Number(name?.slice(1)) - 1;
  return file >= 0 && Number.isInteger(rank) && rank >= 0 && rank < SIZE && name.length === 2 ? rank * SIZE + file : -1;
}
export const POINTS = ['a1', 'd1', 'g1', 'b2', 'd2', 'f2', 'c3', 'd3', 'e3', 'a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'c5', 'd5', 'e5', 'b6', 'd6', 'f6', 'a7', 'd7', 'g7'].map(cellOf);
// The sixteen mills, as lines of three points; neighbours are the points beside each
// other on a line.
export const MILLS = [
  ['a7', 'd7', 'g7'], ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'], ['a4', 'b4', 'c4'], ['e4', 'f4', 'g4'], ['c3', 'd3', 'e3'], ['b2', 'd2', 'f2'], ['a1', 'd1', 'g1'],
  ['a1', 'a4', 'a7'], ['b2', 'b4', 'b6'], ['c3', 'c4', 'c5'], ['d5', 'd6', 'd7'], ['d1', 'd2', 'd3'], ['e3', 'e4', 'e5'], ['f2', 'f4', 'f6'], ['g1', 'g4', 'g7'],
].map(line => line.map(cellOf));
export const NEIGHBOURS = new Map(POINTS.map(point => [point, []]));
for (const [a, b, c] of MILLS) for (const [x, y] of [[a, b], [b, c]]) { NEIGHBOURS.get(x).push(y); NEIGHBOURS.get(y).push(x); }

export const other = side => side === 'w' ? 'b' : 'w';
export const startPosition = () => ({ board: Array(SIZE * SIZE).fill(''), turn: 'w', hand: { w: PIECES, b: PIECES }, quiet: 0 });
export const count = (state, side) => state.board.filter(piece => piece === side).length;
const inMill = (board, point) => MILLS.some(line => line.includes(point) && line.every(cell => board[cell] && board[cell] === board[point]));

// The opponent pieces a mill may take: any not in a mill, or any at all when every one is.
export function takeable(board, side) {
  const theirs = POINTS.filter(point => board[point] === other(side)), free = theirs.filter(point => !inMill(board, point));
  return free.length ? free : theirs;
}

// Every move for the side to move: where it places or moves from and to, and, when that
// closes a mill, one move per piece it could take.
export function legalMoves(state) {
  if (outcome(state)) return [];
  const { board, turn } = state, steps = [];
  if (state.hand[turn] > 0) for (const point of POINTS) { if (!board[point]) steps.push({ from: null, to: point }); }
  else {
    const flying = count(state, turn) === 3;
    for (const from of POINTS) {
      if (board[from] !== turn) continue;
      for (const to of flying ? POINTS : NEIGHBOURS.get(from)) if (!board[to]) steps.push({ from, to });
    }
  }
  const moves = [];
  for (const step of steps) {
    const after = board.slice();
    if (step.from !== null) after[step.from] = '';
    after[step.to] = turn;
    const name = (step.from === null ? '' : `${cellName(step.from)}-`) + cellName(step.to);
    if (!inMill(after, step.to)) { moves.push({ ...step, take: null, notation: name }); continue; }
    for (const take of takeable(after, turn)) moves.push({ ...step, take, notation: `${name}x${cellName(take)}` });
  }
  return moves;
}

export function makeMove(state, move) {
  const board = state.board.slice(), side = state.turn, hand = { ...state.hand };
  if (move.from === null) hand[side]--; else board[move.from] = '';
  board[move.to] = side;
  if (move.take !== null) board[move.take] = '';
  return { board, turn: other(side), hand, quiet: move.take !== null || move.from === null ? 0 : state.quiet + 1 };
}

export const findMove = (state, text) => legalMoves(state).find(move => move.notation === text) ?? null;
export const positionKey = state => state.turn + state.hand.w + state.hand.b + state.board.map(piece => piece || '.').join('');

// The game is over when the side to move is down to two pieces after placing, or has no
// move at all; or drawn after a hundred plies without a mill, or the same position thrice.
export function outcome(state, keys = [positionKey(state)]) {
  const side = state.turn;
  if (state.hand[side] === 0 && count(state, side) < 3) return { winner: other(side), reason: 'down to two pieces' };
  if (state.quiet >= DRAW_PLIES) return { winner: null, reason: 'fifty moves each without a mill' };
  if (keys.filter(key => key === keys.at(-1)).length >= 3) return { winner: null, reason: 'the same position three times' };
  if (state.hand[side] === 0 && !hasStep(state)) return { winner: other(side), reason: 'no move left' };
  return null;
}
function hasStep(state) {
  if (count(state, state.turn) === 3) return state.board.some((piece, cell) => !piece && POINTS.includes(cell));
  return POINTS.some(from => state.board[from] === state.turn && NEIGHBOURS.get(from).some(to => !state.board[to]));
}

export function replay(moves = [], start = startPosition()) {
  let state = start;
  const keys = [positionKey(state)], played = [];
  for (const text of moves) {
    const move = findMove(state, text);
    if (!move || outcome(state, keys)) break;
    played.push({ ...move, side: state.turn });
    state = makeMove(state, move); keys.push(positionKey(state));
  }
  return { state, keys, played, result: outcome(state, keys) };
}

// A position from a diagram: rows from rank 7 down, 'w' / 'b' / '.', with what each
// side still has in hand; for tests and lessons.
export function fromDiagram(rows, { turn = 'w', hand = { w: 0, b: 0 }, quiet = 0 } = {}) {
  const board = Array(SIZE * SIZE).fill('');
  rows.forEach((row, index) => [...row.replace(/\s+/g, '')].forEach((char, file) => { if (char !== '.') board[(SIZE - 1 - index) * SIZE + file] = char; }));
  return { board, turn, hand: { ...hand }, quiet };
}
