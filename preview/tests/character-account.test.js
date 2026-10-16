import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterAccount} from '../src/character-account.js';
import {createMemoryCharacterStore} from '../../server/character-store.js';
import {customizedCharacterDefinition} from '../src/character-customization.js';
const owner='alice',draft=palette=>customizedCharacterDefinition(owner,'sable-human',{palette});
async function fixture(){
 const store=createMemoryCharacterStore();await store.initializeSelection(owner,{appearance:'sable-human',movement:'upright'});
 let seq=0,fail=null;const calls=[];
 const read=async()=>({character:await store.get(owner),selection:await store.getSelection(owner)});
 const write=async(action,body)=>{calls.push({action,body:structuredClone(body)});const opts={expectedVersion:body.expectedVersion,requestId:body.requestId};
  const result=action==='draft'?await store.saveDraft(owner,body.definition,opts):await store.publish(owner,opts);
  if(fail===action){fail=null;throw new Error('network lost');}return result;};
 const select=async(command,selection)=>{calls.push({action:'equip',body:{command,selection}});try{const result=await store.changeSelection(owner,command,selection);
  if(fail==='equip'){fail=null;throw new Error('network lost');}return {ok:true,appliedVersion:result.appliedVersion,selectionVersion:result.selection.version};
 }catch(error){if(error.code)return {ok:false,error:error.code};throw error;}};
 const model=createCharacterAccount({ownerId:owner,read,write,select,operationId:()=>`client-${++seq}`});await model.load();
 return {store,model,calls,read,write,select,fail:value=>{fail=value;}};
}
test('save stays private; wear saves, publishes and equips with separate versions',async()=>{
 const f=await fixture();await f.model.save(draft('rose'));
 assert.equal((await f.store.get(owner)).draft.palette,'rose');assert.equal((await f.store.getSelection(owner)).character,undefined);
 await f.model.wear(draft('rose'));assert.equal((await f.store.getSelection(owner)).character.palette,'rose');
 assert.deepEqual(f.calls.map(x=>x.action),['draft','publish','equip']);
 assert.equal(f.calls[2].body.selection.expectedVersion,1);assert.equal(f.model.state.phase,'ready');
 assert.equal(f.model.state.character.published.revision,1);
});
for(const step of ['draft','publish','equip'])test(`lost ${step} response retries the original operation without duplicate revisions`,async()=>{
 const f=await fixture();f.fail(step);await assert.rejects(f.model.wear(draft('rose')));
 assert.equal(f.model.state.phase,'error');assert.equal(f.model.state.canRetry,true);
 const original=f.calls.find(x=>x.action===step);await f.model.retry();
 const repeated=f.calls.filter(x=>x.action===step);assert.equal(repeated.length,2);assert.deepEqual(repeated[1],original);
 assert.equal((await f.store.get(owner)).published.revision,1);assert.equal((await f.store.getSelection(owner)).version,2);
});
test('concurrent draft changes are conflicts and never publish another editor\'s draft',async()=>{
 const f=await fixture();await f.store.saveDraft(owner,draft('midnight'),{expectedVersion:0,requestId:'other'});
 await assert.rejects(f.model.wear(draft('rose')),error=>error.code==='character_conflict');
 assert.equal(f.model.state.phase,'conflict');assert.equal(f.model.state.canRetry,false);
 assert.equal((await f.store.get(owner)).published,null);assert.equal((await f.store.getSelection(owner)).character,undefined);
 await f.model.load();await f.model.wear(draft('rose'));assert.equal((await f.store.getSelection(owner)).character.palette,'rose');
});
test('a lost publication reply followed by newer publication cannot equip the old look',async()=>{
 const f=await fixture();f.fail('publish');await assert.rejects(f.model.wear(draft('rose')));
 await f.store.saveDraft(owner,draft('midnight'),{expectedVersion:2,requestId:'other-draft'});await f.store.publish(owner,{expectedVersion:3,requestId:'other-publish'});
 await assert.rejects(f.model.retry(),error=>error.code==='character_conflict');
 assert.equal(f.calls.some(x=>x.action==='equip'),false);assert.equal((await f.store.getSelection(owner)).character,undefined);
});
test('selection conflicts preserve the newer selection and retain the saved draft',async()=>{
 const f=await fixture();await f.store.changeSelection(owner,{type:'appearance',appearance:'woman-casual'},{expectedVersion:1,requestId:'other-look'});
 await assert.rejects(f.model.wear(draft('rose')),error=>error.code==='character_selection_conflict');
 assert.equal((await f.store.getSelection(owner)).appearance,'woman-casual');assert.equal((await f.store.get(owner)).draft.palette,'rose');
 assert.equal(f.model.state.phase,'conflict');
});
test('input snapshots and disposal fence late callbacks without mutating local edits',async()=>{
 const f=await fixture();let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});let notifications=0;
 const model=createCharacterAccount({ownerId:owner,read:f.read,write:async(...args)=>{entered();await new Promise(resolve=>{release=resolve;});return f.write(...args);},select:f.select,operationId:()=> 'delayed',onChange:()=>{notifications++;}});
 await model.load();const input=draft('rose'),saving=model.save(input);await waiting;input.palette='midnight';model.dispose();const count=notifications;release();await saving;
 assert.equal(notifications,count);assert.equal((await f.store.get(owner)).draft.palette,'rose');
 const snapshot=model.state;snapshot.character.version=999;assert.notEqual(model.state.character.version,999);
});
test('uncertain operations cannot be replaced by a fresh save or wear',async()=>{
 const f=await fixture();f.fail('draft');await assert.rejects(f.model.save(draft('rose')));
 await assert.rejects(f.model.wear(draft('midnight')),error=>error.code==='character_retry_required');
 await assert.rejects(f.model.load(),error=>error.code==='character_retry_required');
 await f.model.retry();assert.equal((await f.store.get(owner)).draft.palette,'rose');
});
test('a lost equip reply never replays over a newer selection',async()=>{
 const f=await fixture();f.fail('equip');await assert.rejects(f.model.wear(draft('rose')));
 await f.store.changeSelection(owner,{type:'appearance',appearance:'woman-casual'},{expectedVersion:2,requestId:'newer-choice'});
 await assert.rejects(f.model.retry(),error=>error.code==='character_selection_conflict');
 assert.equal((await f.store.getSelection(owner)).appearance,'woman-casual');assert.equal(f.model.state.selection.version,3);
});
test('a lost draft reply cannot publish a newer editor\'s draft',async()=>{
 const f=await fixture();f.fail('draft');await assert.rejects(f.model.wear(draft('rose')));
 await f.store.saveDraft(owner,draft('midnight'),{expectedVersion:1,requestId:'newer-draft'});
 await assert.rejects(f.model.retry(),error=>error.code==='character_conflict');assert.equal(f.calls.some(x=>x.action==='publish'),false);
});
test('read failure after equip retries the receipt without repeating publication',async()=>{
 const f=await fixture();let fail=false,once=true;const model=createCharacterAccount({ownerId:owner,read:()=>{if(fail){fail=false;throw new Error('network');}return f.read();},write:f.write,
  select:async(...args)=>{const result=await f.select(...args);if(once){fail=true;once=false;}return result;},operationId:()=>`read-retry-${f.calls.length}`});
 await model.load();await assert.rejects(model.wear(draft('rose')));assert.equal(model.state.canRetry,true);
 // Use the same account/store with an intermittent post-equip read failure.
 fail=false;await model.retry();assert.equal(model.state.phase,'ready');assert.equal(f.calls.filter(x=>x.action==='publish').length,1);
 assert.equal((await f.store.getSelection(owner)).version,2);
});
test('invalid server definitions and cross-owner selections fail closed',async()=>{
 const f=await fixture();const good=await f.read();
 for(const mutate of [value=>{value.character.published=draft('rose');},value=>{value.selection.character={...draft('rose'),ownerId:'bob',revision:1};},value=>{value.character.version=-1;}]){
  const response=structuredClone(good);mutate(response);
  const model=createCharacterAccount({ownerId:owner,read:async()=>response,write:f.write,select:f.select});
  await assert.rejects(model.load());assert.equal(model.state.phase,'error');assert.equal(model.state.character,null);assert.equal(model.state.canRetry,false);
 }
});
test('HTTP conflicts are definitive; temporary cooldown reuses the operation',async()=>{
 const f=await fixture();let cooldown=true;
 const model=createCharacterAccount({ownerId:owner,read:f.read,write:f.write,select:(...args)=>{if(cooldown){cooldown=false;return {ok:false,error:'appearance_cooldown'};}return f.select(...args);},operationId:()=>`cooldown-${f.calls.length}`});
 await model.load();await assert.rejects(model.wear(draft('rose')));assert.equal(model.state.canRetry,true);await model.retry();assert.equal(model.state.phase,'ready');
 const conflict=createCharacterAccount({ownerId:owner,read:f.read,write:async()=>{throw Object.assign(new Error('character_conflict'),{status:409});},select:f.select});
 await conflict.load();await assert.rejects(conflict.save(draft('midnight')));assert.equal(conflict.state.phase,'conflict');assert.equal(conflict.state.canRetry,false);
});
test('Redis pending timeout retains equip identity until its receipt is recovered',async()=>{
 const f=await fixture();let first=true;const attempts=[];
 const model=createCharacterAccount({ownerId:owner,read:f.read,write:f.write,select:async(command,selection)=>{
  attempts.push(structuredClone({command,selection}));const result=await f.select(command,selection);
  if(first){first=false;return {ok:false,error:'request_timeout'};}return result;
 },operationId:()=>`redis-timeout-${f.calls.length}`});
 await model.load();await assert.rejects(model.wear(draft('rose')));assert.equal(model.state.canRetry,true);
 await assert.rejects(model.wear(draft('midnight')),error=>error.code==='character_retry_required');await model.retry();
 assert.deepEqual(attempts[1],attempts[0]);assert.equal((await f.store.getSelection(owner)).version,2);
});
test('HTTP account throttling retries the exact draft operation',async()=>{
 const f=await fixture();let first=true;const attempts=[];
 const model=createCharacterAccount({ownerId:owner,read:f.read,write:async(action,body)=>{
  attempts.push(structuredClone(body));if(first){first=false;throw Object.assign(new Error('character_rate_limited'),{status:429});}return f.write(action,body);
 },select:f.select,operationId:()=>`throttle-${attempts.length}`});
 await model.load();await assert.rejects(model.save(draft('rose')));assert.equal(model.state.canRetry,true);await model.retry();assert.deepEqual(attempts[1],attempts[0]);
});
for(const name of ['TimeoutError','AbortError'])test(`${name} after a durable HTTP write retains its operation identity`,async()=>{
 const f=await fixture();let first=true;const attempts=[];
 const model=createCharacterAccount({ownerId:owner,read:f.read,write:async(action,body)=>{
  attempts.push(structuredClone(body));const result=await f.write(action,body);if(first){first=false;throw new DOMException('The operation was interrupted',name);}return result;
 },select:f.select,operationId:()=>`abort-${attempts.length}`});
 await model.load();await assert.rejects(model.save(draft('rose')));assert.equal(model.state.canRetry,true);await model.retry();assert.deepEqual(attempts[1],attempts[0]);assert.equal((await f.store.get(owner)).version,1);
});
for(const action of ['draft','publish','equip'])test(`malformed ${action} acknowledgement retains the operation for receipt recovery`,async()=>{
 const f=await fixture();let first=true;const attempts=[];
 const corrupt=(step,result)=>{if(step===action&&first){first=false;return step==='equip'?{ok:true}:{};}return result;};
 const model=createCharacterAccount({ownerId:owner,read:f.read,
  write:async(step,body)=>{attempts.push({step,body:structuredClone(body)});return corrupt(step,await f.write(step,body));},
  select:async(command,selection)=>{attempts.push({step:'equip',body:structuredClone({command,selection})});return corrupt('equip',await f.select(command,selection));},
  operationId:()=>`malformed-${attempts.length}`});
 await model.load();await assert.rejects(model.wear(draft('rose')));assert.equal(model.state.canRetry,true);
 await assert.rejects(model.load(),error=>error.code==='character_retry_required');await model.retry();
 const repeated=attempts.filter(attempt=>attempt.step===action);assert.deepEqual(repeated[1],repeated[0]);
 assert.equal((await f.store.get(owner)).published.revision,1);assert.equal((await f.store.getSelection(owner)).version,2);
});
test('partial publication receipt keeps its identity when revision metadata is absent',async()=>{
 const f=await fixture();let first=true;const publications=[];
 const model=createCharacterAccount({ownerId:owner,read:f.read,select:f.select,write:async(action,body)=>{
  const result=await f.write(action,body);if(action==='publish'){publications.push(structuredClone(body));if(first){first=false;delete result.revision;}}return result;
 },operationId:()=>`partial-${f.calls.length}`});
 await model.load();await assert.rejects(model.wear(draft('rose')));assert.equal(model.state.canRetry,true);
 await model.retry();assert.deepEqual(publications[1],publications[0]);assert.equal((await f.store.get(owner)).published.revision,1);
});

test('pausing Studio retains an uncertain equip until its committed receipt is available',async()=>{
 const f=await fixture(),attempts=[];let stage=0;
 const model=createCharacterAccount({ownerId:owner,read:f.read,write:f.write,select:async(command,selection)=>{
  attempts.push(structuredClone({command,selection}));stage++;
  if(stage===1)return {ok:false,error:'request_timeout'};
  if(stage===2)return {ok:false,error:'character_studio_disabled'};
  return f.select(command,selection);
 },operationId:()=>`paused-${f.calls.length}`});
 await model.load();await assert.rejects(model.wear(draft('rose')));assert.equal(model.state.canRetry,true);
 await assert.rejects(model.retry(),error=>error.code==='character_studio_disabled');
 assert.equal(model.state.canRetry,true,'A paused result cannot prove a previous equip did not commit');
 await assert.rejects(model.load(),error=>error.code==='character_retry_required');
 await assert.rejects(model.wear(draft('midnight')),error=>error.code==='character_retry_required');
 await f.store.changeSelection(owner,attempts[0].command,attempts[0].selection);
 await model.retry();assert.equal(model.state.phase,'ready');
 assert.deepEqual(attempts[1],attempts[0]);assert.deepEqual(attempts[2],attempts[0]);
 assert.equal(model.state.selection.version,2);assert.equal(model.state.character.published.revision,1);
});
