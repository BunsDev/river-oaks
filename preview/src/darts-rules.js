// Darts at the plaza's board: 501, double out. Each player starts on 501 and throws
// three darts a turn, taking each dart's score off. The last dart must land in a
// double (the bull counts as a double) and bring the score to exactly 0. A dart that
// would leave 1 or less without finishing that way "busts": the turn's darts don't
// count, the score goes back to where the turn began, and the turn passes.
//
// The board is the standard one, measured in millimetres from its centre: the bull
// (50) within 6.35, the outer bull (25) within 15.9, treble ring 99–107, double ring
// 162–170, and twenty sectors of 18° with 20 at the top. A throw is the point aimed
// at plus the thrower's wobble, so where a dart lands decides everything.
// Positions are [x, y] in mm, +y up. Pure and dependency-free.

export const START = 501;
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const RINGS = { bull: 6.35, outerBull: 15.9, trebleIn: 99, trebleOut: 107, doubleIn: 162, doubleOut: 170 };

// What a point on the board scores: { value, multiplier, label }.
export function scoreAt([x, y]) {
  const r = Math.hypot(x, y);
  if (r <= RINGS.bull) return { value: 50, multiplier: 2, label: 'Bull', number: 25 };
  if (r <= RINGS.outerBull) return { value: 25, multiplier: 1, label: '25', number: 25 };
  if (r > RINGS.doubleOut) return { value: 0, multiplier: 0, label: 'Miss', number: 0 };
  const angle = (Math.atan2(x, y) * 180 / Math.PI + 360 + 9) % 360, number = SECTORS[Math.floor(angle / 18)];
  const multiplier = r >= RINGS.doubleIn ? 2 : r >= RINGS.trebleIn && r <= RINGS.trebleOut ? 3 : 1;
  return { value: number * multiplier, multiplier, number, label: `${multiplier === 2 ? 'D' : multiplier === 3 ? 'T' : ''}${number}` };
}

// The centre of a target bed: a number and a ring ('single' | 'treble' | 'double'), or the bull.
export function targetPoint(number, ring = 'treble') {
  if (number === 25) return ring === 'double' ? [0, 0] : [0, (RINGS.bull + RINGS.outerBull) / 2];
  const radius = ring === 'double' ? (RINGS.doubleIn + RINGS.doubleOut) / 2 : ring === 'treble' ? (RINGS.trebleIn + RINGS.trebleOut) / 2 : (RINGS.outerBull + RINGS.trebleIn) / 2;
  const angle = SECTORS.indexOf(number) * 18 * Math.PI / 180;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
}

// A throw is a release: where across the board the dart is let go toward (x, in mm),
// and how hard the hand accelerates through its stroke. In a real throw (Smeets, Frens
// & Brenner, Exp Brain Res 2002: board 2.37 m away, bull 1.73 m up, hand accelerating
// at about 50 m/s² to some 6 m/s) nothing acts across the flight, so the release alone
// sets the across position; the speed sets the height, because the dart falls on its
// way: too slow lands low, too fast lands high. Here the hand releases level with the
// bull, 2.0 m from the board, at the angle that carries a 6.0 m/s dart onto the bull.
export const THROW = { distance: 2.0, stroke: 0.36, gravity: 9.81, nominal: 50, accel: [35, 75], across: 230 };
THROW.angle = Math.asin(THROW.gravity * THROW.distance / (2 * THROW.nominal * THROW.stroke)) / 2;
export const releaseSpeed = accel => Math.sqrt(2 * accel * THROW.stroke);
// Height (mm above the bull) at which a dart leaving at `speed` m/s meets the board.
export function heightAt(speed) {
  const { distance, gravity, angle } = THROW, cos = Math.cos(angle);
  return (distance * Math.tan(angle) - gravity * distance ** 2 / (2 * speed ** 2 * cos ** 2)) * 1000;
}
// Where a release lands before the hand's own error.
export const landingOf = ([x, accel]) => [x, heightAt(releaseSpeed(accel))];
// The acceleration that carries a dart to a height (inverse of landingOf), within the hand's range.
export function accelFor(height) {
  const { distance, gravity, angle, stroke } = THROW, cos = Math.cos(angle), drop = distance * Math.tan(angle) - height / 1000;
  const accel = drop > 0 ? gravity * distance ** 2 / (2 * cos ** 2 * drop) / (2 * stroke) : THROW.accel[1];
  return Math.min(THROW.accel[1], Math.max(THROW.accel[0], accel));
}
// The hand's error: a release direction off by `across` (mm) and a speed off by `speed`
// (m/s). The same speed error drops a slow dart further than a firm one.
export const HAND = { across: 18, speed: 0.09 };
// A unit-variance logistic draw from u in (0, 1): zero at 0.5, so a fixed 0.5 throws true.
export const handDraw = u => Math.log(u / (1 - u)) * .5513;
// Where a dart lands from a release and two unit-variance draws, held to the
// recorded square (darts that far out are misses anyway).
export function throwLanding([x, accel], [across, speed], hand = HAND, limit = 400) {
  const height = heightAt(Math.max(1, releaseSpeed(accel) + speed * hand.speed));
  return [Math.max(-limit, Math.min(limit, x + across * hand.across)), Math.max(-limit, Math.min(limit, height))];
}
export const validRelease = release => Array.isArray(release) && release.length === 2 && release.every(n => typeof n === 'number' && Number.isFinite(n))
  && Math.abs(release[0]) <= THROW.across && release[1] >= THROW.accel[0] && release[1] <= THROW.accel[1];

export const startGame = (players = 2) => ({ scores: Array(players).fill(START), turn: 0, darts: [], turnStart: START, winner: null, history: [] });

// Throws one dart landing at `point` for the player whose turn it is.
export function throwDart(state, point) {
  if (state.winner !== null) throw new Error('The game is over');
  const hit = scoreAt(point), player = state.turn, scores = state.scores.slice();
  const left = scores[player] - hit.value, darts = [...state.darts, { point, ...hit }];
  const finish = left === 0 && hit.multiplier === 2;
  const bust = !finish && (left < 2);
  if (finish) { scores[player] = 0; return { ...state, scores, darts, winner: player, history: [...state.history, { player, darts, result: 'checkout' }] }; }
  if (bust) {
    scores[player] = state.turnStart;
    return pass({ ...state, scores, darts }, 'bust');
  }
  scores[player] = left;
  const next = { ...state, scores, darts };
  return darts.length === 3 ? pass(next, 'scored') : next;
}

function pass(state, result) {
  const player = state.turn, turn = (player + 1) % state.scores.length;
  return { ...state, turn, darts: [], turnStart: state.scores[turn], history: [...state.history, { player, darts: state.darts, result }] };
}

// The darts of a game as landing points, replayed exactly.
export function replay(points = [], players = 2) {
  let state = startGame(players);
  for (const point of points) state = throwDart(state, point);
  return { state };
}

// A finishing plan for a score of 170 or less: the beds to aim at with the darts left,
// ending on a double (or null when no finish is possible in that many darts).
export function checkout(score, dartsLeft = 3) {
  const beds = [];
  for (const number of [...SECTORS, 25]) for (const ring of ['single', 'double', 'treble']) {
    if (number === 25 && ring === 'treble') continue;
    const value = number === 25 ? (ring === 'double' ? 50 : 25) : number * (ring === 'treble' ? 3 : ring === 'double' ? 2 : 1);
    beds.push({ number, ring, value, double: ring === 'double' });
  }
  // Favourite doubles first (16 and 20 split well), then the rest high to low.
  const favourite = [16, 20, 18, 12, 10, 8, 25], doubles = beds.filter(bed => bed.double).sort((a, b) => (favourite.indexOf(a.number) + 1 || 99) - (favourite.indexOf(b.number) + 1 || 99) || b.value - a.value);
  const ordered = beds.slice().sort((a, b) => b.value - a.value);
  const one = doubles.find(bed => bed.value === score);
  if (one) return [one];
  if (dartsLeft >= 2) for (const first of ordered) { const rest = score - first.value; const end = doubles.find(bed => bed.value === rest); if (rest > 1 && end) return [first, end]; }
  if (dartsLeft >= 3) for (const first of ordered) for (const second of ordered) { const rest = score - first.value - second.value; const end = doubles.find(bed => bed.value === rest); if (rest > 1 && end) return [first, second, end]; }
  return null;
}
