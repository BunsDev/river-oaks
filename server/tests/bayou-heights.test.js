import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictHeightsCheckpoint } from '../district-heights-checkpoint-migration.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonSeats } from '../../preview/src/plaza-salon-plan.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION, HEIGHTS_TABLE, inBayouHeights } from '../../shared/bayou-heights-layout.js';
const garage=await loadDistrictData(),gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const commons=await loadDistrictData({districtRevision:COMMONS_REVISION}),heights=await loadDistrictData({districtRevision:HEIGHTS_REVISION});
const layout=heights.eastGardenCommons,frame=([x,y])=>[layout.edge+x,-1335+y],west=layout.heights.bounds[0];

test('two server-owned players walk from the District over the footbridge to Heights Hall and back',()=>{
  let time=1000;
  const fixture={...heights,walkSpawn:[...frame([-1,1.5]),layout.ground]};
  const town=createSharedWorld(fixture,{now:()=>time}),environment=createWalkingEnvironment(fixture);
  for(const id of ['alice','bob'])assert.equal(town.join({userId:id,name:id}).ok,true);
  const starts=new Map(town.snapshot().players.map(p=>[p.id,[...p.position]]));
  // Quarter-metre poses every 100 ms: an ordinary walking pace, checked by the town each step.
  const walk=(direction,until)=>{
    for(let i=0;i<2000&&!town.snapshot().players.every(until);i++){
      time+=100;
      for(const player of town.snapshot().players){
        if(until(player))continue;
        const x=player.position[0]+direction*.25,n=player.position[1];
        const result=town.command(player.id,{type:'pose',position:[x,n,environment.groundAt(x,-n)],yaw:direction>0?-Math.PI/2:Math.PI/2,altitude:0});
        assert.equal(result.ok,true,`${player.id} at ${x-layout.edge}: ${JSON.stringify(result)}`);
      }
    }
  };
  walk(1,p=>p.position[0]>layout.edge+400);
  for(const p of town.snapshot().players)assert.ok(inBayouHeights(layout,p.position[0])&&p.position[0]>layout.edge+400,`${p.id} reached Heights Hall`);
  const restored=createSharedWorld(fixture,{now:()=>time});
  assert.deepEqual(restored.restore(town.checkpoint()),{ok:true});
  assert.deepEqual(restored.snapshot().players.map(p=>p.position),town.snapshot().players.map(p=>p.position));
  walk(-1,p=>p.position[0]<=starts.get(p.id)[0]+1e-6);
  for(const p of town.snapshot().players)assert.ok(Math.hypot(...p.position.map((v,i)=>v-starts.get(p.id)[i]))<.01,`${p.id} returned`);
});

test('authority refuses water, building land, the remaining reserve and Heights creations without moving anyone',()=>{
  let time=1000;const town=createSharedWorld(heights,{now:()=>time,isAdmin:()=>true});town.join({userId:'admin',name:'Admin'});
  const command=message=>{time+=2000;return town.command('admin',message);};
  const before=structuredClone(town.snapshot().players[0]);
  // Building land: the middle of each neighborhood's first shell.
  const shells=layout.heights.plans.map(plan=>plan.pieces.find(piece=>piece.piece==='building/shell')).filter(Boolean)
    .map(({rect:[w,s,e,n]})=>[(w+e)/2,(s+n)/2]);
  for(const position of [...[[133,20],[133,-20],[425,0],[413,0],[60,60]].map(frame),...shells]){
    assert.equal(command({type:'travel',position}).ok,false,`travel to frame ${[position[0]-layout.edge,position[1]+1335]}`);
    assert.deepEqual(town.snapshot().players[0].position,before.position);
  }
  assert.equal(command({type:'travel',position:frame([200,60])}).ok,true,'Heights Green is open ground');
  const placed=command({type:'build',action:'place',kind:'seat',finish:'rose',position:frame([203,60]),yaw:0});
  assert.equal(placed.ok,false);assert.equal(placed.error,'blocked_build_site');
});

test('the icehouse table plays through shared authority; rollback stands players and keeps the Commons game',()=>{
  let time=1000;const town=createSharedWorld(heights,{now:()=>time});
  const command=(id,message)=>{time+=2000;return town.command(id,message);};
  const seatAt=(id,buildId)=>{
    town.join({userId:id,name:id});const seat=plazaSalonSeats(heights).find(s=>s.buildId===buildId);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,false,'remote seating rejected');
    assert.equal(command(id,{type:'travel',position:seat.approach}).ok,true);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,true);
  };
  for(const [chair,id] of ['alice','bob'].entries())seatAt(id,`bench:plaza-salon-${HEIGHTS_TABLE}-${chair}`);
  assert.equal(command('alice',{type:'tableGame',action:'invite',kind:'connectFour'}).ok,true);
  assert.equal(command('bob',{type:'tableGame',action:'accept'}).ok,true);
  const icehouse=()=>town.snapshot().tables.find(t=>t.id===HEIGHTS_TABLE);
  assert.equal(icehouse().kind,'connectFour');
  for(const [id,move] of [['alice','c'],['bob','d'],['alice','c']])assert.equal(command(id,{type:'tableGame',action:'move',move}).ok,true,`${id} ${move}`);
  assert.equal(icehouse().moves.length,3);
  // A simultaneous Commons game must survive removal of the icehouse table.
  for(const [chair,id] of ['carol','dave'].entries())seatAt(id,`bench:plaza-salon-chess-commons-${chair}`);
  assert.equal(command('carol',{type:'tableGame',action:'invite',kind:'chess',side:'w'}).ok,true);
  assert.equal(command('dave',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(command('carol',{type:'tableGame',action:'move',move:'e2e4'}).ok,true);
  const commonsTable=structuredClone(town.snapshot().tables.find(t=>t.id==='chess-commons'));
  const saved=town.checkpoint(),restored=createSharedWorld(heights,{now:()=>time});
  assert.equal(restored.restore(saved).ok,true);assert.deepEqual(restored.snapshot().tables,town.snapshot().tables);
  const rollback=recoverDistrictHeightsCheckpoint({worldData:commons,checkpoint:saved,now:()=>time});
  assert.equal(rollback.ok,true);assert.equal(rollback.to,'commons');
  assert.deepEqual(new Set(rollback.moved),new Set(['alice','bob']));
  const returned=createSharedWorld(commons,{now:()=>time});assert.equal(returned.restore(rollback.checkpoint).ok,true);
  assert.deepEqual(returned.snapshot().tables,[commonsTable],'only the removed table\'s game ends');
  const players=returned.snapshot().players;
  assert.ok(players.filter(p=>['carol','dave'].includes(p.id)).every(p=>p.sitting?.buildId.startsWith('bench:plaza-salon-chess-commons-')));
  assert.ok(players.filter(p=>['alice','bob'].includes(p.id)).every(p=>!p.sitting&&p.position[0]<west));
  assert.deepEqual(town.checkpoint(),saved,'the source checkpoint is not rewritten');
});

test('Commons, Gardens and garage checkpoints migrate into Heights without changing players or chat',()=>{
  for(const [name,source] of [['commons',commons],['gardens',gardens],['garage',garage]]){
    const before=createSharedWorld(source,{now:()=>1000});before.join({userId:'alice',name:'Alice'});
    assert.equal(before.command('alice',{type:'chat',text:'See you over the bayou.'}).ok,true);
    const checkpoint=before.checkpoint(),result=recoverDistrictHeightsCheckpoint({worldData:heights,checkpoint,now:()=>1000});
    assert.equal(result.ok,true,name);assert.equal(result.to,'heights');assert.deepEqual(result.moved,[]);
    if(name!=='garage')assert.equal(result.from,name);
    const after=createSharedWorld(heights,{now:()=>1000});assert.equal(after.restore(result.checkpoint).ok,true,name);
    assert.deepEqual(after.snapshot().chat,before.snapshot().chat);
    assert.deepEqual(after.snapshot().players.map(p=>[p.id,p.position,p.appearance]),before.snapshot().players.map(p=>[p.id,p.position,p.appearance]));
    assert.deepEqual(before.checkpoint(),checkpoint);
  }
  const checkpoint=createSharedWorld(commons,{now:()=>1000}).checkpoint();
  assert.equal(recoverDistrictHeightsCheckpoint({worldData:heights,checkpoint:{...checkpoint,checksum:'bad'}}).ok,false);
  // The Commons recovery cannot misread a Heights world as its own.
  assert.equal(recoverDistrictCommonsCheckpoint({worldData:heights,checkpoint,now:()=>1000}).ok,false);
});

test('rollback to the Commons or Gardens moves standing, airborne and seated Heights occupants onto clear ground',()=>{
  let time=100000;const source=createSharedWorld(heights,{now:()=>time});
  const command=(id,message)=>{time+=2000;return source.command(id,message);};
  // The Commons migration tests' owner fixture identity is one that may fly (shared-appearances.js).
  const flyer='user_01M402HKJYDTH1QJM5NAQDZ4HH';
  for(const id of ['alice','bob',flyer,'dave','erin'])source.join({userId:id,name:id});
  assert.equal(command('alice',{type:'travel',position:frame([200,0])}).ok,true,'standing east of the bridge');
  assert.equal(command('bob',{type:'travel',position:frame([133,0])}).ok,true,'standing on the footbridge');
  assert.equal(command(flyer,{type:'travel',position:frame([300,1.5])}).ok,true);
  const airborne=source.snapshot().players.find(p=>p.id===flyer);
  assert.equal(command(flyer,{type:'pose',position:airborne.position,yaw:0,altitude:1}).ok,true,'airborne over Nineteenth & Yale');
  const seat=plazaSalonSeats(heights).find(s=>s.buildId===`bench:plaza-salon-${HEIGHTS_TABLE}-0`);
  assert.equal(command('dave',{type:'travel',position:seat.approach}).ok,true);
  assert.equal(command('dave',{type:'sit',buildId:seat.buildId,slot:0}).ok,true,'seated at the icehouse table');
  assert.equal(command('erin',{type:'travel',position:frame([60,0])}).ok,true,'on Market Street');
  const erin=structuredClone(source.snapshot().players.find(p=>p.id==='erin'));
  const checkpoint=source.checkpoint();
  const toCommons=recoverDistrictHeightsCheckpoint({worldData:commons,checkpoint,now:()=>time});
  assert.equal(toCommons.ok,true);assert.deepEqual(new Set(toCommons.moved),new Set(['alice','bob',flyer,'dave']));
  const inCommons=createSharedWorld(commons,{now:()=>time});assert.equal(inCommons.restore(toCommons.checkpoint).ok,true);
  const environment=createWalkingEnvironment(commons),players=inCommons.snapshot().players;
  for(const p of players){
    assert.ok(p.position[0]<west&&p.altitude===0&&!p.sitting,`${p.id} back on the Commons`);
    assert.ok(environment.isFree(p.position[0],-p.position[1]),`${p.id} on free ground`);
    if(toCommons.moved.includes(p.id))assert.ok(p.position[0]>layout.edge+80,`${p.id} lands by the footbridge, not thrown to the District`);
  }
  assert.deepEqual(players.find(p=>p.id==='erin'),erin,'people already on Commons ground stay put');
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)
    assert.ok(Math.hypot(players[i].position[0]-players[j].position[0],players[i].position[1]-players[j].position[1])>=.9);
  const toGardens=recoverDistrictHeightsCheckpoint({worldData:gardens,checkpoint,now:()=>time});
  assert.equal(toGardens.ok,true);assert.equal(toGardens.from,'heights');assert.equal(toGardens.to,'gardens');
  const inGardens=createSharedWorld(gardens,{now:()=>time});assert.equal(inGardens.restore(toGardens.checkpoint).ok,true);
  for(const p of inGardens.snapshot().players)assert.ok(p.position[0]<gardens.bounds_m[2]&&p.altitude===0,`${p.id} in the District`);
  assert.deepEqual(source.checkpoint(),checkpoint);
});

test('Redis fences Heights rollout and rollback by epoch and preserves durable state',{skip:!process.env.REDIS_URL},async t=>{
  const {default:Redis}=await import('ioredis');
  const {randomUUID}=await import('node:crypto');
  const {createRedisRoom}=await import('../redis-room.js');
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];let time=100000;
  const create=(worldData,districtEpoch)=>{const room=createRedisRoom({redis,prefix,worldData,districtEpoch,authorize:async()=>true,now:()=>time,isAdmin:()=>false});rooms.push(room);return room;};
  t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const join=(room,connectionId)=>room.request({type:'join',identity:{userId:'alice',name:'Alice',sessionId:'fixture-alice',expiresAt:time+120000},connectionId});
  const first=create(commons,1);assert.equal((await join(first,'one')).ok,true);await first.close();
  await assert.rejects(join(create(heights,1),'unchanged'),/Invalid durable town district/);
  const next=create(heights,2);assert.equal((await join(next,'two')).ok,true);
  time+=2000;
  assert.equal((await next.request({type:'command',userId:'alice',connectionId:'two',message:{type:'travel',position:frame([200,0])}})).ok,true);
  await next.close();const saved=await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(commons,1),'stale'),/Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(saved));
  const rollback=create(commons,3);assert.equal((await join(rollback,'three')).ok,true);
  const position=(await rollback.read()).snapshot.players[0].position;
  assert.ok(position[0]<west&&position[0]>layout.edge+80,'returned to the Commons by the footbridge');
  await rollback.close();
  await assert.rejects(join(create(heights,2),'stale-heights'),/Invalid durable town district/);
  const again=create(heights,4);assert.equal((await join(again,'four')).ok,true);await again.close();
});
