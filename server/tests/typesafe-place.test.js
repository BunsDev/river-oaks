import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { recoverDistrictTypeSafeCheckpoint } from '../district-typesafe-checkpoint-migration.js';
import { recoverDistrictWoodlandCheckpoint } from '../district-woodland-checkpoint-migration.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { TERRACES_REVISION } from '../../shared/bayou-terraces-layout.js';
import { WOODLAND_REVISION } from '../../shared/woodland-heights-layout.js';
import { TYPESAFE_REVISION, inTypeSafePlace } from '../../shared/typesafe-place-layout.js';
const gardens=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS}),terraces=await loadDistrictData({districtRevision:TERRACES_REVISION});
const woodland=await loadDistrictData({districtRevision:WOODLAND_REVISION}),typesafe=await loadDistrictData({districtRevision:TYPESAFE_REVISION});
// Woodland's walkable ground ends 0.35 m short of its cross streets' east ends at x 552.5.
const layout=typesafe.eastGardenCommons,frame=([x,y])=>[layout.edge+x,-1335+y],woodlandEast=layout.edge+552.15;
// The owner fixture identity is one that may fly (shared-appearances.js).
const flyer='user_01M402HKJYDTH1QJM5NAQDZ4HH';
const tower=id=>layout.typesafe.plans.flatMap(plan=>plan.pieces).find(piece=>piece.id.endsWith(`/manual/${id}`));

test('two server-owned players walk from Woodland along Twentieth Street into TypeSafe Place and back',()=>{
  let time=1000;
  const fixture={...typesafe,walkSpawn:[...frame([540,111.5]),layout.ground]};
  const town=createSharedWorld(fixture,{now:()=>time}),environment=createWalkingEnvironment(fixture);
  for(const id of ['alice','bob'])assert.equal(town.join({userId:id,name:id}).ok,true);
  const starts=new Map(town.snapshot().players.map(p=>[p.id,[...p.position]]));
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
  // Across Place Avenue's crossing, through both seams, to the shops at the east end.
  walk(1,p=>p.position[0]>layout.edge+660);
  for(const p of town.snapshot().players)assert.ok(inTypeSafePlace(layout,p.position[0]),`${p.id} crossed Place Avenue on Twentieth Street`);
  const restored=createSharedWorld(fixture,{now:()=>time});
  assert.deepEqual(restored.restore(town.checkpoint()),{ok:true});
  walk(-1,p=>p.position[0]<=starts.get(p.id)[0]+1e-6);
  for(const p of town.snapshot().players)assert.ok(Math.hypot(...p.position.map((v,i)=>v-starts.get(p.id)[i]))<.01,`${p.id} returned`);
});

test('authority refuses TypeSafe building land and the location edge without moving anyone',()=>{
  let time=1000;const town=createSharedWorld(typesafe,{now:()=>time,isAdmin:()=>true});town.join({userId:'admin',name:'Admin'});
  const command=message=>{time+=2000;return town.command('admin',message);};
  const before=structuredClone(town.snapshot().players[0]);
  const shells=layout.typesafe.plans.flatMap(plan=>plan.pieces.filter(piece=>piece.piece==='building/shell').slice(0,2))
    .map(({rect:[w,s,e,n]})=>[(w+e)/2,(s+n)/2]);
  for(const position of [...[[703.5,50],[628,169],[628,-124]].map(frame),...shells]){
    assert.equal(command({type:'travel',position}).ok,false,`travel to frame ${[position[0]-layout.edge,position[1]+1335]}`);
    assert.deepEqual(town.snapshot().players[0].position,before.position);
  }
  assert.equal(command({type:'travel',position:frame([600,-20])}).ok,true,'the Neighborhood Green is open ground');
  assert.equal(command({type:'travel',position:frame([588,-34])}).ok,false,'the ribbon sculpture stands on its plinth');
  // Woodland Heights has no ground beyond the end of its streets.
  const plain=createSharedWorld(woodland,{now:()=>time,isAdmin:()=>true});plain.join({userId:'admin',name:'Admin'});
  time+=2000;assert.equal(plain.command('admin',{type:'travel',position:frame([600,-20])}).ok,false);
});

test('Woodland, Terraces and Gardens checkpoints migrate into TypeSafe Place without changing players or chat',()=>{
  for(const [name,source] of [['woodland',woodland],['terraces',terraces],['gardens',gardens]]){
    const before=createSharedWorld(source,{now:()=>1000});before.join({userId:'alice',name:'Alice'});
    assert.equal(before.command('alice',{type:'chat',text:'Meet you by the ribbon.'}).ok,true);
    const checkpoint=before.checkpoint(),result=recoverDistrictTypeSafeCheckpoint({worldData:typesafe,checkpoint,now:()=>1000});
    assert.equal(result.ok,true,name);assert.equal(result.to,'typesafe');assert.deepEqual(result.moved,[]);assert.equal(result.from,name);
    const after=createSharedWorld(typesafe,{now:()=>1000});assert.equal(after.restore(result.checkpoint).ok,true,name);
    assert.deepEqual(after.snapshot().chat,before.snapshot().chat);
    assert.deepEqual(after.snapshot().players.map(p=>[p.id,p.position,p.appearance]),before.snapshot().players.map(p=>[p.id,p.position,p.appearance]));
    assert.deepEqual(before.checkpoint(),checkpoint);
  }
  const checkpoint=createSharedWorld(woodland,{now:()=>1000}).checkpoint();
  assert.equal(recoverDistrictTypeSafeCheckpoint({worldData:typesafe,checkpoint:{...checkpoint,checksum:'bad'}}).ok,false);
  // The Woodland recovery cannot misread a TypeSafe world as its own.
  assert.equal(recoverDistrictWoodlandCheckpoint({worldData:typesafe,checkpoint,now:()=>1000}).ok,false);
});

// Poses within the town's budget: 3 m of lift and 20 m of flight a second.
const flyTo=(town,command,environment,target,altitude)=>{
  const from=town.snapshot().players.find(p=>p.id===flyer),steps=Math.max(1,Math.ceil(Math.hypot(target[0]-from.position[0],target[1]-from.position[1])/20),Math.ceil(Math.abs(altitude-from.altitude)/3));
  for(let i=1;i<=steps;i++){
    const t=i/steps,point=[from.position[0]+(target[0]-from.position[0])*t,from.position[1]+(target[1]-from.position[1])*t];
    const result=command(flyer,{type:'pose',position:[...point,environment.groundAt(point[0],-point[1])],yaw:0,altitude:from.altitude+(altitude-from.altitude)*t});
    if(!result.ok)return result;
  }
  return {ok:true};
};

test('rollback moves TypeSafe occupants, and anyone above Woodland\'s ceiling, to Woodland street ground by the nearer cross street',()=>{
  let time=100000;const source=createSharedWorld(typesafe,{now:()=>time}),environment=createWalkingEnvironment(typesafe);
  const command=(id,message)=>{time+=2000;return source.command(id,message);};
  for(const id of ['alice','bob',flyer,'dave','erin','frank'])source.join({userId:id,name:id});
  assert.equal(command('alice',{type:'travel',position:frame([600,-20])}).ok,true,'on the Neighborhood Green');
  assert.equal(command('bob',{type:'travel',position:frame([605,60])}).ok,true,'in the Luxury Living forecourt');
  assert.equal(command('dave',{type:'travel',position:frame([660,111])}).ok,true,'on Twentieth Street east of the avenue');
  assert.equal(command('erin',{type:'travel',position:frame([545,40])}).ok,true,'on the Woodland green');
  assert.equal(command('frank',{type:'travel',position:frame([530,-71])}).ok,true,'on Woodland\'s Eighteenth Street');
  // High over the Woodland green: allowed under TypeSafe's ceiling, above Woodland's.
  assert.equal(command(flyer,{type:'travel',position:frame([545,-100])}).ok,true);
  const high=createWalkingEnvironment(woodland).flightCeiling+5;
  assert.ok(high<environment.flightCeiling);
  assert.equal(flyTo(source,command,environment,frame([545,-100]),high).ok,true,'climbing above Woodland\'s ceiling');
  const unmoved=['erin','frank'].map(id=>structuredClone(source.snapshot().players.find(p=>p.id===id)));
  const checkpoint=source.checkpoint();
  const back=recoverDistrictTypeSafeCheckpoint({worldData:woodland,checkpoint,now:()=>time});
  assert.equal(back.ok,true);assert.equal(back.to,'woodland');assert.deepEqual(new Set(back.moved),new Set(['alice','bob',flyer,'dave']));
  const inWoodland=createSharedWorld(woodland,{now:()=>time});assert.equal(inWoodland.restore(back.checkpoint).ok,true);
  const free=createWalkingEnvironment(woodland),players=inWoodland.snapshot().players;
  for(const p of players)assert.ok(p.position[0]<=woodlandEast&&p.altitude===0&&free.isFree(p.position[0],-p.position[1]),`${p.id} back on Woodland ground`);
  for(const [id,north] of [['alice',-71],['bob',111],['dave',111],[flyer,-71]]){
    const p=players.find(item=>item.id===id);
    assert.ok(p.position[0]>layout.edge+533&&Math.abs(p.position[1]-frame([0,north])[1])<10,`${id} at the end of the ${north>0?'Twentieth':'Eighteenth'} Street: ${[p.position[0]-layout.edge,p.position[1]+1335]}`);
  }
  for(const p of unmoved)assert.deepEqual(players.find(item=>item.id===p.id),p,`${p.id} stays put`);
  for(const [name,target] of [['terraces',terraces],['gardens',gardens]]){
    const result=recoverDistrictTypeSafeCheckpoint({worldData:target,checkpoint,now:()=>time});
    assert.equal(result.ok,true,name);assert.equal(result.from,'typesafe');
    const restored=createSharedWorld(target,{now:()=>time});assert.equal(restored.restore(result.checkpoint).ok,true,name);
    const ground=createWalkingEnvironment(target);
    for(const p of restored.snapshot().players)assert.ok(p.altitude===0&&ground.isFree(p.position[0],-p.position[1]),`${p.id} on ${name} ground`);
  }
  assert.deepEqual(source.checkpoint(),checkpoint);
});

test('the town lets Jevica fly over Penthouse Row\'s crown, but not down into it',()=>{
  let time=100000;const town=createSharedWorld(typesafe,{now:()=>time}),environment=createWalkingEnvironment(typesafe);
  const command=(id,message)=>{time+=2000;return town.command(id,message);};
  town.join({userId:flyer,name:'Jevica'});
  const {rect:[w,s,e,n],height}=tower('penthouse-row'),roof=[(w+e)/2,(s+n)/2],court=frame([640,40]);
  assert.equal(height,71.1,'twenty storeys');
  assert.ok(environment.flightCeiling>height+6,`ceiling ${environment.flightCeiling}`);
  assert.equal(command(flyer,{type:'travel',position:court}).ok,true);
  assert.equal(flyTo(town,command,environment,court,height+6).ok,true,'rising beside the tower');
  const over=flyTo(town,command,environment,roof,height+6);
  assert.equal(over.ok,true,`over the crown: ${JSON.stringify(over)}`);
  assert.equal(command(flyer,{type:'pose',position:[...roof,environment.groundAt(roof[0],-roof[1])],yaw:0,altitude:height+3}).error,'blocked','not down into the crown');
  assert.equal(flyTo(town,command,environment,court,height+6).ok,true,'and back over the court');
});

test('Redis fences TypeSafe rollout and rollback by epoch and preserves durable state',{skip:!process.env.REDIS_URL},async t=>{
  const {default:Redis}=await import('ioredis');
  const {randomUUID}=await import('node:crypto');
  const {createRedisRoom}=await import('../redis-room.js');
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:null});
  redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:test:${randomUUID()}}`,rooms=[];let time=100000;
  const create=(worldData,districtEpoch)=>{const room=createRedisRoom({redis,prefix,worldData,districtEpoch,authorize:async()=>true,now:()=>time,isAdmin:()=>false});rooms.push(room);return room;};
  t.after(async()=>{await Promise.all(rooms.map(room=>room.close()));const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});
  const join=(room,connectionId)=>room.request({type:'join',identity:{userId:'alice',name:'Alice',sessionId:'fixture-alice',expiresAt:time+120000},connectionId});
  const first=create(woodland,1);assert.equal((await join(first,'one')).ok,true);await first.close();
  await assert.rejects(join(create(typesafe,1),'unchanged'),/Invalid durable town district/);
  const next=create(typesafe,2);assert.equal((await join(next,'two')).ok,true);
  time+=2000;
  assert.equal((await next.request({type:'command',userId:'alice',connectionId:'two',message:{type:'travel',position:frame([600,-20])}})).ok,true);
  await next.close();const saved=await redis.getBuffer(`${prefix}:state`);
  await assert.rejects(join(create(woodland,1),'stale'),/Invalid durable town district/);
  assert.ok((await redis.getBuffer(`${prefix}:state`)).equals(saved));
  const rollback=create(woodland,3);assert.equal((await join(rollback,'three')).ok,true);
  const position=(await rollback.read()).snapshot.players[0].position;
  assert.ok(position[0]<woodlandEast&&position[0]>layout.edge+533&&Math.abs(position[1]-frame([0,-71])[1])<10,'returned to the end of Woodland\'s Eighteenth Street');
  await rollback.close();
  await assert.rejects(join(create(typesafe,2),'stale-typesafe'),/Invalid durable town district/);
  const again=create(typesafe,4);assert.equal((await join(again,'four')).ok,true);await again.close();
});
