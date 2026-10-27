import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictStudewoodCheckpoint } from '../district-studewood-checkpoint-migration.js';
import { recoverDistrictHeightsCheckpoint } from '../district-heights-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonSeats } from '../../preview/src/plaza-salon-plan.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION, HEIGHTS_TABLE } from '../../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION, STUDEWOOD_TABLE, inStudewood } from '../../shared/studewood-layout.js';
const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS}),commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const heights=await loadDistrictData({districtRevision:HEIGHTS_REVISION}),studewood=await loadDistrictData({districtRevision:STUDEWOOD_REVISION});
const layout=studewood.eastGardenCommons,frame=([x,y])=>[layout.edge+x,-1335+y],heightsEast=layout.edge+406;

test('two server-owned players walk from Heights Boulevard along Twentieth Street into Studewood Park and back',()=>{
  let time=1000;
  const fixture={...studewood,walkSpawn:[...frame([396,111.5]),layout.ground]};
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
  walk(1,p=>p.position[0]>layout.edge+500);
  for(const p of town.snapshot().players)assert.ok(inStudewood(layout,p.position[0])&&p.position[0]>layout.edge+500,`${p.id} reached the end of Twentieth Street`);
  const restored=createSharedWorld(fixture,{now:()=>time});
  assert.deepEqual(restored.restore(town.checkpoint()),{ok:true});
  assert.deepEqual(restored.snapshot().players.map(p=>p.position),town.snapshot().players.map(p=>p.position));
  walk(-1,p=>p.position[0]<=starts.get(p.id)[0]+1e-6);
  for(const p of town.snapshot().players)assert.ok(Math.hypot(...p.position.map((v,i)=>v-starts.get(p.id)[i]))<.01,`${p.id} returned`);
});

test('authority refuses Studewood building land, the location edge and creations without moving anyone',()=>{
  let time=1000;const town=createSharedWorld(studewood,{now:()=>time,isAdmin:()=>true});town.join({userId:'admin',name:'Admin'});
  const command=message=>{time+=2000;return town.command('admin',message);};
  const before=structuredClone(town.snapshot().players[0]);
  const shells=layout.studewood.plans.flatMap(plan=>plan.pieces.filter(piece=>piece.piece==='building/shell').slice(0,3))
    .map(({rect:[w,s,e,n]})=>[(w+e)/2,(s+n)/2]);
  for(const position of [...[[421.5,50],[508.5,50],[480,166]].map(frame),...shells]){
    assert.equal(command({type:'travel',position}).ok,false,`travel to frame ${[position[0]-layout.edge,position[1]+1335]}`);
    assert.deepEqual(town.snapshot().players[0].position,before.position);
  }
  assert.equal(command({type:'travel',position:frame([472,40])}).ok,true,'Studewood Park is open ground');
  const placed=command({type:'build',action:'place',kind:'seat',finish:'rose',position:frame([474,40]),yaw:0});
  assert.equal(placed.ok,false);assert.equal(placed.error,'blocked_build_site');
  // The Heights revision has no ground beyond the boulevard.
  const plain=createSharedWorld(heights,{now:()=>time,isAdmin:()=>true});plain.join({userId:'admin',name:'Admin'});
  time+=2000;assert.equal(plain.command('admin',{type:'travel',position:frame([472,40])}).ok,false);
});

test('the Studewood Park table plays through shared authority; rollback stands its players and keeps the icehouse game',()=>{
  let time=1000;const town=createSharedWorld(studewood,{now:()=>time});
  const command=(id,message)=>{time+=2000;return town.command(id,message);};
  const seatAt=(id,buildId)=>{
    town.join({userId:id,name:id});const seat=plazaSalonSeats(studewood).find(s=>s.buildId===buildId);
    assert.equal(command(id,{type:'travel',position:seat.approach}).ok,true);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,true);
  };
  for(const [chair,id] of ['alice','bob'].entries())seatAt(id,`bench:plaza-salon-${STUDEWOOD_TABLE}-${chair}`);
  assert.equal(command('alice',{type:'tableGame',action:'invite',kind:'checkers'}).ok,true);
  assert.equal(command('bob',{type:'tableGame',action:'accept'}).ok,true);
  const park=()=>town.snapshot().tables.find(t=>t.id===STUDEWOOD_TABLE);
  assert.equal(park().kind,'checkers');
  for(const [chair,id] of ['carol','dave'].entries())seatAt(id,`bench:plaza-salon-${HEIGHTS_TABLE}-${chair}`);
  assert.equal(command('carol',{type:'tableGame',action:'invite',kind:'connectFour'}).ok,true);
  assert.equal(command('dave',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(command('carol',{type:'tableGame',action:'move',move:'c'}).ok,true);
  const icehouse=structuredClone(town.snapshot().tables.find(t=>t.id===HEIGHTS_TABLE));
  const saved=town.checkpoint();
  const rollback=recoverDistrictStudewoodCheckpoint({worldData:heights,checkpoint:saved,now:()=>time});
  assert.equal(rollback.ok,true);assert.equal(rollback.to,'heights');
  assert.deepEqual(new Set(rollback.moved),new Set(['alice','bob']));
  const returned=createSharedWorld(heights,{now:()=>time});assert.equal(returned.restore(rollback.checkpoint).ok,true);
  assert.deepEqual(returned.snapshot().tables,[icehouse],'only the removed table\'s game ends');
  const players=returned.snapshot().players;
  assert.ok(players.filter(p=>['carol','dave'].includes(p.id)).every(p=>p.sitting?.buildId.startsWith(`bench:plaza-salon-${HEIGHTS_TABLE}-`)));
  assert.ok(players.filter(p=>['alice','bob'].includes(p.id)).every(p=>!p.sitting&&p.position[0]<heightsEast));
  assert.deepEqual(town.checkpoint(),saved,'the source checkpoint is not rewritten');
});

test('Heights, Commons and Gardens checkpoints migrate into Studewood without changing players or chat',()=>{
  for(const [name,source] of [['heights',heights],['commons',commons],['gardens',gardens]]){
    const before=createSharedWorld(source,{now:()=>1000});before.join({userId:'alice',name:'Alice'});
    assert.equal(before.command('alice',{type:'chat',text:'Meet you at the water tower.'}).ok,true);
    const checkpoint=before.checkpoint(),result=recoverDistrictStudewoodCheckpoint({worldData:studewood,checkpoint,now:()=>1000});
    assert.equal(result.ok,true,name);assert.equal(result.to,'studewood');assert.deepEqual(result.moved,[]);assert.equal(result.from,name);
    const after=createSharedWorld(studewood,{now:()=>1000});assert.equal(after.restore(result.checkpoint).ok,true,name);
    assert.deepEqual(after.snapshot().chat,before.snapshot().chat);
    assert.deepEqual(after.snapshot().players.map(p=>[p.id,p.position,p.appearance]),before.snapshot().players.map(p=>[p.id,p.position,p.appearance]));
    assert.deepEqual(before.checkpoint(),checkpoint);
  }
  const checkpoint=createSharedWorld(heights,{now:()=>1000}).checkpoint();
  assert.equal(recoverDistrictStudewoodCheckpoint({worldData:studewood,checkpoint:{...checkpoint,checksum:'bad'}}).ok,false);
  // The Heights recovery cannot misread a Studewood world as its own.
  assert.equal(recoverDistrictHeightsCheckpoint({worldData:studewood,checkpoint,now:()=>1000}).ok,false);
});

test('rollback to Heights, the Commons or Gardens moves standing, airborne and seated Studewood occupants onto clear ground',()=>{
  let time=100000;const source=createSharedWorld(studewood,{now:()=>time});
  const command=(id,message)=>{time+=2000;return source.command(id,message);};
  // The owner fixture identity is one that may fly (shared-appearances.js).
  const flyer='user_01M402HKJYDTH1QJM5NAQDZ4HH';
  for(const id of ['alice','bob',flyer,'dave','erin','frank','gus'])source.join({userId:id,name:id});
  assert.equal(command('alice',{type:'travel',position:frame([472,40])}).ok,true,'standing in Studewood Park');
  assert.equal(command('bob',{type:'travel',position:frame([415,111])}).ok,true,'standing on the Twentieth Street seam');
  assert.equal(command(flyer,{type:'travel',position:frame([480,-40])}).ok,true);
  const airborne=source.snapshot().players.find(p=>p.id===flyer);
  assert.equal(command(flyer,{type:'pose',position:airborne.position,yaw:0,altitude:1}).ok,true,'airborne over the market yard');
  const seat=plazaSalonSeats(studewood).find(s=>s.buildId===`bench:plaza-salon-${STUDEWOOD_TABLE}-0`);
  assert.equal(command('dave',{type:'travel',position:seat.approach}).ok,true);
  assert.equal(command('dave',{type:'sit',buildId:seat.buildId,slot:0}).ok,true,'seated at the park table');
  assert.equal(command('erin',{type:'travel',position:frame([385,60])}).ok,true,'on the Heights esplanade');
  // The rollback line: Heights' walkable ground ends 0.35 m short of the boulevard sidewalk's edge at x 406.
  assert.equal(command('frank',{type:'travel',position:frame([405.5,111])}).ok,true,'on the Heights sidewalk under the seam');
  assert.equal(command('gus',{type:'travel',position:frame([406.4,108])}).ok,true,'on the seam just east of Heights ground');
  const erin=structuredClone(source.snapshot().players.find(p=>p.id==='erin'));
  const checkpoint=source.checkpoint();
  const toHeights=recoverDistrictStudewoodCheckpoint({worldData:heights,checkpoint,now:()=>time});
  assert.equal(toHeights.ok,true);assert.deepEqual(new Set(toHeights.moved),new Set(['alice','bob',flyer,'dave','gus']));
  const inHeights=createSharedWorld(heights,{now:()=>time});assert.equal(inHeights.restore(toHeights.checkpoint).ok,true);
  const environment=createWalkingEnvironment(heights),players=inHeights.snapshot().players;
  for(const p of players){
    assert.ok(p.position[0]<heightsEast&&p.altitude===0&&!p.sitting,`${p.id} back in Heights`);
    assert.ok(environment.isFree(p.position[0],-p.position[1]),`${p.id} on free ground`);
    if(toHeights.moved.includes(p.id))assert.ok(p.position[0]>layout.edge+380,`${p.id} lands on the boulevard, not thrown back to the bridge`);
  }
  assert.deepEqual(players.find(p=>p.id==='erin'),erin,'people already on Heights ground stay put');
  assert.ok(Math.abs(players.find(p=>p.id==='frank').position[0]-frame([405.5,111])[0])<1e-9,'including on the sidewalk under the seam');
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)
    assert.ok(Math.hypot(players[i].position[0]-players[j].position[0],players[i].position[1]-players[j].position[1])>=.9);
  for(const [name,target,west] of [['commons',commons,layout.heights.bounds[0]],['gardens',gardens,gardens.bounds_m[2]]]){
    const result=recoverDistrictStudewoodCheckpoint({worldData:target,checkpoint,now:()=>time});
    assert.equal(result.ok,true,name);assert.equal(result.from,'studewood');assert.equal(result.to,name);
    const restored=createSharedWorld(target,{now:()=>time});assert.equal(restored.restore(result.checkpoint).ok,true,name);
    for(const p of restored.snapshot().players)assert.ok(p.position[0]<west&&p.altitude===0,`${p.id} back in ${name}`);
  }
  assert.deepEqual(source.checkpoint(),checkpoint);
});

test('Redis fences Studewood rollout and rollback by epoch and preserves durable state',{skip:!process.env.REDIS_URL},async t=>{
  const {default:Redis}=await import('ioredis');
  const {randomUUID}=await import('node:crypto');
  const {createRedisRoom}=await import('../redis-room.js');
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];let time=100000;
  const create=(worldData,districtEpoch)=>{const room=createRedisRoom({redis,prefix,worldData,districtEpoch,authorize:async()=>true,now:()=>time,isAdmin:()=>false});rooms.push(room);return room;};
  t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const join=(room,connectionId)=>room.request({type:'join',identity:{userId:'alice',name:'Alice',sessionId:'fixture-alice',expiresAt:time+120000},connectionId});
  const first=create(heights,1);assert.equal((await join(first,'one')).ok,true);await first.close();
  await assert.rejects(join(create(studewood,1),'unchanged'),/Invalid durable town district/);
  const next=create(studewood,2);assert.equal((await join(next,'two')).ok,true);
  time+=2000;
  assert.equal((await next.request({type:'command',userId:'alice',connectionId:'two',message:{type:'travel',position:frame([472,40])}})).ok,true);
  await next.close();const saved=await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(heights,1),'stale'),/Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(saved));
  const rollback=create(heights,3);assert.equal((await join(rollback,'three')).ok,true);
  const position=(await rollback.read()).snapshot.players[0].position;
  assert.ok(position[0]<heightsEast&&position[0]>layout.edge+380,'returned to Heights Boulevard');
  await rollback.close();
  await assert.rejects(join(create(studewood,2),'stale-studewood'),/Invalid durable town district/);
  const again=create(studewood,4);assert.equal((await join(again,'four')).ok,true);await again.close();
});
