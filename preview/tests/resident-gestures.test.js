import test from 'node:test';
import assert from 'node:assert/strict';
import { createResidentGestures } from '../src/resident-gestures.js';

test('Force casting reaches with the free arm and eases back without disturbing the wand arm',()=>{
  const motion=createResidentGestures();let pose;
  for(let i=0;i<90;i++)pose=motion.update('force',1/60);
  assert.ok(pose.upperarm_l[0]<-1);assert.ok(pose.hand_l[0]>.2);
  assert.deepEqual(pose.upperarm_r,[0,0,0]);assert.deepEqual(pose.lowerarm_r,[0,0,0]);
  const raised=pose.upperarm_l[0];motion.update('continue',1/60);
  assert.ok(Math.abs(pose.upperarm_l[0]-raised)<.04);
  for(let i=0;i<120;i++)pose=motion.update('continue',1/60);
  assert.ok(Object.values(pose).flat().every(value=>Math.abs(value)<1e-6));
});

test('a wave raises the right arm and settles back into the walking pose',()=>{
  const motion=createResidentGestures();let pose;
  for(let frame=0;frame<60;frame++)pose=motion.update('wave',1/60,frame/60);
  assert.ok(pose.upperarm_r[0]<-.8 && pose.lowerarm_r[2]>1,'the greeting reads as a raised hand');
  for(let frame=0;frame<120;frame++)pose=motion.update('continue',1/60,frame/60);
  assert.ok(Object.values(pose).flat().every(angle=>Math.abs(angle)<1e-6));
});

test('a visible slow frame still advances a shared wave',()=>{
  const motion=createResidentGestures();
  const pose=motion.update('wave',0.32,0.32);
  assert.ok(pose.upperarm_r[0]<-0.1,'a busy renderer must not freeze the greeting');
});

const copy=pose=>structuredClone(pose);
test('passive acknowledgement is a small head nod that leaves walking arms free',()=>{
  const motion=createResidentGestures();let pose;
  for(let frame=0;frame<40;frame++)pose=motion.update('acknowledge',1/60);
  assert.ok(pose.head[0]>0.04 && pose.head[0]<0.1,'a restrained nod is visible');
  for(const [joint,angles] of Object.entries(pose))if(joint!=='head')assert.deepEqual(angles,[0,0,0]);
  for(let frame=0;frame<120;frame++)pose=motion.update('continue',1/60);
  assert.ok(Object.values(pose).flat().every(angle=>Math.abs(angle)<1e-6));
});

test('reactions settle into their gesture and return to rest at every refresh rate',()=>{
  const snapshots=[];
  for(const hz of [30,60,144]){
    const motion=createResidentGestures();let pose;
    for(let frame=0;frame<hz;frame++)pose=motion.update('startled',1/hz);
    snapshots.push(copy(pose));
    assert.ok(Math.abs(pose.lowerarm_r[2]-1.35)<0.001,'startled expression is retained');
    for(let frame=0;frame<2*hz;frame++)pose=motion.update('idle',1/hz);
    assert.ok(Object.values(pose).flat().every(angle=>Math.abs(angle)<1e-6),'hands return to rest');
  }
  for(const name of Object.keys(snapshots[0]))for(let axis=0;axis<3;axis++)assert.ok(Math.abs(snapshots[0][name][axis]-snapshots[2][name][axis])<1e-10,'response must not change with refresh rate');
});

test('interrupting a gesture preserves angular velocity instead of reversing in one frame',()=>{
  const motion=createResidentGestures();let pose;
  const dt=1/1000;
  for(let frame=0;frame<150;frame++)pose=motion.update('startled',dt);
  const before=pose.lowerarm_r[2];
  const last=motion.update('startled',dt).lowerarm_r[2];
  const next=motion.update('idle',dt).lowerarm_r[2];
  assert.ok(last>before&&next>last,'the arm brakes before returning');
  assert.ok(Math.abs((next-last)-(last-before))/dt<0.15,'velocity remains continuous at interruption');
});

test('independent residents and reduced motion do not inherit another reaction',()=>{
  const active=createResidentGestures(),other=createResidentGestures(),reduced=createResidentGestures({reducedMotion:true});
  for(let frame=0;frame<60;frame++)active.update('amazed',1/60);
  for(const motion of [other,reduced])assert.ok(Object.values(motion.update('amazed',0)).flat().every(angle=>angle===0));
  assert.ok(Object.values(reduced.update('startled',1)).flat().every(angle=>angle===0));
  const before=copy(active.update('amazed',0));
  for(const delta of [-1,NaN,Infinity])assert.deepEqual(active.update('idle',delta),before,'invalid time cannot corrupt or rewind a pose');
});

test('resuming after culling preserves the pose before continuing the transition',()=>{
  const motion=createResidentGestures();
  for(let frame=0;frame<8;frame++)motion.update('startled',1/60);
  const before=copy(motion.update('startled',0));
  motion.suspend();
  assert.deepEqual(motion.update('greet',2),before,'a hidden interval must not become a visible catch-up step');
  const resumed=motion.update('greet',1/60);
  assert.ok(Math.abs(resumed.lowerarm_r[2]-before.lowerarm_r[2])<0.15,'normal frame steps resume smoothly');
});

test('watering leans in, looks down and tips the can forward with the right hand', () => {
  const gestures = createResidentGestures();
  let pose;
  for (let i = 0; i < 90; i++) pose = gestures.update('water', 1 / 60, i / 60);
  assert.ok(pose.upperarm_r[0] < -0.6, 'right arm forward');
  assert.ok(pose.hand_r[0] > 0.25, 'wrist tipped to pour');
  assert.ok(pose.spine_03[0] > 0.1 && pose.head[0] > 0.15, 'leaning in, looking down');
  assert.equal(pose.upperarm_l[0], 0, 'the left arm stays free');
  for (let i = 0; i < 120; i++) pose = gestures.update('continue', 1 / 60, i / 60);
  assert.ok(Math.abs(pose.hand_r[0]) < 0.01, 'releases back to rest');
});
