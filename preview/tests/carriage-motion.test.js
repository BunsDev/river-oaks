import test from 'node:test';
import {Euler,Quaternion,Vector3} from 'three';
import assert from 'node:assert/strict';
import * as motion from '../src/carriage-motion.js';
import { carriageContains } from '../src/carriage-parking.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { thirdPersonPose } from '../src/third-person.js';
import * as flight from '../src/flight.js';

test('riding accelerates, steers, brakes and advances real wheel distance',()=>{
  assert.equal(typeof motion.stepCarriage,'function');
  const state={position:[0,0,0],yaw:0,speed:0,distance:0};
  const env={groundAt:()=>0,canOccupy:()=>true};
  for(let i=0;i<120;i++)motion.stepCarriage(state,env,{forward:1},1/60);
  assert.ok(state.position[0]<-3);assert.ok(state.distance>3);assert.ok(state.speed<=4);
  const yaw=state.yaw;
  for(let i=0;i<40;i++)motion.stepCarriage(state,env,{forward:1,strafe:-1},1/60);
  assert.ok(state.yaw>yaw+.1);
  for(let i=0;i<180;i++)motion.stepCarriage(state,env,{},1/60);
  assert.ok(Math.abs(state.speed)<.001);
});
test('the full carriage stops before an obstruction even on a long frame',()=>{
  const state={position:[0,0,0],yaw:0,speed:4,distance:0};
  const env={groundAt:()=>0,canOccupy:p=>!carriageContains(p,-4,1,0,.1)};
  for(let i=0;i<20;i++)motion.stepCarriage(state,env,{forward:1},.08);
  assert.ok(state.position[0]>-.79);assert.equal(state.speed,0);
});
test('four tyres contact an uneven slope and safe exits remain outside the coach',()=>{
  assert.equal(typeof motion.fitCarriageToGround,'function');
  const state={position:[0,0,0],yaw:.5},groundAt=(x,z)=>.03*x+.01*z+.008*Math.sin(x*2+z);
  motion.fitCarriageToGround(state,groundAt);
  assert.ok(state.wheelOffsets.length===4);
  for(const clearance of motion.carriageTyreClearances(state,groundAt))assert.ok(Math.abs(clearance)<.001,`${clearance}`);
  const exit=motion.findCarriageExit(state,{groundAt,isFree:(x,z)=>z>0,roomAt:()=>null});
  assert.ok(exit);assert.ok(exit[2]>0);assert.equal(carriageContains(state,...exit,.4),false);
  assert.equal(motion.findCarriageExit(state,{groundAt,isFree:()=>false}),null);
});
test('dismount leaves room for the third-person camera outside the coach',()=>{
  const placement={position:[0,0,0],yaw:0};
  const world={bounds_m:[-30,-30,30,30],buildings:[]};
  const environment=createWalkingEnvironment(world,[{contains:(...point)=>carriageContains(placement,...point)}]);
  const exit=motion.findCarriageExit(placement,environment);
  const state={position:[exit[0],exit[1]+1.68,exit[2]],yaw:Math.atan2(exit[0]+2.1,exit[2]),pitch:-.15};
  const camera=thirdPersonPose(state,environment);
  assert.equal(camera.showBody,true);
  assert.ok(Math.hypot(...camera.position.map((v,i)=>v-camera.target[i]))>1);
});
test('bubble flight cannot enter an immobile flight state beside the coach',()=>{
  assert.equal(typeof flight.beginFlight,'function');
  const placement={position:[0,0,0],yaw:0};
  const environment=createWalkingEnvironment({bounds_m:[-30,-30,30,30],buildings:[]},[{contains:(...p)=>carriageContains(placement,...p)}]);
  const airborne=flight.createFlightState(),state={position:[0,1.68,2.1]};
  assert.equal(environment.isFree(0,2.1),true,'Jevica fits here on foot');
  assert.equal(flight.beginFlight(state,environment,airborne),false,'her bubble needs more clearance');
  assert.deepEqual(airborne,flight.createFlightState());
  state.position[2]=3.2;
  assert.equal(flight.beginFlight(state,environment,airborne),true);
  assert.equal(airborne.active,true);
});

test('a smaller coach keeps its scaled tyres on the ground at every wheel angle',()=>{
  const groundAt=(x,z)=>.04*x+.02*z+.03*Math.sin(x*2);
  for(const scale of [.9,1])for(const distance of [0,.27,2.1,7]) {
    const state={position:[2,0,-1],yaw:.63,scale,distance};
    motion.fitCarriageToGround(state,groundAt);
    const q=new Quaternion().setFromEuler(new Euler(state.pitch,state.yaw,state.roll,'YXZ'));
    for(const [i,[x,r,z]]of motion.CARRIAGE_WHEELS.entries()) {
      let clearance=Infinity;
      for(let n=0;n<96;n++)for(const edge of [-.018,.018]) {
        const a=n/96*Math.PI*2;
        const p=new Vector3(x+r*Math.cos(a),r+r*Math.sin(a),z+edge).multiplyScalar(scale).applyQuaternion(q);
        p.x+=state.position[0];p.y+=state.position[1]+state.wheelOffsets[i];p.z+=state.position[2];
        clearance=Math.min(clearance,p.y-groundAt(p.x,p.z));
      }
      assert.ok(Math.abs(clearance)<.001,`scale ${scale}, wheel ${i}: ${clearance}`);
    }
  }
});
