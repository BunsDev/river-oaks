import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity, interactWithLocal, stepCommunity, snapshotForLocal, applyLocalReaction } from '../src/community.js';
import { createResidentLife, stepResidentLife, residentPacket } from '../src/resident-life.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { encounterPosition, indoorEncounterPosition } from '../src/encounter.js';
import { withinTalkingReach } from '../src/people-picking.js';
import { releaseResidents } from '../src/invasion.js';

const world={scene:'district',bounds_m:[-40,-40,40,40],walkSpawn:[0,0,0],collisionPolygons:[],communityLocations:Array.from({length:9},(_,i)=>({id:`p${i}`,name:`Place ${i}`,position:[i*3,0,0]}))};
function visit() {
  const state=createCommunity(world),life=createResidentLife(world,state),recipient=state.locals[0],helper=state.locals[8];
  state.running=true;
  interactWithLocal(state,recipient.id,'ask');interactWithLocal(state,recipient.id,'dispatch');state.selectedId=null;
  return {state,life,recipient,helper,job:state.jobs[0]};
}
const step=(life,frames)=>{for(let i=0;i<frames;i++){stepCommunity(life.state,1/60,{config:{staff:80}});stepResidentLife(life,1/60,{paused:true});}};
const release=state=>releaseResidents({abducted:state.locals.filter(local=>local.abducted).map(local=>local.id)},state.locals);

test('abducted residents reject encounters, support and new or outstanding conversation reactions',()=>{
  const state=createCommunity(world),local=state.locals[0],environment=createWalkingEnvironment(world);
  state.running=true;
  const packet=snapshotForLocal(state,local.id,'ask',1),context={generation:state.generation,tick:packet.tick};
  local.abducted=true;
  const before=JSON.stringify(state);
  assert.equal(encounterPosition(environment,local,[0,-2.5,1.68]),null);
  assert.equal(indoorEncounterPosition(environment,{...local,indoor:true},[0,-2.5,1.68]),null);
  assert.equal(withinTalkingReach(local,{position:[0,1.68,2.5],ground:0,altitude:0,roomId:null},()=>true),false);
  for(const action of ['ask','supply','dispatch'])assert.equal(interactWithLocal(state,local.id,action).ok,false,action);
  assert.equal(snapshotForLocal(state,local.id),null);
  assert.equal(applyLocalReaction(state,local.id,{schema_version:1,tick:1,latency_ms:1,decisions:[{id:local.id,action:'greet',source:'jev'}]},context),false);
  assert.equal(JSON.stringify(state),before,'Unavailable interactions must not mutate selection or spend resources');
  release(state);
  assert.equal(interactWithLocal(state,local.id,'ask').ok,true);
});

test('abducted neighbors do not block a visible resident conversation approach',()=>{
  const environment=createWalkingEnvironment(world),local={id:'visible',position:[0,0,0]},visitor=[0,-2.5,1.68];
  const hidden={id:'hidden',position:[0,-1.2,0],abducted:true};
  assert.equal(encounterPosition(environment,local,visitor,[local,hidden]),visitor);
});

test('queued visits wait for abducted participants without recruiting them or refunding capacity',()=>{
  for(const who of ['recipient','helper']) {
    const context=visit(),{state,life,job,recipient}=context;context[who].abducted=true;
    step(life,120);
    assert.equal(job.helperId,null,who);
    assert.equal(state.jobs.length,1);assert.equal(state.helpBudget,3);
    release(state);step(life,2400);
    assert.equal(recipient.status,'supported');assert.equal(state.helpBudget,3);
  }
});

test('traveling visits stop while either participant is abducted and resume on release',()=>{
  for(const who of ['recipient','helper']) {
    const context=visit(),{state,life,job,helper,recipient}=context;step(life,60);
    assert.equal(job.phase,'traveling');context[who].abducted=true;
    const position=[...helper.position];step(life,120);
    assert.deepEqual(helper.position,position,who);assert.equal(job.progress,0);
    release(state);step(life,2400);
    assert.equal(recipient.status,'supported');assert.equal(state.helpBudget,3);
  }
});

test('assisting visits hold both progress and on-site work while a participant is abducted',()=>{
  for(const who of ['recipient','helper']) {
    const context=visit(),{state,life,helper,recipient,job}=context;
    for(let i=0;i<2400 && job.phase!=='assisting';i++)step(life,1);
    assert.equal(job.phase,'assisting');context[who].abducted=true;
    const progress=job.progress;step(life,120);
    assert.equal(job.progress,progress,who);assert.equal(helper.life.helping.onSite,false);
    release(state);step(life,600);
    assert.equal(recipient.status,'supported');assert.equal(state.helpBudget,3);
  }
});

test('resident inference omits people who are aboard a saucer',()=>{
  const {state,life,helper}=visit();helper.abducted=true;
  const packet=residentPacket(life,1);
  assert.ok(packet.agents.every(agent=>agent.id!==helper.id));
  assert.ok(packet.agents.every(agent=>agent.nearby.every(person=>person.id!==helper.id)));
  release(state);assert.ok(residentPacket(life,2).agents.some(agent=>agent.id===helper.id));
});
