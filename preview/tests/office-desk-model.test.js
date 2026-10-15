import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeskModel } from '../src/office-desk-model.js';
import { createMemoryOfficeDesk } from '../../server/office-desk.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){let account='alice';const store=createMemoryOfficeDesk();let delay=null;const model=createDeskModel({account:()=>account,request:async(action,data)=>{if(delay)await delay;const r=action==='read'?{ok:true,desk:await store.read(account)}:await store[action](account,data);if(!r.ok)throw new Error(r.reason);return r;},id:()=> 'task-one'});return {model,store,setAccount:v=>account=v,delay:p=>delay=p};}
test('desk creates, saves, finishes and resumes a task without losing the result',async()=>{
 const {model}=fixture();await model.load();await model.create();model.edit({title:'Write a proposal',notes:'A quiet place to work',result:'Ready to share'});await model.save();assert.equal(model.state.status,'saved');await model.finish();assert.equal(model.state.task.status,'done');model.reset();await model.load();assert.equal(model.state.task.result,'Ready to share');assert.equal(model.state.task.status,'done');
});
test('typing during a save keeps newer text dirty until another save',async()=>{
 const f=fixture();await f.model.load();await f.model.create();f.model.edit({title:'First title'});let release;f.delay(new Promise(r=>release=r));const save=f.model.save();f.model.edit({notes:'Typed while saving'});release();await save;assert.equal(f.model.state.dirty,true);assert.equal(f.model.state.task.notes,'Typed while saving');f.delay(null);await f.model.save();assert.equal((await f.store.read('alice')).tasks[0].notes,'Typed while saving');
});
test('conflicts retain local text and block switching until resolved',async()=>{
 const {model,store}=fixture();await model.load();await model.create();model.edit({title:'Original'});await model.save();await store.save('alice',{expectedVersion:1,task:{...model.state.task,title:'Other tab'}});model.edit({notes:'Keep my work'});assert.equal(await model.save(),false);assert.equal(model.state.error,'desk_conflict');assert.equal(model.state.task.notes,'Keep my work');assert.equal(await model.create(),false);await model.load({discard:true});assert.equal(model.state.task.title,'Other tab');
});
test('late responses and an account change cannot expose the former desk',async()=>{
 const f=fixture();await f.model.load();await f.model.create();f.model.edit({title:'Alice private draft'});let release;f.delay(new Promise(r=>release=r));const pending=f.model.save();f.setAccount('bob');f.model.reset();release();await pending;await tick();assert.equal(f.model.state.task,null);assert.equal(f.model.state.desk.tasks.length,0);
});

test('typing while a reopened desk loads cannot be overwritten by its late read',async()=>{
 const f=fixture();await f.model.load();await f.model.create();f.model.edit({title:'Saved title',notes:'Saved notes'});await f.model.save();
 let release;f.delay(new Promise(r=>release=r));const loading=f.model.load();f.model.edit({notes:'New text during reopening'});release();await loading;
 assert.equal(f.model.state.task.notes,'New text during reopening');assert.equal(f.model.state.dirty,true);f.delay(null);await f.model.save();assert.equal((await f.store.read('alice')).tasks[0].notes,'New text during reopening');
});

test('a confirmed removal refuses further edits while pending',async()=>{
 const f=fixture();await f.model.load();await f.model.create();f.model.edit({title:'Remove me'});await f.model.save();
 let release;f.delay(new Promise(r=>release=r));const pending=f.model.remove();assert.equal(f.model.state.status,'removing');f.model.edit({notes:'Cannot edit a removing task'});assert.equal(f.model.state.task.notes,'');release();await pending;assert.equal(f.model.state.task,null);assert.equal(f.model.state.dirty,false);
});

test('lost save response retries the same mutation before saving newer typing',async()=>{
 const store=createMemoryOfficeDesk();let lose=true;const calls=[];
 const model=createDeskModel({account:()=> 'alice',id:()=> 'task',request:async(action,data)=>{
  calls.push(structuredClone({action,data}));const r=action==='read'?{ok:true,desk:await store.read('alice')}:await store[action]('alice',data);
  if(!r.ok)throw Error(r.reason);if(action==='save'&&lose){lose=false;throw Error('network');}return r;
 }});
 await model.load();await model.create();model.edit({title:'First'});assert.equal(await model.save(),false);
 model.edit({notes:'Typed after timeout'});await model.save();
 assert.deepEqual(calls[1],calls[2],'retry must preserve operation ID and original payload');
 assert.equal(model.state.dirty,true);assert.equal(model.state.task.notes,'Typed after timeout');
 await model.save();assert.equal(model.state.dirty,false);assert.equal((await store.read('alice')).tasks[0].notes,'Typed after timeout');
});

test('lost removal response is retried without restoring the removed task',async()=>{
 const store=createMemoryOfficeDesk();let lose=true;
 const model=createDeskModel({account:()=> 'alice',id:()=> 'task',request:async(action,data)=>{
  const r=action==='read'?{ok:true,desk:await store.read('alice')}:await store[action]('alice',data);
  if(!r.ok)throw Error(r.reason);if(action==='remove'&&lose){lose=false;throw Error('network');}return r;
 }});
 await model.load();await model.create();model.edit({title:'Remove me'});await model.save();
 assert.equal(await model.remove(),false);assert.equal(model.state.task.title,'Remove me');
 assert.equal(await model.retry(),true);assert.equal(model.state.task,null);assert.equal((await store.read('alice')).version,2);
});

test('workspace switching fences old data and delayed responses without relying on a reset call',async()=>{
 let scope='private',release;const model=createDeskModel({account:()=> 'alice',scope:()=>scope,id:()=> 'task',request:async()=>{
  await new Promise(r=>release=r);return {desk:{version:1,activeId:'task',updatedAt:1,tasks:[{id:'task',title:'Private',notes:'secret',result:'',links:[],status:'open'}]}};
 }});
 const reading=model.load();scope='office-a';release();await reading;
 assert.equal(model.state.task,null);assert.deepEqual(model.state.desk.tasks,[]);
});

test('reopening a shared draft revalidates access while preserving failed-save text',async()=>{
 const store=createMemoryOfficeDesk();let failSave=true,reads=0;
 const model=createDeskModel({account:()=> 'alice',scope:()=> 'shared',id:()=> 'task',request:async(action,data)=>{
  if(action==='read'){reads++;return {desk:await store.read('alice')};}
  if(failSave)throw Error('unavailable');const r=await store[action]('alice',data);if(!r.ok)throw Error(r.reason);return r;
 }});
 await model.load();await model.create();model.edit({title:'Draft',notes:'Keep through disconnect'});await model.save();
 assert.equal(await model.load({preserveDraft:true}),true);assert.equal(reads,2);
 assert.equal(model.state.task.notes,'Keep through disconnect');assert.equal(model.state.dirty,true);
 failSave=false;await model.retry();assert.equal(model.state.status,'saved');
});
