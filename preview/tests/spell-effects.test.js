import test from 'node:test';
import assert from 'node:assert/strict';
import { burst, createPool, emit, paletteFor, stepPool } from '../src/spell-effects.js';

test('each form has its own palette and unknown forms fall back to Jevica', () => {
  assert.notDeepEqual(paletteFor('witch').core, paletteFor('jevica').core);
  assert.deepEqual(paletteFor('lion'), paletteFor('jevica'));
});

test('particles age out and the pool stays packed', () => {
  const pool = createPool(4);
  emit(pool, { position: [0, 0, 0], velocity: [1, 0, 0], life: 0.1, color: [1, 1, 1], size: 0.1 });
  emit(pool, { position: [0, 0, 0], velocity: [0, 1, 0], life: 1, color: [1, 1, 1], size: 0.1 });
  assert.equal(stepPool(pool, 0.2), 1);
  // Drag decays velocity exponentially: exp(-drag × dt) of it survives the step.
  assert.deepEqual([...pool.velocity.slice(0, 3)].map(v => Math.round(v * 100) / 100), [0, Math.round(Math.exp(-0.2) * 100) / 100, 0]);
  assert.equal(pool.position[1] > 0, true, 'the survivor kept moving');
});

test('gravity pulls sparks down and lifts smoke', () => {
  const pool = createPool(2);
  emit(pool, { position: [0, 0, 0], velocity: [0, 0, 0], life: 5, color: [1, 1, 1], size: 0.1, gravity: 9 });
  emit(pool, { position: [0, 0, 0], velocity: [0, 0, 0], life: 5, color: [1, 1, 1], size: 0.1, gravity: -2 });
  stepPool(pool, 0.5);
  assert.equal(pool.velocity[1] < 0, true); assert.equal(pool.velocity[4] > 0, true);
});

test('a cast burst leaves the hand along the aim', () => {
  const pool = createPool(200);
  const count = burst(pool, 'cast', 'witch', [1, 1.2, -3], { direction: [0, 0, -1], seed: 3 });
  assert.equal(count, 36);
  let forward = 0; for (let i = 0; i < pool.count; i++) if (pool.velocity[i * 3 + 2] < 0) forward++;
  assert.equal(forward > count * 0.8, true, 'sparks fly forward');
});

test('an impact is bigger than a cast and includes lingering smoke', () => {
  const pool = createPool(600);
  const cast = burst(pool, 'cast', 'jevica', [0, 0, 0], { seed: 1 }); const impact = burst(pool, 'impact', 'jevica', [0, 0, 0], { seed: 1 });
  assert.equal(impact > cast * 3, true);
  const lives = [...pool.life.slice(cast, cast + impact)];
  assert.equal(Math.max(...lives) > 1, true, 'smoke lingers past a second');
});

test('the pool refuses new particles when full and reduced scale emits fewer', () => {
  const pool = createPool(10);
  assert.equal(burst(pool, 'impact', 'witch', [0, 0, 0], { seed: 2 }), 10);
  assert.equal(emit(pool, { position: [0, 0, 0], velocity: [0, 0, 0], life: 1, color: [1, 1, 1], size: 0.1 }), false);
  const small = createPool(600);
  assert.equal(burst(small, 'impact', 'witch', [0, 0, 0], { seed: 2, scale: 0.35 }) < 80, true);
});
