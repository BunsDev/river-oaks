import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationMotion} from '../src/conversation-motion.js';

function sample(seed,hz=60,speaking=true) {
 const motion=createConversationMotion({seed}),frames=[];
 for(let i=0;i<hz*24;i++)frames.push({...motion.update(1/hz,{attending:true,speaking})});
 return frames;
}

test('conversation nods contain quiet pauses, vary between people, and stay subtler when listening',()=>{
 const speaker=sample('resident-1'),other=sample('resident-2'),listener=sample('resident-1',60,false);
 const peak=frames=>Math.max(...frames.map(p=>p.pitch));
 assert.ok(peak(speaker)>.025&&peak(speaker)<.06);
 assert.ok(peak(listener)>.01&&peak(listener)<peak(speaker)*.6);
 const quiet=speaker.filter(p=>Math.abs(p.pitch)<.002).length/speaker.length;
 assert.ok(quiet>.25&&quiet<.85,'Nods have substantial quiet intervals instead of continuous bobbing');
 assert.ok(speaker.some((p,i)=>Math.abs(p.pitch-other[i].pitch)>.015),'Neighbors do not nod in unison');
 assert.deepEqual(sample('resident-1'),speaker,'Identity makes the motion repeatable');
 for(let i=1;i<speaker.length;i++)assert.ok(Math.abs(speaker[i].pitch-speaker[i-1].pitch)<.006,'No head snap');
});

test('speaking and listening transitions settle continuously; resumed culled and reduced-motion people do not catch up',()=>{
 const motion=createConversationMotion({seed:'worker'});let pose;
 for(let i=0;i<120;i++)pose=motion.update(1/60,{attending:true,speaking:true});
 const before={...pose};
 for(const delta of [0,-1,NaN,Infinity,5])assert.deepEqual(motion.update(delta,{attending:false}),before);
 const first={...motion.update(1/60,{attending:false})};
 assert.ok(Math.abs(first.pitch-before.pitch)<.006);
 for(let i=0;i<180;i++)pose=motion.update(1/60,{attending:false});
 assert.ok(Object.values(pose).every(value=>Math.abs(value)<1e-8),'Closing conversation returns to the neutral pose');
 const reduced=createConversationMotion({seed:'worker',reducedMotion:true});
 for(let i=0;i<300;i++)assert.ok(Object.values(reduced.update(1/60,{attending:true,speaking:true})).every(value=>value===0));
});

test('speakers use asymmetric hand phrases with rests; listeners keep their hands quiet',()=>{
 const speaker=sample('resident-1'),listener=sample('resident-1',60,false);
 assert.ok(speaker.some(p=>p.left>.6||p.right>.6),'Speaking lifts a hand into a gesture');
 assert.ok(speaker.some(p=>Math.abs(p.left-p.right)>.4),'Hands do not mirror every phrase');
 assert.ok(speaker.filter(p=>p.left<.02&&p.right<.02).length>speaker.length*.2,'Hands settle between phrases');
 assert.ok(listener.every(p=>p.left===0&&p.right===0),'Listening does not keep gesticulating');
 assert.ok(listener.some(p=>Math.abs(p.lean)>.001),'Listening includes a small upper-body weight shift');
 for(let i=1;i<speaker.length;i++)for(const key of ['left','right','leftBeat','rightBeat','lean','turn','tilt']) {
  assert.ok(Number.isFinite(speaker[i][key]));
  assert.ok(Math.abs(speaker[i][key]-speaker[i-1][key])<.045,`${key} changes without snapping`);
 }
});

test('busy hands and locomotion ease body gestures away while speech nods continue',()=>{
 const motion=createConversationMotion({seed:'resident-1'});let pose;
 for(let i=0;i<600;i++)pose=motion.update(1/60,{speaking:true});
 const before={...pose};
 pose=motion.update(1/60,{speaking:true,gesturing:false});
 assert.ok(Math.abs(pose.left-before.left)<.045,'An interruption releases the gesture continuously');
 let nods=0;
 for(let i=0;i<300;i++){pose=motion.update(1/60,{speaking:true,gesturing:false});nods=Math.max(nods,pose.pitch);}
 assert.ok(nods>.025,'Head motion survives a body-gesture interruption');
 for(const key of ['left','right','leftBeat','rightBeat','lean','turn','tilt'])assert.ok(Math.abs(pose[key])<1e-8,`${key} returns to neutral`);
});

test('the same conversation cadence survives 30, 60 and 120 Hz',()=>{
 const traces=[30,60,120].map(hz=>sample('same-speaker',hz).filter((_,i)=>(i+1)%(hz/10)===0));
 for(let i=0;i<traces[0].length;i++)for(const trace of traces.slice(1)) {
  assert.ok(Math.abs(trace[i].pitch-traces[0][i].pitch)<.004,'Frame rate preserves the nod cadence');
  assert.ok(Math.abs(trace[i].roll-traces[0][i].roll)<.002);
  for(const key of ['left','right','leftBeat','rightBeat','lean','turn','tilt'])assert.ok(Math.abs(trace[i][key]-traces[0][i][key])<.035,`${key}: frame rate preserves the gesture phrase`);
 }
});
