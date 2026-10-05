import test from 'node:test';
import assert from 'node:assert/strict';
import {createChauffeur,scenicRoute} from '../src/chauffeur.js';
const route=[[-4,0],[-10,0],[-20,0]],pose={position:[0,0,0],yaw:0,speed:1,vehicle:'rolls'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function response(request,changes={}){return {ok:true,json:async()=>({schema_version:1,tick:request.tick,generation:request.generation,source:'jev',candidate_id:'cruise',confidence:.9,...changes})};}
test('smart driving holds for the API, respects decisions, expires leases and cancels on manual input',async()=>{
 let now=0,resolve,request;const brain=createChauffeur({clock:()=>now,fetcher:(_url,options)=>{request=JSON.parse(options.body);return new Promise(r=>resolve=r);}});
 brain.request({mode:'tour'},route);assert.equal(brain.input(pose,{},.016).forward,0);
 resolve(response(request));await flush();assert.ok(brain.input(pose,{},.016).forward>0);assert.equal(brain.status.source,'jev');
 assert.equal(brain.input(pose,{},.016,{roadClear:false}).forward,0);
 now=3000;assert.equal(brain.input(pose,{},.016).forward,0,'expired decisions brake');
 assert.equal(brain.input(pose,{turn:1},.016).turn,1);assert.equal(brain.status.active,false);
 resolve(response(request));await flush();assert.equal(brain.input(pose,{},.016).forward,0,'late API response cannot restart cancelled drive');brain.dispose();
});
test('missing keys, invalid actions, stale ticks and low confidence all hold position',async()=>{
 for(const changes of [{source:'unavailable',reason:'not_configured'},{candidate_id:'teleport'},{tick:99},{confidence:.1},{confidence:NaN}]){
  const brain=createChauffeur({fetcher:async(_u,o)=>response(JSON.parse(o.body),changes)});brain.request({mode:'tour'},route);brain.input(pose,{},.016);await flush();assert.equal(brain.input(pose,{},.016).forward,0);brain.dispose();
 }
});
test('routes follow authored roads and reject invalid points',()=>{
 const world={roads:[{kind:'service',points:[[30,0,0],[-30,0,0]]}]};assert.ok(scenicRoute(world,pose).length>3);
 const brain=createChauffeur();assert.equal(brain.request({mode:'tour'},[[NaN,0],[1,2]]),false);brain.dispose();
});


test('pause aborts outstanding decisions and resume requires a fresh lease',async()=>{
 let resolve,request;const brain=createChauffeur({fetcher:(_u,o)=>{request=JSON.parse(o.body);return new Promise(r=>resolve=r);}});
 brain.request({mode:'tour'},route);brain.input(pose,{},.016);
 assert.equal(brain.request({mode:'pause'}),true);assert.equal(brain.status.paused,true);
 resolve(response(request));await flush();assert.equal(brain.input(pose,{},.016).forward,0);
 assert.equal(brain.request({mode:'resume'}),true);assert.equal(brain.input(pose,{},.016).forward,0);
 resolve(response(request));await flush();assert.ok(brain.input(pose,{},.016).forward>0);
 brain.input(pose,{brake:true},.016);assert.equal(brain.status.active,false);assert.equal(brain.request({mode:'resume'}),false);brain.dispose();
});
test('Jev controls turns, braking, recovery reverse and parking within live clearance',async()=>{
 for(const action of ['accelerate','turn_left','turn_right','brake','reverse','park']){
  const brain=createChauffeur({fetcher:async(_u,o)=>response(JSON.parse(o.body),{candidate_id:action})});
  const path=action==='park'?[[0,0],[-1,0]]:action==='accelerate'?[[-12,0],[-20,0]]:route;
  brain.request({mode:'tour'},path);
  const current={...pose,yaw:action==='turn_left'?-.4:action==='turn_right'?.4:action==='reverse'?Math.PI:0,speed:0};
  brain.input(current,{},.016,{rearClear:true});await flush();
  const controls=brain.input(current,{},.016,{rearClear:true});
  if(action==='accelerate')assert.ok(controls.forward>.55);
  if(action==='turn_left')assert.ok(controls.turn>0);
  if(action==='turn_right')assert.ok(controls.turn<0);
  if(action==='brake')assert.equal(controls.forward,0);
  if(action==='reverse'){assert.ok(controls.forward<0);assert.equal(brain.input(current,{},.016,{rearClear:false}).forward,0);}
  if(action==='park'){assert.equal(controls.brake,true);assert.equal(brain.status.active,false);assert.equal(brain.status.label,'Jev has parked');}
  brain.dispose();
 }
});


test('reverse movement clears a stalled recovery before the next Jev request',async()=>{
 let now=0,requests=[],decision='cruise';
 const brain=createChauffeur({clock:()=>now,fetcher:async(_u,o)=>{const p=JSON.parse(o.body);requests.push(p);return response(p,{candidate_id:decision});}});
 brain.request({mode:'tour'},[[-12,0],[-25,0]]);
 const stopped={...pose,speed:0};brain.input(stopped,{},.08,{rearClear:true});await flush();
 for(let i=0;i<28;i++)brain.input(stopped,{},.08,{rearClear:true});
 now=1600;decision='reverse';brain.input(stopped,{},.08,{rearClear:true});await flush();
 assert.equal(requests.at(-1).recovery,true);assert.ok(brain.input(stopped,{},.08,{rearClear:true}).forward<0);
 now=3200;brain.input({...stopped,speed:-.2}, {}, .08, {rearClear:true});await flush();
 assert.equal(requests.at(-1).recovery,false);brain.dispose();
});
