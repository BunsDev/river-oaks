import * as reversi from './reversi-rules.js';

// Reversi for the plaza game sheet (plaza-table-games.js): an 8×8 board that keeps its
// orientation, where a move is a disc placed on the clicked square. The table mirror
// draws black discs where checkers has dark ones ('d') and white where it has light.
// A side with no move passes on its own; the status says so and keeps the count.
const NAME = { d: 'Black', l: 'White' };
export const REVERSI = {
  id: 'reversi', name: 'Reversi', sides: ['d', 'l'], sideName: NAME, opening: { d: 'd3', l: 'c5' },
  drop: true, flips: false,
  replay(moves) {
    const { state, played } = reversi.replay(moves), ended = reversi.outcome(state);
    return { state, keys: [], played: played.map(move => ({ to: move.to, text: move.notation })), result: ended && { winner: ended.winner, reason: ended.reason } };
  },
  turn: state => state.turn,
  piece(state, square) {
    const side = state.board[square];
    return side ? { side, label: `${NAME[side].toLowerCase()} disc` } : null;
  },
  moves: state => reversi.legalMoves(state).map(move => ({ to: move.to, key: move.notation, capture: false, flips: move.flips.length })),
  // A disc goes on the clicked square.
  dropAt: (moves, square) => moves.find(move => move.to === square) ?? null,
  alert(state) {
    const passed = state.passed ? `${NAME[reversi.other(state.turn)]} has no move. ` : '';
    return { square: -1, text: `${passed}Black ${reversi.count(state.board, 'd')} · White ${reversi.count(state.board, 'l')}. ` };
  },
  ending: reason => `No moves left, ${reason}.`,
  position: state => state,
  key: reversi.positionKey,
};
