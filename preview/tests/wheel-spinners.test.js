import test from 'node:test';
import assert from 'node:assert/strict';
import {createWheelSpinners} from '../src/wheel-spinners.js';

test('wheel centers build momentum while riding and coast independently after stopping',()=>{
  for(const hz of [30,60,120]) {
    const spin=createWheelSpinners([.63,.63,.738,.738]);
    for(let i=0;i<hz*2;i++)spin.update(1/hz,3);
    const before=spin.inspect();assert.ok(before[0].velocity>4);assert.ok(before[0].velocity>before[2].velocity);
    for(let i=0;i<hz;i++)spin.update(1/hz,0);
    const after=spin.inspect();assert.ok(after[0].angle>before[0].angle);assert.ok(after[0].velocity>1);
    for(let i=0;i<hz*30;i++)spin.update(1/hz,0);
    assert.equal(spin.inspect()[0].velocity,0);
    spin.reset();assert.ok(spin.inspect().every(s=>s.angle===0&&s.velocity===0));
  }
});

test('reduced motion keeps the centers attached to the rolling wheels without idle spinning',()=>{
  const spin=createWheelSpinners([.63],{reducedMotion:true});
  spin.update(.08,3);assert.equal(spin.inspect()[0].velocity,0);assert.equal(spin.inspect()[0].angle,0);
  for(const delta of [-1,NaN,Infinity])spin.update(delta,3);
  assert.equal(spin.inspect()[0].angle,0);
});
