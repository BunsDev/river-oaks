import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAction } from '../profile-api.js';
import { createMemoryProfiles } from '../profiles.js';
import { createMemorySocial } from '../social.js';

test('a profile is visible in a shared room or to an accepted contact',async()=>{
  const profiles=createMemoryProfiles({now:()=>10}),social=createMemorySocial();
  const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'};
  let present=false;
  const call=(identity,action,data)=>profileAction({identity,action,profiles,social,readBody:async()=>data,
    visiblePlayer:async(_,peerId)=>present&&peerId==='alice'?{id:'alice',name:'Alice'}:null,allowWrite:async()=>true});
  assert.equal((await call(bob,'view',{peerId:'alice'})).status,404);
  const fields={tagline:'A maker of stories',bio:'Meet me by the trees.',pronouns:'they/them',interests:['Stories'],expectedVersion:0};
  assert.equal((await call(alice,'save',fields)).status,200);
  assert.equal((await call(bob,'view',{peerId:'alice'})).status,404);
  present=true;
  assert.equal((await call(bob,'view',{peerId:'alice'})).value.profile.bio,fields.bio);
  present=false;
  await social.request(bob,alice);
  assert.equal((await call(bob,'view',{peerId:'alice'})).status,404);
  await social.accept('alice','bob');
  assert.equal((await call(bob,'view',{peerId:'alice'})).value.profile.name,'Alice');
  assert.equal((await call(alice,'view',{})).value.profile.version,1);
  assert.equal((await call(bob,'save',{...fields,peerId:'alice'})).status,400);
  await social.remove('alice','bob');
  assert.equal((await call(bob,'view',{peerId:'alice'})).status,404);
});
