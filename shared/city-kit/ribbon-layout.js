// The Ribbon layout contract (#825, slice 1). The Ribbon is one shaded canopy walk
// joining the Five Rooms. Its paths are drawn by hand as polylines; this module turns
// them into canopy modules, edge posts, lamps, fans and seat sockets with stable IDs
// (`ribbon:<segment>:module:012`), and refuses a layout that puts a post or a seat
// where people need to pass. Data and validation only: nothing here renders.
//
// Units and frame follow the city kit (catalog.js): metres, site-local x east, y north.
// The expansion is pure arithmetic on the recipe. The seeded stream (assemble.js,
// keyed by stable ID) picks only non-functional variety, the fan finish, so a seed
// change never moves a post. Module numbering is per segment, so editing one segment
// leaves every other segment's IDs and positions unchanged.
import { stableHash, streamFor } from './assemble.js';

export const RIBBON_KIT = 'ribbon-1';
export const RIBBON_RULES = Object.freeze({
  // A walk two people can pass on (1.2 m), with headroom over a raised hand (3 m).
  minWidth: 1.2,
  minClearHeight: 3,
  // Each straight run is cut into equal modules as close to 3 m as the run allows.
  moduleLength: 3,
  minRun: 1.5,
  // Sharper turns would fold the canopy over itself; draw two turns instead.
  maxTurnDegrees: 90,
  // Below this the turn reads as a bend (`curve`), at or above it as a `corner`.
  cornerDegrees: 30,
  // Square post footprint, metres per side, centred on the walk's edge.
  post: 0.3,
  // A bench socket beside the walk: length along it, depth across, gap from the edge.
  seat: Object.freeze({ length: 1.6, depth: 0.6, gap: 0.4 }),
  fanDrop: 0.4,
  lampDrop: 0.2,
  // A lamp on every second boundary, on the left post.
  lampEvery: 2,
  exclusionKinds: Object.freeze(['doorway', 'seat-access', 'no-go', 'step-free']),
  styles: Object.freeze(['canopy', 'arcade']),
  fanFinishes: Object.freeze(['scallop', 'fin', 'plain']),
});

const EPS = 1e-6;
const mm = value => Math.round(value * 1000) / 1000;
const idOk = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(id);
const pointOk = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const rectOk = r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3];
const fail = message => { throw new Error(`Invalid ribbon layout: ${message}`); };
const pad = n => String(n).padStart(3, '0');
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const left = ([x, y]) => [-y, x];
const turnDegrees = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180 / Math.PI;
const corners = r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
// An oriented rectangle: centre, unit direction along it, length along, depth across.
const box = (centre, dir, length, depth) => {
  const a = [dir[0] * length / 2, dir[1] * length / 2], n = left(dir), b = [n[0] * depth / 2, n[1] * depth / 2];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [centre[0] + i * a[0] + j * b[0], centre[1] + i * a[1] + j * b[1]]);
};
// Do two convex polygons share interior area? Touching edges do not count.
function overlaps(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], axis = [q[1] - p[1], p[0] - q[0]], size = Math.hypot(axis[0], axis[1]);
    const project = shape => shape.map(v => v[0] * axis[0] + v[1] * axis[1]);
    const pa = project(a), pb = project(b);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= EPS * size) return false;
  }
  return true;
}

function runsOf(segment) {
  return segment.points.slice(1).map((to, i) => {
    const from = segment.points[i], dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
    return { from, to, length, dir: [dx / length, dy / length] };
  });
}

export function validateRibbon(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) fail('not an object');
  for (const key of Object.keys(recipe)) if (!['id', 'kit', 'seed', 'segments', 'exclusions'].includes(key)) fail(`unknown key ${key}`);
  if (!idOk(recipe.id)) fail('id');
  if (recipe.kit !== RIBBON_KIT) fail(`kit must be ${RIBBON_KIT}`);
  if (!Number.isInteger(recipe.seed) || recipe.seed < 0 || recipe.seed >= 2 ** 32) fail('seed');
  const ids = new Set(), unique = (kind, id) => { if (!idOk(id) || ids.has(id)) fail(`${kind} id ${id}`); ids.add(id); };
  if (!Array.isArray(recipe.segments) || !recipe.segments.length) fail('needs at least one segment');
  for (const segment of recipe.segments) {
    if (!segment || typeof segment !== 'object') fail('segment');
    unique('segment', segment.id);
    for (const key of Object.keys(segment)) if (!['id', 'points', 'width', 'clearHeight', 'style', 'seats'].includes(key)) fail(`segment ${segment.id}: unknown key ${key}`);
    if (!Array.isArray(segment.points) || segment.points.length < 2 || !segment.points.every(pointOk)) fail(`segment ${segment.id} needs two or more [x, y] points`);
    if (!(Number.isFinite(segment.width) && segment.width + EPS >= RIBBON_RULES.minWidth)) fail(`segment ${segment.id} is narrower than ${RIBBON_RULES.minWidth} m`);
    if (!(Number.isFinite(segment.clearHeight) && segment.clearHeight + EPS >= RIBBON_RULES.minClearHeight)) fail(`segment ${segment.id} has less than ${RIBBON_RULES.minClearHeight} m headroom`);
    if (!RIBBON_RULES.styles.includes(segment.style)) fail(`segment ${segment.id} style must be ${RIBBON_RULES.styles.join(' or ')}`);
    if (segment.seats !== undefined && !(segment.seats && Number.isInteger(segment.seats.every) && segment.seats.every >= 1 && ['left', 'right'].includes(segment.seats.side))) fail(`segment ${segment.id} seats need a whole every >= 1 and a left or right side`);
    const runs = runsOf(segment);
    runs.forEach((run, i) => {
      if (!(run.length + EPS >= RIBBON_RULES.minRun)) fail(`segment ${segment.id} run ${i} is shorter than ${RIBBON_RULES.minRun} m`);
      if (i > 0 && turnDegrees(runs[i - 1].dir, run.dir) > RIBBON_RULES.maxTurnDegrees + EPS) fail(`segment ${segment.id} turns more than ${RIBBON_RULES.maxTurnDegrees}° at point ${i}`);
    });
  }
  for (const item of recipe.exclusions ?? []) {
    if (!item || typeof item !== 'object') fail('exclusion');
    unique('exclusion', item.id);
    if (!RIBBON_RULES.exclusionKinds.includes(item.kind)) fail(`exclusion ${item.id} kind must be one of ${RIBBON_RULES.exclusionKinds.join(', ')}`);
    if (!rectOk(item.rect)) fail(`exclusion ${item.id} rect`);
  }
  return recipe;
}

// Expand a recipe into placements. Lists are in segment order, then index order.
export function expandRibbon(source) {
  const recipe = validateRibbon(source), rules = RIBBON_RULES;
  const modules = [], posts = [], fans = [], lamps = [], seats = [], footprints = [], corridors = [];
  for (const segment of recipe.segments) {
    const runs = runsOf(segment), half = segment.width / 2, prefix = `ribbon:${segment.id}`;
    let index = 0, boundary = 0;
    const total = runs.reduce((sum, run) => sum + Math.max(1, Math.round(run.length / rules.moduleLength)), 0);
    const addBoundary = (at, offset, height) => {
      const id = n => `${prefix}:post:${pad(boundary)}:${n}`;
      for (const [side, sign] of [['l', 1], ['r', -1]]) {
        const position = [at[0] + offset[0] * sign, at[1] + offset[1] * sign];
        posts.push({ id: id(side), segment: segment.id, boundary, side: side === 'l' ? 'left' : 'right', position, height });
        const p = rules.post / 2;
        footprints.push({ id: id(side), segment: segment.id, shape: corners([position[0] - p, position[1] - p, position[0] + p, position[1] + p]) });
      }
      if (boundary % rules.lampEvery === 0) lamps.push({ id: `${prefix}:lamp:${pad(boundary)}`, segment: segment.id, post: id('l'), position: [at[0] + offset[0], at[1] + offset[1]], height: segment.clearHeight - rules.lampDrop });
      boundary++;
    };
    runs.forEach((run, r) => {
      const normal = left(run.dir), count = Math.max(1, Math.round(run.length / rules.moduleLength));
      corridors.push({ segment: segment.id, shape: box(lerp(run.from, run.to, .5), run.dir, run.length, segment.width) });
      // The run's first boundary: the segment's start, or the mitred turn it shares with the run before.
      if (r === 0) addBoundary(run.from, [normal[0] * half, normal[1] * half], segment.clearHeight);
      for (let k = 0; k < count; k++) {
        const from = lerp(run.from, run.to, k / count), to = lerp(run.from, run.to, (k + 1) / count), centre = lerp(from, to, .5);
        const turn = k === 0 && r > 0 ? turnDegrees(runs[r - 1].dir, run.dir) : 0;
        const kind = index === 0 || index === total - 1 ? 'end' : turn >= rules.cornerDegrees ? 'corner' : turn > EPS ? 'curve' : 'straight';
        const id = `${prefix}:module:${pad(index)}`;
        modules.push({ id, segment: segment.id, index, kind, from, to, length: run.length / count, yaw: Math.atan2(run.dir[1], run.dir[0]), width: segment.width, clearHeight: segment.clearHeight, style: segment.style });
        const fan = `${prefix}:fan:${pad(index)}`;
        fans.push({ id: fan, segment: segment.id, module: id, position: centre, height: segment.clearHeight - rules.fanDrop, finish: streamFor(recipe.seed, fan).pick(rules.fanFinishes) });
        if (segment.seats && (index + 1) % segment.seats.every === 0) {
          const sign = segment.seats.side === 'left' ? 1 : -1, reach = half + rules.seat.gap + rules.seat.depth / 2;
          const position = [centre[0] + normal[0] * reach * sign, centre[1] + normal[1] * reach * sign], seat = `${prefix}:seat:${pad(index)}`;
          // A seat faces the walk.
          seats.push({ id: seat, segment: segment.id, module: id, side: segment.seats.side, position, yaw: Math.atan2(-normal[1] * sign, -normal[0] * sign), size: [rules.seat.length, rules.seat.depth] });
          footprints.push({ id: seat, segment: segment.id, seat: true, shape: box(position, run.dir, rules.seat.length, rules.seat.depth) });
        }
        index++;
        if (k < count - 1) addBoundary(to, [normal[0] * half, normal[1] * half], segment.clearHeight);
        else {
          const next = runs[r + 1];
          if (!next) addBoundary(run.to, [normal[0] * half, normal[1] * half], segment.clearHeight);
          else {
            // Mitre: the post pair stands on the bisector of the two edges, still half the width from each.
            const n2 = left(next.dir), bisector = [normal[0] + n2[0], normal[1] + n2[1]], size = Math.hypot(...bisector);
            const unit = [bisector[0] / size, bisector[1] / size], scale = half / (unit[0] * normal[0] + unit[1] * normal[1]);
            addBoundary(run.to, [unit[0] * scale, unit[1] * scale], segment.clearHeight);
          }
        }
      }
    });
  }
  // Nothing stands where people must pass: no post or seat in a doorway, a seat's access
  // zone, a no-go zone or a step-free route, and no seat on any segment's walk.
  for (const item of footprints) {
    for (const zone of recipe.exclusions ?? []) if (overlaps(item.shape, corners(zone.rect))) fail(`${item.id} lands in ${zone.kind} ${zone.id}; move a point of segment ${item.segment}`);
    if (item.seat) for (const corridor of corridors) if (overlaps(item.shape, corridor.shape)) fail(`${item.id} lands on the walking corridor of ribbon:${corridor.segment}; move it to the other side or change every`);
  }
  // Every number to the millimetre (radians to the milliradian), so Node and browsers agree byte for byte.
  const round = value => Array.isArray(value) ? value.map(round)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, round(item)]))
      : typeof value === 'number' ? mm(value) + 0 : value;
  const placements = round({ modules, posts, lamps, fans, seats });
  return {
    id: recipe.id, kit: RIBBON_KIT, seed: recipe.seed,
    ...placements,
    stats: { segments: recipe.segments.length, modules: modules.length, posts: posts.length, lamps: lamps.length, fans: fans.length, seats: seats.length },
    hash: stableHash(placements),
  };
}
