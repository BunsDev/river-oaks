import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createDistributedServer } from '../distributed-app.js';
import { createSharedWorld } from '../world.js';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { JEVICA_ACCOUNT_IDS } from '../../preview/src/jevica-accounts.js';
import { WORLD_PROTOCOL_VERSION } from '../../preview/src/world-contract.js';
import { newObjectPart } from '../../preview/src/creator-object.js';

const owner=JEVICA_ACCOUNT_IDS[0],origin='https://sim.jev.works';
const data={scene:'district',bounds_m:[-40,-40,40,40],walkSpawn:[-12,0,0],stores:[],buildings:[],collisionPolygons:[],roads:[],
  communityLocations:[{id:'a',name:'Garden',position:[-12,0,0]}]};
const auth={handle:async()=>false,authenticate:async req=>{
  const label=req.headers.cookie?.match(/session=(owner|guest)/)?.[1];if(!label)return null;
  const userId=label==='owner'?owner:'guest';
  return {userId,name:userId,sessionId:userId,csrfToken:'fixture',expiresAt:Date.now()+60000};
}};
async function fixture(t,distributed){
  let redis,room;const prefix=`{river-oaks:creator-transport:${randomUUID()}}`;
  if(distributed){redis=new Redis(process.env.REDIS_URL);redis.on('error',()=>{});room=createRedisRoom({redis,prefix,worldData:data,authorize:async()=>true});}
  const app=distributed?createDistributedServer({auth,room,security:createRedisSecurity({redis,prefix}),waitlist:approvedWaitlist,origin})
    :createGameServer({auth,world:createSharedWorld(data),waitlist:approvedWaitlist,origin});
  const sockets=[];t.after(async()=>{
    for(const socket of sockets)socket.terminate();await app.close();
    if(room)await room.close();if(redis){const keys=await redis.keys(prefix+':*');if(keys.length)await redis.del(...keys);await redis.quit();}
  });
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const ticket=async user=>{
    const response=await fetch(base+'/api/multiplayer/ticket',{method:'POST',headers:{Cookie:'session='+user,Origin:origin,'X-CSRF-Token':'fixture'}});
    assert.equal(response.status,200);return response.json();
  };
  const join=async user=>{
    const access=await ticket(user),socket=new WebSocket(base.replace('http:','ws:')+`/multiplayer?ticket=${access.ticket}&protocol=${WORLD_PROTOCOL_VERSION}`,{headers:{Cookie:'session='+user,Origin:origin}});
    sockets.push(socket);
    await new Promise((resolve,reject)=>{socket.on('message',raw=>{if(JSON.parse(raw).type==='snapshot')resolve();});socket.once('error',reject);});
    return socket;
  };
  const command=(socket,value)=>new Promise((resolve,reject)=>{
    const requestId=randomUUID(),deadline=setTimeout(()=>{socket.off('message',read);reject(new Error('No creator response'));},3000);
    const read=raw=>{const result=JSON.parse(raw);if(result.requestId===requestId){clearTimeout(deadline);socket.off('message',read);resolve(result);}};
    socket.on('message',read);socket.send(JSON.stringify({...value,requestId}));
  });
  return {base,ticket,join,command};
}

for(const distributed of [false,true])test(`${distributed?'Redis':'memory'} transport accepts a complete 16-part creator request and denies guests`,
  {skip:distributed&&!process.env.REDIS_URL,timeout:15000},async t=>{
    const f=await fixture(t,distributed),socket=await f.join('owner');
    const assembly={name:'Full design',parts:Array.from({length:16},()=>({...newObjectPart(),size:[.923456789,.456789123,.789123456],position:[.123456789,.5,.234567891],rotation:[0,.123456789,0]}))};
    const message={type:'build',action:'place',kind:'object',finish:'rose',assembly,position:[-12,2.4],yaw:0};
    assert.ok(Buffer.byteLength(JSON.stringify(message))>2048,'this crosses the old frame ceiling');
    const placed=await f.command(socket,message);assert.equal(placed.ok,true,JSON.stringify(placed));
    assert.equal(placed.item.assembly.parts.length,16);
    const guest=await f.join('guest');
    assert.equal((await f.command(guest,{type:'build',action:'remove',id:placed.item.id})).error,'admin_only');
    const closed=new Promise(resolve=>guest.once('close',code=>resolve(code)));
    guest.send(JSON.stringify(message));assert.equal(await closed,1009,'ordinary guests retain the original frame bound');
  });

for(const distributed of [false,true])for(const protocol of [1,null])
test(`${distributed?'Redis':'memory'} rejects ${protocol===null?'unversioned':'old'} clients before joining`,{skip:distributed&&!process.env.REDIS_URL},async t=>{
  const f=await fixture(t,distributed),access=await f.ticket('owner');
  const socket=new WebSocket(f.base.replace('http:','ws:')+`/multiplayer?ticket=${access.ticket}${protocol===null?'':'&protocol='+protocol}`,{headers:{Cookie:'session=owner',Origin:origin}});
  t.after(()=>socket.terminate());
  await assert.rejects(new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);}),/426/);
});
