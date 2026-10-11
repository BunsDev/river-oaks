import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { createStoreIntroDirector } from '../src/store-intro.js';
const room={storeId:'shop',name:'Harry Winston',center:0,depth:8,floor:18,toWorld:(a,d)=>[a,d]};
const context={room,accountId:'alice',worldId:'river-oaks',canPlay:true};
const setup=(options={})=>{const camera=new PerspectiveCamera(65);camera.position.set(10,20,30);let starts=0,ends=0,claims=0;
 const director=createStoreIntroDirector({camera,claim:async()=>{claims++;return {firstVisit:true};},onStart:()=>starts++,onEnd:()=>ends++,...options});
 return {camera,director,counts:()=>({starts,ends,claims})};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('first arrival plays actual room coordinates, keeps camera finite and restores lens',async()=>{
 const {camera,director,counts}=setup();director.observe(context);await flush();assert.equal(director.active,true);
 director.update(100);assert.equal(camera.position.y,20.2);assert.equal(camera.position.z,5.5);
 director.update(3300);assert.ok(camera.position.z<0);assert.ok(camera.position.toArray().every(Number.isFinite));
 director.update(6200);assert.equal(director.active,false);assert.equal(camera.fov,65);assert.deepEqual(camera.position.toArray(),[10,20,30]);
 director.observe(context);await flush();assert.deepEqual(counts(),{starts:1,ends:1,claims:1});
});
test('late claims after departure never steal camera; failures permit a later visit',async()=>{
 let finish;const {director,counts}=setup({claim:()=>new Promise(resolve=>finish=resolve)});
 director.observe(context);await flush();director.observe({...context,room:null});finish({firstVisit:true});await flush();assert.equal(director.active,false);assert.equal(counts().starts,0);
 let attempts=0;const failed=setup({claim:async()=>{if(++attempts===1)throw new Error('offline');return {firstVisit:true};}});
 failed.director.observe(context);await flush();assert.equal(failed.director.active,false);
 failed.director.observe({...context,room:null});failed.director.observe(context);await flush();assert.equal(failed.director.active,true);
});
test('repeat claims do not play; skip and reduced motion restore control exactly once',async()=>{
 const repeated=setup({claim:async()=>({firstVisit:false})});repeated.director.observe(context);await flush();assert.equal(repeated.director.active,false);
 const {camera,director,counts}=setup({getReducedMotion:()=>true});director.observe(context);await flush();director.update(100);director.update(1000);
 assert.deepEqual(camera.position.toArray(),[10,20,30]);director.cancel();director.cancel();assert.deepEqual(counts(),{starts:1,ends:1,claims:1});
});

test('leaving, losing eligibility and changing worlds fence active and pending sequences',async()=>{
 const {director,counts}=setup();director.observe(context);await flush();
 director.observe({...context,canPlay:false});assert.equal(director.active,false);
 director.observe({...context,canPlay:true});await flush();assert.equal(counts().starts,1);
 director.observe({...context,room:null});director.observe(context);await flush();assert.equal(counts().starts,2);
 director.reset();assert.equal(director.active,false);
 director.observe({...context,worldId:'other'});await flush();assert.equal(counts().starts,3);
});

test('a failed presentation restores camera ownership instead of freezing movement',async()=>{
 const {director,counts}=setup({onStart:()=>{throw new Error('presentation unavailable');}});
 director.observe(context);await flush();assert.equal(director.active,false);assert.equal(counts().ends,1);
});
