import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunity,stepCommunity,interactWithLocal,chooseCommunityScenario} from '../src/community.js';
import {createResidentLife,stepResidentLife,residentPacket,applyResidentDecisions} from '../src/resident-life.js';
import {conversationLine} from '../src/personas.js';

const positions=[[-10,0],[-22,-20],[-22,20],[-30,0],[-10,-25],[10,-25],[25,-15],[25,25],[10,0]];
const world={scene:'district',bounds_m:[-35,-35,35,35],collisionPolygons:[[[-2,-8],[2,-8],[2,8],[-2,8]]],communityLocations:positions.map((p,i)=>({id:`stop-${i}`,name:`Public stop ${i}`,position:[...p,0]}))};
const create=(provider)=>{const state=createCommunity(world),life=createResidentLife(world,state,provider);state.running=true;const local=state.locals[0];interactWithLocal(state,local.id,'ask');interactWithLocal(state,local.id,'dispatch');state.selectedId=null;return {state,life,local,helper:state.locals[8]};};
const advance=(life,seconds,{storm=false}={})=>{for(let i=0;i<seconds*60;i++){stepCommunity(life.state,1/60,{config:{storm,staff:80}});stepResidentLife(life,1/60,{paused:true,storm});}};

test('an existing resident walks around a building and resolves a visit only after arrival and work',()=>{
  const {state,life,local,helper}=create(),start=[...helper.position];
  advance(life,1);
  assert.equal(state.jobs[0].helperId,helper.id,'An available resident must be assigned');
  assert.ok(helper.life.distance>0 && helper.life.distance<=1.4,'Volunteer moves at walking speed even with ambient strolls paused');
  assert.ok(Math.hypot(helper.position[0]-start[0],helper.position[1]-start[1])<=1.4);
  advance(life,10);assert.equal(local.status,'aid_en_route');assert.equal(state.jobs[0].progress,0);
  for(let i=0;i<2400 && local.status!=='supported';i++) {
    advance(life,1/60);assert.ok(life.navigation.free(helper.position));
  }
  assert.equal(local.status,'supported');
  assert.ok(helper.life.distance>20,'The wall requires actual route travel');
  assert.ok(Math.hypot(helper.position[0]-local.position[0],helper.position[1]-local.position[1])<=1.5);
  assert.equal(state.jobs.length,0);assert.equal(state.helpBudget,3);assert.equal(state.locals.length,9,'No extra crowd is created');
});

test('pausing the scenario and a storm hold physical visits; clearing the storm resumes the route',()=>{
  const {state,life,helper,local}=create();advance(life,3);state.running=false;
  const position=[...helper.position],elapsed=state.elapsed;advance(life,5);
  assert.deepEqual(helper.position,position);assert.equal(state.elapsed,elapsed);
  state.running=true;advance(life,3,{storm:true});assert.equal(state.jobs[0].progress,0);assert.equal(state.jobs[0].phase,'storm_hold');
  advance(life,45);assert.equal(local.status,'supported');
});

test('unreachable visits return unused capacity once and leave the need unresolved',()=>{
  const {state,life,local}=create(()=>null);advance(life,3);
  assert.equal(state.jobs.length,0);assert.equal(state.helpBudget,4);assert.equal(local.status,'needs_help');
  advance(life,3);assert.equal(state.helpBudget,4);assert.equal(state.supported,0);
  assert.match(state.events.at(-1).message,/No walkable volunteer route/);
});

test('a late route cannot revive a visit after a scenario reset',async()=>{
  const pending=[];const {state,life,helper}=create((start,end)=>new Promise(resolve=>pending.push({resolve,end})));
  advance(life,1);assert.equal(pending.length,1);
  chooseCommunityScenario(state,'delivery');stepResidentLife(life,1/60,{paused:true});
  pending[0].resolve([pending[0].end]);await Promise.resolve();
  assert.equal(state.jobs.length,0);assert.equal(state.helpBudget,3);
  assert.ok(!helper.life.visitId);assert.equal(helper.life.route.length,0);
});

test('volunteers describe their actual task and include it in local reaction context',()=>{
  const {state,life,helper,local}=create();advance(life,1);
  const greeting=conversationLine(helper,'greeting');
  assert.match(greeting,new RegExp(local.name));assert.match(greeting,/cooling supplies/);
  const packet=residentPacket(life,1);
  assert.equal(packet.agents.length,1,'Only the active helper reacts while ambient strolls are paused');
  assert.match(packet.agents[0].role_context,new RegExp(local.name));
  const position=[...helper.position];
  applyResidentDecisions(life,{schema_version:1,tick:1,latency_ms:10,decisions:[{id:helper.id,action:'stop',source:'jev'}]});
  advance(life,1);assert.deepEqual(helper.position,position,'A reactive stop must stop the physical visit');
  assert.equal(state.supported,0);
  chooseCommunityScenario(state,'storm');stepResidentLife(life,1/60,{paused:true});
  assert.doesNotMatch(conversationLine(helper,'greeting'),/cooling supplies/,'Canceled work must leave the conversation context');
});
