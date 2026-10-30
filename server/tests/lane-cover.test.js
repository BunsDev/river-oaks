import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { CRIME_TARGETS } from '../crime.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { LANE_YARD, laneCover, laneCoverFootprints } from '../../preview/src/lane-cover.js';
import { plazaSalonFootprints } from '../../preview/src/plaza-salon-plan.js';
import { cityBikeRackFootprints } from '../../preview/src/bike-racks.js';
import { GAMEPLAY_ZONES } from '../../preview/src/world-policy.js';

// #599 escape by concealment: the service yard in the south lane (lane-cover.js).
const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const env = createWalkingEnvironment(district);
const eye = ([east, north]) => [east, north, env.groundAt(east, -north) + 1.2];
const free = ([east, north]) => env.isFree(east, -north);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lane = GAMEPLAY_ZONES['river-oaks'].find(zone => zone.id === 'south-service-lane');

test('the yard stands inside the south service lane, blocks bodies, and hides its inner bay from the bay mouth', () => {
  const pieces = laneCover(district);
  assert.equal(pieces.length, 3);
  const [w, s, e, n] = lane.rect;
  for (const piece of pieces) {
    assert.ok(piece.height > 1.2, `${piece.id} stands above the 1.2 m police sight line`);
    assert.ok(piece.center[0] > w && piece.center[0] < e && piece.center[1] > s && piece.center[1] < n, `${piece.id} is inside the lane`);
    assert.equal(free(piece.center), false, `${piece.id} blocks bodies`);
  }
  assert.ok(free(LANE_YARD.hide) && free(LANE_YARD.mouth), 'the hide spot and the bay mouth are walkable');
  assert.equal(env.hasSightLine(eye(LANE_YARD.mouth), eye(LANE_YARD.hide)), false, 'the partition hides the inner bay from the mouth');
  // Every walkable point of the lane within police sight range (35 m) that sees the hide spot is
  // inside the inner bay or on the lip of its gap: nowhere an officer stands outside the yard.
  const seenFrom = [];
  for (let east = -2808; east <= -2738; east += 0.5) for (let north = -1457.5; north <= -1426; north += 0.5) {
    if (!free([east, north]) || dist([east, north], LANE_YARD.hide) > 35) continue;
    if (env.hasSightLine(eye([east, north]), eye(LANE_YARD.hide))) seenFrom.push([east, north]);
  }
  const outside = seenFrom.filter(([east, north]) => !(east > -2775 && east < -2768.5 && north > -1457.6 && north < -1453.2));
  assert.deepEqual(outside, [], 'only the inner bay and its gap see the hide spot');
  // The outer bay stays in view of its mouth, and open lane points still see each other.
  assert.equal(env.hasSightLine(eye(LANE_YARD.mouth), eye([-2766.4, -1456.6])), true, 'the mouth sees the outer bay');
  assert.equal(env.hasSightLine(eye([-2770, -1440]), eye([-2770, -1450])), true, 'open lane points north of the crates see each other');
});

test('the hide spot is reachable through the partition gap at a body\'s width', () => {
  const g = 0.25, key = (i, j) => `${i},${j}`, at = p => [Math.round(p[0] / g), Math.round(p[1] / g)];
  const start = at(LANE_YARD.mouth), goal = key(...at(LANE_YARD.hide)), seen = new Set([key(...start)]), queue = [start];
  let found = false;
  while (queue.length && !found) {
    const [i, j] = queue.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [i + di, j + dj], k = key(...next);
      if (seen.has(k) || dist([next[0] * g, next[1] * g], LANE_YARD.mouth) > 20 || !free([next[0] * g, next[1] * g])) continue;
      if (k === goal) found = true;
      seen.add(k); queue.push(next);
    }
  }
  assert.ok(found, 'a walker gets from the mouth to the hide spot');
});

test('only the yard blocks sight: salon furniture and bike racks keep blocking bodies alone', () => {
  for (const group of [plazaSalonFootprints(district), ...cityBikeRackFootprints(district)]) {
    const [east, north] = group[Math.floor(group.length / 2)];
    assert.equal(free([east, north]), false, 'the prop still blocks a body');
    assert.equal(env.hasSightLine(eye([east - 2, north]), eye([east + 2, north])), true, `a line across the prop at ${east}, ${north} stays clear`);
  }
  assert.ok(laneCoverFootprints(district).every(group => group.length > 1 && group.every(([, , radius]) => radius === 0.3)), 'every piece is a grid of 0.3 m discs');
});

test('a wanted player who hides in the inner bay is searched for, not found, and keeps their star; in the open the same run ends in arrest', () => {
  const RIVAL = CRIME_TARGETS['river-oaks'].find(target => target.id === 'rival:service-lane'), [RX, RN] = RIVAL.position;
  const approach = [[-2785, -1449.5], [-2762.5, -1449.5], [-2762.5, -1455]];
  const run = route => {
    const clock = { time: 5_000_000 }, world = createSharedWorld(district, { now: () => clock.time, isAdmin: id => id === 'owner' });
    for (const id of ['owner', 'alice']) assert.equal(world.join({ userId: id, name: id }).ok, true);
    const put = (id, [east, north]) => { world.players.get(id).position = [east, north, env.groundAt(east, -north)]; };
    const tick = () => { clock.time += 50; world.step(0.05); };
    put('owner', [RX + 40, RN + 10]); put('alice', [RX + 1.2, RN]); clock.time += 1000; world.step(1);
    assert.equal(world.command('owner', { type: 'worldPolicy', action: 'update', expectedRevision: world.worldPolicy().revision, changes: { violence: { mode: 'forced', zones: [lane.id] } } }).ok, true);
    tick();
    assert.equal(world.command('alice', { type: 'attack', targetId: RIVAL.id, attackKind: 'melee' }).ok, true);
    let unitId = null;
    const officer = () => { const units = world.snapshot().police.units; const unit = unitId ? units.find(item => item.id === unitId) : units.find(item => item.targetId === 'alice'); if (unit) unitId = unit.id; return unit; };
    for (let i = 0; i < 400 && officer()?.state !== 'pursue'; i++) tick();
    assert.equal(officer()?.state, 'pursue', 'an officer pursues the wanted player');
    for (let i = 0; i < 200 && dist(officer().position, world.players.get('alice').position) > 1.5; i++) tick();
    // Walk at 5 m/s along the crates, round the east end, in at the mouth, through the gap.
    const path = [[RX + 1.2, RN], ...approach, ...route];
    const states = new Set();
    for (let k = 1; k < path.length; k++) {
      const [a, b] = [path[k - 1], path[k]], n = Math.max(1, Math.ceil(dist(a, b) / 0.25));
      for (let i = 1; i <= n; i++) { const p = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]; assert.ok(free(p), `the path is walkable at ${p}`); put('alice', p); tick(); states.add(officer()?.state ?? 'gone'); }
    }
    for (let i = 0; i < 20 * 20; i++) { tick(); states.add(officer()?.state ?? 'gone'); }
    return { states, wanted: world.snapshot().crime.wanted, alice: world.players.get('alice').position };
  };
  const hidden = run([[-2767.6, -1455], [-2768.2, -1454], [-2771.8, -1454], LANE_YARD.hide]);
  assert.ok(hidden.states.has('search') && hidden.states.has('return'), `the officer searches and gives up: ${[...hidden.states]}`);
  assert.ok(!hidden.states.has('grab') && !hidden.states.has('arrest'), 'and never reaches the hidden player');
  assert.deepEqual(hidden.wanted, [['alice', 1]], 'the player keeps their star and is free to let it cool');
  assert.ok(dist(hidden.alice, LANE_YARD.hide) < 0.01, 'and is still in the bay');
  // The same chase ending in the outer bay, where the mouth sees: the officer finds and arrests.
  const open = run([[-2766.4, -1456.6]]);
  assert.ok(open.states.has('arrest'), `in the outer bay the officer arrests: ${[...open.states]}`);
  assert.deepEqual(open.wanted, []);
});
