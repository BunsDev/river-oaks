import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerAttention} from '../src/player-attention.js';
const local={id:'worker',position:[2,4,10],eyeHeight:1.1};
const base={position:[0,10,0],heading:0,speed:0,conversation:local};

test('conversation attention follows standing, seated and magically elevated people in scene coordinates',()=>{
 const attention=createPlayerAttention();
 assert.deepEqual(attention.update(1/60,{...base,conversation:{...local,wish:{kind:'flight',age:2}}}).target.map(n=>Math.round(n*1e6)/1e6),[2,12.9,-4]);
 assert.deepEqual(attention.update(1/60,{...base,conversation:{...local,wish:{kind:'dog'}}}).target,[2,10.76,-4]);
 assert.deepEqual(attention.update(1/60,base).target,[2,11.1,-4]);
 assert.equal(attention.update(1/60,{...base,conversation:{...local,position:null}}).target,null);
 assert.equal(attention.update(1/60,{...base,conversation:{...local,position:[NaN,0,0]}}).target,null);
});

test('walking, flying and riding retain control of body facing',()=>{
 const attention=createPlayerAttention();
 for(const state of [{speed:1},{flying:true},{riding:true}]){const pose=attention.update(1/60,{...base,...state});assert.equal(pose.mode,'conversation');assert.equal(pose.facing,null);assert.deepEqual(pose.target,[2,11.1,-4]);}
 assert.deepEqual(attention.update(1/60,{...base,conversation:null}),{mode:'none',target:null,facing:null});
});

test('standing conversation turns use the shortest arc, bounded speed and smooth acquisition and release',()=>{
 for(const hz of [30,60,120]){
  const attention=createPlayerAttention();let heading=-Math.PI+.05,lastSpeed=0,maxSpeed=0;
  const conversation={position:[-.1,-2,0]};
  for(let i=0;i<hz*6;i++){
   const next=attention.update(1/hz,{position:[0,0,0],heading,conversation,speed:0});
   const speed=(next.facing-heading)*hz;maxSpeed=Math.max(maxSpeed,Math.abs(speed));
   assert.ok(Math.abs(speed-lastSpeed)<.6,'Turn velocity does not jump');heading=next.facing;lastSpeed=speed;
  }
  assert.ok(maxSpeed<=1.4+1e-8);assert.ok(Math.abs(Math.atan2(Math.sin(heading-Math.atan2(-.1,2)),Math.cos(heading-Math.atan2(-.1,2))))<.002);
  const before=heading;for(const dt of [0,-1,NaN,Infinity,3])assert.equal(attention.update(dt,{...base,heading}).facing,before);
  attention.update(1/hz,{...base,speed:1});const restart=attention.update(1/hz,{...base,heading});assert.ok(Math.abs(restart.facing-heading)<.5/hz);
 }
});

test('closing mid-turn decelerates the body while releasing the target immediately',()=>{
 const attention=createPlayerAttention();let heading=0;
 for(let i=0;i<30;i++)heading=attention.update(1/60,{...base,heading}).facing;
 const first=attention.update(1/60,{...base,heading,conversation:null});assert.equal(first.target,null);assert.equal(first.mode,'none');assert.ok(first.facing!==null&&Math.abs(first.facing-heading)>.01);
 let step=Math.abs(first.facing-heading);heading=first.facing;
 for(let i=0;i<120;i++){
  const next=attention.update(1/60,{...base,heading,conversation:null});const distance=next.facing===null?0:Math.abs(next.facing-heading);assert.ok(distance<=step+1e-10);step=distance;heading=next.facing??heading;
 }
 assert.ok(step<1e-6);
});
