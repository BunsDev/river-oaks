// Axe throwing at a wooden target (the unbranded axe-and-darts room; Val, 2026-10-15).
// A match is ten throws each, taken in turn; the higher total wins and a tie is a
// draw. The target is a painted board measured in millimetres from its centre, +y up:
// the bull (6) within 40, then rings worth 4, 3, 2 and 1 out to 340, and two blue
// killshot dots (8) high on each side. A throw is where the axe's blade lands plus
// whether it stuck: an axe that bounces off scores nothing wherever it hit. The
// server decides both (server/axe-games.js); this module only scores and replays.
// Pure and dependency-free.

export const THROWS = 10;
export const RINGS = Object.freeze([{ radius: 40, value: 6 }, { radius: 115, value: 4 }, { radius: 190, value: 3 }, { radius: 265, value: 2 }, { radius: 340, value: 1 }]);
export const KILLSHOTS = Object.freeze([[-235, 235], [235, 235]]);
export const KILLSHOT_RADIUS = 28, KILLSHOT_VALUE = 8;
export const BOARD = 400;

// What a stuck axe at a point scores: { value, label }.
export function scoreAt([x, y]) {
  if (KILLSHOTS.some(([kx, ky]) => Math.hypot(x - kx, y - ky) <= KILLSHOT_RADIUS)) return { value: KILLSHOT_VALUE, label: 'Killshot' };
  const r = Math.hypot(x, y), ring = RINGS.find(item => r <= item.radius);
  return ring ? { value: ring.value, label: ring.value === 6 ? 'Bull' : String(ring.value) } : { value: 0, label: 'Board' };
}

export const startGame = (players = 2) => ({ scores: Array(players).fill(0), throws: Array(players).fill(0), turn: 0, winner: null, draw: false, history: [] });

// One throw for the player whose turn it is: where it landed and whether it stuck.
export function throwAxe(state, { point, stuck }) {
  if (state.winner !== null || state.draw) throw new Error('The match is over');
  const player = state.turn, hit = stuck ? scoreAt(point) : { value: 0, label: 'Drop' };
  const scores = state.scores.slice(), throws = state.throws.slice();
  scores[player] += hit.value; throws[player] += 1;
  const history = [...state.history, { player, point, stuck, ...hit }];
  const done = throws.every(n => n >= THROWS), turn = (player + 1) % scores.length;
  if (!done) return { ...state, scores, throws, turn, history };
  const best = Math.max(...scores), leaders = scores.flatMap((score, index) => score === best ? [index] : []);
  return { ...state, scores, throws, turn, history, winner: leaders.length === 1 ? leaders[0] : null, draw: leaders.length > 1 };
}

export function replay(throws = [], players = 2) {
  let state = startGame(players);
  for (const item of throws) state = throwAxe(state, item);
  return { state };
}
