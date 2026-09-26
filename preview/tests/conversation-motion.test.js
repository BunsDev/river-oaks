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
 assert.ok(Math.abs(pose.pitch)<1e-8&&Math.abs(pose.roll)<1e-8,'Closing conversation returns to the neutral pose');
 const reduced=createConversationMotion({seed:'worker',reducedMotion:true});
 for(let i=0;i<300;i++)assert.deepEqual(reduced.update(1/60,{attending:true,speaking:true}),{pitch:0,roll:0});
});

test('the same conversation cadence survives 30, 60 and 120 Hz',()=>{
 const traces=[30,60,120].map(hz=>sample('same-speaker',hz).filter((_,i)=>(i+1)%(hz/10)===0));
 for(let i=0;i<traces[0].length;i++)for(const trace of traces.slice(1)) {
  assert.ok(Math.abs(trace[i].pitch-traces[0][i].pitch)<.004,'Frame rate preserves the nod cadence');
  assert.ok(Math.abs(trace[i].roll-traces[0][i].roll)<.002);
 }
});
