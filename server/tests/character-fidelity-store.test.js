import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Redis from 'ioredis';
import {createMemoryCharacterStore,createRedisCharacterStore} from '../character-store.js';
import {characterDefinitionFor,validateCharacterDefinition} from '../../preview/src/character-definition.js';
import {characterFidelityContract} from '../../preview/src/character-fidelity-contract.js';

for(const backend of ['memory','redis']) test(`${backend}: realistic human variants publish, equip and reload with exact owned asset pins`,{skip:backend==='redis'&&!process.env.REDIS_URL,timeout:30000},async t=>{
 let store,reader;
 if(backend==='redis'){
  const redis=new Redis(process.env.REDIS_URL),peer=new Redis(process.env.REDIS_URL),prefix=`{fidelity-test:${randomUUID()}}`;
  redis.on('error',()=>{});peer.on('error',()=>{});store=createRedisCharacterStore({redis,prefix});reader=createRedisCharacterStore({redis:peer,prefix});
  t.after(async()=>{const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await Promise.all([redis.quit(),peer.quit()]);});
 }else store=reader=createMemoryCharacterStore();
 const owner='fidelity-owner';let version=0;
 await store.initializeSelection(owner,{appearance:'sable-human',movement:'upright'});
 for(const [index,id] of ['morgan-human','imani-human'].entries()){
  const definition=characterDefinitionFor(owner,id);
  await store.saveDraft(owner,definition,{expectedVersion:version++,requestId:`draft-${index}`});
  const publication=await store.publish(owner,{expectedVersion:version++,requestId:`publish-${index}`});
  const equipped=await store.changeSelection(owner,{type:'character',revision:publication.revision},{expectedVersion:index+1,requestId:`equip-${index}`});
  assert.equal(equipped.selection.character.appearanceId,id);
  const reloaded=(await reader.get(owner)).published;
  assert.equal(validateCharacterDefinition(JSON.parse(JSON.stringify(reloaded)),{ownerId:owner}).ok,true);
  assert.equal(reloaded.assets[0].sha256,characterFidelityContract(reloaded.rig).asset.sha256);
  assert.equal((await reader.getSelection(owner)).character.appearanceId,id);
 }
 const bad=characterDefinitionFor(owner,'morgan-human');bad.assets[0].sha256='0'.repeat(64);
 await assert.rejects(store.saveDraft(owner,bad,{expectedVersion:version,requestId:'bad-pin'}),error=>error.code==='invalid_character_definition');
 assert.equal((await reader.get('other-owner')).published,null);
});
