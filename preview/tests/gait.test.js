import test from 'node:test';
import assert from 'node:assert/strict';
import { residentStride, turnToward } from '../src/gait.js';

test('walking cycle follows distance, alternates feet and returns to rest on stopping',()=>{
  const a=residentStride(0.275,1.1),b=residentStride(0.825,1.1),repeat=residentStride(1.375,1.1);
  assert.ok(a.thigh_l*a.thigh_r<0,'Legs must alternate');
  assert.ok(a.thigh_l*b.thigh_l<0);
  assert.ok(Math.abs(a.thigh_l-repeat.thigh_l)<1e-8,'Stride must repeat after 1.1 meters');
  assert.ok(Object.values(a).every(Number.isFinite));
  assert.ok(Object.values(residentStride(0.275,0)).every(angle=>angle===0));
  assert.ok(Object.values(residentStride(NaN,Infinity)).every(angle=>angle===0));
});

test('turning has the same response at 30, 60 and 144 Hz and follows the short arc', () => {
  const results = [30,60,144].map(hz => { let heading = 0; for(let i=0;i<hz;i++) heading=turnToward(heading, 2, 1/hz); return heading; });
  assert.ok(Math.abs(results[0]-results[2]) < 1e-10);
  assert.ok(turnToward(Math.PI-0.1, -Math.PI+0.1, 1/60) > Math.PI-0.1);
  assert.equal(turnToward(1, NaN, 1/60), 1);
});
