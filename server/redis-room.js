import { randomUUID } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { createSharedWorld } from './world.js';

const LEASE_MS=5000, REPLY_MS=15000, REQUEST_MS=7000, TICK_MS=200;
const MAX_QUEUE=4096, BATCH_SIZE=256, MAX_BYTES=16*1024*1024;
const ENQUEUE=`
  if redis.call('LLEN',KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
  redis.call('RPUSH',KEYS[1],ARGV[2])
  return 1
`;
const ACQUIRE=`
  local owned = redis.call('GET',KEYS[1]) == ARGV[1]
  if owned then redis.call('PEXPIRE',KEYS[1],ARGV[2])
  elseif not redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]) then
    return {0,false,{},redis.call('GET',KEYS[4])}
  end
  local checkpoint = false
  if not owned or ARGV[4] == '1' then checkpoint = redis.call('GET',KEYS[2]) end
  return {owned and 1 or 2,checkpoint,redis.call('LRANGE',KEYS[3],0,tonumber(ARGV[3])-1),false}
`;
const RELEASE=`
  if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end
  return 0
`;
// Every durable mutation, including replies and queue removal, is fenced by the
// same lease token. No result is visible until its world state is committed.
const COMMIT=`-- COMMIT_ROOM
  if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET',KEYS[2],ARGV[2])
  redis.call('SET',KEYS[3],ARGV[3])
  if tonumber(ARGV[4]) > 0 then redis.call('LTRIM',KEYS[4],ARGV[4],-1) end
  for i=5,#KEYS do redis.call('SET',KEYS[i],ARGV[i+2],'PX',ARGV[6]) end
  redis.call('PEXPIRE',KEYS[1],ARGV[5])
  return 1
`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rejected=error=>({ok:false,error,message:error});
const id=value=>typeof value==='string' && value.length>0 && value.length<=160;
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const pack=value=>{
  const json=JSON.stringify(value);
  if(Buffer.byteLength(json)>MAX_BYTES)throw new Error('Town state capacity exceeded');
  return deflateSync(json);
};
const unpack=buffer=>JSON.parse(inflateSync(buffer,{maxOutputLength:MAX_BYTES}).toString('utf8'));
const validIdentity=identity=>record(identity) && id(identity.userId) && id(identity.sessionId)
  && typeof identity.name==='string' && identity.name.length<=80 && Number.isFinite(identity.expiresAt);
function validOperation(operation) {
  if(!record(operation))return false;
  if(operation.type==='join')return validIdentity(operation.identity) && id(operation.connectionId);
  if(operation.type==='kick')return id(operation.userId) && (operation.sessionId===undefined || id(operation.sessionId));
  return ['command','heartbeat','leave'].includes(operation.type) && id(operation.userId) && id(operation.connectionId)
    && (operation.type!=='command' || record(operation.message));
}

/** Private room coordinator. Authentication and connection IDs come from the server. */
export function createRedisRoom({redis,prefix,worldData,now=Date.now,authorize}) {
  if(!redis || typeof authorize!=='function' || typeof prefix!=='string' || !prefix || prefix.length>180) throw new Error('Invalid room configuration');
  const tag=prefix.includes('{')?prefix:`{${prefix}}`;
  if(!/^\{[^{}]+\}$/.test(tag))throw new Error('Room prefix must be one Redis hash tag');
  const keys={lease:`${tag}:lease`,state:`${tag}:state`,view:`${tag}:view`,queue:`${tag}:queue`};
  const token=randomUUID();
  let closed=false,pendingTick=null,lastAttempt=-Infinity,lastView=null,cached=null;
  async function read() {
    const buffer=await redis.getBuffer(keys.view);
    lastView=buffer?unpack(buffer):null;
    return lastView;
  }
  async function runTick() {
    if(closed)return null;
    if(performance.now()-lastAttempt<TICK_MS)return lastView;
    lastAttempt=performance.now();
    const [ownership,stored,batch,otherView]=await redis.evalBuffer(ACQUIRE,4,keys.lease,keys.state,keys.queue,keys.view,token,LEASE_MS,BATCH_SIZE,cached?'0':'1');
    if(!ownership){cached=null;lastView=otherView?unpack(otherView):null;return lastView;}
    // A fresh lease always reloads durable state, even for this process's token.
    // A tentative mutation is reusable only after its fenced commit succeeds.
    if(ownership===2)cached=null;
    const world=cached?.world??createSharedWorld(worldData,{now});
    const time=now();
    let previous=cached?.previous??null,connections=cached?.connections??new Map();
    if(!cached && stored) {
      previous=unpack(stored);
      if(!record(previous) || previous.version!==1 || !Number.isSafeInteger(previous.revision) || previous.revision<0
        || !Number.isFinite(previous.lastTick) || !Array.isArray(previous.connections) || !world.restore(previous.checkpoint).ok) throw new Error('Invalid durable town checkpoint');
      for(const connection of previous.connections) {
        if(!record(connection) || !validIdentity(connection.identity) || !id(connection.connectionId) || !Number.isFinite(connection.lastSeen)
          || !(connection.leftAt===null || Number.isFinite(connection.leftAt)) || connections.has(connection.identity.userId)
          || !world.players.has(connection.identity.userId)) throw new Error('Invalid durable town presence');
        connections.set(connection.identity.userId,connection);
      }
      if(connections.size!==world.players.size)throw new Error('Invalid durable town roster');
    }
    // Cache only within this commit: presence and queued commands share current
    // ban/session checks, while the next tick observes revocation immediately.
    const authorizations=new Map();
    const allowed=identity=>{
      const key=JSON.stringify([identity.userId,identity.sessionId]);
      if(!authorizations.has(key))authorizations.set(key,Promise.resolve().then(()=>authorize(identity)).then(value=>value===true));
      return authorizations.get(key);
    };
    const remove=userId=>{connections.delete(userId);world.leave(userId);};
    const presence=await Promise.all([...connections.values()].map(async connection=>({connection,authorized:await allowed(connection.identity)})));
    for(const {connection,authorized} of presence) {
      if(!authorized || time-connection.identity.expiresAt>=10000 || connection.leftAt!==null && time-connection.leftAt>=10000 || time-connection.lastSeen>=20000) remove(connection.identity.userId);
    }
    // Real clocks govern cooldowns/presence; simulation never catches up offline.
    if(connections.size)world.step(previous?Math.min(0.25,Math.max(0,(time-previous.lastTick)/1000)):0);
    async function apply(operation) {
      if(!validOperation(operation))return rejected('invalid_operation');
      if(operation.type==='join') {
        if(operation.identity.expiresAt<=time || !await allowed(operation.identity))return rejected('session_invalid');
        let result;
        if(world.players.has(operation.identity.userId)) {
          result={ok:true,player:world.snapshot().players.find(player=>player.id===operation.identity.userId)};
        } else result=world.join(operation.identity);
        if(result.ok)connections.set(operation.identity.userId,{identity:operation.identity,connectionId:operation.connectionId,lastSeen:time,leftAt:null});
        return result;
      }
      const connection=connections.get(operation.userId);
      if(operation.type==='kick') {
        if(connection && (!operation.sessionId || operation.sessionId===connection.identity.sessionId))remove(operation.userId);
        return {ok:true};
      }
      if(!connection || connection.connectionId!==operation.connectionId || connection.leftAt!==null)return rejected('stale_connection');
      if(!await allowed(connection.identity)){remove(operation.userId);return rejected('session_invalid');}
      if(connection.identity.expiresAt<=time)return rejected('session_expired');
      if(operation.type==='leave'){connection.leftAt=time;return {ok:true};}
      connection.lastSeen=time;
      if(operation.type==='heartbeat')return {ok:true};
      return world.command(operation.userId,operation.message);
    }
    const replies=[];
    for(const raw of batch) {
      const entry=JSON.parse(raw);
      if(!record(entry) || typeof entry.id!=='string' || !/^[a-f0-9-]{36}$/.test(entry.id))throw new Error('Invalid durable operation');
      replies.push({key:`${tag}:reply:${entry.id}`,result:await apply(entry.operation)});
    }
    if(closed){cached=null;return null;}
    const revision=(previous?.revision??0)+1;
    const view={snapshot:world.snapshot(),connections:[...connections.values()].map(({identity,connectionId})=>({userId:identity.userId,connectionId,sessionId:identity.sessionId,expiresAt:identity.expiresAt})),revision};
    const checkpoint={version:1,revision,lastTick:time,connections:[...connections.values()],checkpoint:world.checkpoint()};
    const committed=await redis.eval(COMMIT,4+replies.length,keys.lease,keys.state,keys.view,keys.queue,...replies.map(reply=>reply.key),
      token,pack(checkpoint),pack(view),batch.length,LEASE_MS,REPLY_MS,...replies.map(reply=>JSON.stringify(reply.result)));
    if(!committed){cached=null;return read();}
    cached={world,connections,previous:checkpoint};lastView=view;
    return view;
  }
  function tick() {
    if(closed)return Promise.resolve(null);
    if(!pendingTick)pendingTick=runTick().catch(error=>{cached=null;throw error;}).finally(()=>{pendingTick=null;});
    return pendingTick;
  }
  async function request(operation) {
    if(closed)return rejected('room_closed');
    if(!validOperation(operation))return rejected('invalid_operation');
    const requestId=randomUUID(),replyKey=`${tag}:reply:${requestId}`;
    let serialized;
    try {serialized=JSON.stringify({id:requestId,operation});}catch{return rejected('invalid_operation');}
    if(Buffer.byteLength(serialized)>8192)return rejected('invalid_operation');
    const deadline=performance.now()+REQUEST_MS;
    const timeoutResult=()=>({...rejected('request_timeout'),message:'Request outcome is pending. Refresh the town before retrying.'});
    let timer;
    const execute=async()=>{
      if(!await redis.eval(ENQUEUE,1,keys.queue,MAX_QUEUE,serialized))return rejected('queue_full');
      while(performance.now()<deadline) {
        // A follower drives acquisition as well: if the previous function stopped,
        // its lease expires and accepted durable operations can still complete.
        await tick();
        const reply=await redis.get(replyKey);
        if(reply)return JSON.parse(reply);
        if(closed)return rejected('room_closed');
        await delay(100);
      }
      return timeoutResult();
    };
    // Also bound a stalled Redis call or authorization/commit; the durable queue
    // remains authoritative when the response deadline expires first.
    try {
      return await Promise.race([execute(),new Promise(resolve=>{timer=setTimeout(()=>resolve(timeoutResult()),REQUEST_MS);})]);
    } finally {clearTimeout(timer);}
  }

  async function close() {
    closed=true;cached=null;
    await redis.eval(RELEASE,1,keys.lease,token);
  }
  return {request,tick,read,close};
}
