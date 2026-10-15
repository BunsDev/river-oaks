// IPIC circulation checks (#364): how wide a body each authored trip admits,
// measured against the same walls and obstacles the server collides with.
// Pure plan maths in the room frame (a across the frontage, d inward, metres);
// nothing here runs in the game loop. See docs/ipic-interior.md.
import { DOOR_HALF_WIDTH } from './store-rooms.js';
import { IPIC_INTERIOR } from './ipic-plan.js';

const boxDistance = (a, d, o) => Math.hypot(a - Math.max(o.a0, Math.min(a, o.a1)), d - Math.max(o.d0, Math.min(d, o.d1)));

// Distance from [a, d] to the nearest wall, door jamb, obstacle or blocker; 0
// or less is inside something. The street side of the doorway counts as open
// for the door's width, as the server's room lookup does.
export function ipicClearance(room, [a, d], blockers = []) {
  if (room?.interior !== IPIC_INTERIOR) throw new Error('An IPIC room plan is required');
  let clear = d < 0 ? DOOR_HALF_WIDTH - Math.abs(a)
    : Math.min(a - room.aMin, room.aMax - a, room.depth - d,
      Math.abs(a) >= DOOR_HALF_WIDTH ? d : Math.hypot(DOOR_HALF_WIDTH - Math.abs(a), d));
  for (const o of room.obstacles) clear = Math.min(clear, boxDistance(a, d, o));
  for (const blocker of blockers) clear = Math.min(clear, blocker(a, d));
  return clear;
}

// How far a seated body reaches from its seat origin, worst over the 22 shared
// looks, measured on the real rigs in the game's seat pose (2026-10-15,
// docs/superpowers/plans/2026-10-15-ipic-route-evidence/seated-extents.json):
// legs reach forward, beast tails reach back. Side is the wider of the two.
export const IPIC_SEATED_REACH = Object.freeze({ side: .514, front: .644, back: 1.155 });

// The plan-view footprint of a seated body, as a rectangle in the seat's own
// frame: `side` either way, `front` toward the way the seat faces, `back` behind.
// IPIC seats face +d at yaw 0 and -d at yaw PI.
export function seatedFootprint(seat, { side, front, back }) {
  const forward = Math.cos(seat.yaw) >= 0 ? 1 : -1;
  return (a, d) => {
    const u = a - seat.a, v = (d - seat.d) * forward;
    return Math.hypot(u - Math.max(-side, Math.min(u, side)), v - Math.max(-back, Math.min(v, front)));
  };
}

// The point 0.9 m in front of a seat, where the client walks a sitter to
// (ipicSeatSites' approach).
export const seatApproach = seat => [seat.a, seat.d + (Math.cos(seat.yaw) >= 0 ? .9 : -.9)];

const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// A grid over the room (plus the doorway) with cached clearance per cell.
function grid(room, blockers, step) {
  const cache = new Map(), key = (i, j) => `${i},${j}`;
  const a0 = Math.floor(room.aMin / step) - 1, a1 = Math.ceil(room.aMax / step) + 1;
  const d0 = Math.floor(-1.4 / step), d1 = Math.ceil(room.depth / step) + 1;
  return {
    key, cell: ([a, d]) => [Math.round(a / step), Math.round(d / step)], point: (i, j) => [i * step, j * step],
    inside: (i, j) => i >= a0 && i <= a1 && j >= d0 && j <= d1,
    clearance(i, j) {
      const k = key(i, j);
      if (!cache.has(k)) cache.set(k, ipicClearance(room, [i * step, j * step], blockers));
      return cache.get(k);
    },
  };
}

// A binary heap; `better(x, y)` is true when x should come out first.
function heap(better) {
  const items = [];
  return {
    get size() { return items.length; },
    push(item) {
      items.push(item);
      for (let i = items.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!better(items[i], items[p])) break; [items[p], items[i]] = [items[i], items[p]]; i = p; }
    },
    pop() {
      const top = items[0], last = items.pop();
      if (items.length) {
        items[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < items.length && better(items[l], items[m])) m = l;
          if (r < items.length && better(items[r], items[m])) m = r;
          if (m === i) break; [items[m], items[i]] = [items[i], items[m]]; i = m;
        }
      }
      return top;
    },
  };
}

// The narrowest clearance on the best trip between two points (the largest
// body radius that can make it), on a `step` grid with 8-way moves; null if
// either end is inside something.
export function ipicBottleneck(room, from, to, { blockers = [], step = .05 } = {}) {
  const g = grid(room, blockers, step), [si, sj] = g.cell(from), [ti, tj] = g.cell(to);
  if (g.clearance(si, sj) <= 0 || g.clearance(ti, tj) <= 0) return null;
  const best = new Map([[g.key(si, sj), g.clearance(si, sj)]]), queue = heap((x, y) => x[0] > y[0]);
  queue.push([g.clearance(si, sj), si, sj]);
  while (queue.size) {
    const [width, i, j] = queue.pop();
    if (width < best.get(g.key(i, j))) continue;
    if (i === ti && j === tj) return width;
    for (const [di, dj] of MOVES) {
      const ni = i + di, nj = j + dj;
      if (!g.inside(ni, nj)) continue;
      const w = Math.min(width, g.clearance(ni, nj)), k = g.key(ni, nj);
      if (w <= 0 || w <= (best.get(k) ?? 0)) continue;
      best.set(k, w); queue.push([w, ni, nj]);
    }
  }
  return null;
}

// The shortest trip keeping at least `radius` from everything (A* on the
// grid), or null. `free(point)` can add a rule of its own, such as the
// server's, whose square-inflated boxes are stricter at corners.
export function ipicRoute(room, from, to, { radius, blockers = [], step = .05, free = () => true } = {}) {
  const g = grid(room, blockers, step), [si, sj] = g.cell(from), [ti, tj] = g.cell(to);
  const open = (i, j) => g.clearance(i, j) >= radius - 1e-9 && free(g.point(i, j));
  if (!open(si, sj) || !open(ti, tj)) return null;
  const h = (i, j) => Math.hypot(i - ti, j - tj), cost = new Map([[g.key(si, sj), 0]]), previous = new Map([[g.key(si, sj), null]]);
  const queue = heap((x, y) => x[0] < y[0]);
  queue.push([h(si, sj), 0, si, sj]);
  while (queue.size) {
    const [, spent, i, j] = queue.pop();
    if (spent > cost.get(g.key(i, j))) continue;
    if (i === ti && j === tj) break;
    for (const [di, dj] of MOVES) {
      const ni = i + di, nj = j + dj, k = g.key(ni, nj), next = spent + Math.hypot(di, dj);
      // A diagonal step needs both cells beside it open, so it cannot clip a corner.
      if (!g.inside(ni, nj) || !open(ni, nj) || di && dj && !(open(ni, j) && open(i, nj)) || next >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, next); previous.set(k, g.key(i, j)); queue.push([next + h(ni, nj), next, ni, nj]);
    }
  }
  const end = g.key(ti, tj);
  if (!previous.has(end)) return null;
  const path = [];
  for (let k = end; k; k = previous.get(k)) path.unshift(g.point(...k.split(',').map(Number)));
  return path;
}

// Every grid cell reachable from `from` keeping `radius` and `free`, as a
// predicate on room points (a flood fill; one per question, not per point).
export function ipicReachable(room, from, { radius, blockers = [], step = .05, free = () => true } = {}) {
  const g = grid(room, blockers, step), open = (i, j) => g.clearance(i, j) >= radius - 1e-9 && free(g.point(i, j));
  const [si, sj] = g.cell(from), seen = new Set();
  if (open(si, sj)) {
    const queue = [[si, sj]]; seen.add(g.key(si, sj));
    for (let head = 0; head < queue.length; head++) {
      const [i, j] = queue[head];
      for (const [di, dj] of MOVES) {
        const ni = i + di, nj = j + dj, k = g.key(ni, nj);
        if (seen.has(k) || !g.inside(ni, nj) || !open(ni, nj)) continue;
        seen.add(k); queue.push([ni, nj]);
      }
    }
  }
  return point => seen.has(g.key(...g.cell(point)));
}

// The widest trip: its bottleneck clearance, where that is, and the shortest
// path that keeps it (or `cap`, if smaller) and satisfies `free`.
export function widestRoute(room, from, to, { blockers = [], step = .05, cap = Infinity, free } = {}) {
  const clearance = ipicBottleneck(room, from, to, { blockers, step });
  if (clearance === null) return null;
  const path = ipicRoute(room, from, to, { radius: Math.min(clearance, cap), blockers, step, free });
  if (!path) return { clearance, pinch: null, path: null };
  let pinch = path[0], narrowest = Infinity;
  for (const point of path) { const c = ipicClearance(room, point, blockers); if (c < narrowest) { narrowest = c; pinch = point; } }
  return { clearance, pinch, path };
}

// The largest circle that fits anywhere in a band of the room (a turning
// circle for a long body at a decision point).
export function largestCircle(room, [d0, d1], { blockers = [], step = .05 } = {}) {
  let best = { clearance: 0, at: null };
  for (let a = room.aMin; a <= room.aMax; a += step) for (let d = d0; d <= d1; d += step) {
    const c = ipicClearance(room, [a, d], blockers);
    if (c > best.clearance) best = { clearance: c, at: [a, d] };
  }
  return best;
}
