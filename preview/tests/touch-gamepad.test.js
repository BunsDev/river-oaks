import test from 'node:test';
import assert from 'node:assert/strict';
import { STICK, stickInput, createGamepadState } from '../src/touch-gamepad.js';

const keys = (dx, dy, locked = false) => stickInput(dx, dy, STICK, locked).keys.sort();

test('the stick dead zone presses nothing, so a resting thumb never drifts', () => {
  assert.deepEqual(keys(0, 0), []);
  assert.deepEqual(keys(STICK.radius * STICK.deadzone * 0.9, 0), []);
  assert.deepEqual(keys(0, -STICK.radius * STICK.deadzone * 0.9), []);
  assert.deepEqual(keys(0, -STICK.radius * STICK.deadzone * 1.1), ['KeyW']);
});

test('eight 45° sectors map to the walking keys, screen up being forward', () => {
  const r = STICK.radius, d = r * Math.SQRT1_2;
  assert.deepEqual(keys(0, -r), ['KeyW']);
  assert.deepEqual(keys(0, r), ['KeyS']);
  assert.deepEqual(keys(-r, 0), ['KeyA']);
  assert.deepEqual(keys(r, 0), ['KeyD']);
  assert.deepEqual(keys(d, -d), ['KeyD', 'KeyW']);
  assert.deepEqual(keys(-d, -d), ['KeyA', 'KeyW']);
  assert.deepEqual(keys(d, d), ['KeyD', 'KeyS']);
  assert.deepEqual(keys(-d, d), ['KeyA', 'KeyS']);
  // 20° off straight up stays a pure forward walk; 25° picks up the strafe.
  const at = deg => [Math.sin(deg * Math.PI / 180) * r, -Math.cos(deg * Math.PI / 180) * r];
  assert.deepEqual(keys(...at(20)), ['KeyW']);
  assert.deepEqual(keys(...at(25)), ['KeyD', 'KeyW']);
});

test('the knob is clamped to the ring while the pull keeps counting', () => {
  const result = stickInput(0, -STICK.radius * 3);
  assert.deepEqual(result.knob, [0, -STICK.radius]);
  assert.equal(result.magnitude, 1);
});

test('pulling straight up past the ring locks sprint; an angled pull does not', () => {
  const pull = STICK.radius * STICK.sprintPull;
  assert.equal(stickInput(0, -pull * 0.95).sprintLocked, false);
  assert.deepEqual(keys(0, -pull * 1.01), ['KeyW', 'ShiftLeft']);
  assert.equal(stickInput(pull * 0.7, -pull * 0.7).sprintLocked, false, 'a 45° pull strafes without sprinting');
});

test('a locked sprint survives easing back and steering, and ends on reverse, rest or release', () => {
  const pull = STICK.radius * STICK.sprintPull;
  const changes = [];
  const pad = createGamepadState({ onKeys: held => changes.push([...held].sort()) });
  assert.equal(pad.stickDown(7, 100, 400), true);
  pad.stickMove(7, 100, 400 - pull - 2);
  assert.equal(pad.sprintLocked, true);
  pad.stickMove(7, 100, 400 - STICK.radius * 0.6);
  assert.deepEqual([...pad.held].sort(), ['KeyW', 'ShiftLeft'], 'easing back inside the ring keeps the lock');
  pad.stickMove(7, 140, 360);
  assert.deepEqual([...pad.held].sort(), ['KeyD', 'KeyW', 'ShiftLeft'], 'steering while sprinting keeps it');
  pad.stickMove(7, 100, 400 + STICK.radius);
  assert.deepEqual([...pad.held], ['KeyS'], 'pulling back drops the lock');
  pad.stickMove(7, 100, 400 - STICK.radius);
  assert.deepEqual([...pad.held], ['KeyW'], 'a later forward push does not resume sprinting');
  pad.stickMove(7, 100, 400 - pull - 2);
  pad.stickMove(7, 101, 401);
  assert.deepEqual([...pad.held], [], 'returning to centre drops it');
  assert.equal(pad.sprintLocked, false);
  pad.stickMove(7, 100, 400 - pull - 2);
  assert.equal(pad.stickUp(7), true);
  assert.deepEqual([...pad.held], []);
  assert.equal(pad.sprintLocked, false);
  assert.deepEqual(changes.at(-1), []);
});

test('a second finger can neither take over nor release the stick', () => {
  const pad = createGamepadState();
  pad.stickDown(1, 50, 500);
  assert.equal(pad.stickDown(2, 60, 500), false);
  assert.equal(pad.stickMove(2, 60, 300), null);
  pad.stickMove(1, 50, 440);
  assert.deepEqual([...pad.held], ['KeyW']);
  assert.equal(pad.stickUp(2), false);
  assert.deepEqual([...pad.held], ['KeyW']);
  assert.equal(pad.stickUp(1), true);
  assert.equal(pad.stickOwner, null);
});

test('stick and held buttons merge, and releasing one never drops the other', () => {
  const changes = [];
  const pad = createGamepadState({ onKeys: held => changes.push([...held].sort()) });
  const rise = {};
  pad.stickDown(1, 0, 0); pad.stickMove(1, 0, -STICK.radius);
  assert.equal(pad.hold(rise, 'Space'), true);
  assert.equal(pad.hold(rise, 'Space'), false, 'a second finger on the same button is ignored');
  assert.deepEqual([...pad.held].sort(), ['KeyW', 'Space']);
  pad.stickUp(1);
  assert.deepEqual([...pad.held], ['Space']);
  assert.equal(pad.release(rise), true);
  assert.equal(pad.release(rise), false);
  assert.deepEqual(changes, [['KeyW'], ['KeyW', 'Space'], ['Space'], []]);
});

test('unchanged moves stay quiet, releaseAll reports once and reset forgets silently', () => {
  let calls = 0;
  const pad = createGamepadState({ onKeys: () => { calls += 1; } });
  pad.stickDown(1, 0, 0);
  pad.stickMove(1, 0, -30); pad.stickMove(1, 1, -40); pad.stickMove(1, -1, -50);
  assert.equal(calls, 1);
  pad.hold('lower', 'KeyC');
  pad.releaseAll();
  assert.equal(calls, 3);
  assert.deepEqual([...pad.held], []);
  pad.stickDown(2, 0, 0); pad.stickMove(2, 0, -40);
  const before = calls;
  pad.reset();
  assert.equal(calls, before, 'reset follows a caller that already cleared its keys');
  assert.deepEqual([...pad.held], []);
  assert.equal(pad.stickOwner, null);
  pad.stickDown(3, 0, 0); pad.stickMove(3, 0, -40);
  assert.equal(calls, before + 1, 'after a reset the same keys are reported again');
});
