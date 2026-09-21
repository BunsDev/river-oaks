import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity,chooseCommunityScenario } from '../src/community.js';
import { createResidentLife,stepResidentLife,residentPacket,applyResidentDecisions } from '../src/resident-life.js';

const world={scene:'district',bounds_m:[-30,-30,30,30],collisionPolygons:[[[-3,-8],[3,-8],[3,8],[-3,8]]],communityLocations:[
  {id:'a',name:'Garden café',position:[-12,0,0]}, {id:'b',name:'Gallery',position:[12,0,0]}, {id:'c',name:'Public plaza',position:[0,15,0]},
],stores:[{id:'awning',name:'Garden café',facade:[-3,0,0],outward:[-1,0]}]};
const create=()=>{const state=createCommunity(world);const life=createResidentLife(world,state);assert.ok(life,'Residents need a life simulation');return {state,life};};
const step=(life,count,options={})=>{for(let i=0;i<count;i++) stepResidentLife(life,1/60,options);};
const reply=(packet,action='continue')=>({schema_version:1,tick:packet.tick,latency_ms:12,decisions:packet.agents.map(a=>({id:a.id,action,source:'jev'}))});

test('residents walk between public stops without entering buildings or teleporting',()=>{
  const {state,life}=create();
  for(let i=0;i<1800;i++) {
    const positions=state.locals.map(l=>l.position.slice(0,2));step(life,1);
    state.locals.forEach((local,index)=>{
      assert.ok(life.navigation.free(local.position));
      assert.ok(Math.hypot(local.position[0]-positions[index][0],local.position[1]-positions[index][1])<=1.4/60+1e-6);
      assert.ok(local.life.speed<=1.4);
    });
  }
  assert.ok(state.locals.every(local=>local.life.distance>5));
  assert.equal(state.elapsed,0,'Strolling must not advance or spend the community scenario');
  assert.equal(state.supplies,12);
});

test('selection, nearby visitors and motion pause freeze movement with no catch-up',()=>{
  const {state,life}=create();step(life,180);
  const local=state.locals[0],position=[...local.position];state.selectedId=local.id;
  step(life,180);assert.deepEqual(local.position,position);
  state.selectedId=null;step(life,180,{visitor:position});assert.deepEqual(local.position,position);
  const all=state.locals.map(l=>[...l.position]);step(life,180,{paused:true});
  assert.deepEqual(state.locals.map(l=>l.position),all);
  stepResidentLife(life,Infinity);assert.deepEqual(state.locals.map(l=>l.position),all);
  stepResidentLife(life,15);
  assert.ok(Math.hypot(local.position[0]-position[0],local.position[1]-position[1])<=0.12);
});

test('storm reactions seek an interpreted awning and resume a stroll after clearing',()=>{
  const {state,life}=create();step(life,1200,{storm:true});
  assert.ok(state.locals.some(l=>l.life.status==='sheltered'));
  assert.ok(state.locals.every(l=>l.life.action==='seek_shelter'));
  assert.ok(state.locals.every(l=>l.life.source==='safety_override'));
  const before=state.locals.reduce((sum,l)=>sum+l.life.distance,0);
  step(life,600,{storm:false});
  assert.ok(state.locals.reduce((sum,l)=>sum+l.life.distance,0)>before+2);
});

test('batched context is local and bounded; late, duplicate and malformed decisions are atomic no-ops',()=>{
  const {state,life}=create();step(life,120);
  const packet=residentPacket(life,4,{visitor:[-12,1,0],hour:15,humidity:0.9});
  assert.equal(packet.agents.length,3);
  assert.equal(packet.agents[0].nearby[0].id,'visitor');
  assert.ok(packet.agents.every(a=>a.activity.length<=64 && a.role_context.length<=512 && a.nearby.length<=16));
  const invalid=reply(packet);invalid.decisions[1].id=invalid.decisions[0].id;
  assert.equal(applyResidentDecisions(life,invalid),false);
  assert.equal(applyResidentDecisions(life,reply(packet,'slow')),true);
  assert.equal(applyResidentDecisions(life,reply(packet)),false);
  const old=residentPacket(life,5);step(life,181);
  assert.equal(applyResidentDecisions(life,reply(old)),false);
  const reset=residentPacket(life,6);chooseCommunityScenario(state,'storm');
  assert.equal(applyResidentDecisions(life,reply(reset)),false);
  const weather=residentPacket(life,7);step(life,1,{storm:true});
  assert.equal(applyResidentDecisions(life,reply(weather)),false);
});

test('micro-actions change movement without overruling a conversation or spending resources',()=>{
  const {state,life}=create();step(life,180);
  const packet=residentPacket(life,1);assert.equal(applyResidentDecisions(life,reply(packet,'stop')),true);
  const positions=state.locals.map(l=>[...l.position]);step(life,60);
  assert.deepEqual(state.locals.map(l=>l.position),positions);
  step(life,180);assert.ok(state.locals.some((l,i)=>l.position[0]!==positions[i][0] || l.position[1]!==positions[i][1]));
  state.selectedId=state.locals[0].id;
  const next=residentPacket(life,2);assert.ok(next.agents.every(a=>a.id!==state.selectedId));
  assert.equal(state.helpBudget,4);
});

test('opposing pedestrians pass each other without permanent deadlock or overlap',()=>{
  const street={...world,collisionPolygons:[],communityLocations:[{id:'left',name:'West',position:[-5,0,0]},{id:'right',name:'East',position:[5,0,0]}]};
  const state=createCommunity(street),life=createResidentLife(street,state);
  for(let i=0;i<900;i++) {
    step(life,1);
    assert.ok(Math.hypot(state.locals[0].position[0]-state.locals[1].position[0],state.locals[0].position[1]-state.locals[1].position[1])>=0.69);
  }
  assert.ok(state.locals[0].position[0]>3 && state.locals[1].position[0]<-3,'Both residents must pass and reach the opposite stop');
});

test('asynchronous route results cannot move a resident after weather or scene-generation changes',async()=>{
  for(const change of ['weather','generation','reaction']) {
    const state=createCommunity(world),pending=[];
    const life=createResidentLife(world,state,(start,end)=>new Promise(resolve=>pending.push({resolve,start,end})));
    step(life,60);assert.equal(pending.length,1,'Only one bounded route request may be in flight');
    const positions=state.locals.map(l=>[...l.position]);
    if(change==='weather') step(life,1,{storm:true});
    if(change==='generation') chooseCommunityScenario(state,'storm');
    if(change==='reaction') {const packet=residentPacket(life,1);applyResidentDecisions(life,reply(packet,'seek_shelter'));}
    pending[0].resolve([pending[0].end]);await Promise.resolve();
    assert.ok(state.locals.every(l=>!l.life.route.length),`An obsolete route cannot survive ${change}`);
    assert.deepEqual(state.locals.map(l=>l.position),positions);
  }
});

test('a temporary shelter decision expires when there is no active storm',()=>{
  const {state,life}=create();step(life,60);
  const packet=residentPacket(life,1);applyResidentDecisions(life,reply(packet,'seek_shelter'));
  step(life,600);
  assert.ok(state.locals.every(l=>!l.life.destination?.shelter),'An expired reaction cannot leave permanent shelter navigation');
});

test('redirect reverses the current walking direction within local clearance',()=>{
  const {state,life}=create();step(life,180);
  const local=state.locals[0],position=[...local.position],heading=local.life.heading;
  const packet=residentPacket(life,1);applyResidentDecisions(life,reply(packet,'redirect'));
  step(life,15);
  const forward=(local.position[0]-position[0])*Math.sin(heading)-(local.position[1]-position[1])*Math.cos(heading);
  assert.ok(forward<0,'Redirect must reverse, not choose another arbitrary forward destination');
});


test('ordinary walking accelerates gradually and slows before reaching a destination',()=>{
  const street={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],communityLocations:[{id:'a',name:'West',position:[-5,0,0]}]};
  const state=createCommunity(street),life=createResidentLife(street,state),local=state.locals[0];
  local.life.route=[[5,0]];local.life.destination={id:'b',name:'East'};
  const speeds=[];
  for(let i=0;i<660;i++) {stepResidentLife(life,1/60);speeds.push(local.life.speed);}
  assert.ok(speeds[0]>0 && speeds[0]<0.03, 'First frame cannot jump to cruising speed');
  assert.ok(speeds[30]>0.6 && speeds[30]<0.8);
  assert.ok(speeds[90]>1);
  const approaching=speeds.slice(400).filter(speed=>speed>0 && speed<0.5);
  assert.ok(approaching.length>5,'Arrival must brake over multiple frames');
  assert.equal(local.life.speed,0);
  assert.ok(Math.abs(local.position[0]-5)<0.025);
});
