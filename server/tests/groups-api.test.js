import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGroups } from '../groups.js';
import { createMemorySocial } from '../social.js';
import { groupAction } from '../groups-api.js';

const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'},eve={userId:'eve',name:'Eve'};

test('group API uses authenticated contacts, not supplied names or memberships',async()=>{
  const groups=createMemoryGroups({createId:()=> 'group-1'}),social=createMemorySocial();
  const call=async(identity,action,data={})=>groupAction({action,identity,groups,social,
    readBody:async()=>data,allowWrite:async()=>true});
  assert.equal((await call(alice,'invite',{groupId:'missing',peerId:'bob'})).status,409);
  const created=await call(alice,'create',{name:'Moon Friends',description:'Across worlds'});
  assert.equal(created.status,200);
  const groupId=created.value.group.id;
  assert.equal((await call(eve,'read',{groupId})).status,404);
  assert.equal((await call(alice,'invite',{groupId,peerId:'bob',name:'Forged'})).status,400);
  assert.equal((await call(alice,'invite',{groupId,peerId:'bob'})).status,409);
  await social.request(alice,bob);await social.accept('bob','alice');
  assert.equal((await call(alice,'invite',{groupId,peerId:'bob'})).status,200);
  assert.equal((await call(bob,'read',{groupId})).status,404);
  assert.equal((await call(bob,'accept',{groupId})).status,200);
  assert.equal((await call(bob,'send',{groupId,text:'Hello group'})).status,200);
  assert.equal((await call(eve,'send',{groupId,text:'Intrusion'})).status,409);
  assert.equal((await call(eve,'read',{groupId})).status,404);
  const detail=await call(alice,'read',{groupId});
  assert.deepEqual(detail.value.group.members.map(member=>member.name),['Alice','Bob']);
  assert.equal(detail.value.group.messages[0].text,'Hello group');
});

test('group API rejects invalid input and rate limits mutations',async()=>{
  const groups=createMemoryGroups(),social=createMemorySocial();
  const call=async(action,data,allowWrite=async()=>true)=>groupAction({action,identity:alice,groups,social,
    readBody:async()=>data,allowWrite});
  assert.equal((await call('create',{name:'Safe',ownerId:'eve'})).status,400);
  assert.equal((await call('create',{name:'Safe'},async()=>false)).status,429);
  assert.equal((await call('create',{name:'Safe'})).status,200);
  assert.equal((await call('send',{groupId:'../bad',text:'Hello'})).status,400);
  assert.equal((await call('unknown',{})).status,404);
});
