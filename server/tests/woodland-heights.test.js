import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictWoodlandCheckpoint } from '../district-woodland-checkpoint-migration.js';
import { recoverDistrictTerracesCheckpoint } from '../district-terraces-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonSeats } from '../../preview/src/plaza-salon-plan.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION } from '../../shared/studewood-layout.js';
import { TERRACES_REVISION, TERRACES_TABLE } from '../../shared/bayou-terraces-layout.js';
import { WOODLAND_REVISION, WOODLAND_TABLE, inWoodlandHeights } from '../../shared/woodland-heights-layout.js';
const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS}),commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const heights=await loadDistrictData({districtRevision:HEIGHTS_REVISION}),studewood=await loadDistrictData({districtRevision:STUDEWOOD_REVISION});
const terraces=await loadDistrictData({districtRevision:TERRACES_REVISION}),woodland=await loadDistrictData({districtRevision:WOODLAND_REVISION});
// Studewood's walkable ground ends 0.35 m short of its cross streets' east ends at x 507.5.
const layout=woodland.eastGardenCommons,frame=([x,y])=>[layout.edge+x,-1335+y],studewoodEast=layout.edge+507.15;

test('two server-owned players walk from Studewood along Twentieth Street into Woodland Heights and back',()=>{
  let time=1000;
  const fixture={...woodland,walkSpawn:[...frame([495,111.5]),layout.ground]};
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
  walk(1,p=>p.position[0]>layout.edge+540);
  for(const p of town.snapshot().players)assert.ok(inWoodlandHeights(layout,p.position[0])&&p.position[0]>layout.edge+540,`${p.id} crossed Live Oak Lane on Twentieth Street`);
  const restored=createSharedWorld(fixture,{now:()=>time});
  assert.deepEqual(restored.restore(town.checkpoint()),{ok:true});
  assert.deepEqual(restored.snapshot().players.map(p=>p.position),town.snapshot().players.map(p=>p.position));
  walk(-1,p=>p.position[0]<=starts.get(p.id)[0]+1e-6);
  for(const p of town.snapshot().players)assert.ok(Math.hypot(...p.position.map((v,i)=>v-starts.get(p.id)[i]))<.01,`${p.id} returned`);
});

test('authority refuses Woodland building land, the location edge and creations without moving anyone',()=>{
  let time=1000;const town=createSharedWorld(woodland,{now:()=>time,isAdmin:()=>true});town.join({userId:'admin',name:'Admin'});
  const command=message=>{time+=2000;return town.command('admin',message);};
  const before=structuredClone(town.snapshot().players[0]);
  const shells=layout.woodland.plans.flatMap(plan=>plan.pieces.filter(piece=>piece.piece==='building/shell').slice(0,3))
    .map(({rect:[w,s,e,n]})=>[(w+e)/2,(s+n)/2]);
  // Travel settles within 1.2 m of the asked-for spot, so the hedged gap to Studewood is checked by walking (preview tests).
  for(const position of [...[[553.2,50],[553.2,111],[530,168],[530,-123]].map(frame),...shells]){
    assert.equal(command({type:'travel',position}).ok,false,`travel to frame ${[position[0]-layout.edge,position[1]+1335]}`);
    assert.deepEqual(town.snapshot().players[0].position,before.position);
  }
  assert.equal(command({type:'travel',position:frame([545,40])}).ok,true,'the Woodland green is open ground');
  const placed=command({type:'build',action:'place',kind:'seat',finish:'rose',position:frame([545,42]),yaw:0});
  assert.equal(placed.ok,false);assert.equal(placed.error,'blocked_build_site');
  // The Terraces revision has no ground beyond the end of Studewood's streets.
  const plain=createSharedWorld(terraces,{now:()=>time,isAdmin:()=>true});plain.join({userId:'admin',name:'Admin'});
  time+=2000;assert.equal(plain.command('admin',{type:'travel',position:frame([545,40])}).ok,false);
});

test('the Woodland green table plays through shared authority; rollback stands its players and keeps the terrace game',()=>{
  let time=1000;const town=createSharedWorld(woodland,{now:()=>time});
  const command=(id,message)=>{time+=2000;return town.command(id,message);};
  const seatAt=(id,buildId)=>{
    town.join({userId:id,name:id});const seat=plazaSalonSeats(woodland).find(s=>s.buildId===buildId);
    assert.equal(command(id,{type:'travel',position:seat.approach}).ok,true);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,true);
  };
  for(const [chair,id] of ['alice','bob'].entries())seatAt(id,`bench:plaza-salon-${WOODLAND_TABLE}-${chair}`);
  assert.equal(command('alice',{type:'tableGame',action:'invite',kind:'morris'}).ok,true);
  assert.equal(command('bob',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(town.snapshot().tables.find(t=>t.id===WOODLAND_TABLE).kind,'morris');
  for(const [chair,id] of ['carol','dave'].entries())seatAt(id,`bench:plaza-salon-${TERRACES_TABLE}-${chair}`);
  assert.equal(command('carol',{type:'tableGame',action:'invite',kind:'connectFour'}).ok,true);
  assert.equal(command('dave',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(command('carol',{type:'tableGame',action:'move',move:'c'}).ok,true);
  const gardensTable=structuredClone(town.snapshot().tables.find(t=>t.id===TERRACES_TABLE));
  const saved=town.checkpoint();
  const rollback=recoverDistrictWoodlandCheckpoint({worldData:terraces,checkpoint:saved,now:()=>time});
  assert.equal(rollback.ok,true);assert.equal(rollback.to,'terraces');
  assert.deepEqual(new Set(rollback.moved),new Set(['alice','bob']));
  const returned=createSharedWorld(terraces,{now:()=>time});assert.equal(returned.restore(rollback.checkpoint).ok,true);
  assert.deepEqual(returned.snapshot().tables,[gardensTable],'only the removed table\'s game ends');
  const players=returned.snapshot().players;
  assert.ok(players.filter(p=>['carol','dave'].includes(p.id)).every(p=>p.sitting?.buildId.startsWith(`bench:plaza-salon-${TERRACES_TABLE}-`)));
  assert.ok(players.filter(p=>['alice','bob'].includes(p.id)).every(p=>!p.sitting&&p.position[0]<studewoodEast));
  assert.deepEqual(town.checkpoint(),saved,'the source checkpoint is not rewritten');
});

test('Terraces, Studewood, Heights, Commons and Gardens checkpoints migrate into Woodland Heights without changing players or chat',()=>{
  for(const [name,source] of [['terraces',terraces],['studewood',studewood],['heights',heights],['commons',commons],['gardens',gardens]]){
    const before=createSharedWorld(source,{now:()=>1000});before.join({userId:'alice',name:'Alice'});
    assert.equal(before.command('alice',{type:'chat',text:'Meet you on the Woodland green.'}).ok,true);
    const checkpoint=before.checkpoint(),result=recoverDistrictWoodlandCheckpoint({worldData:woodland,checkpoint,now:()=>1000});
    assert.equal(result.ok,true,name);assert.equal(result.to,'woodland');assert.deepEqual(result.moved,[]);assert.equal(result.from,name);
    const after=createSharedWorld(woodland,{now:()=>1000});assert.equal(after.restore(result.checkpoint).ok,true,name);
    assert.deepEqual(after.snapshot().chat,before.snapshot().chat);
    assert.deepEqual(after.snapshot().players.map(p=>[p.id,p.position,p.appearance]),before.snapshot().players.map(p=>[p.id,p.position,p.appearance]));
    assert.deepEqual(before.checkpoint(),checkpoint);
  }
  const checkpoint=createSharedWorld(terraces,{now:()=>1000}).checkpoint();
  assert.equal(recoverDistrictWoodlandCheckpoint({worldData:woodland,checkpoint:{...checkpoint,checksum:'bad'}}).ok,false);
  // The Terraces recovery cannot misread a Woodland world as its own.
  assert.equal(recoverDistrictTerracesCheckpoint({worldData:woodland,checkpoint,now:()=>1000}).ok,false);
});

test('rollback moves standing, seam, airborne and seated Woodland occupants to Studewood street ground by the nearer cross street',()=>{
  let time=100000;const source=createSharedWorld(woodland,{now:()=>time});
  const command=(id,message)=>{time+=2000;return source.command(id,message);};
  // The owner fixture identity is one that may fly (shared-appearances.js).
  const flyer='user_01M402HKJYDTH1QJM5NAQDZ4HH';
  for(const id of ['alice','bob',flyer,'dave','erin','frank','gus'])source.join({userId:id,name:id});
  assert.equal(command('alice',{type:'travel',position:frame([545,40])}).ok,true,'standing on the Woodland green');
  assert.equal(command('bob',{type:'travel',position:frame([507.4,108])}).ok,true,'on the Twentieth Street seam, just east of Studewood ground');
  assert.equal(command(flyer,{type:'travel',position:frame([545,-100])}).ok,true);
  const airborne=source.snapshot().players.find(p=>p.id===flyer);
  assert.equal(command(flyer,{type:'pose',position:airborne.position,yaw:0,altitude:1}).ok,true,'airborne over the Woodland lawn');
  const seat=plazaSalonSeats(woodland).find(s=>s.buildId===`bench:plaza-salon-${WOODLAND_TABLE}-0`);
  assert.equal(command('dave',{type:'travel',position:seat.approach}).ok,true);
  assert.equal(command('dave',{type:'sit',buildId:seat.buildId,slot:0}).ok,true,'seated at the green table');
  assert.equal(command('erin',{type:'travel',position:frame([472,40])}).ok,true,'in Studewood Park');
  // The rollback line: Studewood's walkable ground ends 0.35 m short of its streets' ends at x 507.5.
  assert.equal(command('frank',{type:'travel',position:frame([506.8,111])}).ok,true,'on Studewood\'s Twentieth Street under the seam');
  assert.equal(command('gus',{type:'travel',position:frame([520,-71])}).ok,true,'on Eighteenth Street in Woodland');
  const unmoved=['erin','frank'].map(id=>structuredClone(source.snapshot().players.find(p=>p.id===id)));
  const checkpoint=source.checkpoint();
  const back=recoverDistrictWoodlandCheckpoint({worldData:terraces,checkpoint,now:()=>time});
  assert.equal(back.ok,true);assert.deepEqual(new Set(back.moved),new Set(['alice','bob',flyer,'dave','gus']));
  const inTerraces=createSharedWorld(terraces,{now:()=>time});assert.equal(inTerraces.restore(back.checkpoint).ok,true);
  const environment=createWalkingEnvironment(terraces),players=inTerraces.snapshot().players;
  for(const p of players){
    assert.ok(p.position[0]<studewoodEast&&p.altitude===0&&!p.sitting,`${p.id} back on Studewood ground`);
    assert.ok(environment.isFree(p.position[0],-p.position[1]),`${p.id} on free ground`);
  }
  for(const [id,north] of [['alice',111],['bob',111],['dave',111],[flyer,-71],['gus',-71]]){
    const p=players.find(item=>item.id===id);
    assert.ok(p.position[0]>layout.edge+488&&Math.abs(p.position[1]-frame([0,north])[1])<10,`${id} at the end of the ${north>0?'Twentieth':'Eighteenth'} Street: ${[p.position[0]-layout.edge,p.position[1]+1335]}`);
  }
  for(const p of unmoved)assert.deepEqual(players.find(item=>item.id===p.id),p,`${p.id} stays put`);
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)
    assert.ok(Math.hypot(players[i].position[0]-players[j].position[0],players[i].position[1]-players[j].position[1])>=.9);
  for(const [name,target] of [['studewood',studewood],['heights',heights],['commons',commons],['gardens',gardens]]){
    const result=recoverDistrictWoodlandCheckpoint({worldData:target,checkpoint,now:()=>time});
    assert.equal(result.ok,true,name);assert.equal(result.from,'woodland');assert.equal(result.to,name);
    const restored=createSharedWorld(target,{now:()=>time});assert.equal(restored.restore(result.checkpoint).ok,true,name);
    const free=createWalkingEnvironment(target);
    for(const p of restored.snapshot().players)assert.ok(p.altitude===0&&free.isFree(p.position[0],-p.position[1]),`${p.id} on ${name} ground`);
  }
  assert.deepEqual(source.checkpoint(),checkpoint);
});

test('Redis fences Woodland rollout and rollback by epoch and preserves durable state',{skip:!process.env.REDIS_URL},async t=>{
  const {default:Redis}=await import('ioredis');
  const {randomUUID}=await import('node:crypto');
  const {createRedisRoom}=await import('../redis-room.js');
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];let time=100000;
  const create=(worldData,districtEpoch)=>{const room=createRedisRoom({redis,prefix,worldData,districtEpoch,authorize:async()=>true,now:()=>time,isAdmin:()=>false});rooms.push(room);return room;};
  t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const join=(room,connectionId)=>room.request({type:'join',identity:{userId:'alice',name:'Alice',sessionId:'fixture-alice',expiresAt:time+120000},connectionId});
  const first=create(terraces,1);assert.equal((await join(first,'one')).ok,true);await first.close();
  await assert.rejects(join(create(woodland,1),'unchanged'),/Invalid durable town district/);
  const next=create(woodland,2);assert.equal((await join(next,'two')).ok,true);
  time+=2000;
  assert.equal((await next.request({type:'command',userId:'alice',connectionId:'two',message:{type:'travel',position:frame([545,40])}})).ok,true);
  await next.close();const saved=await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(terraces,1),'stale'),/Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(saved));
  const rollback=create(terraces,3);assert.equal((await join(rollback,'three')).ok,true);
  const position=(await rollback.read()).snapshot.players[0].position;
  assert.ok(position[0]<studewoodEast&&position[0]>layout.edge+488&&Math.abs(position[1]-frame([0,111])[1])<10,'returned to the end of Studewood\'s Twentieth Street');
  await rollback.close();
  await assert.rejects(join(create(woodland,2),'stale-woodland'),/Invalid durable town district/);
  const again=create(woodland,4);assert.equal((await join(again,'four')).ok,true);await again.close();
});
