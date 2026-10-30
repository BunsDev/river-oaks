import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createCharacterStore, createMemoryCharacterStore, createRedisCharacterStore, CHARACTER_STORE_LIMITS } from '../character-store.js';
import { customizedCharacterDefinition } from '../../preview/src/character-customization.js';
import { recipeCharacterDefinition, validateCharacterDefinition } from '../../preview/src/character-definition.js';
import { CUSTOM_APPEARANCE_ID, rollCharacterRecipe } from '../../preview/src/character-recipe.js';

const draft=(owner='alice',palette='rose')=>customizedCharacterDefinition(owner,'sable-human',{palette,hair:'espresso'});
const code=expected=>error=>error.code===expected;
const fixtures={
  memory:async()=>({store:createMemoryCharacterStore(),close:async()=>{}}),
  redis:async()=>{
    const redis=new Redis(process.env.REDIS_URL),peer=new Redis(process.env.REDIS_URL),prefix=`{character-test:${randomUUID()}}`;
    redis.on('error',()=>{});peer.on('error',()=>{});
    return {store:createRedisCharacterStore({redis,prefix}),other:createRedisCharacterStore({redis:peer,prefix}),redis,prefix,
      close:async()=>{const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await Promise.all([redis.quit(),peer.quit()]);}};
  },
};

for(const [backend,setup] of Object.entries(fixtures)){
  const options={skip:backend==='redis'&&!process.env.REDIS_URL,timeout:30000};
  test(`${backend}: private draft, immutable publication, rollback and defensive copies`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f;
    assert.deepEqual(await store.get('alice'),{version:0,draft:null,published:null,deleted:false});
    const input=draft();
    const saved=await store.saveDraft('alice',input,{expectedVersion:0,requestId:'draft-1'});
    assert.equal(saved.appliedVersion,1);assert.deepEqual(saved.state.draft,input);
    input.palette='changed';saved.state.draft.palette='changed';
    assert.equal((await store.get('alice')).draft.palette,'rose');
    assert.equal((await store.get('bob')).draft,null);
    const published=await store.publish('alice',{expectedVersion:1,requestId:'publish-1'});
    assert.equal(published.revision,1);assert.equal(published.state.published.revision,1);
    assert.equal(published.state.draft.revision,0);
    await store.saveDraft('alice',draft('alice','midnight'),{expectedVersion:2,requestId:'draft-2'});
    const second=await store.publish('alice',{expectedVersion:3,requestId:'publish-2'});
    assert.equal(second.revision,2);
    assert.equal((await store.getRevision('alice',1)).palette,'rose');
    assert.equal(await store.getRevision('bob',1),null);
    const rollback=await store.rollback('alice',1,{expectedVersion:4,requestId:'rollback-1'});
    assert.equal(rollback.revision,3);assert.equal(rollback.state.published.palette,'rose');
    assert.equal(rollback.state.draft.palette,'midnight','rollback must not destroy a private edit');
    assert.equal((await store.getRevision('alice',2)).palette,'midnight');
    rollback.state.published.palette='changed';
    assert.equal((await store.getRevision('alice',3)).palette,'rose');
  });

  test(`${backend}: concurrent editors conflict and retries cannot duplicate publication`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f,other=f.other??store;
    const writes=await Promise.allSettled([
      store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'editor-a'}),
      other.saveDraft('alice',draft('alice','midnight'),{expectedVersion:0,requestId:'editor-b'}),
    ]);
    assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(writes.find(r=>r.status==='rejected').reason.code,'character_conflict');
    const publications=await Promise.all([
      store.publish('alice',{expectedVersion:1,requestId:'same-publish'}),
      other.publish('alice',{expectedVersion:1,requestId:'same-publish'}),
    ]);
    assert.deepEqual(publications.map(p=>p.revision),[1,1]);
    assert.equal((await store.get('alice')).version,2);
    await assert.rejects(store.publish('alice',{expectedVersion:2,requestId:'same-publish'}),code('character_request_reused'));
    await store.saveDraft('alice',draft(),{expectedVersion:2,requestId:'later-edit'});
    const retry=await store.publish('alice',{expectedVersion:1,requestId:'same-publish'});
    assert.equal(retry.appliedVersion,2);assert.equal(retry.state.version,3,'a retry returns current state without applying again');
    assert.equal(await store.getRevision('alice',2),null);
  });

  test(`${backend}: untrusted fields, foreign owners and unavailable revisions fail closed`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f;
    for(const value of [{...draft(),ownerId:'bob'},{...draft(),revision:1},{...draft(),admin:true},
      {...draft(),rig:'https://example.test/upload.glb'},{...draft(),appearanceId:'jevica'}]){
      await assert.rejects(store.saveDraft('alice',value,{expectedVersion:0,requestId:'invalid'}),code('invalid_character_definition'));
    }
    await assert.rejects(store.saveDraft('bad owner',draft(),{expectedVersion:0,requestId:'invalid'}),code('invalid_character_owner'));
    for(const opts of [{expectedVersion:-1,requestId:'invalid'},{expectedVersion:0,requestId:''},{expectedVersion:0,requestId:'x'.repeat(65)}])
      await assert.rejects(store.publish('alice',opts),code('invalid_character_operation'));
    await assert.rejects(store.publish('alice',{expectedVersion:0,requestId:'empty'}),code('character_draft_missing'));
    await assert.rejects(store.rollback('alice',1,{expectedVersion:0,requestId:'missing'}),code('character_revision_missing'));
    assert.equal((await store.get('alice')).version,0);
  });

  test(`${backend}: deletion removes character data and rejects stale resurrection`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f;
    await store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'edit'});
    await store.publish('alice',{expectedVersion:1,requestId:'publish'});
    await store.deleteAccount('alice');await store.deleteAccount('alice');
    assert.deepEqual(await store.get('alice'),{version:3,draft:null,published:null,deleted:true});
    assert.equal(await store.getRevision('alice',1),null);
    await assert.rejects(store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'old-edit'}),code('character_account_deleted'));
    await assert.rejects(store.publish('alice',{expectedVersion:1,requestId:'publish'}),code('character_account_deleted'));
    await store.deleteAccount('bob');
    await assert.rejects(store.saveDraft('bob',draft('bob'),{expectedVersion:0,requestId:'first-edit'}),code('character_account_deleted'));
    if(f.redis){const raw=await f.redis.hvals(`${f.prefix}:characters:v1`);assert.ok(raw.every(v=>!v.includes('rose')&&!v.includes('alice')&&!v.includes('assets')));}
  });

  test(`${backend}: deletion wins a race with an in-flight edit`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f;
    await store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'first-edit'});
    const results=await Promise.allSettled([
      (f.other??store).saveDraft('alice',draft('alice','midnight'),{expectedVersion:1,requestId:'racing-edit'}),
      store.deleteAccount('alice'),
    ]);
    assert.equal(results[1].status,'fulfilled');
    if(results[0].status==='rejected')assert.equal(results[0].reason.code,'character_account_deleted');
    const state=await store.get('alice');assert.equal(state.deleted,true);assert.equal(state.draft,null);
  });

  test(`${backend}: revision capacity preserves existing immutable records`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f;
    await store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'edit'});
    for(let i=0;i<CHARACTER_STORE_LIMITS.revisions;i++)await store.publish('alice',{expectedVersion:i+1,requestId:`publish-${i}`});
    await assert.rejects(store.publish('alice',{expectedVersion:CHARACTER_STORE_LIMITS.revisions+1,requestId:'overflow'}),code('character_revision_capacity'));
    assert.equal((await store.getRevision('alice',1)).revision,1);
    assert.equal((await store.get('alice')).published.revision,CHARACTER_STORE_LIMITS.revisions);
    // The first receipt has expired. Its stale CAS still prevents a duplicate
    // write rather than treating this old request as a new operation.
    await assert.rejects(store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'edit'}),code('character_conflict'));
  });

  test(`${backend}: account capacity includes tombstones without blocking existing account deletion`,options,async t=>{
    const f=await setup();t.after(f.close);const {store}=f;
    await store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'edit'});
    for(let i=1;i<CHARACTER_STORE_LIMITS.accounts;i++)await store.deleteAccount(`deleted-${i}`);
    await assert.rejects(store.saveDraft('bob',draft('bob'),{expectedVersion:0,requestId:'overflow'}),code('character_account_capacity'));
    await assert.rejects(store.initializeSelection('carol',{appearance:'sable-human',movement:'upright'}),code('character_account_capacity'));
    await store.deleteAccount('alice');assert.equal((await store.get('alice')).deleted,true);
    assert.equal((await store.get('bob')).version,0,'refused admission creates no partial record');
  });
}

test('Redis persisted corruption is rejected rather than repaired or published',{skip:!process.env.REDIS_URL},async t=>{
  const f=await fixtures.redis();t.after(f.close);
  await f.store.saveDraft('alice',draft(),{expectedVersion:0,requestId:'edit'});
  const key=`${f.prefix}:characters:v1`,[id]=await f.redis.hkeys(key),raw=JSON.parse(await f.redis.hget(key,id));
  for(const invalid of [{...raw,admin:true},{...raw,draft:{...raw.draft,ownerId:'bob'}},{...raw,version:-1}]){
    await f.redis.hset(key,id,JSON.stringify(invalid));
    await assert.rejects(f.store.get('alice'),code('invalid_character_record'));
    await assert.rejects(f.store.publish('alice',{expectedVersion:1,requestId:'bad-publish'}),code('invalid_character_record'));
  }
  await f.store.deleteAccount('alice');
  assert.equal((await f.store.get('alice')).deleted,true,'corruption must not prevent deletion of private data');
});

// The recipe gained a `build` (body type) on 2026-10-29. People published before it are
// stored without the field: the store reads them as a neutral build, their revisions
// equip and select exactly, and a tampered build is still corruption, not repaired.
test('memory: a stored recipe revision from before the build reads, equips and selects as a neutral build',async()=>{
  const records=new Map();
  const store=createCharacterStore({async get(id){return records.get(id)??null;},async compareAndSet(id,old,raw){if((records.get(id)??null)!==old)return false;records.set(id,raw);return true;}});
  const recipe=rollCharacterRecipe({random:()=>.37}),definition=recipeCharacterDefinition('alice',recipe);
  await store.saveDraft('alice',definition,{expectedVersion:0,requestId:'draft'});
  await store.publish('alice',{expectedVersion:1,requestId:'publish'});
  const [id]=records.keys(),stored=JSON.parse(records.get(id));
  const strip=({build:_build,...parameters})=>parameters;
  stored.revisions=stored.revisions.map(item=>({...item,parameters:strip(item.parameters)}));
  if(stored.draft)stored.draft={...stored.draft,parameters:strip(stored.draft.parameters)};
  records.set(id,JSON.stringify(stored));
  assert.equal(Object.hasOwn(JSON.parse(records.get(id)).revisions[0].parameters,'build'),false,'the stored record has no build');
  const read=await store.get('alice');
  assert.equal(read.published.parameters.build,0);
  assert.deepEqual(read.published,recipeCharacterDefinition('alice',{...strip(recipe),build:0},{revision:1}));
  assert.equal((await store.getRevision('alice',1)).parameters.build,0);
  // A client that loaded the person (so its copy carries build 0) selects the stored revision.
  const selection=await store.initializeSelection('alice',{appearance:CUSTOM_APPEARANCE_ID,movement:'upright',character:recipeCharacterDefinition('alice',{...strip(recipe),build:0},{revision:1})});
  assert.equal(selection.character.revision,1);assert.equal(selection.character.parameters.build,0);
  // So does a client sending the record exactly as stored, without the field.
  const legacyRecord={...recipeCharacterDefinition('alice',recipe,{revision:1}),parameters:strip(recipe)};
  await store.changeSelection('alice',{type:'appearance',appearance:'sable-human'},{expectedVersion:1,requestId:'authored'});
  const equipped=await store.changeSelection('alice',{type:'character',revision:1},{expectedVersion:2,requestId:'equip'});
  assert.equal(equipped.selection.character.parameters.build,0);
  assert.equal(JSON.stringify(equipped.selection.character),JSON.stringify(recipeCharacterDefinition('alice',{...strip(recipe),build:0},{revision:1})));
  assert.equal(validateCharacterDefinition(legacyRecord,{ownerId:'alice'}).ok,true);
  // A build the catalogue refuses is corruption, not something to repair.
  const tampered=JSON.parse(records.get(id));tampered.revisions[0].parameters.build=7;records.set(id,JSON.stringify(tampered));
  await assert.rejects(store.get('alice'),code('invalid_character_record'));
});
