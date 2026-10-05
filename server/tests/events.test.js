import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryEvents, createRedisEvents } from '../events.js';

const actor={userId:'host',name:'Host'},venue={worldId:'moon-garden',worldTitle:'Moon Garden',placeId:'arrival',placeName:'Arrival'};
const draft={title:'Moonlit stories',description:'Bring a story.\nMeet beneath the stars.',placeId:'arrival',startsAt:1_000_000,endsAt:4_600_000,capacity:2};
async function exercise(events) {
  const created=await events.create(actor,draft,venue);assert.equal(created.ok,true);const id=created.event.id;
  assert.equal(created.event.attending,1);assert.equal(created.event.going,true);
  assert.equal((await events.rsvp('host',id,false)).reason,'event_host');
  assert.equal((await events.rsvp('guest',id,true)).ok,true);
  assert.equal((await events.rsvp('guest',id,true)).ok,true,'a repeated RSVP does not use another place');
  assert.equal((await events.rsvp('other',id,true)).reason,'event_full');
  const publicEvent=(await events.list('guest'))[0];
  assert.equal(publicEvent.attending,2);assert.equal(publicEvent.going,true);
  assert.equal('attendees' in publicEvent,false);assert.equal('hostId' in publicEvent,false);
  assert.equal((await events.cancel('guest',id)).reason,'event_forbidden');
  assert.equal((await events.rsvp('guest',id,false)).ok,true);
  assert.equal((await events.rsvp('other',id,true)).ok,true);
  assert.equal((await events.list('jevica',true))[0].canCancel,true);
  assert.equal((await events.cancel('jevica',id,true)).ok,true);
  assert.equal((await events.rsvp('other',id,true)).reason,'event_missing');
  assert.deepEqual(await events.list('host'),[]);
}
test('events enforce capacity, idempotent RSVP, privacy and host/admin cancellation',async()=>{
  await exercise(createMemoryEvents({now:()=>0}));
});
test('calendar bounds time, input, host limits and reclaims expired events',async()=>{
  let now=0;const events=createMemoryEvents({now:()=>now});
  for(const change of [{hostId:'forged'},{worldId:'forged'},{title:'\u202eSpoof'},{startsAt:-1},{endsAt:1_000_001},{capacity:33},
    {description:'x'.repeat(401)},{description:'Unsafe\u0001text'},{startsAt:31*86_400_000}])assert.equal((await events.create(actor,{...draft,...change},venue)).reason,'invalid_event');
  assert.equal((await events.create(actor,draft,{...venue,placeId:'fake'})).reason,'invalid_event');
  for(let i=0;i<5;i++)assert.equal((await events.create(actor,draft,venue)).ok,true);
  assert.equal((await events.create(actor,draft,venue)).reason,'event_limit');
  now=draft.endsAt;assert.deepEqual(await events.list('host'),[]);
  assert.equal((await events.create(actor,{...draft,startsAt:now+1000,endsAt:now+3_601_000},venue)).ok,true);
});
test('calendar capacity is global and host cancellation removes the stored record',async()=>{
  const events=createMemoryEvents({now:()=>0});let first;
  for(let index=0;index<128;index++){
    const result=await events.create({userId:`host-${index}`,name:'Host'},draft,venue);assert.equal(result.ok,true);first??=result.event;
  }
  assert.equal((await events.create(actor,draft,venue)).reason,'event_limit');
  assert.equal((await events.cancel('host-0',first.id)).ok,true);
  assert.equal((await events.create(actor,draft,venue)).ok,true);
});
test('Redis calendar persists and atomically admits only the last available RSVP', {skip:!process.env.REDIS_URL},async t=>{
  const redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});
  const prefix=`{river-oaks:events-test:${randomUUID()}}`;let now=0;
  t.after(async()=>{await redis.del(`${prefix}:events:v1`);await redis.quit();});
  const first=createRedisEvents({redis,prefix,now:()=>now}),second=createRedisEvents({redis,prefix,now:()=>now});
  await exercise(first);
  const {event}=await first.create(actor,draft,venue);
  const results=await Promise.all([first.rsvp('alice',event.id,true),second.rsvp('bob',event.id,true)]);
  assert.equal(results.filter(result=>result.ok).length,1);
  assert.equal(results.find(result=>!result.ok).reason,'event_full');
  assert.equal((await second.list('host'))[0].attending,2);
  for(let i=0;i<4;i++)assert.equal((await second.create(actor,draft,venue)).ok,true);
  assert.equal((await first.create(actor,draft,venue)).reason,'event_limit');
  now=draft.endsAt;assert.deepEqual(await first.list('host'),[]);
  assert.equal(await redis.hlen(`${prefix}:events:v1`),0);
});
