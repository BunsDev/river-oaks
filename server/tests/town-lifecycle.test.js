import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTown } from '../town.js';

async function fixture(t) {
  const temporary=await mkdtemp(join(tmpdir(),'river-oaks-lifecycle-'));
  const town=await createTown({origin:'http://127.0.0.1:5180',devAuth:'local',staticRoot:null,
    env:{RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',
      WAITLIST_FILE:join(temporary,'waitlist.json'),MODERATION_FILE:join(temporary,'moderation.json')}});
  t.after(async()=>{await town.close();await rm(temporary,{recursive:true,force:true});});
  return town;
}

test('closed towns cannot create another room or restart its background timers',async t=>{
  const town=await fixture(t);
  await town.close();
  const entry=await town.worldFor('river-oaks');
  if(entry)await entry.game.close();
  assert.ok(entry===null,'a closed town must reject room creation');
});

test('town shutdown drains a room load already in flight and clears its timers',async t=>{
  const town=await fixture(t),intervals=[],setIntervalOriginal=globalThis.setInterval;
  t.mock.method(globalThis,'setInterval',(...args)=>{const timer=setIntervalOriginal(...args);intervals.push(timer);return timer;});
  t.after(()=>intervals.forEach(clearInterval));
  const get=town.catalog.get.bind(town.catalog);
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  t.mock.method(town.catalog,'get',async id=>{await gate;return get(id);});
  const load=town.worldFor('river-oaks');
  let finished=false;
  const closing=town.close().then(()=>{finished=true;});
  await new Promise(resolve=>setImmediate(resolve));
  const closedBeforeLoad=finished;
  release();
  const entry=await load;
  await closing;
  const running=intervals.filter(timer=>!timer._destroyed).length;
  if(entry)await entry.game.close();
  assert.equal(closedBeforeLoad,false,'shutdown must wait for the owned load');
  assert.ok(intervals.length>=2,'the fixture exercised actual room timers');
  assert.equal(running,0,'late-created room timers must be closed');
  assert.equal(await town.worldFor('river-oaks'),null);
});
