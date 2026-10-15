import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraBoom, pitchAfterSeatChange, seatedEyeView } from '../src/third-person.js';

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

test('a seat that names an eye pitch is seen from the seated eye; other seats keep the camera boom',()=>{
  // A high-back cinema recliner hides the screen from any camera behind it (#368).
  assert.deepEqual(seatedEyeView({buildId:'bench:ipic-recliner-1-1',slot:0,height:.53,yaw:0,eyePitch:.44}),{pitch:.44});
  assert.equal(seatedEyeView({buildId:'bench:shop',slot:0,height:.45,yaw:0}),null);
  assert.equal(seatedEyeView({buildId:'bench:x',slot:0,eyePitch:Number.NaN}),null);
  assert.equal(seatedEyeView(null),null);
});

test('a recliner sitter looks at the screen once on sitting; re-confirming the seat keeps their look; standing levels it',()=>{
  const front={buildId:'bench:ipic-recliner-1-1',slot:0,height:.53,yaw:0,eyePitch:.44},back={buildId:'bench:ipic-recliner-0-1',slot:0,height:.53,yaw:0,eyePitch:.22};
  const bench={buildId:'bench:shop',slot:0,height:.45,yaw:0};
  assert.equal(pitchAfterSeatChange(null,front,-.6),.44,'sitting down looks at the screen, whatever the walk left');
  assert.equal(pitchAfterSeatChange(front,{...front},.1),.1,'a reconnect or correction on the same seat keeps a dragged look');
  assert.equal(pitchAfterSeatChange(front,back,.1),.22,'moving to another recliner looks at the screen from there');
  assert.equal(pitchAfterSeatChange(front,null,.1),0,'standing up levels the walking camera');
  assert.equal(pitchAfterSeatChange(null,bench,-.3),-.3,'other seats keep the pitch');
  assert.equal(pitchAfterSeatChange(bench,null,-.3),-.3,'and so does standing from them');
});
