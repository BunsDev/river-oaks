import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { recoverDistrictTerracesCheckpoint } from '../district-terraces-checkpoint-migration.js';
import { recoverDistrictStudewoodCheckpoint } from '../district-studewood-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonSeats } from '../../preview/src/plaza-salon-plan.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION, STUDEWOOD_TABLE } from '../../shared/studewood-layout.js';
import { TERRACES_REVISION, TERRACES_TABLE, inBayouTerraces } from '../../shared/bayou-terraces-layout.js';
const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS}),commons=await loadDistrictData({districtRevision:COMMONS_REVISION});
const heights=await loadDistrictData({districtRevision:HEIGHTS_REVISION}),studewood=await loadDistrictData({districtRevision:STUDEWOOD_REVISION});
const terraces=await loadDistrictData({districtRevision:TERRACES_REVISION});
const layout=terraces.eastGardenCommons,frame=([x,y])=>[layout.edge+x,-1335+y],bank=layout.heights.bounds[0];

test('two server-owned players walk from the Heights greenway over the Twentieth Street footbridge into the terrace gardens and back',()=>{
  let time=1000;
  const fixture={...terraces,walkSpawn:[...frame([156.5,110]),layout.ground]};
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
  walk(-1,p=>p.position[0]<layout.edge+95);
  for(const p of town.snapshot().players)assert.ok(inBayouTerraces(layout,p.position[0],p.position[1]),`${p.id} reached the gardens`);
  const restored=createSharedWorld(fixture,{now:()=>time});
  assert.deepEqual(restored.restore(town.checkpoint()),{ok:true});
  assert.deepEqual(restored.snapshot().players.map(p=>p.position),town.snapshot().players.map(p=>p.position));
  walk(1,p=>p.position[0]>=starts.get(p.id)[0]-1e-6);
  for(const p of town.snapshot().players)assert.ok(Math.hypot(...p.position.map((v,i)=>v-starts.get(p.id)[i]))<.01,`${p.id} returned`);
});

test('authority refuses terrace building land, the bayou and creations, and keeps the Commons green hedged off',()=>{
  let time=1000;const town=createSharedWorld(terraces,{now:()=>time,isAdmin:()=>true});town.join({userId:'admin',name:'Admin'});
  const command=message=>{time+=2000;return town.command('admin',message);};
  const before=structuredClone(town.snapshot().players[0]);
  const shells=layout.terraces.plans.flatMap(plan=>plan.pieces.filter(piece=>piece.piece==='building/shell').slice(0,3))
    .map(({rect:[w,s,e,n]})=>[(w+e)/2,(s+n)/2]);
  for(const position of [...[[130,100],[130,-80]].map(frame),...shells]){
    assert.equal(command({type:'travel',position}).ok,false,`travel to frame ${[position[0]-layout.edge,position[1]+1335]}`);
    assert.deepEqual(town.snapshot().players[0].position,before.position);
  }
  assert.equal(command({type:'travel',position:frame([60,130])}).ok,true,'the north gardens are open ground');
  const placed=command({type:'build',action:'place',kind:'seat',finish:'rose',position:frame([62,130]),yaw:0});
  assert.equal(placed.ok,false);assert.equal(placed.error,'blocked_build_site');
  // Walking north from the Commons green stops at its hedge: the terraces are reached only over their footbridges.
  const environment=createWalkingEnvironment(terraces);
  for(const direction of [1,-1]){
    assert.equal(command({type:'travel',position:frame([70,36*direction])}).ok,true);
    let refused=false;
    for(let i=0;i<40&&!refused;i++){
      time+=100;const [x,n]=town.snapshot().players[0].position,next=n+direction*.25;
      refused=!town.command('admin',{type:'pose',position:[x,next,environment.groundAt(x,-next)],yaw:0,altitude:0}).ok;
    }
    const n=town.snapshot().players[0].position[1]+1335;
    assert.ok(refused&&Math.abs(n)<39,`the hedge stops the walk at ${n}`);
  }
  const plain=createSharedWorld(studewood,{now:()=>time,isAdmin:()=>true});plain.join({userId:'admin',name:'Admin'});
  time+=2000;assert.equal(plain.command('admin',{type:'travel',position:frame([60,130])}).ok,false,'Studewood has no terraces');
});

test('the terrace gardens table plays through shared authority; rollback stands its players and keeps the Studewood game',()=>{
  let time=1000;const town=createSharedWorld(terraces,{now:()=>time});
  const command=(id,message)=>{time+=2000;return town.command(id,message);};
  const seatAt=(id,buildId)=>{
    town.join({userId:id,name:id});const seat=plazaSalonSeats(terraces).find(s=>s.buildId===buildId);
    assert.equal(command(id,{type:'travel',position:seat.approach}).ok,true);
    assert.equal(command(id,{type:'sit',buildId,slot:0}).ok,true);
  };
  for(const [chair,id] of ['alice','bob'].entries())seatAt(id,`bench:plaza-salon-${TERRACES_TABLE}-${chair}`);
  assert.equal(command('alice',{type:'tableGame',action:'invite',kind:'reversi'}).ok,true);
  assert.equal(command('bob',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(town.snapshot().tables.find(t=>t.id===TERRACES_TABLE).kind,'reversi');
  for(const [chair,id] of ['carol','dave'].entries())seatAt(id,`bench:plaza-salon-${STUDEWOOD_TABLE}-${chair}`);
  assert.equal(command('carol',{type:'tableGame',action:'invite',kind:'connectFour'}).ok,true);
  assert.equal(command('dave',{type:'tableGame',action:'accept'}).ok,true);
  assert.equal(command('carol',{type:'tableGame',action:'move',move:'c'}).ok,true);
  const park=structuredClone(town.snapshot().tables.find(t=>t.id===STUDEWOOD_TABLE));
  const saved=town.checkpoint();
  const rollback=recoverDistrictTerracesCheckpoint({worldData:studewood,checkpoint:saved,now:()=>time});
  assert.equal(rollback.ok,true);assert.equal(rollback.to,'studewood');
  assert.deepEqual(new Set(rollback.moved),new Set(['alice','bob']));
  const returned=createSharedWorld(studewood,{now:()=>time});assert.equal(returned.restore(rollback.checkpoint).ok,true);
  assert.deepEqual(returned.snapshot().tables,[park],'only the removed table\'s game ends');
  const players=returned.snapshot().players;
  assert.ok(players.filter(p=>['carol','dave'].includes(p.id)).every(p=>p.sitting?.buildId.startsWith(`bench:plaza-salon-${STUDEWOOD_TABLE}-`)));
  assert.ok(players.filter(p=>['alice','bob'].includes(p.id)).every(p=>!p.sitting&&p.position[0]>bank));
  assert.deepEqual(town.checkpoint(),saved,'the source checkpoint is not rewritten');
});

test('Studewood, Heights, Commons and Gardens checkpoints migrate into the terraces without changing players or chat',()=>{
  for(const [name,source] of [['studewood',studewood],['heights',heights],['commons',commons],['gardens',gardens]]){
    const before=createSharedWorld(source,{now:()=>1000});before.join({userId:'alice',name:'Alice'});
    assert.equal(before.command('alice',{type:'chat',text:'Meet you on the west bank.'}).ok,true);
    const checkpoint=before.checkpoint(),result=recoverDistrictTerracesCheckpoint({worldData:terraces,checkpoint,now:()=>1000});
    assert.equal(result.ok,true,name);assert.equal(result.to,'terraces');assert.deepEqual(result.moved,[]);assert.equal(result.from,name);
    const after=createSharedWorld(terraces,{now:()=>1000});assert.equal(after.restore(result.checkpoint).ok,true,name);
    assert.deepEqual(after.snapshot().chat,before.snapshot().chat);
    assert.deepEqual(after.snapshot().players.map(p=>[p.id,p.position,p.appearance]),before.snapshot().players.map(p=>[p.id,p.position,p.appearance]));
    assert.deepEqual(before.checkpoint(),checkpoint);
  }
  const checkpoint=createSharedWorld(studewood,{now:()=>1000}).checkpoint();
  assert.equal(recoverDistrictTerracesCheckpoint({worldData:terraces,checkpoint:{...checkpoint,checksum:'bad'}}).ok,false);
  // The Studewood recovery cannot misread a terraces world as its own.
  assert.equal(recoverDistrictStudewoodCheckpoint({worldData:terraces,checkpoint,now:()=>1000}).ok,false);
});

test('rollback moves standing, bridge, airborne and seated terrace occupants to the greenway by the nearer footbridge',()=>{
  let time=100000;const source=createSharedWorld(terraces,{now:()=>time});
  const command=(id,message)=>{time+=2000;return source.command(id,message);};
  // The owner fixture identity is one that may fly (shared-appearances.js).
  const flyer='user_01M402HKJYDTH1QJM5NAQDZ4HH';
  for(const id of ['alice','bob',flyer,'dave','erin','frank'])source.join({userId:id,name:id});
  assert.equal(command('alice',{type:'travel',position:frame([60,130])}).ok,true,'in the north gardens');
  assert.equal(command('bob',{type:'travel',position:frame([130,-71])}).ok,true,'on the south footbridge');
  assert.equal(command(flyer,{type:'travel',position:frame([60,-100])}).ok,true);
  const airborne=source.snapshot().players.find(p=>p.id===flyer);
  assert.equal(command(flyer,{type:'pose',position:airborne.position,yaw:0,altitude:1}).ok,true,'airborne over the south gardens');
  const seat=plazaSalonSeats(terraces).find(s=>s.buildId===`bench:plaza-salon-${TERRACES_TABLE}-0`);
  assert.equal(command('dave',{type:'travel',position:seat.approach}).ok,true);
  assert.equal(command('dave',{type:'sit',buildId:seat.buildId,slot:0}).ok,true,'seated at the gardens table');
  assert.equal(command('erin',{type:'travel',position:frame([156.5,111])}).ok,true,'on the greenway');
  assert.equal(command('frank',{type:'travel',position:frame([60,0])}).ok,true,'on the Commons green');
  const unmoved=['erin','frank'].map(id=>structuredClone(source.snapshot().players.find(p=>p.id===id)));
  const checkpoint=source.checkpoint();
  const back=recoverDistrictTerracesCheckpoint({worldData:studewood,checkpoint,now:()=>time});
  assert.equal(back.ok,true);assert.deepEqual(new Set(back.moved),new Set(['alice','bob',flyer,'dave']));
  const inStudewood=createSharedWorld(studewood,{now:()=>time});assert.equal(inStudewood.restore(back.checkpoint).ok,true);
  const environment=createWalkingEnvironment(studewood),players=inStudewood.snapshot().players;
  for(const p of players){
    assert.ok(p.altitude===0&&!p.sitting,`${p.id} standing`);
    assert.ok(environment.isFree(p.position[0],-p.position[1]),`${p.id} on free ground`);
  }
  for(const [id,north] of [['alice',111],['dave',111],['bob',-71],[flyer,-71]]){
    const p=players.find(item=>item.id===id);
    assert.ok(Math.abs(p.position[0]-frame([156.5,0])[0])<4&&Math.abs(p.position[1]-frame([0,north])[1])<10,`${id} by the ${north>0?'north':'south'} footbridge: ${[p.position[0]-layout.edge,p.position[1]+1335]}`);
  }
  for(const p of unmoved)assert.deepEqual(players.find(item=>item.id===p.id),p,`${p.id} stays put`);
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)
    assert.ok(Math.hypot(players[i].position[0]-players[j].position[0],players[i].position[1]-players[j].position[1])>=.9);
  for(const [name,target] of [['heights',heights],['commons',commons],['gardens',gardens]]){
    const result=recoverDistrictTerracesCheckpoint({worldData:target,checkpoint,now:()=>time});
    assert.equal(result.ok,true,name);assert.equal(result.from,'terraces');assert.equal(result.to,name);
    const restored=createSharedWorld(target,{now:()=>time});assert.equal(restored.restore(result.checkpoint).ok,true,name);
    const free=createWalkingEnvironment(target);
    for(const p of restored.snapshot().players)assert.ok(p.altitude===0&&free.isFree(p.position[0],-p.position[1]),`${p.id} on ${name} ground`);
  }
  assert.deepEqual(source.checkpoint(),checkpoint);
});

test('Redis fences terraces rollout and rollback by epoch and preserves durable state',{skip:!process.env.REDIS_URL},async t=>{
  const {default:Redis}=await import('ioredis');
  const {randomUUID}=await import('node:crypto');
  const {createRedisRoom}=await import('../redis-room.js');
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];let time=100000;
  const create=(worldData,districtEpoch)=>{const room=createRedisRoom({redis,prefix,worldData,districtEpoch,authorize:async()=>true,now:()=>time,isAdmin:()=>false});rooms.push(room);return room;};
  t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const join=(room,connectionId)=>room.request({type:'join',identity:{userId:'alice',name:'Alice',sessionId:'fixture-alice',expiresAt:time+120000},connectionId});
  const first=create(studewood,1);assert.equal((await join(first,'one')).ok,true);await first.close();
  await assert.rejects(join(create(terraces,1),'unchanged'),/Invalid durable town district/);
  const next=create(terraces,2);assert.equal((await join(next,'two')).ok,true);
  time+=2000;
  assert.equal((await next.request({type:'command',userId:'alice',connectionId:'two',message:{type:'travel',position:frame([60,130])}})).ok,true);
  await next.close();const saved=await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(studewood,1),'stale'),/Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(saved));
  const rollback=create(studewood,3);assert.equal((await join(rollback,'three')).ok,true);
  const position=(await rollback.read()).snapshot.players[0].position;
  assert.ok(position[0]>bank&&Math.abs(position[1]-frame([0,111])[1])<10,'returned to the greenway by the north footbridge');
  await rollback.close();
  await assert.rejects(join(create(terraces,2),'stale-terraces'),/Invalid durable town district/);
  const again=create(terraces,4);assert.equal((await join(again,'four')).ok,true);await again.close();
});

test('rollback leaves someone on a Gardens campus floor where they are, whatever lies at ground level below',()=>{
  // A campus level's free floor can stand over ground that is blocked at street level; the
  // terraces rollback moves only people on terrace geography.
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const ground=createWalkingEnvironment(studewood),floor=createWalkingEnvironment(studewood,[],'garden-campus/l1');
  const [x0,y0,x1,y1]=floor.rooms[0].lookupBounds,spots=[];
  for(let x=x0;x<=x1&&spots.length<40;x+=.5)for(let y=y0;y<=y1&&spots.length<40;y+=.5)if(floor.isFree(x,-y)&&!ground.isFree(x,-y))spots.push([x,y]);
  assert.ok(spots.length>0,'a floor spot over blocked street-level ground exists');
  const town=createSharedWorld(terraces,{now:()=>100000});town.join({userId:'tenant',name:'Tenant'});
  const base=town.checkpoint();let tried=0;
  for(const [x,y] of spots){
    const {checksum:_checksum,...envelope}=structuredClone(base),player=envelope.payload.players[0];
    Object.assign(player,{position:[x,y,floor.groundAt(x,-y)],levelId:'garden-campus/l1',buildingId:'garden-campus',altitude:0});
    const checkpoint={...envelope,checksum:digest(envelope)};
    if(!createSharedWorld(terraces,{now:()=>100000}).restore(checkpoint).ok)continue;
    tried++;
    const back=recoverDistrictTerracesCheckpoint({worldData:studewood,checkpoint,now:()=>100000});
    assert.equal(back.ok,true);assert.deepEqual(back.moved,[],`no one moved from the campus floor at ${[x,y]}`);
    const restored=createSharedWorld(studewood,{now:()=>100000});assert.equal(restored.restore(back.checkpoint).ok,true);
    const after=restored.snapshot().players[0];
    assert.deepEqual([after.position,after.levelId],[player.position,'garden-campus/l1']);
    break;
  }
  assert.equal(tried,1,'one restorable campus-floor spot was checked');
});
