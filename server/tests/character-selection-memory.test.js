import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedWorld} from '../world.js';
import {createMemoryCharacterStore} from '../character-store.js';
import {createMemoryCharacterSelection} from '../character-selection.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';
const data={scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],communityLocations:[]};
async function fixture(overrides={}){
 let time=100000,current=true,world=createSharedWorld(data,{now:()=>time});
 const store=createMemoryCharacterStore();
 await store.saveDraft('alice',customizedCharacterDefinition('alice','sable-human',{palette:'rose'}),{expectedVersion:0,requestId:'draft'});
 await store.publish('alice',{expectedVersion:1,requestId:'publish'});
 const selection=createMemoryCharacterSelection({world:()=>world,store:{...store,...overrides},authorized:async()=>current});
 await selection.initialize('alice');world.join({userId:'alice',name:'Alice'});
 return {store,selection,world,advance:()=>{time+=2000;},revoke:()=>{current=false;},replace:()=>{world=createSharedWorld(data,{now:()=>time});selection.clear();return world;}};
}
const command={type:'character',revision:1},options={expectedVersion:1,requestId:'equip'};
test('memory selection confirms account CAS before projection and preserves authority/cooldown',async()=>{
 const f=await fixture();assert.equal(f.world.snapshot().players[0].character,undefined);
 const result=await f.selection.command('alice',command,options,{});assert.equal(result.ok,true);assert.equal(result.selectionVersion,2);
 assert.equal(f.world.snapshot().players[0].character.palette,'rose');
 assert.equal((await f.selection.command('alice',{type:'appearance',appearance:'woman-casual'},undefined,{})).error,'appearance_cooldown');
 assert.equal((await f.selection.command('alice',{type:'movement',movement:'beast'},undefined,{})).error,'beast_form_required');
 const retry=await f.selection.command('alice',command,options,{});assert.equal(retry.ok,true);assert.equal(retry.appliedVersion,2);
 f.advance();assert.equal((await f.selection.command('alice',{type:'appearance',appearance:'woman-casual'},undefined,{})).ok,true);
 const old=await f.selection.command('alice',command,options,{});assert.equal(old.ok,true);assert.equal(old.player.character,undefined);
});
test('memory unavailable writes retain the old view and pending fence until recovery',async()=>{
 let unavailable=true;const f=await fixture();const original=f.store.changeSelection;
 // Replace the callback through a separate coordinator sharing the same store.
 const selection=createMemoryCharacterSelection({world:()=>f.world,store:{...f.store,changeSelection:async(...args)=>{if(unavailable)throw new Error('offline');return original(...args);}},authorized:async()=>true});
 assert.equal((await selection.command('alice',command,options,{})).error,'character_unavailable');assert.equal(selection.hasPending('alice'),true);
 assert.equal(f.world.snapshot().players[0].character,undefined);assert.equal((await f.store.getSelection('alice')).version,1);
 assert.equal((await selection.command('alice',{type:'movement',movement:'upright'},undefined,{})).error,'character_selection_pending');
 unavailable=false;await selection.recover();assert.equal(selection.hasPending('alice'),false);assert.equal(f.world.snapshot().players[0].character.palette,'rose');
});
test('memory lost CAS reply recovers without replay and revoked/departed intents never resurrect players',async()=>{
 const f=await fixture();let lost=true,active=true;
 const selection=createMemoryCharacterSelection({world:()=>f.world,store:{...f.store,changeSelection:async(...args)=>{const value=await f.store.changeSelection(...args);if(lost){lost=false;throw new Error('lost reply');}return value;}},authorized:async()=>active});
 assert.equal((await selection.command('alice',command,options,{})).error,'character_unavailable');
 assert.equal((await f.store.getSelection('alice')).version,2);f.world.leave('alice');active=false;
 await selection.recover();assert.equal(selection.hasPending('alice'),false);assert.equal(f.world.players.size,0);
 await selection.initialize('alice');assert.equal(f.world.join({userId:'alice',name:'Alice'}).player.character.palette,'rose');
});
test('memory rechecks origin authority before an unapplied CAS and rejects malformed custom metadata',async()=>{
 const f=await fixture();f.revoke();
 assert.equal((await f.selection.command('alice',command,options,{})).error,'session_invalid');assert.equal((await f.store.getSelection('alice')).version,1);
 const g=await fixture();assert.equal((await g.selection.command('alice',command,undefined,{})).error,'invalid_character_operation');
 assert.equal((await g.selection.command('alice',{...command,ownerId:'bob'},options,{})).error,'invalid_character_selection');
});

test('memory delayed sync cannot overwrite a replacement world or a newer connection',async()=>{
 const f=await fixture();let active=f.world,delayed=false,release,started;
 const waiting=new Promise(resolve=>{started=resolve;});
 const selection=createMemoryCharacterSelection({world:()=>active,store:{...f.store,getSelection:async(...args)=>{
  const value=await f.store.getSelection(...args);if(delayed){delayed=false;started();await new Promise(resolve=>{release=resolve;});}return value;
 }},authorized:async()=>true});
 delayed=true;const stale=selection.sync('alice');await waiting;
 await f.store.changeSelection('alice',command,options);
 active=createSharedWorld(data);selection.clear();await selection.initialize('alice');active.join({userId:'alice',name:'Alice'});
 release();await stale;assert.equal(active.snapshot().players[0].character?.palette,'rose');
 let current=true,releaseAgain,startedAgain;const waitAgain=new Promise(resolve=>{startedAgain=resolve;});
 const reconnect=createMemoryCharacterSelection({world:()=>active,store:{...f.store,getSelection:async(...args)=>{
  const value=await f.store.getSelection(...args);startedAgain();await new Promise(resolve=>{releaseAgain=resolve;});return value;
 }},authorized:async()=>true});
 const oldConnection=reconnect.sync('alice',()=>current);await waitAgain;current=false;
 active.applyAccountAppearance('alice',{appearance:'woman-casual',movement:'upright'});
 releaseAgain();await oldConnection;assert.equal(active.snapshot().players[0].appearance,'woman-casual');
});
