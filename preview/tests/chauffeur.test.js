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
