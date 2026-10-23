import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { plazaSalonSeats, chessSeat } from '../../preview/src/plaza-salon-plan.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';
const data=await loadDistrictData({districtRevision:COMMONS_REVISION});

test('Commons chairs use existing authority, shared game rules and checkpoint recovery',async()=>{
  let time=1000;const world=createSharedWorld(data,{now:()=>time});
  const command=(id,message)=>{time+=2000;return world.command(id,message);};
  for(const [chair,id] of ['alice','bob'].entries()){
    world.join({userId:id,name:id});const buildId=`bench:plaza-salon-chess-commons-${chair}`;
    const seat=plazaSalonSeats(data).find(s=>s.buildId===buildId);
    assert.deepEqual(chessSeat(buildId),{tableId:'chess-commons',chair});
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,false,'remote seating rejected');
    assert.equal(command(id,{type:'travel',position:seat.approach}).ok,true);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,true);
  }
  assert.equal(command('alice',{type:'tableGame',action:'invite',kind:'chess',side:'w'}).ok,true);
  assert.equal(command('bob',{type:'tableGame',action:'accept'}).ok,true);
  for(const [id,move] of [['alice','f2f3'],['bob','e7e5'],['alice','g2g4'],['bob','d8h4']])assert.equal(command(id,{type:'tableGame',action:'move',move}).ok,true);
  const table=world.snapshot().tables.find(t=>t.id==='chess-commons');
  assert.equal(table.result.winner,'b');assert.equal(table.moves.length,4);
  // A simultaneous District game must survive removal of the Commons table.
  for(const [chair,id] of ['carol','dave'].entries()){
    world.join({userId:id,name:id});
    const buildId=`bench:plaza-salon-chess-west-${chair}`;
    const seat=plazaSalonSeats(data).find(s=>s.buildId===buildId);
    assert.equal(command(id,{type:'travel',position:seat.approach}).ok,true);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,true);
  }
  assert.equal(command('carol',{type:'tableGame',action:'invite',kind:'chess',side:'w'}).ok,true);
  assert.equal(command('dave',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(command('carol',{type:'tableGame',action:'move',move:'e2e4'}).ok,true);
  const districtTable=structuredClone(world.snapshot().tables.find(t=>t.id==='chess-west'));
  const saved=world.checkpoint(),restored=createSharedWorld(data,{now:()=>time});
  assert.equal(restored.restore(saved).ok,true);assert.deepEqual(restored.snapshot().tables,world.snapshot().tables);
  // A configuration rollback leaves removed chairs using normal game departure rules.
  const gardens=await loadDistrictData({districtRevision:'river-oaks-gardens-3'});
  const rollback=recoverDistrictCommonsCheckpoint({worldData:gardens,checkpoint:saved,now:()=>time});
  assert.equal(rollback.ok,true);
  const returned=createSharedWorld(gardens,{now:()=>time});assert.equal(returned.restore(rollback.checkpoint).ok,true);
  assert.deepEqual(returned.snapshot().tables,[districtTable],'only removed-table game ends; District game remains exact');
  assert.deepEqual(returned.snapshot().players.map(p=>p.id),['alice','bob','carol','dave']);
  assert.ok(returned.snapshot().players.filter(p=>['carol','dave'].includes(p.id)).every(p=>p.sitting?.buildId.startsWith('bench:plaza-salon-chess-west-')));
  assert.ok(returned.snapshot().players.filter(p=>['alice','bob'].includes(p.id)).every(p=>!p.sitting&&p.position[0]<gardens.bounds_m[2]));
});
