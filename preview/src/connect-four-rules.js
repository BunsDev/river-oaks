// Connect Four for the plaza chess tables: seven columns, six rows. Players drop a
// disc into a column and it falls to the lowest empty cell; four in a row across,
// up or diagonally wins, and a full board is a draw. Red moves first. Pure and
// dependency-free, like chess-rules.js and checkers-rules.js.
//
// Cells run a1 (bottom left) to g6 (top right); index = row * 7 + column. Discs are
// 'r' (red) and 'y' (yellow), '' is empty. A move is its column letter, 'a'-'g'.

export const COLUMNS = 7, ROWS = 6, CELLS = COLUMNS * ROWS;
const LETTERS = 'abcdefg';
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
export const other = side => side === 'r' ? 'y' : 'r';
export const cellName = cell => `${LETTERS[cell % COLUMNS]}${Math.floor(cell / COLUMNS) + 1}`;
export function cellOf(name) {
  const column = LETTERS.indexOf(name?.[0]), row = Number(name?.slice(1)) - 1;
  return column >= 0 && Number.isInteger(row) && row >= 0 && row < ROWS && name.length === 2 ? row * COLUMNS + column : -1;
}

export const startPosition = () => ({ board: Array(CELLS).fill(''), turn: 'r' });

// The lowest empty cell of a column, or -1 when it is full.
export function dropCell(board, column) {
  for (let row = 0; row < ROWS; row++) if (!board[row * COLUMNS + column]) return row * COLUMNS + column;
  return -1;
}

export function legalMoves(state) {
  if (winningLine(state.board)) return [];
  const moves = [];
  for (let column = 0; column < COLUMNS; column++) {
    const cell = dropCell(state.board, column);
    if (cell >= 0) moves.push({ column, to: cell, notation: LETTERS[column] });
  }
  return moves;
}

export function makeMove(state, move) {
  const board = state.board.slice();
  board[move.to] = state.turn;
  return { board, turn: other(state.turn) };
}

export const findMove = (state, text) => legalMoves(state).find(move => move.notation === text) ?? null;
export const positionKey = state => state.turn + state.board.map(disc => disc || '.').join('');

// Four or more discs of one colour in a line: the cells and the side, or null.
export function winningLine(board) {
  for (let cell = 0; cell < CELLS; cell++) {
    const side = board[cell];
    if (!side) continue;
    const column = cell % COLUMNS, row = Math.floor(cell / COLUMNS);
    for (const [dc, dr] of DIRECTIONS) {
      const line = [cell];
      for (let step = 1; step < 4; step++) {
        const c = column + dc * step, r = row + dr * step;
        if (c < 0 || c >= COLUMNS || r < 0 || r >= ROWS || board[r * COLUMNS + c] !== side) break;
        line.push(r * COLUMNS + c);
      }
      if (line.length === 4) return { side, cells: line };
    }
  }
  return null;
}

// The result: null while the game goes on.
export function outcome(state) {
  const line = winningLine(state.board);
  if (line) return { winner: line.side, reason: 'four in a row', cells: line.cells };
  if (state.board.every(Boolean)) return { winner: null, reason: 'a full board' };
  return null;
}

// A game from the start and its moves (column letters), replayed and checked.
export function replay(moves = [], start = startPosition()) {
  let state = start;
  const keys = [positionKey(state)], played = [];
  for (const text of moves) {
    const move = findMove(state, text);
    if (!move) throw new Error(`Illegal move ${text}`);
    played.push(move);
    state = makeMove(state, move); keys.push(positionKey(state));
  }
  return { state, played, keys, outcome: outcome(state) };
}

// A position from a diagram: rows from the top (row 6) down, '.' for an empty cell.
// The side to move is whoever has fewer discs, red on a tie.
export function fromDiagram(rows) {
  const board = Array(CELLS).fill('');
  rows.forEach((line, index) => [...line.replace(/\s+/g, '')].forEach((char, column) => { if (char !== '.') board[(ROWS - 1 - index) * COLUMNS + column] = char; }));
  const count = side => board.filter(disc => disc === side).length;
  return { board, turn: count('r') > count('y') ? 'y' : 'r' };
}
