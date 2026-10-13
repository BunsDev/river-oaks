// Thinks off the main thread, so the plaza keeps walking while the regular plays.
// Each request carries its game and ply; the caller drops any late answer.
import { fromFEN } from './chess-rules.js';
import { chooseMove } from './chess-opponent.js';

self.addEventListener('message', ({ data }) => {
  const { id, fen, history, budget } = data ?? {};
  try {
    const reply = chooseMove(fromFEN(fen), { history, budget });
    self.postMessage({ id, move: reply?.move ?? null });
  } catch (error) {
    self.postMessage({ id, move: null, error: error.message });
  }
});
