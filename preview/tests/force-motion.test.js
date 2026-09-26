import test from 'node:test';
import assert from 'node:assert/strict';
import { createForceBody, createForceAnchor, forceAnchorPosition, stepForceBody, pushForceBody, releaseForceBody } from '../src/force-motion.js';

test('Force lifts ease in, hold a stable height, and land without penetration at different frame rates',()=>{
  const results=[];
  for(const hz of [30,60,120]) {
    const body=createForceBody([0,.2,0],75,1.2),environment={groundAt:()=>.2,canMove:()=>true};
    stepForceBody(body,1/hz,environment);assert.ok(body.position[1]>.2&&body.position[1]<.25,'No teleport on lift');
    for(let i=0;i<3*hz;i++)stepForceBody(body,1/hz,environment);
    assert.ok(Math.abs(body.position[1]-1.4)<.002,'Stable hold');
    results.push(body.position[1]);releaseForceBody(body);
    for(let i=0;i<4*hz;i++){stepForceBody(body,1/hz,environment);assert.ok(body.position[1]>=.2,'Body cannot sink into ground');}
    assert.equal(body.mode,'landed');assert.equal(body.position[1],.2);
  }
  assert.ok(Math.max(...results)-Math.min(...results)<.001);
});

test('push momentum depends on mass and swept motion cannot pass through a thin obstacle',()=>{
  const light=createForceBody([0,0,0],18),heavy=createForceBody([0,0,0],75);
  pushForceBody(light,[1,0]);pushForceBody(heavy,[1,0]);
  assert.ok(light.velocity[0]>heavy.velocity[0]);
  const environment={groundAt:x=>x<.3?0:.1,canMove:(from,to)=>to[0]<.42};
  for(const body of [light,heavy]) {
    for(let i=0;i<240;i++) {
      stepForceBody(body,1/30,environment);
      assert.ok(body.position[0]<.42,'Stops at wall');
      assert.ok(body.position[1]>=environment.groundAt(body.position[0]),'Stays above raised paving');
    }
    assert.equal(body.mode,'landed');
  }
});

test('a pushed airborne body lands and settles, and invalid timing cannot poison the simulation',()=>{
  const body=createForceBody([0,0,0],75),environment={groundAt:()=>0,canMove:()=>true};
  for(let i=0;i<180;i++)stepForceBody(body,1/60,environment);
  pushForceBody(body,[0,1]);
  const start=body.position.slice();
  for(const dt of [0,-1,NaN,Infinity])stepForceBody(body,dt,environment);
  assert.deepEqual(body.position,start);
  for(let i=0;i<360;i++){stepForceBody(body,1/60,environment);assert.ok(body.position[1]>=0);}
  assert.ok(body.position[2]>.5);assert.equal(body.mode,'landed');
  assert.ok(body.velocity.every(v=>v===0));
});

test('carry preserves acquisition offset, follows walking and turns, and settles without a snap at 30/60/120Hz',()=>{
  const results=[];
  for(const hz of [30,60,120]) {
    const pose={position:[0,1.6,0],yaw:0},body=createForceBody([0,0,-3],18),anchor=createForceAnchor(body.position,pose);
    assert.deepEqual(forceAnchorPosition(anchor,pose),[0,-3]);
    const environment={groundAt:()=>0,canMove:()=>true};
    let maxSpeed=0,maxAcceleration=0;
    for(let i=0;i<hz*5;i++) {
      const t=i/hz;pose.position[0]=Math.min(2,t);pose.yaw=Math.min(.6,t*.2);
      const previous=body.velocity.slice();
      stepForceBody(body,1/hz,{...environment,anchor:forceAnchorPosition(anchor,pose)});
      maxSpeed=Math.max(maxSpeed,Math.hypot(body.velocity[0],body.velocity[2]));
      maxAcceleration=Math.max(maxAcceleration,Math.hypot(body.velocity[0]-previous[0],body.velocity[2]-previous[2])*hz);
    }
    const goal=forceAnchorPosition(anchor,pose);
    assert.ok(Math.hypot(body.position[0]-goal[0],body.position[2]-goal[1])<.025,'Carry catches up and settles');
    assert.ok(maxSpeed<=4&&maxAcceleration<=8.01,'Bounded speed and acceleration');
    assert.ok(Math.hypot(body.position[0],body.position[2]+3)>.5,'Target actually moves');
    results.push(body.position);
    releaseForceBody(body);
    for(let i=0;i<hz*4;i++)stepForceBody(body,1/hz,{...environment,anchor:[100,100]});
    assert.equal(body.mode,'landed');assert.ok(body.position[0]<10,'Release stops following the caster');
  }
  assert.ok(Math.hypot(...results[0].map((v,i)=>v-results[2][i]))<.015,'Consistent across render rates');
});

test('carry slides along an obstacle, never tunnels and resumes after the obstruction clears',()=>{
  const body=createForceBody([0,1.25,0],18),environment={groundAt:()=>0,canMove:(_from,to)=>to[0]<.3,anchor:[2,2]};
  for(let i=0;i<180;i++){stepForceBody(body,1/60,environment);assert.ok(body.position[0]<.3);}
  assert.ok(body.blocked);assert.ok(body.position[2]>1.8,'Unblocked axis remains usable');
  for(let i=0;i<180;i++)stepForceBody(body,1/60,{...environment,canMove:()=>true});
  assert.ok(Math.hypot(body.position[0]-2,body.position[2]-2)<.01);assert.equal(body.blocked,false);
});
