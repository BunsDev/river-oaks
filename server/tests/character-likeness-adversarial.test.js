import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createLikenessQuarantine } from '../character-likeness-quarantine.js';
import { makeLikenessFixture } from '../character-likeness-fixture.js';
import { createSharedWorld } from '../world.js';
import { characterDefinitionFor, validateCharacterDefinition } from '../../preview/src/character-definition.js';
import { createMemoryCharacterStore } from '../character-store.js';

const options={enabled:true,environment:{NODE_ENV:'test'}};
const make=()=>createLikenessQuarantine(options);
async function published(harness=make()) {
  const record=await harness.intake.submit('fixture-alice',makeLikenessFixture());
  harness.reviewer.approve('fixture-alice',record.id);
  return {...harness,id:record.id,revision:harness.intake.publish('fixture-alice',record.id)};
}

test('foreign owners cannot read, delete, revoke, moderate, publish or resolve an asset',async()=>{
  const {intake,reviewer,id,revision}=await published();
  for(const action of [intake.read,intake.delete,intake.revoke,intake.publish,reviewer.approve,reviewer.reject]) {
    assert.throws(()=>action('fixture-bob',id),{code:'likeness_unavailable'});
    assert.throws(()=>action('fixture-bob','missing'),{code:'likeness_unavailable'});
  }
  assert.deepEqual(intake.list('fixture-bob'),[]);
  assert.deepEqual(intake.resolve('fixture-bob',revision),{kind:'fallback',appearanceId:'sable-human'});
  assert.equal(intake.resolve('fixture-alice',revision).kind,'fixture');
});

for(const operation of ['delete','revoke'])test(`${operation} during validation defeats late quarantine completion`,async()=>{
  const {intake,reviewer}=make();
  const pending=intake.submit('fixture-alice',makeLikenessFixture());
  const [{id,state}]=intake.list('fixture-alice');
  assert.equal(state,'validating');
  intake[operation]('fixture-alice',id);
  await assert.rejects(pending,{code:'likeness_unavailable'});
  assert.deepEqual(intake.list('fixture-alice'),[]);
  assert.throws(()=>reviewer.approve('fixture-alice',id),{code:'likeness_unavailable'});
  assert.throws(()=>intake.publish('fixture-alice',id),{code:'likeness_unavailable'});
});

for(const operation of ['delete','revoke'])test(`${operation} after publication blocks read, signature replay and republish`,async()=>{
  const {intake,reviewer,id,revision}=await published();
  intake[operation]('fixture-alice',id);
  assert.throws(()=>intake.read('fixture-alice',id),{code:'likeness_unavailable'});
  assert.throws(()=>reviewer.approve('fixture-alice',id),{code:'likeness_unavailable'});
  assert.throws(()=>intake.publish('fixture-alice',id),{code:'likeness_unavailable'});
  assert.equal(intake.resolve('fixture-alice',revision).kind,'fallback');
});

test('duplicate concurrent publish is one immutable revision; caller cannot mutate stored release',async()=>{
  const {intake,id,revision}=await published();
  const retries=await Promise.all(Array.from({length:12},()=>Promise.resolve().then(()=>intake.publish('fixture-alice',id))));
  assert.ok(retries.every(r=>JSON.stringify(r)===JSON.stringify(revision)));
  retries[0].signature='forged';
  const resolved=intake.resolve('fixture-alice',revision);resolved.bytes.fill(0);resolved.revision.signature='forged';
  assert.deepEqual(intake.publish('fixture-alice',id),revision);
  assert.equal(intake.resolve('fixture-alice',revision).kind,'fixture');
  assert.equal(intake.resolve('fixture-alice',retries[0]).kind,'fallback');
});

test('missing asset after restart has a safe authored fallback and does not import old signatures',async()=>{
  const {revision}=await published();
  const {intake}=make();
  assert.deepEqual(intake.resolve('fixture-alice',revision),{kind:'fallback',appearanceId:'sable-human'});
  assert.deepEqual(intake.resolve('fixture-alice',null),{kind:'fallback',appearanceId:'sable-human'});
});

test('expiry invalidates an approved or published record before it can release bytes',async()=>{
  let time=100;
  const h=createLikenessQuarantine({...options,now:()=>time});
  const {id,revision}=await published(h);
  time+=3600000;
  assert.throws(()=>h.intake.publish('fixture-alice',id),{code:'likeness_unavailable'});
  assert.equal(h.intake.resolve('fixture-alice',revision).kind,'fallback');
  assert.deepEqual(h.intake.list('fixture-alice'),[]);
});

test('retained tombstones bound process memory and cannot be recycled through deletion',async()=>{
  const {intake}=make();
  for(let i=0;i<64;i++) {const r=await intake.submit('fixture-alice',makeLikenessFixture());intake.delete('fixture-alice',r.id);}
  await assert.rejects(intake.submit('fixture-alice',makeLikenessFixture()),{code:'likeness_capacity'});
});

test('default off never admits a fixture or allows moderation',async()=>{
  const {intake,reviewer}=createLikenessQuarantine();
  await assert.rejects(intake.submit('fixture-alice',makeLikenessFixture()),{code:'likeness_disabled'});
  assert.throws(()=>reviewer.approve('fixture-alice','missing'),{code:'likeness_disabled'});
  assert.equal(intake.resolve('fixture-alice',{}).kind,'fallback');
});

for(const environment of [{NODE_ENV:'production'},{NODE_ENV:'test',VERCEL_ENV:'production'},{NODE_ENV:'development',CONTEXT:'production'}])test(`production refuses enablement: ${JSON.stringify(environment)}`,()=>{
  assert.throws(()=>createLikenessQuarantine({enabled:true,environment}),{code:'likeness_production_forbidden'});
});

test('test configuration cannot override the actual production process',()=>{
  const module=new URL('../character-likeness-quarantine.js',import.meta.url).href;
  const script=`import {createLikenessQuarantine} from ${JSON.stringify(module)}; try { createLikenessQuarantine({enabled:true,environment:{NODE_ENV:'test'}}); process.exit(9); } catch(e) { if(e.code!=='likeness_production_forbidden')throw e; }`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{NODE_ENV:'production'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('likeness receipts and private metadata cannot enter canonical identity or peer snapshots',async()=>{
  const {revision}=await published();
  const world=createSharedWorld({scene:'district',bounds_m:[-30,-30,30,30],walkSpawn:[-12,0,0],collisionPolygons:[],stores:[],buildings:[],communityLocations:[]});
  world.join({userId:'fixture-alice',name:'Alice',likeness:revision,consent:'PRIVATE_SENTINEL'});
  world.join({userId:'fixture-bob',name:'Bob'});
  const before=world.snapshot();
  const definition=characterDefinitionFor('fixture-alice','sable-human',{revision:1});
  for(const injected of [{...definition,likeness:revision},{...definition,consent:'PRIVATE_SENTINEL'},{...definition,assets:[revision]},{...definition,provenance:{kind:'likeness',source:'PRIVATE_SENTINEL'}}]) {
    assert.equal(validateCharacterDefinition(injected,{ownerId:'fixture-alice'}).ok,false);
    assert.equal(world.command('fixture-alice',{type:'character',revision:1},{characterDefinition:injected}).ok,false);
  }
  assert.equal(world.command('fixture-alice',{type:'character',revision:1,likeness:revision},{characterDefinition:definition}).ok,false);
  assert.deepEqual(world.snapshot(),before);
  const publicText=JSON.stringify(world.snapshot());
  for(const forbidden of ['PRIVATE_SENTINEL',revision.signature,revision.sha256,'likeness','consent'])assert.equal(publicText.includes(forbidden),false);
  const store=createMemoryCharacterStore();
  const state=await store.get('fixture-alice');
  assert.equal(JSON.stringify(state).includes(revision.signature),false);
});

test('idle quarantine expires without another operation or advancing injected wall clock',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=createLikenessQuarantine({...options,now:()=>100});
  const {id,revision}=await published(h);
  t.mock.timers.tick(3600000);
  assert.throws(()=>h.intake.read('fixture-alice',id),{code:'likeness_unavailable'});
  assert.equal(h.intake.resolve('fixture-alice',revision).kind,'fallback');
});
