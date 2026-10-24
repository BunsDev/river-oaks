import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedWorld} from '../world.js';
import {createWalkingEnvironment} from '../../preview/src/walking.js';
import {createFlightState,stepFlight,recordFlightPose,acknowledgeFlightPose} from '../../preview/src/flight.js';

const owner='user_01M40Y914S1H4EJCEHH91DKTAY';
const data={scene:'district',bounds_m:[-60,-60,60,60],walkSpawn:[6.31,0,0],buildings:[{center:[0,0,0],size:[10,10,8]}],stores:[],roads:[],trees:[],communityLocations:[]};
for(const phase of [0,3,6,9])for(const latency of [0,200,500])test(`corner poses pass authority at 200ms cadence, phase ${phase}, latency ${latency}`,()=>{
  let now=0;const world=createSharedWorld(data,{now:()=>now}),environment=createWalkingEnvironment(data);
  world.join({userId:owner,name:'Jevica'});
  for(let altitude=1;altitude<=4;altitude++) {
    now+=400;assert.equal(world.command(owner,{type:'pose',position:[6.31,0,0],altitude,yaw:0}).ok,true);
  }
  const state={position:[6.31,5.68,0],velocity:[0,0],yaw:0,speed:0,distance:0};
  const flight={...createFlightState(),active:true,altitude:4,target:4};
  acknowledgeFlightPose(flight,world.snapshot().players.find(p=>p.id===owner));
  let pending=null,accepted=0;
  for(let frame=0;frame<180;frame++) {
    now+=1000/60;
    if(pending&&now>=pending.at) {
      const result=world.command(owner,pending.message);
      assert.equal(result.ok,true,`${result.error}: ${JSON.stringify(pending.message)}`);
      acknowledgeFlightPose(flight,result.player,pending.receipt);pending=null;accepted++;
    }
    stepFlight(state,environment,flight,{strafe:-1,forward:1,fast:true},1/60);
    if((frame+phase)%12===0&&!pending) {
      const pose={position:[...state.position],altitude:flight.altitude};
      pending={at:now+latency,receipt:recordFlightPose(flight,pose),message:{type:'pose',position:[state.position[0],-state.position[2],0],altitude:flight.altitude,yaw:state.yaw}};
    }
  }
  assert.ok(accepted>=3,'authoritative updates continue');
  assert.ok(state.position[2]<-7&&state.position[0]<6.3,'makes progress around the corner');
});

test('receipt identity distinguishes returning to an earlier endpoint and ignores late acknowledgments',()=>{
  const flight=createFlightState(),pose=x=>({position:[x,5.68,0],altitude:4}),player=x=>({position:[x,0,0],altitude:4});
  const first=recordFlightPose(flight,pose(0)),middle=recordFlightPose(flight,pose(1)),last=recordFlightPose(flight,pose(0));
  acknowledgeFlightPose(flight,player(0),first);assert.deepEqual(flight.submitted,[middle,last]);
  acknowledgeFlightPose(flight,player(0),last);assert.deepEqual(flight.submitted,[]);
  acknowledgeFlightPose(flight,player(1),middle);assert.equal(flight.acknowledged[0],0);assert.equal(flight.acknowledged[2],4);
});

test('unacknowledged path bound freezes ascent and recovers after acknowledgment',()=>{
  const flight={...createFlightState(),active:true,altitude:4,target:4};
  for(let i=0;i<8;i++)recordFlightPose(flight,{position:[i*.01,5.68,0],altitude:4});
  const state={position:[.07,5.68,0],velocity:[0,0],yaw:0,speed:0,distance:0},environment={groundAt:()=>0,isFree:()=>true,canFly:()=>true};
  stepFlight(state,environment,flight,{lift:1,forward:1},.08);assert.equal(flight.altitude,4);assert.equal(state.position[2],0);
  acknowledgeFlightPose(flight,{position:[.07,0,0],altitude:4},flight.submitted.at(-1));
  stepFlight(state,environment,flight,{lift:1,forward:1},.08);assert.ok(flight.altitude>4);assert.ok(state.position[2]<0);
});

test('sustained steep-terrain roof escape remains inside authoritative lift budget',()=>{
  const slope={...data,bounds_m:[-100,-100,100,100],walkSpawn:[0,12,10],buildings:[{center:[0,0,0],size:[100,20,8]}],terrain:{width:2,height:2,grid_origin_m:[-100,-100],spacing_m:[200,200],heights_m:[60,-40,60,-40]}};
  let now=0;const world=createSharedWorld(slope,{now:()=>now}),environment=createWalkingEnvironment(slope);
  world.join({userId:owner,name:'Jevica'});now+=500;
  assert.equal(world.command(owner,{type:'pose',position:[0,12,10],altitude:1.101,yaw:0}).ok,true);
  now+=1000;assert.equal(world.command(owner,{type:'pose',position:[0,0,10],altitude:1.101,yaw:0}).ok,true);
  const state={position:[0,12.781,0],velocity:[14,0],yaw:0,speed:0,distance:0},flight={...createFlightState(),active:true,altitude:1.101,target:0,landing:true};
  acknowledgeFlightPose(flight,world.snapshot().players.find(p=>p.id===owner));
  for(let frame=0;frame<75;frame++) {
    now+=80;stepFlight(state,environment,flight,{strafe:1,fast:true},.08);
    if(frame%3===0){
      const receipt=recordFlightPose(flight,{position:state.position,altitude:flight.altitude});
      const result=world.command(owner,{type:'pose',position:[state.position[0],-state.position[2],environment.groundAt(state.position[0],state.position[2])],altitude:flight.altitude,yaw:state.yaw});
      assert.equal(result.ok,true,result.error);acknowledgeFlightPose(flight,result.player,receipt);
    }
  }
  assert.ok(state.position[0]>10,'continues across sloping ground under the roof');
});
