import test from 'node:test';
import assert from 'node:assert/strict';
import { turnToward } from '../src/gait.js';

test('turning has the same response at 30, 60 and 144 Hz and follows the short arc', () => {
  const results = [30,60,144].map(hz => { let heading = 0; for(let i=0;i<hz;i++) heading=turnToward(heading, 2, 1/hz); return heading; });
  assert.ok(Math.abs(results[0]-results[2]) < 1e-10);
  assert.ok(turnToward(Math.PI-0.1, -Math.PI+0.1, 1/60) > Math.PI-0.1);
  assert.equal(turnToward(1, NaN, 1/60), 1);
});
