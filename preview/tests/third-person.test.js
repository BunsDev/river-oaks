import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraBoom } from '../src/third-person.js';

test('camera retracts immediately at obstructions and eases back out at any frame rate',()=>{
  const results=[];
  for(const hz of [30,60,120]) {
    const boom=createCameraBoom();
    assert.equal(boom.update(4,0),4);
    assert.equal(boom.update(1,1/hz),1,'Never interpolate through a wall');
    const next=boom.update(4,1/hz);assert.ok(next>1&&next<2,'No outward pop after a wall clears');
    for(let i=1;i<hz;i++)boom.update(4,1/hz);
    results.push(boom.update(4,0.000001));
    assert.equal(boom.update(2,0),2,'Explicit travel resets the boom');
  }
  assert.ok(Math.max(...results)-Math.min(...results)<1e-8);
  assert.ok(results.every(value=>value>3.99&&value<=4));
});
