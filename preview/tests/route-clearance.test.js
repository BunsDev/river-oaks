import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDistrictData } from '../../server/district-data.js';
import { createResidentNavigation } from '../src/navigation.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { clearRouter, keepClear } from '../e2e/route-clearance.js';

// Lowest room along a walked route (0.05 m steps up to 0.5 m, -1 inside an obstacle),
// sampled at `step` metres, waypoints included and the destination excluded.
const lowestRoom = (isAreaFree, from, path, step = 0.05) => {
  const room = ([x, y]) => { if (!isAreaFree(x, y, 0)) return -1; for (let r = 0.5; r > 0; r -= 0.05) if (isAreaFree(x, y, r)) return r; return 0; };
  let least = Infinity, current = from;
  for (const [index, point] of path.entries()) {
    const n = Math.max(1, Math.ceil(Math.hypot(point[0] - current[0], point[1] - current[1]) / step));
    for (let k = 1; k <= n; k++) if (k < n || index < path.length - 1) least = Math.min(least, room([current[0] + (point[0] - current[0]) * k / n, current[1] + (point[1] - current[1]) * k / n]));
    current = point;
  }
  return least;
};
// A box in route coordinates; a walker r metres larger fits wherever it stays r away.
const box = ([minX, minY, maxX, maxY]) => (x, y, r) => Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minY - y, 0, y - maxY)) > r;

test('a leg that grazes an obstacle detours around it and keeps its destination', () => {
  const isAreaFree = box([-1, 0.05, 1, 2.05]), from = [-5, 0], path = [[5, 0]];
  assert.ok(lowestRoom(isAreaFree, from, path) < 0.1);
  const clear = keepClear(isAreaFree, from, path);
  assert.deepEqual(clear.at(-1), [5, 0]);
  assert.ok(clear.length > 1, 'a detour waypoint is inserted');
  assert.ok(lowestRoom(isAreaFree, from, clear) >= 0.3 - 1e-9);
});

test('a route that is already clear, or cannot be made clearer, comes back unchanged', () => {
  const path = [[0, 0], [5, 0], [5, 5]];
  assert.deepEqual(keepClear(box([-1, 9, 1, 11]), [-5, 0], path), path);
  // A corridor 0.4 m wide: every sideways offset is tighter than its centre line.
  const corridor = (x, y, r) => Math.abs(y) + r < 0.2;
  assert.deepEqual(keepClear(corridor, [-5, 0], [[5, 0]]), [[5, 0]]);
});

test('a detour that canTravel refuses is not taken', () => {
  // The box sits above the line, so the only clearer offsets lie below it.
  const isAreaFree = box([-1, 0.05, 1, 2.05]), canTravel = (a, b) => a[1] >= -1e-9 && b[1] >= -1e-9;
  assert.deepEqual(keepClear(isAreaFree, [-5, 0], [[5, 0]], { canTravel }), [[5, 0]]);
  // Only the second half, from below the line into the destination, is refused.
  const intoDestination = (a, b) => !(b[0] === 5 && a[1] < -1e-9);
  assert.deepEqual(keepClear(isAreaFree, [-5, 0], [[5, 0]], { canTravel: intoDestination }), [[5, 0]]);
});

test('the world-streaming routes that graze corners on cb83c7cd keep their room or gain it', async () => {
  const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
  const walking = createWalkingEnvironment(world), isAreaFree = (x, y, r) => walking.isAreaFree(x, -y, r);
  const { canTravel } = createResidentNavigation(world, { allowRoads: true });
  // Resident routes recorded on cb83c7cd. Attempt 1 of the 2026-10-26 Commons rerun stalled
  // on a reload leg at (-2708.31, -1349.73), beside a 1.75 m box corner.
  const reloads = [
    [[-2786, -1370], [[-2728.28, -1371.609], [-2724.28, -1367.609], [-2703.48, -1344.609], [-2703.332, -1343.415], [-2685, -1334]]],
    [[-2786, -1371], [[-2728.28, -1371.609], [-2703.54, -1344.759], [-2703.332, -1343.415], [-2685, -1335]]],
  ];
  const eviction = [[-2685, -1334.3], [[-2702.856, -1343.184], [-2714.28, -1357.609], [-2728.28, -1371.609], [-2786, -1370]]];
  for (const [from, path] of [...reloads, eviction]) {
    const raw = lowestRoom(isAreaFree, from, path), clear = keepClear(isAreaFree, from, path, { canTravel }), kept = lowestRoom(isAreaFree, from, clear);
    assert.ok(raw < 0.15, `the recorded route from ${from} passes within 0.15 m of an obstacle`);
    assert.deepEqual(clear.at(-1), path.at(-1));
    assert.ok(kept >= 0, `no sample of the kept route from ${from} is inside an obstacle`);
    assert.ok(kept >= raw, `the kept route from ${from} is no tighter than the recorded one`);
    let current = from;
    for (const point of clear) { assert.ok(canTravel(current, point), `every kept leg from ${from} passes canTravel`); current = point; }
  }
  for (const [from, path] of reloads) assert.ok(lowestRoom(isAreaFree, from, keepClear(isAreaFree, from, path, { canTravel })) >= 0.3 - 1e-9, `the reload route from ${from} keeps 0.3 m`);
});

test('the journey router reuses a lap route but re-clears its first leg from a shifted start', async () => {
  const world = await loadDistrictData({ districtRevision: 'east-garden-commons-market-1' });
  const walking = createWalkingEnvironment(world), isAreaFree = (x, y, r) => walking.isAreaFree(x, -y, r);
  const nav = createResidentNavigation(world, { allowRoads: true }), route = clearRouter(walking, nav);
  const start = [-2786, -1370], shifted = [-2785.51, -1369.51], to = [-2685, -1334];
  const lap = route(start, to);
  assert.equal(route([-2786.05, -1370.05], to), lap, 'a start within 0.15 m reuses the cached route');
  const fromShifted = route(shifted, to);
  assert.deepEqual(fromShifted.at(-1), to);
  assert.deepEqual(fromShifted.slice(-lap.length + 1), lap.slice(1), 'only the first leg is re-cleared');
  // Walking the cached route from here keeps only about 0.20 m on its first leg.
  assert.ok(lowestRoom(isAreaFree, shifted, fromShifted) > lowestRoom(isAreaFree, shifted, lap), 'clearer than walking the cached route from there');
  assert.ok(lowestRoom(isAreaFree, shifted, fromShifted) >= lowestRoom(isAreaFree, shifted, nav.route(shifted, to)), 'no tighter than the resident route from there');
});

test('the journey router does not cache a missing route', () => {
  let calls = 0;
  const nav = { route: () => (calls++ ? [[5, 0]] : null), canTravel: () => true }, walking = { isAreaFree: () => true };
  const route = clearRouter(walking, nav);
  assert.equal(route([0, 0], [5, 0]), null);
  assert.deepEqual(route([0, 0], [5, 0]), [[5, 0]]);
  assert.equal(calls, 2);
});
