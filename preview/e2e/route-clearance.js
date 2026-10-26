// Resident routes (preview/src/navigation.js) keep a resident's margin from obstacles,
// which can leave a walking player's collider touching a corner. A keyboard walker
// steering past such a corner can press into it and stall. keepClear() detours a leg
// around its least-clear point: of the sideways offsets that pass canTravel, it takes
// the one that leaves the whole detoured leg clearest, and repeats on each half while
// a leg keeps less than `margin` metres. A leg is replaced only by a clearer one, so no
// route ends up less clear than it was, and the destination never moves.
// isAreaFree(x, north, r) is true when a walker r metres larger still fits there.
export function keepClear(isAreaFree, from, path, { margin = 0.3, step = 0.1, depth = 4, canTravel = () => true } = {}) {
  const rooms = new Map();
  // Room around a point in 0.05 m steps up to the margin; -1 inside an obstacle.
  const room = ([x, y]) => {
    const key = `${x},${y}`;
    if (!rooms.has(key)) {
      let found = isAreaFree(x, y, 0) ? 0 : -1;
      for (let steps = Math.ceil(margin / 0.05 - 1e-9); found === 0 && steps > 0; steps--) if (isAreaFree(x, y, steps * 0.05)) found = steps * 0.05;
      rooms.set(key, found);
    }
    return rooms.get(key);
  };
  // The least-clear sampled point between a and b, endpoints excluded.
  const closest = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    let least = Infinity, at = null;
    for (let k = 1; k < n; k++) {
      const point = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], found = room(point);
      if (found < least) { least = found; at = point; }
    }
    return { room: least, at };
  };
  const leg = (a, b, level) => {
    const worst = closest(a, b);
    if (worst.room >= margin - 1e-9 || !level) return [b];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), side = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    let best = null;
    for (const sign of [1, -1]) for (let tenths = 1; tenths <= 15; tenths++) {
      const via = [worst.at[0] + side[0] * sign * tenths / 10, worst.at[1] + side[1] * sign * tenths / 10];
      const clear = Math.min(room(via), closest(a, via).room, closest(via, b).room);
      if (clear > (best ? best.clear : worst.room) && canTravel(a, via) && canTravel(via, b)) best = { via, clear };
    }
    return best ? [...leg(a, best.via, level - 1), ...leg(best.via, b, level - 1)] : [b];
  };
  const result = [];
  let current = from;
  for (const point of path) { result.push(...leg(current, point, depth)); current = point; }
  return result;
}

// The journey's router over keepClear(). Routes are cached per metre of start, so laps
// reuse the first lap's route; a hit from a start more than 0.15 m away re-clears the
// first leg from where the walker stands, or routes afresh if that leg isn't walkable.
// walking is createWalkingEnvironment(world); nav is createResidentNavigation(world, ...).
export function clearRouter(walking, nav, options = {}) {
  const isAreaFree = (x, y, r) => walking.isAreaFree(x, -y, r), settings = { canTravel: nav.canTravel, ...options }, routes = new Map();
  const fresh = (from, to) => { const path = nav.route(from, to); return path && keepClear(isAreaFree, from, path, settings); };
  return (from, to) => {
    const key = `${from.map(Math.round)}>${to}`, cached = routes.get(key);
    if (!cached) {
      const route = fresh(from, to);
      if (route) routes.set(key, { from, route });
      return route;
    }
    if (Math.hypot(from[0] - cached.from[0], from[1] - cached.from[1]) <= 0.15) return cached.route;
    if (!nav.canTravel(from, cached.route[0])) return fresh(from, to);
    return [...keepClear(isAreaFree, from, [cached.route[0]], settings), ...cached.route.slice(1)];
  };
}
