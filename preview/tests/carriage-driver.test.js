import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCommunity} from '../src/community.js';
import {createResidentLife,stepResidentLife} from '../src/resident-life.js';
import {carriageContains} from '../src/carriage-parking.js';
import * as THREE from 'three';
import {createCarriageDriver} from '../src/carriage-driver.js';
import {createCompanionNavigation} from '../src/companion-navigation.js';
import {createWalkingEnvironment} from '../src/walking.js';
import {withinTalkingReach} from '../src/people-picking.js';

async function renderedDriver(world={scene:'district',bounds_m:[-40,-40,40,40],collisionPolygons:[]},position=[0,0,0]) {
  const old=documentSafe();
  const scene=new THREE.Scene(),coach=new THREE.Group();scene.add(coach);coach.scale.setScalar(.78);coach.position.fromArray(position);
  let local={id:'carriage-driver',position:[0,0,0],life:{}},resets=0,carrying=false,loadedProfile;
  const avatar={object:new THREE.Group(),rig:{hipHeight:.95},update(){},suspend(){},dispose(){}};
  const brain={reset(){resets++;},dispose(){resets++;},update:()=>({stance:'beside',source:'local',label:'Local follow',decisions:0})};
  const placement={position,yaw:0,scale:.78,team:true};
  const env=createWalkingEnvironment(world,[{contains:(...p)=>carriageContains(placement,...p)}]);
  const driver=createCarriageDriver({scene,getLocals:()=>[local],brain,
    loadSkinTexture:async()=>null,
    loadAvatar:async(index,id,profile)=>{loadedProfile=profile;return avatar;},
    createCostume:()=>({update(value){carrying=Boolean(value?.carrying);},dispose(){}}),
    createRouteService:(w,p)=>({route:async(a,b)=>createCompanionNavigation(w,{placement:p}).route(a,b),dispose(){}})});
  await driver.ready;assert.equal(typeof driver.configure,'function','The hero needs a world/reset lifecycle');
  driver.configure(world,placement);
  let time=0;const step=async(pose,seconds)=>{for(let i=0;i<seconds*60;i++){time+=1000/60;driver.update(coach,time,[pose.position[0],-pose.position[2],pose.position[1]],{pose,environment:env});await Promise.resolve();}};
  return {driver,coach,env,step,get local(){return local;},get resets(){return resets;},get carrying(){return carrying;},get loadedProfile(){return loadedProfile;},replace(){local={...local,life:{}};},dispose(){driver.dispose();globalThis.document=old;}};
}
function documentSafe(){const previous=globalThis.document;globalThis.document={querySelector:()=>({dataset:{}}),dispatchEvent(){}};return previous;}
const pose=(x,z,more={})=>({position:[x,1.68,z],ground:0,yaw:0,speed:0,velocity:[0,0],roomId:null,...more});

test('the dedicated hero dismounts continuously, carries the bag, and returns before driving',async()=>{
  const f=await renderedDriver();try {
    await f.step(pose(2,3),.1);assert.equal(f.loadedProfile,'prince-jev');const seated=f.driver.object.position.clone();
    assert.equal(f.driver.setCompanion(true),true);await f.step(pose(2,3),1/60);
    assert.ok(f.driver.object.position.distanceTo(seated)<.1,'No instantaneous bench-to-street jump');
    assert.equal(f.driver.canDrive,false);await f.step(pose(2,3),7);assert.equal(f.driver.companion.mode,'walking');assert.equal(f.carrying,true);
    assert.deepEqual(f.local.position,[f.driver.object.position.x,-f.driver.object.position.z,f.driver.object.position.y]);
    const resets=f.resets;f.driver.setCompanion(false);assert.ok(f.resets>resets,'Manual return cancels the brain');assert.equal(f.driver.canDrive,false);
    await f.step(pose(2,3),12);assert.equal(f.driver.companion.mode,'seat');assert.equal(f.driver.canDrive,true);assert.equal(f.carrying,false);
  }finally{f.dispose();}
});

test('far travel and flight never teleport the hero; world replacement clears companionship',async()=>{
  const f=await renderedDriver();try {
    await f.step(pose(2,3),.1);f.driver.setCompanion(true);await f.step(pose(2,3),3);
    const before=f.driver.object.position.clone();await f.step(pose(30,30),.1);
    assert.ok(f.driver.object.position.distanceTo(before)<.5,'Large gaps must be routed, never rejoined by relocation');
    const landed=f.driver.object.position.clone();await f.step(pose(30,30,{flying:true}),3);
    assert.ok(f.driver.object.position.distanceTo(landed)<1e-8,'He waits on the ground during flight');
    f.replace();await f.step(pose(2,3),.1);assert.equal(f.driver.companion.mode,'seat');assert.equal(f.driver.companion.enabled,false);
  }finally{f.dispose();}
});

test('the companion walks through a shop door and updates the same encounter for indoor conversation',async()=>{
  const ring=[[-6,4],[6,4],[6,16],[-6,16],[-6,4]];
  const world={scene:'district',bounds_m:[-40,-40,40,40],collisionPolygons:[ring],buildings:[{id:'b',center:[0,10],size:[12,12,4],ring}],stores:[{id:'boutique',name:'Boutique',building_id:'b',facade:[0,4,0],outward:[0,-1],category:'clothes'}]};
  const f=await renderedDriver(world,[-12,0,0]);try {
    await f.step(pose(-10,3),.1);f.driver.setCompanion(true);await f.step(pose(-10,3),3);
    const inside=pose(0,-6.4,{position:[0,1.88,-6.4],roomId:'boutique'});
    await f.step(inside,25);assert.equal(f.local.storeId,'boutique');assert.equal(f.local.indoor,true);
    assert.equal(withinTalkingReach(f.local,inside,(point,height)=>f.env.hasSightLine([inside.position[0],-inside.position[2],inside.position[1]],[point[0],point[1],point[2]+height])),true);
    f.driver.setCompanion(false);await f.step(inside,25);assert.equal(f.driver.companion.mode,'seat');assert.equal(f.local.storeId,undefined);
  }finally{f.dispose();}
});

test('Prince Jev is a stable encounter with a stationary job, outside support targets',()=>{
  const world=JSON.parse(fs.readFileSync('preview/public/data/district.json'));
  const state=createCommunity(world),driver=state.locals.find(p=>p.id==='carriage-driver');
  assert.ok(driver);assert.equal(driver.name,'Prince Jev');assert.equal(driver.role,'Prince and companion');assert.equal(driver.stationary,true);
  assert.equal(driver.priority,false);assert.equal(driver.persona.portrayal,false);
  const life=createResidentLife(world,state),start=[...driver.position];
  for(let i=0;i<60;i++)stepResidentLife(life,1/60,{position:[0,0,0]});
  assert.deepEqual(driver.position,start);assert.equal(driver.life.route.length,0);
});

test('the front bench stays solid but sightlines can reach the seated driver above it',()=>{
  const placement={position:[0,0,0],yaw:0,scale:.9};
  assert.equal(carriageContains(placement,-2.1*.9,.9,0),true);
  assert.equal(carriageContains(placement,-2.1*.9,2.2,0),false);
  assert.equal(carriageContains(placement,0,2.2,0),true);
});

test('outdoor conversation rays use eye height above the bench while bodies cannot walk through it',async()=>{
  const {createWalkingEnvironment}=await import('../src/walking.js');
  const placement={position:[0,0,0],yaw:0,scale:.9};
  const env=createWalkingEnvironment({bounds_m:[-20,-20,20,20],buildings:[]},[{contains:(...point)=>carriageContains(placement,...point)}]);
  assert.equal(env.isFree(-1.89,0),false);
  assert.equal(env.hasSightLine([-1.89,-3,1.68],[-1.89,0,2.2]),true);
  assert.equal(env.hasSightLine([-1.89,-3,1.3],[-1.89,0,1.4]),false);
});
