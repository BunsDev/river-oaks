import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryGroups, createRedisGroups } from '../groups.js';

const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'},eve={userId:'eve',name:'Eve'};

async function exercise(groups) {
  assert.deepEqual(await groups.list('alice'),[]);
  const created=await groups.create(alice,{name:'Moon Garden Friends',description:'Meet across worlds.'});
  assert.equal(created.ok,true);
  const id=created.group.id;
  assert.equal((await groups.list('alice'))[0].role,'owner');
  assert.equal((await groups.read('eve',id)),null);
  assert.equal((await groups.send(eve,id,'Sneak in')).reason,'missing');
  assert.equal((await groups.invite(bob,id,eve)).reason,'forbidden');
  assert.equal((await groups.invite(alice,id,bob)).ok,true);
  assert.equal((await groups.list('bob'))[0].status,'invited');
  assert.equal(await groups.read('bob',id),null,'invitations do not reveal private chat');
  assert.equal((await groups.send(bob,id,'Too early')).reason,'missing');
  assert.equal((await groups.accept(eve.userId,id)).reason,'missing');
  assert.equal((await groups.accept(bob.userId,id)).ok,true);
  assert.equal((await groups.accept(bob.userId,id)).reason,'missing');
  assert.equal((await groups.send(alice,id,'Welcome to the group')).ok,true);
  assert.equal((await groups.send(bob,id,'Hello from another world')).ok,true);
  assert.deepEqual((await groups.read('bob',id)).messages.map(message=>message.text),['Welcome to the group','Hello from another world']);
  assert.equal((await groups.read('eve',id)),null);
  assert.equal((await groups.remove(bob,id,'alice')).reason,'forbidden');
  assert.equal((await groups.remove(alice,id,'bob')).ok,true);
  assert.deepEqual(await groups.list('bob'),[]);
  assert.equal((await groups.send(bob,id,'After removal')).reason,'missing');
  assert.equal((await groups.invite(alice,id,bob)).ok,true);
  assert.equal((await groups.decline('bob',id)).ok,true);
  assert.deepEqual(await groups.list('bob'),[]);
  assert.equal((await groups.leave('alice',id)).ok,true);
  assert.deepEqual(await groups.list('alice'),[]);
  assert.equal(await groups.read('alice',id),null);
}

test('memory groups enforce invitation, membership, history, removal and disband',async()=>{
  let sequence=0;
  await exercise(createMemoryGroups({now:()=>42,createId:()=>`group-${++sequence}`}));
});

test('group names, messages, and account limits are bounded',async()=>{
  let sequence=0;
  const groups=createMemoryGroups({createId:()=>`group-${++sequence}`});
  assert.equal((await groups.create(alice,{name:'\u202eSpoof'})).reason,'invalid');
  assert.equal((await groups.create(alice,{name:'x'.repeat(41)})).reason,'invalid');
  assert.equal((await groups.create(alice,{name:'Open Circle'})).ok,true);
  const id=(await groups.list('alice'))[0].id;
  assert.equal((await groups.send(alice,id,'x'.repeat(281))).reason,'invalid');
  assert.equal((await groups.send(alice,id,'line\nbreak')).reason,'invalid');
  assert.deepEqual((await groups.read('alice',id)).messages,[]);
  for(let index=0;index<65;index++)assert.equal((await groups.send(alice,id,`Message ${index}`)).ok,true);
  const messages=(await groups.read('alice',id)).messages;
  assert.equal(messages.length,60);assert.equal(messages[0].text,'Message 5');
  for(let index=0;index<11;index++)assert.equal((await groups.create(alice,{name:`Circle ${index}`})).ok,true);
  assert.equal((await groups.create(alice,{name:'Too many'})).reason,'limit');
  assert.equal((await groups.invite(alice,id,bob)).ok,true);
  assert.equal((await groups.invite(alice,id,bob)).reason,'existing');
});

test('Redis groups preserve the same access rules across instances', {skip:!process.env.REDIS_URL},async t=>{
  const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
  const prefix=`{river-oaks:groups-test:${randomUUID()}}`;
  const first=createRedisGroups({redis,prefix,now:()=>42});
  const second=createRedisGroups({redis,prefix,now:()=>43});
  t.after(async()=>{await redis.del(`${prefix}:groups:records`,`${prefix}:groups:index`);await redis.quit();});
  const created=await first.create(alice,{name:'Moon Garden Friends'}),id=created.group.id;
  assert.equal((await second.invite(alice,id,bob)).ok,true);
  assert.equal((await first.accept('bob',id)).ok,true);
  assert.equal((await second.send(bob,id,'Across instances')).ok,true);
  assert.equal((await first.read('alice',id)).messages[0].text,'Across instances');
  assert.equal((await first.send(eve,id,'Private')).reason,'missing');
  await redis.hset(`${prefix}:groups:index`,'eve',JSON.stringify([id]));
  assert.deepEqual(await second.list('eve'),[],'a stale or forged account index cannot reveal a private group');
  await redis.hdel(`${prefix}:groups:index`,'eve');
  assert.equal((await second.leave('alice',id)).ok,true);
  assert.deepEqual(await first.list('bob'),[]);
  await exercise(createRedisGroups({redis,prefix}));
});
