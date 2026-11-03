import {timingSafeEqual} from 'node:crypto';

// One account's erasure across everything the server keeps for it (#292). The
// account is shut out first: the character tombstone refuses it a new session,
// then its sessions end and its sockets close, so nothing writes new records
// while the rest are erased. Every step is idempotent. A run with any failed
// step reports failure and is retried whole, by WorkOS (the webhook answers
// 503) or by the caller; it is never reported as done early. `steps` run
// together; `after` runs once they settle, for stores a world can still write
// to while it forgets the account (banked ride metres, the stored look).
// docs/privacy-data-inventory.md lists what each step erases and what is kept.
//
// With a `pending` store each request is recorded, under its provider event id,
// before anything runs, and stays until a second run `settleMs` after the first
// one finishes. A request let in before the sessions ended can still write while
// the server waits for its body (up to its 15 s request timeout); the second run
// erases that too. `sweep()` retries a failed or interrupted request and runs each
// due second pass. Node enforces that timeout every 30 s, so a body can take about
// 45 s in all; the second run waits 60.
export const ERASURE_SETTLE_MS=60_000;
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const stage=group=>Object.entries(group??{}).filter(([,step])=>typeof step==='function');
const store=value=>['put','drop','list'].every(key=>typeof value?.[key]==='function');

export function createAccountErasure({tombstone,revoke,steps,after,pending=null,settleMs=ERASURE_SETTLE_MS,now=Date.now}) {
  if(typeof tombstone!=='function'||typeof revoke!=='function'||!steps||typeof steps!=='object'||(after!==undefined&&(!after||typeof after!=='object'))
    ||(pending!==null&&!store(pending))||!Number.isSafeInteger(settleMs)||settleMs<0)
    throw new TypeError('Invalid account erasure');
  const stages=[stage(steps),stage(after)];
  const running=new Map();
  // Step names and the provider's event id only: never the account or a store's error text.
  const incomplete=(eventId,failed)=>{
    console.warn(JSON.stringify({event:'account_erasure_incomplete',eventId,steps:failed}));
    return new Error('Account erasure incomplete');
  };
  const record=async(eventId,write)=>{try{await write();}catch{throw incomplete(eventId,['pending']);}};
  // `final` is the record a due second pass read; it is dropped only while unchanged,
  // so a newer request for the account, from any server, keeps its own.
  async function run(userId,eventId,final) {
    if(pending&&!final)await record(eventId,()=>pending.put(userId,{eventId,settleAt:null}));
    for(const [name,shut] of [['tombstone',tombstone],['revoke',revoke]]) {
      try{await shut(userId);}catch{throw incomplete(eventId,[name]);}
    }
    const failed=[];
    for(const entries of stages) {
      const results=await Promise.allSettled(entries.map(([,step])=>Promise.resolve().then(()=>step(userId))));
      failed.push(...entries.filter((_,index)=>results[index].status==='rejected').map(([name])=>name));
    }
    if(failed.length)throw incomplete(eventId,failed);
    if(pending)await record(eventId,()=>final?pending.drop(userId,final):pending.put(userId,{eventId,settleAt:now()+settleMs}));
  }
  // Concurrent requests for one account, such as overlapping webhook deliveries, share a run.
  const erase=(userId,eventId,final)=>{
    if(!running.has(userId))running.set(userId,run(userId,eventId,final).finally(()=>running.delete(userId)));
    return running.get(userId);
  };
  function eraseAccount(userId,{eventId=null}={}) {
    if(!validId(userId))return Promise.reject(new TypeError('Invalid account'));
    return erase(userId,typeof eventId==='string'?eventId:null,null);
  }
  // Each recorded request in turn: a first run that failed or never finished, or a
  // second pass that is due. One sweep runs at a time; a call meanwhile shares it.
  let sweeping=null;
  eraseAccount.sweep=()=>{
    if(!pending)return Promise.resolve({finished:0,failed:0,waiting:0});
    sweeping??=(async()=>{
      const counts={finished:0,failed:0,waiting:0};
      let listed;
      try{listed=await pending.list();}catch(error){console.warn(JSON.stringify({event:'account_erasure_sweep_failed'}));throw error;}
      for(const [userId,saved] of listed) {
        if(!validId(userId))continue;
        if(saved.settleAt!==null&&saved.settleAt>now()){counts.waiting++;continue;}
        try{await erase(userId,saved.eventId,saved.settleAt!==null?saved:null);counts.finished++;}catch{counts.failed++;}
      }
      return counts;
    })().finally(()=>{sweeping=null;});
    return sweeping;
  };
  return eraseAccount;
}

// Every item is erased even when one fails, such as a world that cannot load; the
// first failure is thrown once the rest are done, so the run is retried.
export async function eraseEach(items,erase) {
  let failure=null;
  for(const item of items) {
    try{await erase(item);}catch(error){failure??=error;}
  }
  if(failure)throw failure;
}

const recorded=value=>JSON.stringify({eventId:value.eventId,settleAt:value.settleAt});
// A record that does not parse, or is not in the form written here, is kept and retried
// as a first run, which rewrites it; a second pass drops only the form it read.
const parse=raw=>{
  try{
    const value=JSON.parse(raw),eventId=typeof value?.eventId==='string'?value.eventId:null;
    const settleAt=Number.isSafeInteger(value?.settleAt)?value.settleAt:null;
    return {eventId,settleAt:recorded({eventId,settleAt})===raw?settleAt:null};
  }catch{return {eventId:null,settleAt:null};}
};
export function createMemoryPendingErasures() {
  const records=new Map();
  return {
    async put(userId,value){records.set(userId,recorded(value));},
    async drop(userId,expected){if(records.get(userId)===recorded(expected))records.delete(userId);},
    async list(){return [...records].map(([userId,raw])=>[userId,parse(raw)]);},
  };
}
// One hash for the namespace: account id → {eventId, settleAt}. A field lives only
// until its account's second pass.
const DROP=`if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then return redis.call('HDEL', KEYS[1], ARGV[1]) end return 0`;
export function createRedisPendingErasures({redis,prefix}={}) {
  if(!redis?.hset||typeof prefix!=='string'||!/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid pending erasure storage');
  const key=`${prefix}:erasure:pending:v1`;
  return {
    async put(userId,value){await redis.hset(key,userId,recorded(value));},
    async drop(userId,expected){await redis.eval(DROP,1,key,userId,recorded(expected));},
    async list(){return Object.entries(await redis.hgetall(key)).map(([userId,raw])=>[userId,parse(raw)]);},
  };
}

// Vercel Cron: serverless instances keep no timers, so a scheduled call runs the
// sweep. It exists only with a configured secret, and needs that secret.
const bearerMatches=(header,secret)=>{
  const given=Buffer.from(String(header??'')),expected=Buffer.from(`Bearer ${secret}`);
  return given.length===expected.length&&timingSafeEqual(given,expected);
};
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
export function createErasureSweepRoute({sweep,cronSecret=null}) {
  if(typeof sweep!=='function')throw new TypeError('Invalid erasure sweep');
  return async(req,res)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/api/erasure-sweep'||!cronSecret)return false;
    if(req.method!=='GET'){res.setHeader('Allow','GET');json(res,405,{error:'Use GET.'});return true;}
    if(!bearerMatches(req.headers.authorization,cronSecret)){json(res,401,{error:'Unauthorized.'});return true;}
    json(res,200,{ok:true,...await sweep()});
    return true;
  };
}
