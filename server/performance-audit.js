// Reproducible loopback capacity probe. Uses synthetic accounts, the real
// WebSocket server, and the shipped district; no WorkOS or Redis credentials.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { deflateRawSync } from 'node:zlib';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createGameServer } from './app.js';
import { createRedisRoom } from './redis-room.js';
import { createSharedWorld } from './world.js';

const district=JSON.parse(await readFile(new URL('../preview/public/data/district.json',import.meta.url)));
district.vegetation=JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json',import.meta.url)));
const origin='https://audit.river-oaks.test';
const quantile=(samples,fraction)=>{const sorted=[...samples].sort((a,b)=>a-b);return Math.round((sorted[Math.ceil(sorted.length*fraction)-1]??0)*100)/100;};
const mib=bytes=>Math.round(bytes/1048576*100)/100;
const waits=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function worldProbe(sharedPopulation,players) {
  const world=createSharedWorld(district,{sharedPopulation});
  for(let i=0;i<players;i++)if(!world.join({userId:`probe-${i}`,name:`Probe ${i}`}).ok)throw new Error('World admission failed');
  const step=[],steadyStep=[],snapshot=[],checkpoint=[];
  // Warm navigation caches before measuring. Same work runs for both casts.
  for(let i=0;i<10;i++)world.step(.05);
  for(let i=0;i<80;i++){
    let start=performance.now();world.step(.05);step.push(performance.now()-start);
    if(i%4===0){start=performance.now();world.snapshot();snapshot.push(performance.now()-start);
      start=performance.now();world.checkpoint();checkpoint.push(performance.now()-start);}
  }
  for(let i=0;i<80;i++){const start=performance.now();world.step(.05);steadyStep.push(performance.now()-start);}
  const encoded=Buffer.from(JSON.stringify(world.snapshot()));
  const durable=Buffer.from(JSON.stringify(world.checkpoint()));
  return {players,npcs:world.snapshot().locals.length,snapshotBytes:encoded.length,snapshotDeflateLevel1Bytes:deflateRawSync(encoded,{level:1}).length,
    checkpointBytes:durable.length,stepP95Ms:quantile(step,.95),stepMaxMs:quantile(step,1),stepOver50Ms:step.filter(ms=>ms>50).length,stepOver200Ms:step.filter(ms=>ms>200).length,
    steadyStepP95Ms:quantile(steadyStep,.95),steadyStepMaxMs:quantile(steadyStep,1),steadyStepOver50Ms:steadyStep.filter(ms=>ms>50).length,
    snapshotP95Ms:quantile(snapshot,.95),checkpointP95Ms:quantile(checkpoint,.95)};
}
async function transportProbe(players,durationMs) {
  const world=createSharedWorld(district);
  const auth={async authenticate(req){const userId=req.headers.cookie?.match(/(?:^|;\s*)audit=(probe-\d+)/)?.[1];
    return userId?{userId,name:userId,sessionId:userId,csrfToken:'audit-csrf',expiresAt:Date.now()+60000}:null;},async handle(){return false;}};
  const app=createGameServer({auth,world,origin,waitlist:{isApproved:async()=>true}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`,connections=[],samples=[];
  try {
    for(let i=0;i<players;i++){
      const id=`probe-${i}`;
      const response=await fetch(`${base}/api/multiplayer/ticket`,{method:'POST',headers:{Origin:origin,Cookie:`audit=${id}`,'X-CSRF-Token':'audit-csrf'}});
      if(!response.ok)throw new Error(`Ticket ${i}: HTTP ${response.status}`);
      const {ticket}=await response.json();
      const ws=new WebSocket(`${base.replace('http:','ws:')}/multiplayer?protocol=2&ticket=${ticket}`,{headers:{Origin:origin,Cookie:`audit=${id}`}});
      const sample={id,count:0,bytes:0,arrival:[],errors:0};samples.push(sample);connections.push(ws);
      ws.on('error',()=>{sample.errors++;});
      ws.on('message',raw=>{if(JSON.parse(raw).type==='snapshot'){sample.count++;sample.bytes+=raw.length;sample.arrival.push(performance.now());}});
      await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`Join ${i} timed out`)),5000);
        ws.once('open',()=>{clearTimeout(timeout);resolve();});ws.once('unexpected-response',(_req,res)=>{clearTimeout(timeout);reject(new Error(`Upgrade ${i}: HTTP ${res.statusCode}`));});});
    }
    await waits(500);
    for(const sample of samples){sample.count=0;sample.bytes=0;sample.arrival=[];}
    const loop=monitorEventLoopDelay({resolution:10});loop.enable();
    const cpuStart=process.cpuUsage(),rssStart=process.memoryUsage().rss,start=performance.now();
    await waits(durationMs);
    const seconds=(performance.now()-start)/1000,cpu=process.cpuUsage(cpuStart);loop.disable();
    const gaps=samples.flatMap(sample=>sample.arrival.slice(1).map((at,index)=>at-sample.arrival[index]));
    const total=samples.reduce((sum,item)=>sum+item.count,0),bytes=samples.reduce((sum,item)=>sum+item.bytes,0);
    return {players,seconds:Math.round(seconds*100)/100,admitted:world.snapshot().players.length,
      snapshotsPerClientMin:Math.min(...samples.map(item=>item.count)),snapshotsPerClientMax:Math.max(...samples.map(item=>item.count)),
      snapshotGapP95Ms:quantile(gaps,.95),eventLoopP95Ms:Math.round(loop.percentile(95)/1e6*100)/100,
      cpuCorePercent:Math.round((cpu.user+cpu.system)/10000/seconds),decodedSnapshotMiBPerSec:mib(bytes/seconds),
      rssDeltaMiB:mib(process.memoryUsage().rss-rssStart),errors:samples.reduce((sum,item)=>sum+item.errors,0),totalSnapshots:total};
  } finally {for(const ws of connections)ws.terminate();await app.close();}
}
async function redisProbe(url) {
  const redis=new Redis(url,{lazyConnect:true,maxRetriesPerRequest:1});redis.on('error',()=>{});await redis.connect();
  const prefix=`{river-oaks:audit:${randomUUID()}}`,room=createRedisRoom({redis,prefix,worldData:district,authorize:async()=>true});
  const result=[];
  try {
    let count=0;
    for(const players of [1,8,16,32]){
      while(count<players){const userId=`probe-${count++}`;
        const joined=await room.request({type:'join',identity:{userId,name:userId,sessionId:userId,expiresAt:Date.now()+120000},connectionId:`socket-${userId}`});
        if(!joined.ok)throw new Error(`Redis admission ${userId}: ${joined.error}`);
      }
      // The real edge heartbeats connected users every five seconds. Keep the
      // synthetic room present while sequential tiers and their ticks run.
      const heartbeats=await Promise.all(Array.from({length:count},(_,i)=>room.request({type:'heartbeat',userId:`probe-${i}`,connectionId:`socket-probe-${i}`})));
      if(heartbeats.some(item=>!item.ok))throw new Error('Redis heartbeat failed');
      const durations=[];
      for(let i=0;i<20;i++){await waits(210);const start=performance.now();await room.tick();durations.push(performance.now()-start);}
      const view=await room.read();
      if(view.snapshot.players.length!==players)throw new Error(`Redis roster fell to ${view.snapshot.players.length}/${players}`);
      result.push({players,admitted:view.snapshot.players.length,tickP95Ms:quantile(durations,.95),tickMaxMs:quantile(durations,1),
        ticksOver200Ms:durations.filter(ms=>ms>200).length,packedCheckpointBytes:await redis.strlen(`${prefix}:state`),packedViewBytes:await redis.strlen(`${prefix}:view`)});
    }
    return result;
  } finally {
    await room.close();const keys=await redis.keys(`${prefix}:*`);if(keys.length)await redis.del(...keys);await redis.quit();
  }
}
const report={at:new Date().toISOString(),runtime:process.version,platform:`${process.platform}/${process.arch}`,
  scope:`Loopback synthetic world and real WebSocket transport${process.env.REDIS_URL?' plus local Redis room ticks':''}; no WorkOS, hosted, mobile, or geographic network load.`,world:[],transport:[]};
for(const sharedPopulation of [false,true])for(const players of [1,8,32])report.world.push({sharedPopulation,...worldProbe(sharedPopulation,players)});
for(const players of [1,8,16,32])report.transport.push(await transportProbe(players,2000));
if(process.env.REDIS_URL)report.redis=await redisProbe(process.env.REDIS_URL);
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
