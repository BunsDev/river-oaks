// The games at the plaza chess tables, as adapters over their pure rules modules: what
// the game sheet (plaza-table-games.js) draws and plays, and what the town checks
// (server/table-games.js) when two residents play each other. DOM-free, and importing
// only rules, so the browser, the worker and the server share one set of moves.
import * as chess from './chess-rules.js';
import * as checkers from './checkers-rules.js';
import { CONNECT_FOUR } from './connect-four-adapter.js';
import { REVERSI } from './reversi-adapter.js';
import { MORRIS } from './morris-adapter.js';

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

export const CHESS = {
  id: 'chess', name: 'Chess', sides: ['w', 'b'], sideName: { w: 'White', b: 'Black' }, opening: { w: 'e2', b: 'e7' },
  replay(moves) {
    let state = chess.fromFEN(chess.START_FEN);
    const keys = [chess.positionKey(state)], played = [];
    for (const text of moves) {
      const move = chess.findMove(state, text);
      if (!move) break;
      played.push({ from: move.from, to: move.to, text: chess.san(state, move) });
      state = chess.makeMove(state, move); keys.push(chess.positionKey(state));
    }
    const ended = chess.outcome(state, keys);
    return { state, keys, played, result: ended && { winner: ended.result === '1-0' ? 'w' : ended.result === '0-1' ? 'b' : null, reason: ended.reason } };
  },
  turn: state => state.turn,
  piece(state, square) {
    const letter = state.board[square];
    if (!letter) return null;
    const side = letter === letter.toUpperCase() ? 'w' : 'b', type = letter.toLowerCase();
    return { side, label: `${side === 'w' ? 'white' : 'black'} ${NAME[type]}`, glyph: GLYPH[type] };
  },
  moves: state => chess.legalMoves(state).map(move => ({ from: move.from, to: move.to, key: chess.uci(move), capture: Boolean(move.captured), choice: move.promotion ?? null })),
  alert: state => chess.inCheck(state) ? { square: chess.kingSquare(state, state.turn), text: 'Check! ' } : null,
  ending: () => 'Checkmate.',
  position: state => chess.toFEN(state),
};

export const CHECKERS = {
  id: 'checkers', name: 'Checkers', sides: ['d', 'l'], sideName: { d: 'Dark', l: 'Light' }, opening: { d: 'c3', l: 'f6' },
  replay(moves) {
    let state = checkers.startPosition();
    const keys = [checkers.positionKey(state)], played = [];
    for (const text of moves) {
      const move = checkers.findMove(state, text);
      if (!move) break;
      played.push({ from: move.from, to: move.path.at(-1), text });
      state = checkers.makeMove(state, move); keys.push(checkers.positionKey(state));
    }
    return { state, keys, played, result: checkers.outcome(state, keys) };
  },
  turn: state => state.turn,
  piece(state, square) {
    const letter = state.board[square];
    if (!letter) return null;
    const side = letter.toLowerCase(), king = letter !== side;
    return { side, king, label: `${side === 'd' ? 'dark' : 'light'} ${king ? 'king' : 'man'}` };
  },
  // Two sequences can end on one square; the one that takes more is offered.
  moves: state => checkers.legalMoves(state).map(move => ({ from: move.from, to: move.path.at(-1), key: checkers.notation(move), capture: move.captures.length > 0, weight: move.captures.length }))
    .sort((a, b) => b.weight - a.weight),
  alert: state => checkers.legalMoves(state)[0]?.captures.length ? { square: -1, text: 'A capture is compulsory. ' } : null,
  ending: reason => reason === 'no pieces left' ? 'Every piece taken.' : 'No moves left.',
  position: state => state,
};
export const TABLE_GAMES = { chess: CHESS, checkers: CHECKERS, connectFour: CONNECT_FOUR, reversi: REVERSI, morris: MORRIS };
