import test from 'node:test';
import assert from 'node:assert/strict';
import {characterDefinitionFor,validateCharacterDefinition,migrateStoredCharacterDefinition} from '../../preview/src/character-definition.js';
import {LEGACY_APPEARANCES,JEVICA_OWNER_USER_IDS} from '../../preview/src/shared-appearances.js';
import {createRedisCharacterStore} from '../character-store.js';
import {createRedisAvatarPreferences} from '../avatar-preferences.js';
const owner=JEVICA_OWNER_USER_IDS[0];
const retired=(old,id,revision)=>({...characterDefinitionFor(owner,id,{revision}),appearanceId:old,outfit:old,form:'beast'});
test('storage reads migrate each retired form while new writes remain strict',()=>{
 for(const [old,id] of Object.entries(LEGACY_APPEARANCES)){
  if(old==='midnight-host-hybrid')continue;
  const value=retired(old,id,2),saved=structuredClone(value),result=migrateStoredCharacterDefinition(value,{ownerId:owner});
  assert.equal(result.ok,true,old);assert.equal(result.definition.appearanceId,id);assert.equal(result.definition.revision,2);assert.deepEqual(value,saved);
  assert.equal(validateCharacterDefinition(value,{ownerId:owner}).ok,false);
  for(const change of [{ownerId:'stranger'},{rig:'foreign'},{outfit:id},{attachments:['untrusted']},{form:'human'}])
   assert.equal(migrateStoredCharacterDefinition({...value,...change},{ownerId:owner}).ok,false,`${old} invalid migration`);
 }
});
test('persisted drafts, revisions and selection preserve ownership and revision numbers on migration',async()=>{
 const old='woman-casual',id='sable-human';
 const raw=JSON.stringify({schemaVersion:2,version:2,deleted:false,draft:retired(old,id,0),revisions:[retired(old,id,1)],receipts:[],selection:{version:1,appearance:old,movement:'beast',revision:1},selectionReceipts:[]});
 const redis={hget:async()=>raw,eval:async()=>{throw new Error('read must not write');}};
 const store=createRedisCharacterStore({redis,prefix:'{human-migration}'});
 const state=await store.get(owner),selection=await store.getSelection(owner);
 assert.equal(state.draft.appearanceId,id);assert.equal(state.published.appearanceId,id);assert.equal(state.published.revision,1);
 assert.equal(selection.movement,'upright');assert.equal(selection.character.appearanceId,id);assert.equal(selection.version,1);
 await assert.rejects(store.saveDraft(owner,retired(old,id,0),{expectedVersion:2,requestId:'new-beast'}),e=>e.code==='invalid_character_definition');
});
test('legacy account preferences return human appearance and upright movement',async()=>{
 const raw=JSON.stringify({version:3,appearance:'woman-casual',movement:'beast',character:retired('woman-casual','sable-human',1)});
 const prefs=createRedisAvatarPreferences({redis:{hget:async()=>raw,eval:async()=>{throw new Error('read must not write');}},prefix:'{human-preferences}'});
 const value=await prefs.get(owner);assert.equal(value.appearance,'sable-human');assert.equal(value.movement,'upright');assert.equal(value.version,3);assert.equal(value.character.revision,1);
});
