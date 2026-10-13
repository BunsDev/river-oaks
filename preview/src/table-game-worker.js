// Thinks off the main thread, so the plaza keeps walking while the regular plays.
// Each request names its game and carries an id; the caller drops any late answer.
import { fromFEN } from './chess-rules.js';
import { chooseMove as chessMove } from './chess-opponent.js';
import { chooseMove as checkersMove } from './checkers-opponent.js';

const GAMES = {
  chess: ({ position, history, budget }) => chessMove(fromFEN(position), { history, budget }),
  checkers: ({ position, history, budget }) => checkersMove(position, { history, budget }),
};

self.addEventListener('message', ({ data }) => {
  const { id, game = 'chess' } = data ?? {};
  try {
    const reply = GAMES[game]?.(data) ?? null;
    self.postMessage({ id, move: reply?.move ?? null });
  } catch (error) {
    self.postMessage({ id, move: null, error: error.message });
  }
});
