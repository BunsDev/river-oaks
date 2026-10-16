import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryCharacterStore, createRedisCharacterStore, CHARACTER_STORE_LIMITS } from '../character-store.js';
import { customizedCharacterDefinition } from '../../preview/src/character-customization.js';

const draft=(owner='alice',palette='rose')=>customizedCharacterDefinition(owner,'sable-human',{palette,hair:'espresso'});
const code=expected=>error=>error.code===expected;
const legacy={appearance:'sable-human',movement:'upright'};
async function setup(mode,t){
  if(mode==='memory'){const store=createMemoryCharacterStore();return {store,other:store};}
  const redis=new Redis(process.env.REDIS_URL),peer=new Redis(process.env.REDIS_URL),prefix=`{character-selection:${randomUUID()}}`;
  redis.on('error',()=>{});peer.on('error',()=>{});
  t.after(async()=>{const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await Promise.all([redis.quit(),peer.quit()]);});
  return {store:createRedisCharacterStore({redis,prefix}),other:createRedisCharacterStore({redis:peer,prefix}),redis,prefix};
}
async function publish(store,owner='alice',palette='rose'){
  const state=await store.get(owner);
  await store.saveDraft(owner,draft(owner,palette),{expectedVersion:state.version,requestId:`draft-${state.version}`});
  return store.publish(owner,{expectedVersion:state.version+1,requestId:`publish-${state.version}`});
}
const change=(store,type,fields,expectedVersion,requestId)=>store.changeSelection('alice',{type,...fields},{expectedVersion,requestId});

for(const mode of ['memory','redis']){
  const options={skip:mode==='redis'&&!process.env.REDIS_URL,timeout:30000};
  test(`${mode}: selected revision is separate from publication and survives independent readers`,options,async t=>{
    const {store,other}=await setup(mode,t);
    assert.equal(typeof store.initializeSelection,'function');
    assert.equal(await store.getSelection('alice'),null);
    const input={...legacy,version:9};
    const initial=await store.initializeSelection('alice',input);assert.deepEqual(initial,{...legacy,version:1});
    input.appearance='invalid';initial.appearance='invalid';
    const one=await publish(store);assert.equal(one.revision,1);
    assert.deepEqual(await other.getSelection('alice'),{...legacy,version:1},'publication does not equip');
    const selected=await change(store,'character',{revision:1},1,'equip-one');
    assert.equal(selected.appliedVersion,2);assert.equal(selected.selection.character.palette,'rose');
    selected.selection.character.palette='changed';
    await publish(other,'alice','midnight');
    const current=await other.getSelection('alice');assert.equal(current.character.revision,1);assert.equal(current.character.palette,'rose');
    assert.equal((await store.get('alice')).published.revision,2);
    assert.equal(await store.getSelection('bob'),null);
    assert.deepEqual(await other.initializeSelection('alice',{appearance:'woman-casual',movement:'beast'}),current,'late migration cannot overwrite selection');
    const migrated=await store.initializeSelection('alice',{...legacy,character:await store.getRevision('alice',2)});
    assert.equal(migrated.character.revision,1);
  });

  test(`${mode}: selection CAS prevents concurrent worlds and stale movement from overwriting identity`,options,async t=>{
    const {store,other}=await setup(mode,t);assert.equal(typeof store.changeSelection,'function');
    await publish(store);await store.initializeSelection('alice',legacy);
    const result=await Promise.allSettled([
      change(store,'character',{revision:1},1,'world-a'),
      change(other,'appearance',{appearance:'woman-casual'},1,'world-b'),
    ]);
    assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(result.find(x=>x.status==='rejected').reason.code,'character_selection_conflict');
    const before=await store.getSelection('alice');
    await assert.rejects(change(other,'movement',{movement:'beast'},1,'stale-movement'),code('character_selection_conflict'));
    assert.deepEqual(await store.getSelection('alice'),before);
    const selected=await change(store,'character',{revision:1},2,'select-current');
    const moved=await change(other,'movement',{movement:'beast'},3,'move-current');
    assert.deepEqual(moved.selection.character,selected.selection.character);assert.equal(moved.selection.movement,'beast');
    const cleared=await change(store,'appearance',{appearance:'sable-human'},4,'clear');
    assert.equal(cleared.selection.character,undefined);assert.equal(cleared.selection.movement,'beast');
  });

  test(`${mode}: duplicate equip receipts survive later edits without replaying old state`,options,async t=>{
    const {store,other}=await setup(mode,t);assert.equal(typeof store.changeSelection,'function');
    await publish(store);await store.initializeSelection('alice',legacy);
    const results=await Promise.all([change(store,'character',{revision:1},1,'same'),change(other,'character',{revision:1},1,'same')]);
    assert.deepEqual(results.map(x=>x.appliedVersion),[2,2]);
    await change(other,'appearance',{appearance:'woman-casual'},2,'later');
    const retry=await change(store,'character',{revision:1},1,'same');
    assert.equal(retry.appliedVersion,2);assert.equal(retry.selection.version,3);assert.equal(retry.selection.appearance,'woman-casual');assert.equal(retry.selection.character,undefined);
    await assert.rejects(change(store,'movement',{movement:'beast'},1,'same'),code('character_request_reused'));
    await assert.rejects(change(store,'character',{revision:1},3,'same'),code('character_request_reused'));
    const privateState=await store.get('alice');
    await store.saveDraft('alice',draft('alice','midnight'),{expectedVersion:privateState.version,requestId:'private-edit'});
    assert.equal((await store.getSelection('alice')).version,3,'draft edit does not conflict with selection version');
    for(let i=0;i<CHARACTER_STORE_LIMITS.receipts;i++)await change(store,'movement',{movement:i%2?'upright':'beast'},3+i,`move-${i}`);
    await assert.rejects(change(other,'character',{revision:1},1,'same'),code('character_selection_conflict'),'expired receipt cannot replay old selection');
  });

  test(`${mode}: foreign, draft and arbitrary selection inputs cannot reach selected account state`,options,async t=>{
    const {store}=await setup(mode,t);assert.equal(typeof store.changeSelection,'function');
    await publish(store,'bob');await store.initializeSelection('alice',legacy);
    for(const command of [{type:'character',revision:0},{type:'character',revision:1,ownerId:'bob'},
      {type:'character',revision:1,definition:draft()},{type:'appearance',appearance:'jevica'},
      {type:'movement',movement:'fly'},{type:'movement',movement:'beast',character:draft()},
      {type:'appearance',appearance:'https://example.test/mesh.glb'}])
      await assert.rejects(store.changeSelection('alice',command,{expectedVersion:1,requestId:'invalid'}),code('invalid_character_selection'));
    await assert.rejects(change(store,'character',{revision:1},1,'foreign'),code('character_revision_missing'));
    await assert.rejects(store.initializeSelection('carol',{appearance:'jevica',movement:'upright'}),code('invalid_character_selection'));
    await assert.rejects(store.initializeSelection('carol',{...legacy,character:draft('carol')}),code('invalid_character_selection'));
    await assert.rejects(store.initializeSelection('carol',{...legacy,character:{...draft('carol'),revision:1}}),code('character_revision_missing'));
    for(const opts of [{expectedVersion:-1,requestId:'x'},{expectedVersion:1,requestId:''},{expectedVersion:1,requestId:'x'.repeat(65)}])
      await assert.rejects(store.changeSelection('alice',{type:'movement',movement:'beast'},opts),code('invalid_character_operation'));
    assert.deepEqual(await store.getSelection('alice'),{...legacy,version:1});
    assert.equal(await store.getSelection('carol'),null);
  });

  test(`${mode}: deletion atomically erases selection and fences pending and retried equip`,options,async t=>{
    const {store,other}=await setup(mode,t);assert.equal(typeof store.changeSelection,'function');
    await publish(store);await store.initializeSelection('alice',legacy);
    const result=await Promise.allSettled([change(other,'character',{revision:1},1,'race'),store.deleteAccount('alice')]);
    assert.equal(result[1].status,'fulfilled');
    if(result[0].status==='rejected')assert.equal(result[0].reason.code,'character_account_deleted');
    assert.equal(await store.getSelection('alice'),null);assert.equal((await store.get('alice')).deleted,true);
    await assert.rejects(change(store,'character',{revision:1},1,'race'),code('character_account_deleted'));
    await assert.rejects(store.initializeSelection('alice',legacy),code('character_account_deleted'));
  });

  test(`${mode}: concurrent private edits and selection preserve both independent versions`,options,async t=>{
    const {store,other}=await setup(mode,t);
    await publish(store);await store.initializeSelection('alice',legacy);
    await Promise.all([
      store.saveDraft('alice',draft('alice','midnight'),{expectedVersion:2,requestId:'concurrent-edit'}),
      change(other,'character',{revision:1},1,'concurrent-equip'),
    ]);
    const state=await other.get('alice'),selection=await store.getSelection('alice');
    assert.equal(state.version,3);assert.equal(state.draft.palette,'midnight');
    assert.equal(selection.version,2);assert.equal(selection.character.palette,'rose');
  });

  test(`${mode}: selection-only accounts remain readable and deletion prevents initial draft creation`,options,async t=>{
    const {store,other}=await setup(mode,t);
    await store.initializeSelection('alice',legacy);
    assert.deepEqual(await other.get('alice'),{version:0,draft:null,published:null,deleted:false});
    assert.deepEqual(await other.getSelection('alice'),{...legacy,version:1});
    await other.deleteAccount('alice');
    assert.equal(await store.getSelection('alice'),null);
    await assert.rejects(store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'late-first-edit'}),code('character_account_deleted'));
  });

  test(`${mode}: initialization migrates a verified published legacy selection exactly once`,options,async t=>{
    const {store,other}=await setup(mode,t);assert.equal(typeof store.initializeSelection,'function');
    await publish(store);const character=await store.getRevision('alice',1);
    const initialized=await store.initializeSelection('alice',{...legacy,character,version:37});
    assert.deepEqual(initialized,{...legacy,character,version:1});
    initialized.character.palette='modified';assert.equal((await other.getSelection('alice')).character.palette,'rose');
    const candidates=await Promise.all([store.initializeSelection('bob',legacy),other.initializeSelection('bob',{appearance:'woman-casual',movement:'beast'})]);
    assert.deepEqual(candidates[0],candidates[1]);
  });
}

test('Redis v1 records migrate without losing private drafts or immutable revisions',{skip:!process.env.REDIS_URL},async t=>{
  const {store,redis,prefix}=await setup('redis',t);assert.equal(typeof store.initializeSelection,'function');
  const definition=draft(),revision={...definition,revision:1};
  const id=createHash('sha256').update('alice').digest('hex'),key=`${prefix}:characters:v1`;
  await redis.hset(key,id,JSON.stringify({schemaVersion:1,version:2,deleted:false,draft:definition,revisions:[revision],receipts:[]}));
  const before=await store.get('alice');
  await store.initializeSelection('alice',{...legacy,character:revision});
  assert.deepEqual(await store.get('alice'),before);
  assert.deepEqual((await store.getSelection('alice')).character,revision);
  await store.saveDraft('alice',draft('alice','midnight'),{expectedVersion:2,requestId:'new-edit'});
  assert.equal((await store.getSelection('alice')).character.palette,'rose');
  const raw=JSON.parse(await redis.hget(key,id));
  for(const invalid of [{...raw,selection:{...raw.selection,revision:2}},{...raw,selection:{...raw.selection,appearance:'woman-casual'}},
    {...raw,selection:{...raw.selection,version:-1}},{...raw,selectionReceipts:[{id:'fake',fingerprint:'x',appliedVersion:1}]}]){
    await redis.hset(key,id,JSON.stringify(invalid));
    await assert.rejects(store.getSelection('alice'),code('invalid_character_record'));
    await assert.rejects(change(store,'movement',{movement:'beast'},1,'corrupt'),code('invalid_character_record'));
  }
  await store.deleteAccount('alice');assert.equal(await store.getSelection('alice'),null);
  const deleted=await redis.hget(key,id);assert.ok(!deleted.includes('rose')&&!deleted.includes('espresso'));
});

test('Redis selection retries recover a lost CAS reply and a failed write leaves state unchanged',{skip:!process.env.REDIS_URL},async t=>{
  const {store,redis,prefix}=await setup('redis',t);assert.equal(typeof store.changeSelection,'function');
  await publish(store);await store.initializeSelection('alice',legacy);
  let failure='before';
  const uncertain=createRedisCharacterStore({prefix,redis:{hget:(...args)=>redis.hget(...args),eval:async(...args)=>{
    if(failure==='before')throw new Error('fixture write unavailable');
    const result=await redis.eval(...args);
    if(failure==='after'){failure=null;throw new Error('fixture reply lost');}
    return result;
  }}});
  await assert.rejects(change(uncertain,'character',{revision:1},1,'durable-equip'),/fixture write unavailable/);
  assert.deepEqual(await store.getSelection('alice'),{...legacy,version:1});
  failure='after';
  await assert.rejects(change(uncertain,'character',{revision:1},1,'durable-equip'),/fixture reply lost/);
  assert.equal((await store.getSelection('alice')).version,2);
  await change(store,'movement',{movement:'beast'},2,'later-movement');
  const retried=await change(uncertain,'character',{revision:1},1,'durable-equip');
  assert.equal(retried.appliedVersion,2);assert.equal(retried.selection.version,3);assert.equal(retried.selection.movement,'beast');
});

test('selection retries use canonical command fields rather than input key order',async()=>{
  const store=createMemoryCharacterStore();await publish(store);await store.initializeSelection('alice',legacy);
  await change(store,'character',{revision:1},1,'ordered');
  const retry=await store.changeSelection('alice',{revision:1,type:'character'},{requestId:'ordered',expectedVersion:1});
  assert.equal(retry.appliedVersion,2);assert.equal(retry.selection.version,2);
  await change(store,'movement',{movement:'beast'},2,'movement-order');
  const moved=await store.changeSelection('alice',{movement:'beast',type:'movement'},{requestId:'movement-order',expectedVersion:2});
  assert.equal(moved.appliedVersion,3);
});

test('Redis rejects an unversioned private draft in a selection-only record',{skip:!process.env.REDIS_URL},async t=>{
  const {store,redis,prefix}=await setup('redis',t);await store.initializeSelection('alice',legacy);
  const key=`${prefix}:characters:v1`,id=createHash('sha256').update('alice').digest('hex');
  const raw=JSON.parse(await redis.hget(key,id));raw.draft=draft();
  await redis.hset(key,id,JSON.stringify(raw));
  await assert.rejects(store.get('alice'),code('invalid_character_record'));
});

test('receipt lookup is read-only and resolves committed retries before world cooldown validation',async()=>{
  const store=createMemoryCharacterStore();await publish(store);await store.initializeSelection('alice',legacy);
  assert.equal(typeof store.getSelectionResult,'function');
  const command={type:'character',revision:1},options={expectedVersion:1,requestId:'receipt'};
  assert.equal(await store.getSelectionResult('alice',command,options),null);
  assert.equal((await store.getSelection('alice')).version,1);
  await store.changeSelection('alice',command,options);
  await change(store,'appearance',{appearance:'woman-casual'},2,'newer');
  const result=await store.getSelectionResult('alice',{revision:1,type:'character'},options);
  assert.equal(result.appliedVersion,2);assert.equal(result.selection.version,3);assert.equal(result.selection.appearance,'woman-casual');
  await assert.rejects(store.getSelectionResult('alice',{type:'movement',movement:'beast'},options),code('character_request_reused'));
  await store.deleteAccount('alice');
  await assert.rejects(store.getSelectionResult('alice',command,options),code('character_account_deleted'));
});
