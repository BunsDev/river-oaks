import * as morris from './morris-rules.js';

// Nine men's morris for the plaza game sheet (plaza-table-games.js): a 7×7 board where
// only the 24 points are played, joined by lines. While a side has pieces in hand, a
// move is a click on an empty point; after that a piece is chosen and moved. Closing a
// mill asks, on the board, which piece to take. The table shows its own morris board.
const NAME = { w: 'White', b: 'Black' }, POINT = new Set(morris.POINTS);
export const MORRIS = {
  id: 'morris', name: "Nine men's morris", short: 'Morris', sides: ['w', 'b'], sideName: NAME, opening: { w: 'd2', b: 'd6' },
  size: { rows: morris.SIZE, cols: morris.SIZE }, squareName: morris.cellName, squareOf: morris.cellOf, mirror: 'morris',
  playable: cell => POINT.has(cell),
  // Placing is one click; moving picks a piece first.
  drop: state => state.hand[state.turn] > 0,
  replay(moves) {
    const { state, keys, played, result } = morris.replay(moves);
    return { state, keys, played: played.map(move => ({ ...(move.from === null ? {} : { from: move.from }), to: move.to, text: move.notation })), result };
  },
  turn: state => state.turn,
  piece(state, cell) {
    const side = state.board[cell];
    return side ? { side, label: `${NAME[side].toLowerCase()} piece` } : null;
  },
  // `take` is the piece a mill would take; one move per piece it may take.
  moves: state => morris.legalMoves(state).map(move => ({ ...(move.from === null ? {} : { from: move.from }), to: move.to, take: move.take, key: move.notation, capture: false })),
  dropAt: (moves, cell) => moves.find(move => move.to === cell) ?? null,
  takeLabel: state => `Choose a ${NAME[morris.other(state.turn)].toLowerCase()} piece to take.`,
  alert(state) {
    if (state.hand.w || state.hand.b) return { square: -1, text: `To place: White ${state.hand.w} · Black ${state.hand.b}. ` };
    return morris.count(state, state.turn) === 3 ? { square: -1, text: `${NAME[state.turn]} is down to three and may fly. ` } : null;
  },
  ending: reason => reason === 'down to two pieces' ? 'Down to two pieces.' : 'Blocked, with no move left.',
  position: state => state,
  key: morris.positionKey,
};
