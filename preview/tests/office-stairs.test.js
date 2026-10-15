import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeElevationAt, officeLayout, officeLevelFree, officeStandFree, officeStep, officeWalk } from '../src/office-layouts.js';

const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE), legacy = officeLayout(OFFICE_LAYOUT_LEGACY);
const L0 = 'jevica-office/l0', L1 = 'jevica-office/l1', { stair } = layout;
const run = (stair.d[1] - stair.d[0]) / stair.risers, riser = stair.rise / stair.risers;

test('the stair rises through its nosings from the main floor to the mezzanine', () => {
  assert.equal(officeElevationAt(layout, L0, [11.8, 4.5]), 0, 'the foot is the main floor');
  assert.equal(officeElevationAt(layout, L1, [11.8, 15.5]), 3.8, 'the head is the mezzanine');
  let last = -Infinity;
  for (let d = 4.5; d <= 14.8; d += 0.05) {
    const e = officeElevationAt(layout, L0, [11.8, d]);
    assert.ok(e >= last - 1e-9, `rises monotonically at d ${d.toFixed(2)}`);
    last = e;
  }
  for (let i = 0; i < stair.risers; i++) {
    const front = stair.d[0] + i * run, top = riser * (i + 1);
    for (const d of [front + 1e-6, front + run / 2, front + run - 1e-6]) {
      const e = officeElevationAt(layout, L0, [11.8, d]);
      assert.ok(e >= top - 1e-9 && e <= top + riser + 1e-9, `tread ${i + 1} at d ${d.toFixed(3)}: feet at ${e.toFixed(3)} m, tread top ${top.toFixed(3)} m`);
    }
  }
});

test('walking the stair changes floor only where the heights meet', () => {
  let at = { levelId: L0, position: [11.8, 4.5] }, last = 0;
  for (let d = 5; d <= 15.5 + 1e-9; d += 0.5) {
    const next = officeWalk(layout, at.levelId, at.position, [11.8, Math.min(d, 15.5)]);
    assert.equal(next.ok, true, `up to d ${d}`);
    const e = officeElevationAt(layout, next.levelId, [11.8, Math.min(d, 15.5)]);
    assert.ok(e - last <= stair.rise / (stair.d[1] - stair.d[0]) * 0.5 + riser + 1e-9, 'no jump');
    at = { levelId: next.levelId, position: [11.8, Math.min(d, 15.5)] }; last = e;
  }
  assert.deepEqual([at.levelId, officeElevationAt(layout, at.levelId, at.position)], [L1, 3.8], 'the stair head leads onto the mezzanine');
  for (let d = 15; d >= 4 - 1e-9; d -= 0.5) {
    const next = officeWalk(layout, at.levelId, at.position, [11.8, d]);
    assert.equal(next.ok, true, `down to d ${d}`);
    at = { levelId: next.levelId, position: [11.8, d] };
  }
  assert.deepEqual([at.levelId, officeElevationAt(layout, at.levelId, at.position)], [L0, 0], 'and its foot back onto the main floor');
});

test('nobody climbs onto the stair from its side, its back or off the mezzanine edge', () => {
  assert.equal(officeLevelFree(layout, L0, [9, 9]), true);
  assert.equal(officeWalk(layout, L0, [9, 9], [11.8, 9]).ok, false, 'not from the side, mid-flight');
  assert.equal(officeLevelFree(layout, L0, [11.8, 15.5]), true, 'the main floor runs on under the mezzanine');
  assert.equal(officeWalk(layout, L0, [11.8, 15.5], [11.8, 13.5]).ok, false, 'not into the back of the stair from below the mezzanine');
  assert.equal(officeWalk(layout, L1, [5, 15.5], [5, 13]).ok, false, 'not off the mezzanine edge beside the stair');
  assert.equal(officeWalk(layout, L1, [11.8, 15.5], [8, 13]).ok, false, 'not off the stair head sideways');
});

test('a body on the stair is standing clear of every seat, though the floor plan itself is solid there', () => {
  assert.equal(officeLevelFree(layout, L0, [11.8, 9]), false);
  assert.equal(officeStandFree(layout, L0, [11.8, 9], layout.seats), true);
  assert.equal(officeStandFree(layout, L0, [9, 9]), true, 'the floor stays standing ground');
  assert.equal(officeStandFree(layout, L1, [11.8, 9]), false, 'the stair is the main floor\'s; a mezzanine visit never stands on it');
});

test('client stepping follows the stair with the server rule', () => {
  let at = { levelId: L0, position: [11.8, 4.5] };
  for (let i = 0; i < 30; i++) at = officeStep(layout, at.levelId, at.position, 0, 0.4);
  assert.equal(at.levelId, L1);
  assert.ok(at.position[1] > 14.9, `climbed onto the mezzanine (d ${at.position[1].toFixed(2)})`);
  assert.equal(officeElevationAt(layout, at.levelId, at.position), 3.8);
  const legacyStep = officeStep(legacy, L0, [0, 1.4], 0, 0.3);
  assert.deepEqual([legacyStep.levelId, officeElevationAt(legacy, L0, legacyStep.position)], [L0, 0], 'the legacy room is unchanged');
});
