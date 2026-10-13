// Go on a 9×9 board at the plaza's grove table. Black moves first. A stone or group
// with no empty point beside it (no liberty) is captured. A move may not leave its
// own group without liberties unless it captures (no suicide), and may not recreate
// any earlier position (positional superko, which covers the simple ko). Two passes
// in a row end the game. Scoring is by area (Chinese rules): stones on the board plus
// empty regions bordered by one colour only, with 7.5 komi for white, so there are
// no ties. Stones still on the board at the end count as alive, so play out dead
// groups before passing (Tromp–Taylor).
//
// Points are named as on a 9×9 board, columns a–j without i, rows 1–9 from black's
// side ('e5'); a move is a point or 'pass'. Games replay exactly from their moves.
// Pure and dependency-free.

export const SIZE = 9, KOMI = 7.5;
const COLUMNS = 'abcdefghj';
export const pointName = index => `${COLUMNS[index % SIZE]}${Math.floor(index / SIZE) + 1}`;
export function pointOf(name) {
  const column = COLUMNS.indexOf(name?.[0]), row = Number(name?.slice(1)) - 1;
  return column >= 0 && Number.isInteger(row) && row >= 0 && row < SIZE ? row * SIZE + column : -1;
}
export const other = colour => (colour === 'b' ? 'w' : 'b');

const NEIGHBOURS = Array.from({ length: SIZE * SIZE }, (_, index) => {
  const x = index % SIZE, y = Math.floor(index / SIZE), list = [];
  if (x > 0) list.push(index - 1); if (x < SIZE - 1) list.push(index + 1);
  if (y > 0) list.push(index - SIZE); if (y < SIZE - 1) list.push(index + SIZE);
  return list;
});
export const neighbours = index => NEIGHBOURS[index];

export const startGame = () => ({ board: Array(SIZE * SIZE).fill(''), turn: 'b', captures: { b: 0, w: 0 }, passes: 0, seen: [''.padEnd(SIZE * SIZE, '.')], over: null, last: null });
const key = board => board.map(stone => stone || '.').join('');

// The group containing a stone, and its liberties.
export function group(board, index) {
  const colour = board[index], stones = [index], seen = new Set(stones), liberties = new Set();
  for (let i = 0; i < stones.length; i++) for (const next of NEIGHBOURS[stones[i]]) {
    if (!board[next]) liberties.add(next);
    else if (board[next] === colour && !seen.has(next)) { seen.add(next); stones.push(next); }
  }
  return { stones, liberties };
}

// Places a stone without the superko check: the board after captures, or null if suicide.
export function place(board, index, colour) {
  if (board[index]) return null;
  const next = board.slice(); next[index] = colour;
  let captured = 0;
  for (const near of NEIGHBOURS[index]) {
    if (next[near] !== other(colour)) continue;
    const { stones, liberties } = group(next, near);
    if (!liberties.size) { for (const stone of stones) next[stone] = ''; captured += stones.length; }
  }
  if (!captured && !group(next, index).liberties.size) return null;
  return { board: next, captured };
}

export function isLegal(state, index) {
  if (state.over || index < 0 || index >= SIZE * SIZE || state.board[index]) return false;
  const placed = place(state.board, index, state.turn);
  return Boolean(placed) && !state.seen.includes(key(placed.board));
}
export function legalMoves(state) {
  if (state.over) return [];
  const moves = [];
  for (let index = 0; index < SIZE * SIZE; index++) if (isLegal(state, index)) moves.push(index);
  return moves;
}

// Area score: stones plus empty regions that touch only one colour.
export function areaScore(board) {
  const score = { b: 0, w: 0 }, seen = new Set();
  for (let index = 0; index < board.length; index++) {
    if (board[index]) { score[board[index]] += 1; continue; }
    if (seen.has(index)) continue;
    const region = [index], borders = new Set();
    seen.add(index);
    for (let i = 0; i < region.length; i++) for (const next of NEIGHBOURS[region[i]]) {
      if (board[next]) borders.add(board[next]);
      else if (!seen.has(next)) { seen.add(next); region.push(next); }
    }
    if (borders.size === 1) score[[...borders][0]] += region.length;
  }
  return { b: score.b, w: score.w + KOMI };
}

export function play(state, move) {
  if (state.over) throw new Error('The game is over');
  if (move === 'pass') {
    const passes = state.passes + 1, next = { ...state, turn: other(state.turn), passes, last: { colour: state.turn, pass: true } };
    if (passes < 2) return next;
    const score = areaScore(state.board);
    return { ...next, over: { score, winner: score.b > score.w ? 'b' : 'w', margin: Math.abs(score.b - score.w) } };
  }
  const index = typeof move === 'number' ? move : pointOf(move);
  if (!isLegal(state, index)) throw new Error(`Illegal move ${typeof move === 'number' ? pointName(move) : move}`);
  const { board, captured } = place(state.board, index, state.turn);
  return { ...state, board, turn: other(state.turn), captures: { ...state.captures, [state.turn]: state.captures[state.turn] + captured }, passes: 0,
    seen: [...state.seen, key(board)], last: { colour: state.turn, index, captured } };
}

export const notation = move => (move === 'pass' ? 'pass' : pointName(move));
export function replay(moves = []) {
  let state = startGame();
  for (const text of moves) state = play(state, text === 'pass' ? 'pass' : pointOf(text));
  return { state };
}
