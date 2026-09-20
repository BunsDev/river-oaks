import test from 'node:test';
import assert from 'node:assert/strict';
import { residentStride } from '../src/gait.js';

test('walking cycle follows distance, alternates feet and returns to rest on stopping',()=>{
  const a=residentStride(0.275,1.1),b=residentStride(0.825,1.1),repeat=residentStride(1.375,1.1);
  assert.ok(a.thigh_l*a.thigh_r<0,'Legs must alternate');
  assert.ok(a.thigh_l*b.thigh_l<0);
  assert.ok(Math.abs(a.thigh_l-repeat.thigh_l)<1e-8,'Stride must repeat after 1.1 meters');
  assert.ok(Object.values(a).every(Number.isFinite));
  assert.ok(Object.values(residentStride(0.275,0)).every(angle=>angle===0));
  assert.ok(Object.values(residentStride(NaN,Infinity)).every(angle=>angle===0));
});
