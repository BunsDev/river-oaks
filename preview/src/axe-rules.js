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

// A throw is a release: where across the target it is let go toward (x, mm) and how hard
// (the release speed, m/s). As for darts (darts-rules.js), the across position comes from
// the release alone and the height from the flight: the axe falls on its way over the
// thrower's real distance to the target, so stepping back lands lower for the same throw.
// Whether it sticks comes from its rotation. An axe turns about once over `ideal` metres, so
// standing closer under-rotates it (the handle hits first) and further back over-rotates
// it (the top hits first): coaches fix that with a step, not more power (World Axe
// Throwing League; Knives of the North). The hand adds a little rotation error of its own.
export const AXE_THROW = { speed: [6.5, 11], nominal: 8, ideal: 4.1, across: 450, gravity: 9.81, window: 0.11, twist: 0.04, wood: 0.97 };
AXE_THROW.angle = Math.asin(AXE_THROW.gravity * AXE_THROW.ideal / AXE_THROW.nominal ** 2) / 2;
// The hand's error: across (mm) and speed (m/s), as unit-variance draws scale.
export const AXE_HAND = { across: 45, speed: 0.12 };
// Height (mm above the bull) at which an axe released at `speed` meets a target `distance` m away.
export function axeHeightAt(distance, speed) {
  const { gravity, angle } = AXE_THROW, cos = Math.cos(angle);
  return (distance * Math.tan(angle) - gravity * distance ** 2 / (2 * speed ** 2 * cos ** 2)) * 1000;
}
export const axeLandingOf = ([x, speed], distance) => [x, axeHeightAt(distance, speed)];
// The release speed that carries an axe to a height from `distance` (inverse of the flight), within the hand's range.
export function axeSpeedFor(height, distance) {
  const { gravity, angle } = AXE_THROW, cos = Math.cos(angle), drop = distance * Math.tan(angle) - height / 1000;
  const speed = drop > 0 ? Math.sqrt(gravity * distance ** 2 / (2 * cos ** 2 * drop)) : AXE_THROW.speed[1];
  return Math.min(AXE_THROW.speed[1], Math.max(AXE_THROW.speed[0], speed));
}
// How far from one clean turn an axe arrives from `distance` (in turns: below 0 under-rotated).
export const rotationError = distance => distance / AXE_THROW.ideal - 1;
export const validAxeRelease = release => Array.isArray(release) && release.length === 2 && release.every(n => typeof n === 'number' && Number.isFinite(n))
  && Math.abs(release[0]) <= AXE_THROW.across && release[1] >= AXE_THROW.speed[0] && release[1] <= AXE_THROW.speed[1];
// One throw from a release and four unit-variance draws (across, speed, twist) plus a uniform
// one for the grain: where the blade lands, whether it sticks, and how it turned.
export function axeThrow([x, speed], distance, [across, slow, twist, grain], hand = AXE_HAND) {
  const point = [x + across * hand.across, axeHeightAt(distance, Math.max(1, speed + slow * hand.speed))].map(n => Math.round(Math.max(-2 * BOARD, Math.min(2 * BOARD, n)) * 10) / 10 || 0);
  const rotation = rotationError(distance) + twist * AXE_THROW.twist, turned = Math.abs(rotation) <= AXE_THROW.window;
  const onBoard = Math.abs(point[0]) <= BOARD && Math.abs(point[1]) <= BOARD;
  return { point, stuck: onBoard && turned && grain < AXE_THROW.wood, rotation: turned ? 'clean' : rotation < 0 ? 'under' : 'over', onBoard };
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
