import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeldControls } from '../src/throw-controls.js';

// A control on a fake clock: what it moved, summed per axis.
function fixture() {
  let time = 0;
  const moved = { across: 0, height: 0 };
  const controls = createHeldControls({ keys: { ArrowLeft: ['across', -1], ArrowRight: ['across', 1], ArrowUp: ['height', 1] }, step: { across: 2, height: 0.5 }, rate: { across: 100, height: 10 },
    now: () => time, apply: move => { for (const [axis, amount] of Object.entries(move)) moved[axis] += amount; } });
  return { controls, moved, at: t => { time = t; }, key: (code, repeat = false) => ({ code, repeat }) };
}

test('a tap moves one step; a key held past the delay keeps moving by the clock, not by frames', () => {
  const f = fixture();
  assert.equal(f.controls.down(f.key('ArrowRight')), true);
  f.at(120); f.controls.up(f.key('ArrowRight'));
  assert.equal(f.moved.across, 2, 'a quick tap is one step');
  // Held for 1.25 s with no frames at all: one step plus a second at the rate.
  f.at(1000); f.controls.down(f.key('ArrowRight'));
  f.at(2250); f.controls.up(f.key('ArrowRight'));
  assert.ok(Math.abs(f.moved.across - (2 + 2 + 100)) < 1e-9, `${f.moved.across}`);
  // The same hold sampled by many frames moves exactly as far.
  const g = fixture();
  g.controls.down(g.key('ArrowUp'));
  for (let t = 16; t <= 1250; t += 16) { g.at(t); g.controls.advance(); }
  g.at(1250); g.controls.up(g.key('ArrowUp'));
  assert.ok(Math.abs(g.moved.height - (0.5 + 10)) < 1e-9, `${g.moved.height}`);
});

test('repeats are ignored, Shift makes moves fine, opposite keys cancel, and clear lets go', () => {
  const f = fixture();
  f.controls.down(f.key('ArrowLeft'));
  assert.equal(f.controls.down(f.key('ArrowLeft', true)), true, 'a repeat is still the game\'s key');
  assert.equal(f.moved.across, -2, 'but moves nothing more');
  f.at(50); f.controls.up(f.key('ArrowLeft'));
  f.controls.down(f.key('ShiftLeft'));
  f.controls.down(f.key('ArrowRight'));
  assert.equal(f.moved.across, -2 + 0.5, 'Shift: a quarter step');
  f.controls.up(f.key('ArrowRight')); f.controls.up(f.key('ShiftLeft'));
  // Both directions held cancel out once the delay has passed.
  const before = f.moved.across;
  f.at(1000); f.controls.down(f.key('ArrowLeft')); f.controls.down(f.key('ArrowRight'));
  f.at(2000); f.controls.advance();
  assert.ok(Math.abs(f.moved.across - before) < 1e-9, 'the two taps and the holds cancel');
  f.controls.clear(); f.at(3000); f.controls.advance();
  assert.ok(Math.abs(f.moved.across - before) < 1e-9, 'nothing moves after clear');
  assert.equal(f.controls.down(f.key('KeyQ')), false, 'other keys are not the game\'s');
});
