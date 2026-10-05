import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity,chooseCommunityScenario,interactWithLocal } from '../src/community.js';
import { createResidentLife,stepResidentLife,residentPacket,applyResidentDecisions } from '../src/resident-life.js';

const world={scene:'district',bounds_m:[-30,-30,30,30],collisionPolygons:[[[-3,-8],[3,-8],[3,8],[-3,8]]],communityLocations:[
  {id:'a',name:'Garden café',position:[-12,0,0]}, {id:'b',name:'Gallery',position:[12,0,0]}, {id:'c',name:'Public plaza',position:[0,15,0]},
],stores:[{id:'awning',name:'Garden café',facade:[-3,0,0],outward:[-1,0]}]};
const create=()=>{const state=createCommunity(world);const life=createResidentLife(world,state);assert.ok(life,'Residents need a life simulation');return {state,life};};
const step=(life,count,options={})=>{for(let i=0;i<count;i++) stepResidentLife(life,1/60,options);};
const reply=(packet,action='continue')=>({schema_version:1,tick:packet.tick,latency_ms:12,decisions:packet.agents.map(a=>({id:a.id,action,source:'jev'}))});

test('pedestrians pass a moved street object without walking through it',()=>{
  const {state,life}=create(),local=state.locals[0];
  state.locals.slice(1).forEach(person=>{person.abducted=true;});
  local.position=[-12,0,0];Object.assign(local.life,{heading:Math.PI,route:[[-12,12,0]],destination:{name:'Test walk'},waitUntil:Infinity});
  const obstacle=[-12,3,0];let closest=Infinity,lateral=0;
  for(let i=0;i<600;i++) {
    stepResidentLife(life,1/60,{obstacles:[obstacle]});
    closest=Math.min(closest,Math.hypot(local.position[0]-obstacle[0],local.position[1]-obstacle[1]));
    lateral=Math.max(lateral,Math.abs(local.position[0]+12));
  }
  assert.ok(closest>=.69,`Object clearance: ${closest}`);
  assert.ok(lateral>.4&&local.life.distance>4,'Finds a way around the bin');
});

test('Force holds pause a walking route and release resumes without teleporting',()=>{
  const {state,life}=create();step(life,180);
  const local=state.locals.find(local=>local.life.speed>.1);assert.ok(local);
  const before=[...local.position];local.force={height:1.2,mode:'lift'};
  step(life,120);assert.deepEqual(local.position,before);assert.equal(local.life.speed,0);
  assert.equal(local.life.status,'held by the Force');
  delete local.force;let travel=0;
  for(let i=0;i<240;i++) {
    const p=[...local.position];step(life,1);
    const distance=Math.hypot(local.position[0]-p[0],local.position[1]-p[1]);
    assert.ok(distance<.025);travel+=distance;
  }
  assert.ok(travel>.2,'The route resumes after the hold');
});

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

test('selection and motion pause freeze movement with no catch-up',()=>{
  const {state,life}=create();step(life,180);
  const local=state.locals[0],position=[...local.position];state.selectedId=local.id;
  step(life,180);assert.deepEqual(local.position,position);
  state.selectedId=null;
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
  assert.deepEqual(local.position,position,'A reversal starts with a planted turn, not a backward slide');
  step(life,75);
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

function passingVisitor() {
  const street={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],communityLocations:[{id:'a',name:'West',position:[-5,0,0]}]};
  const state=createCommunity(street),life=createResidentLife(street,state),local=state.locals[0];
  local.life.route=[[5,0]];local.life.destination={id:'b',name:'East'};local.life.heading=Math.PI/2;
  return {state,life,local};
}

test('a passing nod keeps the route moving beside Jevica without owning body heading',()=>{
  const {life,local}=passingVisitor();step(life,120);
  const before=local.life.distance,heading=local.life.heading;
  local.visitorReaction={action:'acknowledge',passive:true};
  for(let i=0;i<60;i++)step(life,1,{visitor:[local.position[0],local.position[1]+2,0]});
  assert.ok(local.life.distance>before+.9,'A visitor two metres alongside cannot freeze a walking route');
  assert.ok(Math.abs(local.life.heading-heading)<.01,'A head-only greeting cannot steer the body');
  assert.equal(local.life.status,'walking');
});

test('a stationary visitor is passed with clearance instead of freezing the sidewalk',()=>{
  const {life,local}=passingVisitor(),visitor=[0,0,0];let nearest=Infinity;
  for(let i=0;i<900;i++) {
    step(life,1,{visitor});
    nearest=Math.min(nearest,Math.hypot(local.position[0]-visitor[0],local.position[1]-visitor[1]));
  }
  assert.ok(nearest>=.69,`Personal space remains clear: ${nearest}`);
  assert.ok(local.position[0]>4.9,'The pedestrian passes Jevica and finishes the route');
});

test('Jevica overhead or indoors does not deflect a street route, while low hovering keeps clearance',()=>{
  for(const context of [{roomId:null,altitude:3.5},{roomId:'shop',altitude:0},{roomId:null,altitude:1}]) {
    const {life,local}=passingVisitor();let lateral=0,nearest=Infinity;
    const visitor=[0,0,1.68+context.altitude],visitorPose={...context,ground:0,position:[0,visitor[2],0]};
    for(let i=0;i<900;i++) {
      step(life,1,{visitor,visitorPose});
      lateral=Math.max(lateral,Math.abs(local.position[1]));
      nearest=Math.min(nearest,Math.hypot(local.position[0],local.position[1]));
    }
    assert.ok(local.position[0]>4.9);
    if(context.altitude===1)assert.ok(nearest>=.69,'Low hovering still overlaps pedestrian height');
    else assert.ok(lateral<1e-6,`${JSON.stringify(context)} must not create a phantom ground obstacle: ${lateral}`);
  }
});

test('indoor and elevated residents do not block a sidewalk in another physical space',()=>{
  for(const mode of ['indoor','flying']) {
    const {state,life,local}=passingVisitor();
    const other={...local,id:'other',position:[0,0,0],life:{...local.life,route:[]}};
    if(mode==='indoor'){other.indoor=true;other.storeId='shop';}
    else other.wish={kind:'flight',age:4,phase:'gift'};
    state.locals.push(other);let lateral=0;
    for(let i=0;i<900;i++){step(life,1);lateral=Math.max(lateral,Math.abs(local.position[1]));}
    assert.ok(local.position[0]>4.9,`Pass the ${mode} resident's projected location`);
    assert.ok(lateral<1e-6,`${mode} resident cannot steer a ground walker`);
  }
});

test('resident context excludes people in another room or above the walking plane',()=>{
  const {state,life,local}=passingVisitor();
  state.locals.push({...local,id:'shopper',indoor:true,storeId:'shop',position:[0,0,0]});
  state.locals.push({...local,id:'flying',position:[0,0,0],wish:{kind:'flight',age:4,phase:'gift'}});
  const visitor=[0,0,5.18],visitorPose={roomId:null,ground:0,altitude:3.5,position:[0,5.18,0]};
  const packet=residentPacket(life,1,{visitor,visitorPose});
  assert.deepEqual(packet.agents.find(agent=>agent.id===local.id).nearby,[]);
});

test('conversation turns update the walking heading and release with a planted bounded turn',()=>{
  const street={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],communityLocations:[{id:'a',name:'Start',position:[0,0,0]}]};
  for(const fps of [30,60,144]) {
    const state=createCommunity(street),life=createResidentLife(street,state),local=state.locals[0],dt=1/fps;
    Object.assign(local.life,{heading:Math.PI/2,route:[[8,0]],destination:{id:'b',name:'East'}});
    const visitor=[0,2,1.6];state.selectedId=local.id;
    let previous=local.life.heading;
    for(let i=0;i<fps*2;i++) {
      stepResidentLife(life,dt,{visitor});
      assert.ok(Math.abs(local.life.heading-previous)<=3.2*dt+1e-9,'conversation has bounded angular speed');
      previous=local.life.heading;
    }
    assert.ok(Math.abs(Math.atan2(Math.sin(local.life.heading-Math.PI),Math.cos(local.life.heading-Math.PI)))<.01,'route controller retains actual conversation facing');
    assert.deepEqual(local.position,[0,0,0],'turning to talk never translates the resident');
    state.selectedId=null;
    for(let i=0;i<fps*2;i++) {
      stepResidentLife(life,dt,{visitor});
      assert.ok(Math.abs(local.life.heading-previous)<=3.2*dt+1e-9,'release never snaps back to the saved route heading');
      previous=local.life.heading;
    }
    assert.ok(local.position[0]>.5,'resident resumes the original eastbound route');
  }
});

test('pausing routes still allows an explicit conversation to turn without catch-up travel',()=>{
  const {state,life}=create(),local=state.locals[0];state.selectedId=local.id;
  const position=[...local.position],visitor=[position[0]+2,position[1],1.6];
  step(life,120,{paused:true,visitor});
  assert.ok(Math.abs(local.life.heading-Math.PI/2)<.01,'paused conversation faces visitor');
  assert.deepEqual(local.position,position);
  assert.equal(life.elapsed,0);
});

test('wish incidents stop nearby walkers and undo lets them continue',async()=>{
  const {grantWish,undoWish,stepWishes}=await import('../src/wishes.js');
  const street={scene:'district',bounds_m:[-30,-30,30,30],collisionPolygons:[],communityLocations:[
    {id:'a',name:'West',position:[-5,0,0]}, {id:'b',name:'East',position:[-3,0,0]},
  ]};
  const state=createCommunity(street),life=createResidentLife(street,state);
  for(const local of state.locals){local.life.route=[[15,0]];local.life.destination={id:'east',name:'East'};}
  grantWish(state,state.locals[0].id,'dragon','jevica');stepWishes(state,15);
  const positions=state.locals.map(local=>[...local.position]);step(life,120);
  assert.deepEqual(state.locals.map(local=>local.position),positions);
  undoWish(state,state.locals[0].id,'jevica');step(life,120);
  assert.ok(state.locals.some((local,index)=>local.position[0]!==positions[index][0]));
});

test('a neighbour who has just said what would help waits for it, then carries on',()=>{
  const moved=(person,from)=>Math.hypot(person.position[0]-from[0],person.position[1]-from[1]);
  const {state,life}=create();step(life,180);
  const local=state.locals.find(local=>local.life.speed>.1);assert.ok(local,'someone is walking');
  Object.assign(local,{priority:true,status:'needs_help',needKnown:true,lastInteraction:'ask'});
  step(life,60);const waiting=[...local.position];
  step(life,20*60);
  assert.ok(moved(local,waiting)<.05,'they stay put while help is on its way');
  // Released by the timeout: they must actually walk again, not just change status.
  step(life,15*60);
  assert.ok(moved(local,waiting)>.5,`after half a minute they resume walking (${moved(local,waiting).toFixed(2)} m)`);
});

test('help arriving ends the wait at once',()=>{
  const moved=(person,from)=>Math.hypot(person.position[0]-from[0],person.position[1]-from[1]);
  const {state,life}=create();step(life,180);
  const local=state.locals.find(local=>local.life.speed>.1);assert.ok(local,'someone is walking');
  Object.assign(local,{priority:true,status:'needs_help',needKnown:true,lastInteraction:'ask'});
  step(life,60);const held=[...local.position];step(life,60);assert.ok(moved(local,held)<.05,'waiting');
  local.lastInteraction='supply';step(life,10*60);
  assert.ok(moved(local,held)>.5,`a delivered kit lets them walk on (${moved(local,held).toFixed(2)} m)`);
});

test('a storm cancels the wait rather than restarting it when the storm clears',()=>{
  const moved=(person,from)=>Math.hypot(person.position[0]-from[0],person.position[1]-from[1]);
  const {state,life}=create();step(life,180);
  const local=state.locals.find(local=>local.life.speed>.1);assert.ok(local,'someone is walking');
  Object.assign(local,{priority:true,status:'needs_help',needKnown:true,lastInteraction:'ask'});
  step(life,60);
  step(life,120,{storm:true});step(life,15*60,{storm:false});
  const after=[...local.position];step(life,5*60,{storm:false});
  assert.ok(moved(local,after)>.3,`after the storm they go about their day, not wait again (${moved(local,after).toFixed(2)} m)`);
});

test('an ask made during a storm does not start a wait once the storm clears',()=>{
  const moved=(person,from)=>Math.hypot(person.position[0]-from[0],person.position[1]-from[1]);
  const {state,life}=create();step(life,180);
  const local=state.locals.find(local=>local.life.speed>.1);assert.ok(local,'someone is walking');
  step(life,30,{storm:true});
  Object.assign(local,{priority:true,status:'needs_help',needKnown:true,lastInteraction:'ask'});
  step(life,120,{storm:true});step(life,15*60,{storm:false});
  const after=[...local.position];step(life,5*60,{storm:false});
  assert.ok(moved(local,after)>.3,`after the storm they carry on (${moved(local,after).toFixed(2)} m)`);
});

test('an ask made in a storm while walks are paused does not start a wait later',()=>{
  const moved=(person,from)=>Math.hypot(person.position[0]-from[0],person.position[1]-from[1]);
  const {state,life}=create();step(life,180);
  const local=state.locals.find(local=>local.life.speed>.1);assert.ok(local,'someone is walking');
  Object.assign(local,{priority:true,status:'needs_help'});
  state.storm=true;
  assert.equal(interactWithLocal(state,local.id,'ask').ok,true);
  state.selectedId=null;
  step(life,120,{paused:true,storm:true});
  state.storm=false;step(life,15*60,{storm:false});
  const after=[...local.position];step(life,5*60,{storm:false});
  assert.ok(moved(local,after)>.3,`once walks resume in clear weather they carry on (${moved(local,after).toFixed(2)} m)`);
});

// A storefront bench at stop 'a': residents resting there sit on it, one to a
// place, and stand up in front of it before walking on.
const benchWorld={...world,stores:[{id:'a',name:'Garden café',facade:[-12,0,0],outward:[0,1],visit:[-12,0]}]};
test('resting residents sit on a free storefront bench place, one each, and stand before walking on',()=>{
  const state=createCommunity(benchWorld),life=createResidentLife(benchWorld,state);
  assert.equal(life.benches.get('a')?.length,2,'the bench offers two places');
  const seen=new Map();let standsBeforeWalking=true,stillWhileSeated=true;
  for(let i=0;i<60*240;i++) {
    const before=new Map(state.locals.map(local=>[local.id,{seat:local.life.seat?.id??null,position:[...local.position]}]));
    stepResidentLife(life,1/60);
    const held=state.locals.filter(local=>local.life.seat).map(local=>local.life.seat.id);
    assert.equal(new Set(held).size,held.length,'never two residents on one place');
    for(const local of state.locals) {
      const was=before.get(local.id);
      if(local.life.seat) {
        const seat=life.benches.get('a').find(place=>place.id===local.life.seat.id);
        if(!seen.has(local.id))seen.set(local.id,seat.id);
        assert.ok(Math.hypot(local.position[0]-seat.x,local.position[1]-seat.north)<1e-9,'on the bench place');
        assert.equal(local.life.heading,seat.heading,'facing the street');
        if(was.seat===seat.id && Math.hypot(local.position[0]-was.position[0],local.position[1]-was.position[1])>1e-9)stillWhileSeated=false;
      } else if(was.seat) {
        // Stood up: from the bench to the pavement in front, never further.
        const seat=life.benches.get('a').find(place=>place.id===was.seat);
        if(Math.hypot(local.position[0]-seat.approach[0],local.position[1]-seat.approach[1])>0.05)standsBeforeWalking=false;
      }
    }
  }
  assert.ok(seen.size>=1,'somebody rested on the bench');
  assert.ok(stillWhileSeated,'a seated resident does not slide');
  assert.ok(standsBeforeWalking,'they stand in front of the bench before walking');
});

test('residents leave a bench place to a player who holds it',()=>{
  const state=createCommunity(benchWorld),life=createResidentLife(benchWorld,state);
  const places=new Set(life.benches.get('a').map(place=>place.id));
  for(let i=0;i<60*240;i++) {
    stepResidentLife(life,1/60,{takenSeats:places});
    assert.ok(state.locals.every(local=>!local.life.seat),'no resident sits on a held place');
  }
  // In single player the visitor's own seat is held the same way.
  const solo=createResidentLife(benchWorld,createCommunity(benchWorld)),[first,second]=solo.benches.get('a');
  for(let i=0;i<60*240;i++) {
    stepResidentLife(solo,1/60,{visitorPose:{riding:{kind:'seat',seatId:first.id}}});
    assert.ok(solo.state.locals.every(local=>local.life.seat?.id!==first.id));
  }
  assert.ok(second.id);
});

test('a storm stands everyone up before they seek shelter',()=>{
  const state=createCommunity(benchWorld),life=createResidentLife(benchWorld,state);
  let sat=false;
  for(let i=0;i<60*240 && !sat;i++){stepResidentLife(life,1/60);sat=state.locals.some(local=>local.life.seat);}
  assert.ok(sat,'somebody sat down first');
  stepResidentLife(life,1/60,{storm:true});
  assert.ok(state.locals.every(local=>!local.life.seat));
});
