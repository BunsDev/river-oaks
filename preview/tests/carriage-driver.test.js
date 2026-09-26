import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCommunity} from '../src/community.js';
import {createResidentLife,stepResidentLife} from '../src/resident-life.js';
import {carriageContains} from '../src/carriage-parking.js';

test('the coachman is a stable encounter with a stationary job, outside support targets',()=>{
  const world=JSON.parse(fs.readFileSync('preview/public/data/district.json'));
  const state=createCommunity(world),driver=state.locals.find(p=>p.id==='carriage-driver');
  assert.ok(driver);assert.equal(driver.role,'Unicorn coachman');assert.equal(driver.stationary,true);
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
