import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationGaze } from '../src/conversation-gaze.js';

const origin=[0,1.6,0];
test('gaze follows relative partner height with bounded cervical motion at every refresh rate',()=>{
 const results=[];
 for(const hz of [30,60,144]) {
  const gaze=createConversationGaze();let pose;
  for(let i=0;i<hz*2;i++)pose=gaze.update(origin,[0,2.6,2],0,1/hz);
  assert.ok(Math.abs(pose.pitch+Math.atan2(1,2))<1e-5);
  results.push({...pose});
  for(let i=0;i<hz*2;i++)pose=gaze.update(origin,[10,100,-1],0,1/hz);
  assert.ok(Math.abs(pose.yaw-.85)<1e-5&&Math.abs(pose.pitch+.5)<1e-5);
 }
 assert.ok(Math.abs(results[0].pitch-results[2].pitch)<1e-10);
});

test('turning the body changes head-relative yaw without changing the world partner',()=>{
 const gaze=createConversationGaze();let pose;
 for(let i=0;i<180;i++)pose=gaze.update(origin,[2,1.6,0],Math.PI/2,1/60);
 assert.ok(Math.abs(pose.yaw)<1e-8);
 for(let i=0;i<180;i++)pose=gaze.update(origin,[0,0,2],0,1/60);
 assert.ok(Math.abs(pose.pitch-.4)<1e-6);
});

test('interruption brakes gaze continuously and closing conversation returns to neutral',()=>{
 const gaze=createConversationGaze();let pose;
 for(let i=0;i<150;i++)pose=gaze.update(origin,[0,4,2],0,.001);
 const before=pose.pitch,last=gaze.update(origin,[0,4,2],0,.001).pitch;
 const next=gaze.update(origin,[0,0,2],0,.001).pitch;
 assert.ok(last<before&&next<last,'Head brakes before reversing direction');
 assert.ok(Math.abs(next-last)<.003);
 for(let i=0;i<180;i++)pose=gaze.update(origin,null,0,1/60);
 assert.ok(Math.abs(pose.pitch)<1e-6&&Math.abs(pose.yaw)<1e-6);
});

test('invalid or suspended time cannot snap or corrupt gaze',()=>{
 const gaze=createConversationGaze();
 for(let i=0;i<12;i++)gaze.update(origin,[1,3,2],0,1/60);
 const before={...gaze.update(origin,null,0,0)};
 for(const delta of [-1,NaN,Infinity,3])assert.deepEqual(gaze.update(origin,null,0,delta),before);
});
