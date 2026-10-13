import test from 'node:test';
import assert from 'node:assert/strict';
import { RIM, TABLE, THROWS_PER_TURN, aimAt, glassAt, landing, notation, play, replay, resolve, startGame, trajectory } from '../src/wine-pong-rules.js';
import { WOBBLE, chooseThrow } from '../src/wine-pong-opponent.js';
import { winePongSide, winePongStand } from '../src/plaza-salon-plan.js';

test('two racks of six glasses, a triangle at each end, none touching', () => {
  for (const side of [0, 1]) {
    const glasses = Array.from({ length: 6 }, (_, k) => glassAt(side, k));
    for (const [u, v] of glasses) { assert.ok(Math.abs(u) < TABLE.length / 2 - RIM && Math.abs(v) < TABLE.width / 2 - RIM); assert.equal(Math.sign(u), side === 0 ? -1 : 1, 'each rack at its own end'); }
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) assert.ok(Math.hypot(glasses[a][0] - glasses[b][0], glasses[a][1] - glasses[b][1]) > 2 * RIM, `glasses ${a} and ${b} apart`);
  }
});

test('aim and power land where aimAt says, from either end', () => {
  for (const side of [0, 1]) for (const point of [[0.95, 0.05], [-1.0, -0.08], [0.2, 0.1]]) {
    const { aim, power } = aimAt(side, point), land = landing(side, aim, power);
    if (aim < 0 || aim > 1 || power < 0 || power > 1) continue;
    assert.ok(Math.hypot(land[0] - point[0], land[1] - point[1]) < 1e-9, `${side} → ${point}`);
  }
});

test('a dead-centre throw drops in; a rim may rattle in or out; the table bounces; long is a miss', () => {
  const state = startGame(4), apex = glassAt(1, 5), centre = aimAt(0, apex);
  assert.deepEqual([resolve(state, centre.aim, centre.power).result, resolve(state, centre.aim, centre.power).glass], ['in', 5]);
  const rim = aimAt(0, [apex[0], apex[1] + RIM + 0.005]), outcomes = new Set();
  for (let seed = 1; seed <= 40; seed++) outcomes.add(resolve(startGame(seed), rim.aim, rim.power).result);
  assert.deepEqual([...outcomes].sort(), ['rim-in', 'rim-out'], 'rim shots sometimes rattle in, sometimes spin out');
  // Short onto the table, then on into the apex glass on the bounce.
  const short = aimAt(0, [apex[0] - 0.38, apex[1]]);
  assert.equal(resolve(state, short.aim, short.power).result, 'bounce-in');
  assert.equal(resolve(state, 0.5, 1).result, 'miss', 'over the far end');
  assert.equal(resolve(state, 0, 0.4).result, 'miss', 'wide off the side');
});

test('two throws a turn; a hit glass leaves play; clearing the rack wins; games replay exactly', () => {
  let state = startGame(9);
  const throws = [];
  const shoot = k => { const { aim, power } = aimAt(state.turn, glassAt(1 - state.turn, k)); throws.push(notation(aim, power)); state = play(state, Number(aim.toFixed(3)), Number(power.toFixed(3))); };
  shoot(5);
  assert.equal(state.glasses[1][5], false); assert.equal(state.turn, 0); assert.equal(state.throwsLeft, THROWS_PER_TURN - 1);
  shoot(4);
  assert.equal(state.turn, 1, 'after two throws the other side throws');
  for (const k of [5, 4]) shoot(k);
  for (const k of [3, 2]) shoot(k);
  assert.equal(state.turn, 1);
  state = play(state, 0.5, 1); throws.push(notation(0.5, 1)); state = play(state, 0.5, 1); throws.push(notation(0.5, 1));
  for (const k of [1, 0]) shoot(k);
  assert.equal(state.winner, 0, 'six glasses down wins');
  assert.throws(() => play(state, 0.5, 0.5), /over/);
  assert.deepEqual(replay(9, throws).state.glasses, state.glasses);
  assert.equal(replay(9, throws).state.winner, 0);
  assert.throws(() => play(startGame(), 1.2, 0.5), /Bad throw/);
});

test('the regulars sink about a third of their throws, and games end', () => {
  let hits = 0, throws = 0;
  for (const seed of [1, 2, 3, 77, 123_456_789, 2 ** 32 - 1]) {
    let state = startGame(seed);
    while (state.winner === null && state.throws < 400) {
      const choice = chooseThrow(state);
      assert.deepEqual(chooseThrow(state), choice, 'deterministic');
      const before = state.glasses[1 - state.turn].filter(Boolean).length;
      state = play(state, choice.aim, choice.power);
      if (state.glasses[1 - state.last.side].filter(Boolean).length < before) hits++;
      throws++;
    }
    assert.notEqual(state.winner, null, `seed ${seed} ends`);
  }
  assert.ok(hits / throws > 0.2 && hits / throws < 0.45, `hit rate ${hits / throws}`);
  assert.ok(WOBBLE.aim > 0 && WOBBLE.power > 0);
});

test('the ball flies from the hand and comes to rest where the throw says', () => {
  const state = startGame(4), centre = aimAt(0, glassAt(1, 5)), outcome = resolve(state, centre.aim, centre.power), path = trajectory(0, outcome);
  assert.ok(path[0][2] > 1 && path.some(point => point[2] > path[0][2]), 'thrown up from the hand');
  assert.ok(Math.hypot(path.at(-1)[0] - glassAt(1, 5)[0], path.at(-1)[1] - glassAt(1, 5)[1]) < 0.01, 'into the glass');
  const long = trajectory(0, resolve(state, 0.5, 1));
  assert.ok(long.at(-1)[2] < 0.1, 'a long miss falls to the paving');
});

test('each side stands just beyond its own end of the table', () => {
  const table = { x: 10, north: 20, heading: 0 };
  assert.equal(winePongSide(table, winePongStand(table, 0)), 0);
  assert.equal(winePongSide(table, winePongStand(table, 1)), 1);
  assert.equal(winePongSide(table, [10, 20]), null, 'not from the middle of the table');
});
