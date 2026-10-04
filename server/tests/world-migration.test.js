import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedWorld, migrateWorldCheckpoint } from '../world.js';

const base={scene:'district',title:'First Garden',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],
  collisionPolygons:[[[-3,-8],[3,-8],[3,8],[-3,8]]],stores:[],buildings:[],
  communityLocations:[
    {id:'a',name:'Garden',position:[-12,0,0]},
    {id:'b',name:'Gallery',position:[12,0,0]},
    {id:'c',name:'Plaza',position:[0,15,0]},
    {id:'d',name:'Cafe',position:[-12,10,0]},
  ]};
const options={worldId:'creator-garden',now:()=>1000,isAdmin:()=>true};

test('a geography migration keeps creations, designs, appearance, and chat while respawning players',()=>{
  const old=createSharedWorld(base,options);
  assert.equal(old.join({userId:'a',name:'Alice'}).ok,true);
  assert.equal(old.join({userId:'b',name:'Bob'}).ok,true);
  const build=old.command('a',{type:'build',action:'place',kind:'seat',finish:'rose',position:[-12,3],yaw:0}).item;
  const design=old.command('a',{type:'inventory',action:'save',buildId:build.id}).item;
  assert.equal(old.command('a',{type:'appearance',appearance:'woman-tailored'}).ok,true);
  assert.equal(old.command('a',{type:'chat',text:'Welcome to the garden'}).ok,true);
  const changed={...base,title:'Revised Garden'};
  const migrated=migrateWorldCheckpoint({fromData:base,toData:changed,checkpoint:old.checkpoint(),...options});
  assert.equal(migrated.ok,true);
  assert.equal(migrated.disconnectedPlayers,2);
  const next=createSharedWorld(changed,options);
  assert.deepEqual(next.restore(migrated.checkpoint),{ok:true});
  assert.deepEqual(next.snapshot().players,[]);
  assert.deepEqual(next.snapshot().builds,[build]);
  assert.equal(next.snapshot().chat[0].text,'Welcome to the garden');
  assert.equal(next.join({userId:'a',name:'Alice'}).player.appearance,'woman-tailored');
  assert.deepEqual(next.command('a',{type:'inventory',action:'list'}).items,[design]);
  assert.equal(createSharedWorld(base,options).restore(migrated.checkpoint).ok,false);
});

test('a revision that collides with a placed creation leaves the old checkpoint untouched',()=>{
  const old=createSharedWorld(base,options);
  old.join({userId:'a',name:'Alice'});
  old.command('a',{type:'build',action:'place',kind:'seat',finish:'rose',position:[-12,3],yaw:0});
  const checkpoint=old.checkpoint(),serialized=JSON.stringify(checkpoint);
  const blocked={...base,collisionPolygons:[...base.collisionPolygons,[[-14,2],[-10,2],[-10,5],[-14,5],[-14,2]]]};
  const migrated=migrateWorldCheckpoint({fromData:base,toData:blocked,checkpoint,...options});
  assert.equal(migrated.ok,false);
  assert.equal(migrated.error,'incompatible_region');
  assert.equal(JSON.stringify(checkpoint),serialized);
  assert.deepEqual(createSharedWorld(base,options).restore(checkpoint),{ok:true});
});

test('a migration rejects an unverified source checkpoint',()=>{
  const old=createSharedWorld(base,options);
  const checkpoint=old.checkpoint();checkpoint.payload.revision++;
  assert.equal(migrateWorldCheckpoint({fromData:base,toData:{...base,title:'Changed'},checkpoint,...options}).error,'invalid_checkpoint');
});
