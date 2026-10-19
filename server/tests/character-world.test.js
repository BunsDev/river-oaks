import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSharedWorld, migrateWorldCheckpoint } from '../world.js';
import { createMemoryCharacterStore } from '../character-store.js';
import { characterDefinitionFor } from '../../preview/src/character-definition.js';
import { customizedCharacterDefinition } from '../../preview/src/character-customization.js';
import { JEVICA_OWNER_USER_IDS } from '../../preview/src/shared-appearances.js';

const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],
  communityLocations:[{id:'garden',name:'Garden',position:[-12,0,0]}]};
const definition=(id='alice',revision=1,palette='rose',appearance='sable-human')=>customizedCharacterDefinition(id,appearance,{revision,palette,hair:'espresso'});
const resign=saved=>{const {checksum:_,...envelope}=saved;saved.checksum=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');return saved;};
function fixture(){
  let time=1000;const world=createSharedWorld(data,{now:()=>time});
  world.join({userId:'alice',name:'Alice'});world.join({userId:'bob',name:'Bob'});
  return {world,advance:(ms=2000)=>{time+=ms;},now:()=>time,
    equip:(value,command={type:'character',revision:value.revision})=>world.command('alice',command,{characterDefinition:value})};
}

test('only a server-resolved published revision can select a canonical character',()=>{
  const f=fixture(),look=definition();
  assert.equal(f.world.command('alice',{type:'character',revision:1}).error,'invalid_character');
  for(const value of [definition('alice',0),definition('bob'),{...look,flight:true},{...look,rig:'not-a-catalog-rig'},null]){
    assert.equal(f.world.command('alice',{type:'character',revision:1},{characterDefinition:value}).error,'invalid_character');
  }
  assert.equal(f.equip(look,{type:'character',revision:2}).error,'invalid_character');
  assert.equal(f.equip(look,{type:'character',revision:1,characterDefinition:look}).error,'invalid_character');
  assert.equal(f.equip(look,{type:'character',revision:1,userId:'bob'}).error,'invalid_character');
  const result=f.equip(look);assert.equal(result.ok,true);assert.deepEqual(result.player.character,look);
  look.palette='midnight';result.player.character.palette='lagoon';
  const snapshot=f.world.snapshot();assert.equal(snapshot.players.find(p=>p.id==='alice').character.palette,'rose');
  assert.equal(snapshot.players.find(p=>p.id==='bob').character,undefined);
  snapshot.players.find(p=>p.id==='alice').character.assets[0].sha256='changed';
  assert.notEqual(f.world.snapshot().players.find(p=>p.id==='alice').character.assets[0].sha256,'changed');
});

test('custom and legacy appearance changes share the same two-second cooldown, including clearing a same-base look',()=>{
  const f=fixture(),first=definition(),second=definition('alice',2,'midnight');
  assert.equal(f.equip(first).ok,true);
  assert.equal(f.equip(first).ok,true,'identical immutable retry is a no-op');
  assert.equal(f.equip(second).error,'appearance_cooldown');
  assert.equal(f.world.command('alice',{type:'appearance',appearance:'sable-human'}).error,'appearance_cooldown');
  f.advance(1999);assert.equal(f.equip(second).error,'appearance_cooldown');
  f.advance(1);assert.equal(f.equip(second).ok,true);
  f.advance();assert.equal(f.world.command('alice',{type:'appearance',appearance:'sable-human'}).ok,true);
  assert.equal(f.world.snapshot().players[0].character,undefined);
  assert.equal(f.equip(first).error,'appearance_cooldown','legacy selection also fences custom changes');
  f.advance();assert.equal(f.equip(first).ok,true,'selecting an earlier immutable revision is permitted');
});

test('custom selection retains Jevica and flight authority and rejects retired movement',()=>{
  const f=fixture(),owner=JEVICA_OWNER_USER_IDS[0];
  const jevica=characterDefinitionFor(owner,'jevica',{revision:1});
  assert.equal(f.equip({...jevica,ownerId:'alice'}).error,'invalid_character');
  const position=f.world.join({userId:owner,name:'Owner'}).player.position;
  f.advance(1000);assert.equal(f.world.command(owner,{type:'pose',position,yaw:0,altitude:1}).ok,true);
  assert.equal(f.world.command(owner,{type:'character',revision:1},{characterDefinition:definition(owner)}).error,'land_before_appearance');
  f.advance();assert.equal(f.world.command(owner,{type:'pose',position,yaw:0,altitude:0}).ok,true);
  assert.equal(f.world.command(owner,{type:'character',revision:1},{characterDefinition:definition(owner)}).ok,true);
  f.advance();assert.equal(f.world.command(owner,{type:'pose',position,yaw:0,altitude:1}).error,'flight_not_allowed');
  assert.equal(f.equip(definition()).ok,true);
  assert.equal(f.world.command('alice',{type:'movement',movement:'beast'}).error,'invalid_movement');
  f.advance();assert.equal(f.equip(definition('alice',2,'rose','sable-human')).ok,true);
  assert.equal(f.world.command('alice',{type:'movement',movement:'beast'}).error,'invalid_movement');
  assert.equal(f.world.snapshot().players.find(p=>p.id==='alice').movement,'upright');
});

test('selected canonical revisions and their cooldown survive departure, checkpoint recovery and geography migration',()=>{
  const f=fixture(),look=definition();assert.equal(f.equip(look).ok,true);
  const saved=f.world.checkpoint();assert.equal(saved.version,13);
  const recovered=createSharedWorld(data,{now:f.now});assert.deepEqual(recovered.restore(saved),{ok:true});
  assert.deepEqual(recovered.snapshot().players[0].character,look);
  assert.equal(recovered.command('alice',{type:'character',revision:2},{characterDefinition:definition('alice',2)}).error,'appearance_cooldown');
  recovered.leave('alice');assert.deepEqual(recovered.join({userId:'alice',name:'Back'}).player.character,look);
  const nextData={...data,title:'Rebuilt garden',walkSpawn:[-10,0,0]};
  const migration=migrateWorldCheckpoint({fromData:data,toData:nextData,checkpoint:saved,now:f.now});
  assert.equal(migration.ok,true);const moved=createSharedWorld(nextData,{now:f.now});
  assert.equal(moved.restore(migration.checkpoint).ok,true);
  assert.deepEqual(moved.join({userId:'alice',name:'Arrived'}).player.character,look);
});

test('malformed, foreign, draft and version-masquerading selected checkpoint definitions fail without mutating the live room',()=>{
  const f=fixture();assert.equal(f.equip(definition()).ok,true);const baseline=f.world.snapshot();
  for(const change of [
    saved=>{saved.payload.characters[0][1].ownerId='bob';},
    saved=>{saved.payload.characters[0][1].revision=0;},
    saved=>{saved.payload.characters[0][1].palette='unknown';},
    saved=>{saved.payload.characters[0][1].flight=true;},
    saved=>{saved.payload.characters[0][1]=characterDefinitionFor('alice','rowan-human',{revision:1});},
    saved=>{saved.payload.characters.push(structuredClone(saved.payload.characters[0]));},
    saved=>{saved.version=11;},
    saved=>{delete saved.payload.characters;},
  ]){
    const saved=f.world.checkpoint();change(saved);assert.equal(f.world.restore(resign(saved)).error,'invalid_checkpoint');
    assert.deepEqual(f.world.snapshot(),baseline);
  }
});

test('pre-character checkpoints and trusted account sync preserve the authored fallback and defensively copy selected looks',()=>{
  const f=fixture(),legacy=f.world.checkpoint();legacy.version=11;delete legacy.payload.characters;
  assert.equal(f.equip(definition()).ok,true);
  assert.equal(f.world.restore(resign(legacy)).ok,true);assert.equal(f.world.snapshot().players[0].character,undefined);
  const preference={appearance:'sable-human',movement:'upright',character:definition()};
  assert.deepEqual(f.world.applyAccountAppearance('alice',preference).character,definition());
  preference.character.palette='midnight';const read=f.world.accountAppearance('alice');assert.equal(read.character.palette,'rose');
  read.character.palette='lagoon';assert.equal(f.world.accountAppearance('alice').character.palette,'rose');
  assert.throws(()=>f.world.applyAccountAppearance('bob',{appearance:'sable-human',movement:'upright',character:definition()}),/Invalid account appearance/);
  f.world.applyAccountAppearance('alice',{appearance:'sable-human',movement:'upright'});
  assert.equal(f.world.accountAppearance('alice').character,undefined);
});

test('publishing does not equip a look; resolving and accepting it changes only its owner in the world',async()=>{
  const f=fixture(),store=createMemoryCharacterStore();
  await store.saveDraft('alice',definition('alice',0),{expectedVersion:0,requestId:'draft'});
  const published=await store.publish('alice',{expectedVersion:1,requestId:'publish'});
  assert.equal(f.world.snapshot().players[0].character,undefined);
  const resolved=await store.getRevision('alice',published.revision);
  assert.equal(f.equip(resolved).ok,true);
  assert.deepEqual(f.world.snapshot().players[0].character,(await store.get('alice')).published);
  assert.equal(f.world.snapshot().players[1].character,undefined);
});

test('selection preparation preserves appearance until confirmed projection and charges cooldown once',()=>{
  const f=fixture(),look=definition();
  assert.equal(typeof f.world.prepareAccountSelection,'function');
  const before=f.world.snapshot().players.find(p=>p.id==='alice');
  const prepared=f.world.prepareAccountSelection('alice',{type:'character',revision:1},{characterDefinition:look});
  assert.equal(prepared.ok,true);
  assert.deepEqual(f.world.snapshot().players.find(p=>p.id==='alice'),before);
  const selected={appearance:look.appearanceId,movement:'upright',character:look,version:2};
  const projected=f.world.commitAccountSelection('alice',selected,{appearanceChanged:true});
  assert.equal(projected.character.palette,'rose');
  assert.equal(f.world.command('alice',{type:'appearance',appearance:'sable-human'}).error,'appearance_cooldown');
  f.advance();
  assert.equal(f.world.prepareAccountSelection('alice',{type:'movement',movement:'beast'}).error,'invalid_movement');
  assert.equal(f.world.prepareAccountSelection('alice',{type:'pose',position:[0,0,0],yaw:0}).error,'invalid_command');
});
