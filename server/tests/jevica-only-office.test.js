import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSharedWorld} from '../world.js';
import {JEVICA_ADMIN_USER_IDS} from '../admin.js';
const data=JSON.parse(readFileSync(new URL('../../preview/public/data/district.json',import.meta.url)));
test('only Jevica can invite guests into the sole office',()=>{
 let time=1000;const world=createSharedWorld(data,{now:()=>time});const owner=JEVICA_ADMIN_USER_IDS[0];
 for(const id of [owner,'guest','stranger'])world.join({userId:id,name:'Jevica'});
 const send=(id,action,extra={})=>{time+=2100;return world.command(id,{type:'office',officeId:'jevica-office',action,...extra});};
 assert.deepEqual(send('guest','list').offices.map(o=>o.id),['jevica-office']);
 assert.equal(send('guest','enter').error,'office_permission_required');
 assert.equal(send('guest','invite',{peerId:'stranger'}).error,'office_owner_required');
 assert.equal(send('guest','request').ok,false);
 assert.equal(send(owner,'approve',{peerId:'guest'}).ok,false);
 const personal='office-'+ 'a'.repeat(64);
 assert.equal(world.command(owner,{type:'office',action:'enter',officeId:personal},{officeWorkspace:{id:personal,role:'owner'}}).error,'unknown_office');
 assert.equal(send(owner,'invite',{peerId:'guest'}).ok,true);
 const entrance=send('guest','list').offices[0].entrance;time+=2100;
 assert.equal(world.command('guest',{type:'travel',position:entrance}).ok,true);
 assert.equal(send('guest','enter').ok,true);
 assert.equal(send(owner,'revoke',{peerId:'guest'}).ok,true);
 assert.equal(world.officeVisit('guest'),null);
});

test('recovery drops retired personal visits and accepted-request grants',async()=>{
 const {createHash}=await import('node:crypto');
 let time=1000;const world=createSharedWorld(data,{now:()=>time}),owner=JEVICA_ADMIN_USER_IDS[0];
 for(const id of [owner,'guest'])world.join({userId:id,name:id});
 const send=(id,action,extra={})=>{time+=2100;return world.command(id,{type:'office',officeId:'jevica-office',action,...extra});};
 assert.equal(send(owner,'invite',{peerId:'guest'}).ok,true);
 const entrance=send('guest','list').offices[0].entrance;time+=2100;
 assert.equal(world.command('guest',{type:'travel',position:entrance}).ok,true);
 assert.equal(send('guest','enter').ok,true);
 const original=world.checkpoint();
 for(const retired of ['accepted','personal']){
  const saved=structuredClone(original);
  if(retired==='accepted')saved.payload.offices.grants[0][1][0].kind='accepted';
  else saved.payload.offices.visits[0][1].id='office-'+'a'.repeat(64);
  const {checksum,...envelope}=saved;saved.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  const restored=createSharedWorld(data,{now:()=>time});assert.equal(restored.restore(saved).ok,true);
  assert.equal(restored.officeVisit('guest'),null);
  if(retired==='accepted')assert.equal(restored.command('guest',{type:'office',action:'enter',officeId:'jevica-office'}).error,'office_permission_required');
 }
});
