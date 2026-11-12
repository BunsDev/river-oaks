import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCameraBoom, thirdPersonPose, pitchAfterSeatChange, seatedEyeView } from '../src/third-person.js';
import { createWalkingEnvironment } from '../src/walking.js';

test('Ribbonwing overflight keeps the chase camera outside the hull above real boutique footprints',()=>{
  const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
  const environment=createWalkingEnvironment(world),position=[-2831.9384618692047,80,1358.439548752362];
  assert.ok(environment.roomAt(position[0],position[2]),'a real boutique is below the flight');
  assert.ok(environment.canFly(...position),'the aircraft clears the roof');
  for(let heading=0;heading<8;heading++)for(const pitch of [-.6,0,.5]){
    const pose=thirdPersonPose({position,yaw:heading*Math.PI/4,pitch,cameraDistance:10.4},environment);
    const gap=Math.hypot(...pose.position.map((value,i)=>value-pose.target[i]));
    assert.ok(gap>9.9,`heading ${heading}, pitch ${pitch}: camera collapsed to ${gap} m`);
    assert.equal(pose.showBody,true);
  }
});

test('crossing a room footprint in clear sky does not snap or hide the chase view',()=>{
  const room={storeId:'shop',floor:2,height:4};
  const environment={roomAt:(x,z)=>Math.abs(x)<2&&Math.abs(z)<2?room:null,groundAt:()=>2,isFree:()=>false,canPlaceCamera:()=>true};
  const boom=createCameraBoom();let previous=null;
  for(let frame=0;frame<=120;frame++){
    const state={position:[-3+frame*.05,20,0],yaw:0,pitch:0,cameraDistance:10.4};
    const pose=thirdPersonPose(state,environment),gap=Math.hypot(...pose.position.map((value,i)=>value-pose.target[i]));
    const distance=boom.update(gap,1/60);
    assert.ok(distance>10.4,`frame ${frame}: boom collapsed to ${distance} m`);
    assert.equal(pose.showBody,true);
    if(previous!==null)assert.ok(Math.abs(distance-previous)<1e-10);
    previous=distance;
  }
});

test('above-room cameras use outdoor obstacles and the continuous canopy segment guard',()=>{
  const room={storeId:'shop',floor:0,height:4};
  const environment={roomAt:()=>room,groundAt:()=>0,isFree:()=>true,canPlaceCamera:(_x,_y,z)=>z<2};
  const state={position:[0,12,0],yaw:0,pitch:0,cameraDistance:10.4};
  const blocked=thirdPersonPose(state,environment);
  assert.ok(blocked.position[2]>1&&blocked.position[2]<2,'the outdoor obstacle still clips the boom');
  environment.canPlaceCamera=()=>true;
  let segment=null;
  environment.cameraSegmentHit=(from,to)=>{segment={from,to};return {fraction:.5};};
  const clipped=thirdPersonPose(state,environment);
  assert.deepEqual(segment.from,clipped.target);
  assert.ok(clipped.position[2]<5.2&&clipped.position[2]>5,'the finite canopy still clips between samples');
});

test('room elevation uses a varying ceiling or elevated floor and preserves indoor clearance',()=>{
  for(const room of [
    {storeId:'shop',floor:0,height:4,floorAt:()=>8},
    {storeId:'shop',floor:0,height:4,ceilingAt:(_x,north)=>north<0?12:15},
  ]){
    const environment={roomAt:()=>room,groundAt:()=>8,isFree:()=>true,canPlaceCamera:()=>false};
    const state={position:[0,10,0],yaw:0,pitch:0};
    assert.ok(thirdPersonPose(state,environment).position[2]>4,'an indoor view keeps walking clearance');
    assert.equal(thirdPersonPose({...state,position:[0,20,0]},environment).position[2],0,'above the ceiling, outdoor collision wins');
  }
});

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
