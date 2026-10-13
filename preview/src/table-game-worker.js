// Thinks off the main thread, so the plaza keeps walking while the regular plays.
// Each request names its game and carries an id; the caller drops any late answer.
import { fromFEN } from './chess-rules.js';
import { chooseMove as chessMove } from './chess-opponent.js';
import { chooseMove as checkersMove } from './checkers-opponent.js';
import { chooseMove as connectFourMove } from './connect-four-opponent.js';
import { chooseMove as reversiMove } from './reversi-opponent.js';
import { chooseMove as goMove } from './go-opponent.js';

const GAMES = {
  chess: ({ position, history, budget }) => chessMove(fromFEN(position), { history, budget }),
  checkers: ({ position, history, budget }) => checkersMove(position, { history, budget }),
  connectFour: ({ position, budget }) => connectFourMove(position, { budget: budget * 2 }),
  // Reversi weighs mobility at every node, so half the budget keeps replies near a second.
  reversi: ({ position, budget }) => reversiMove(position, { budget: Math.round(budget / 2) }),
  // Go's regular counts play-outs, not nodes: `budget` is passed as is.
  go: ({ position, budget }) => ({ move: goMove(position, { budget }) }),
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
