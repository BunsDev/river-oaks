import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemorySocial, createRedisSocial } from '../social.js';

test('contact history is mutual, bounded, and erased with the relationship',async()=>{
  const social=createMemorySocial({now:()=>42,createId:(()=>{let id=0;return()=>String(++id);})()});
  const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'};
  assert.deepEqual(await social.list('alice'),[]);
  assert.deepEqual(await social.request(alice,bob),{ok:true});
  assert.equal((await social.request(alice,bob)).reason,'existing');
  assert.equal((await social.send(alice,'bob','Hi')).reason,'missing');
  assert.equal((await social.accept('alice','bob')).reason,'missing');
  assert.deepEqual(await social.accept('bob','alice'),{ok:true});
  for(let i=0;i<45;i++)assert.equal((await social.send(alice,'bob',`Message ${i}`)).ok,true);
  const messages=await social.messages('bob','alice');
  assert.equal(messages.length,40);assert.equal(messages[0].text,'Message 5');
  assert.equal(messages.at(-1).authorName,'Alice');
  assert.equal((await social.list('bob'))[0].peer.name,'Alice');
  assert.deepEqual(await social.remove('bob','alice'),{ok:true});
  assert.equal(await social.messages('alice','bob'),null);
  assert.deepEqual(await social.list('alice'),[]);
  assert.equal((await social.send(alice,'bob','After removal')).reason,'missing');
});

test('invalid peers and messages are rejected without creating contacts',async()=>{
  const social=createMemorySocial(),alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'};
  assert.equal((await social.request(alice,alice)).reason,'invalid');
  assert.equal((await social.request(alice,bob)).ok,true);
  assert.equal((await social.accept('bob','alice')).ok,true);
  assert.equal((await social.send(alice,'bob','x'.repeat(281))).reason,'invalid');
  assert.equal((await social.send(alice,'bob','bad\nline')).reason,'invalid');
  assert.deepEqual(await social.messages('alice','bob'),[]);
});

test('accepted contacts can invite each other to a validated world',async()=>{
  const social=createMemorySocial({now:()=>42,createId:()=> 'invite-1'});
  const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'};
  const world={id:'moon-garden',title:'Moon Garden'};
  assert.equal((await social.inviteWorld(alice,'bob',world)).reason,'missing');
  assert.equal((await social.request(alice,bob)).ok,true);
  assert.equal((await social.inviteWorld(alice,'bob',world)).reason,'missing');
  assert.equal((await social.accept('bob','alice')).ok,true);
  assert.equal((await social.inviteWorld(alice,'bob',{id:'../bad',title:'Moon Garden'})).reason,'invalid');
  assert.equal((await social.inviteWorld(alice,'bob',{id:'moon-garden',title:'Bad\nTitle'})).reason,'invalid');
  const result=await social.inviteWorld(alice,'bob',world);
  assert.deepEqual(result.message,{id:'invite-1',authorId:'alice',authorName:'Alice',text:'Come meet me in Moon Garden.',at:42,kind:'world-invite',worldId:'moon-garden',worldTitle:'Moon Garden'});
  assert.deepEqual(await social.messages('bob','alice'),[result.message]);
  assert.equal((await social.list('bob'))[0].latest.worldId,'moon-garden');
  assert.equal((await social.remove('bob','alice')).ok,true);
  assert.equal(await social.messages('bob','alice'),null);
});

test('place invitations require accepted contacts and a valid named destination',async()=>{
  const social=createMemorySocial({now:()=>42,createId:()=> 'meeting-1'});
  const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'};
  const world={id:'moon-garden',title:'Moon Garden'},place={id:'spot:plaza',name:'Moonlit Plaza'};
  assert.equal((await social.invitePlace(alice,'bob',world,place)).reason,'missing');
  await social.request(alice,bob);await social.accept('bob','alice');
  for(const bad of [{id:'../bad',name:'Plaza'},{id:'arrival',name:'Bad\nName'},{id:'spot:plaza',name:'\u202ePlaza'}])
    assert.equal((await social.invitePlace(alice,'bob',world,bad)).reason,'invalid');
  const result=await social.invitePlace(alice,'bob',world,place);
  assert.deepEqual(result.message,{id:'meeting-1',authorId:'alice',authorName:'Alice',
    text:'Meet me at Moonlit Plaza in Moon Garden.',at:42,kind:'place-invite',
    worldId:'moon-garden',worldTitle:'Moon Garden',placeId:'spot:plaza',placeName:'Moonlit Plaza'});
  assert.deepEqual(await social.messages('bob','alice'),[result.message]);
  await social.remove('bob','alice');
  assert.equal(await social.messages('bob','alice'),null);
});

test('Redis contacts admit one concurrent invitation and retain an empty accepted history', {skip:!process.env.REDIS_URL}, async t=>{
  const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
  const prefix=`{river-oaks:social-test:${randomUUID()}}`,social=createRedisSocial({redis,prefix});
  t.after(async()=>{const keys=await redis.keys(`${prefix}:social:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const alice={userId:'alice',name:'Alice'},bob={userId:'bob',name:'Bob'};
  const requests=await Promise.all([social.request(alice,bob),social.request(bob,alice)]);
  assert.equal(requests.filter(item=>item.ok).length,1);
  const requester=requests[0].ok?'alice':'bob',recipient=requester==='alice'?'bob':'alice';
  assert.deepEqual(await social.accept(recipient,requester),{ok:true});
  assert.deepEqual(await social.messages('alice','bob'),[]);
  assert.equal((await social.list('alice'))[0].latest,null);
  assert.equal((await social.list('bob'))[0].status,'accepted');
  assert.equal((await social.send(alice,'bob','Across Redis')).ok,true);
  assert.equal((await social.messages('bob','alice'))[0].text,'Across Redis');
  assert.equal((await social.inviteWorld(alice,'bob',{id:'moon-garden',title:'Moon Garden'})).ok,true);
  assert.equal((await social.messages('bob','alice'))[1].worldId,'moon-garden');
  assert.equal((await social.invitePlace(alice,'bob',{id:'moon-garden',title:'Moon Garden'},{id:'arrival',name:'Arrival'})).ok,true);
  assert.equal((await social.messages('bob','alice'))[2].placeId,'arrival');
  assert.equal((await social.remove('bob','alice')).ok,true);
  assert.deepEqual(await social.list('alice'),[]);
});
