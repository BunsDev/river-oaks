import * as connectFour from './connect-four-rules.js';

// Connect Four for the plaza game sheet (plaza-table-games.js): a 7×6 board that keeps
// its orientation, and moves that drop into a column, played with one click anywhere in it.
export const CONNECT_FOUR = {
  id: 'connectFour', name: 'Connect Four', sides: ['r', 'y'], sideName: { r: 'Red', y: 'Yellow' }, opening: { r: 'd1', y: 'd1' },
  size: { rows: connectFour.ROWS, cols: connectFour.COLUMNS }, drop: true, flips: false, mirror: 'connectFour',
  squareName: connectFour.cellName, squareOf: connectFour.cellOf,
  replay(moves) {
    const { state, played } = connectFour.replay(moves);
    return { state, keys: [], played: played.map(move => ({ to: move.to, text: move.notation.toUpperCase() })), result: connectFour.outcome(state) };
  },
  turn: state => state.turn,
  piece(state, cell) {
    const side = state.board[cell];
    return side ? { side, label: `${side === 'r' ? 'red' : 'yellow'} disc` } : null;
  },
  moves: state => connectFour.legalMoves(state).map(move => ({ to: move.to, column: move.column, key: move.notation, capture: false })),
  // Any cell of a column drops into it.
  dropAt: (moves, cell) => moves.find(move => move.column === cell % connectFour.COLUMNS) ?? null,
  alert: () => null,
  ending: () => 'Four in a row.',
  position: state => state,
  key: connectFour.positionKey,
};
