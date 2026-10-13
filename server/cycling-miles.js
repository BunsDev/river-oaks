import { createHash } from 'node:crypto';

// Lifetime cycling distance per account, in metres, shared across worlds (the
// caller passes the cross-world account prefix). The Memory and Redis twins
// keep one contract: add(userId, meters, name) → total | null (over the rider
// cap), top(limit) → [{userId, name, meters}] best first, rank(userId) →
// {rank, meters} | null. Names are the public roster names at flush time, so
// a board never has to read profiles. Redis keeps a sorted set of totals and a
// hash of {userId, name, updatedAt}; the member is the hashed user id, and the
// stored user id lets top() return the real id to the transport (never to clients);
// a rider whose record is gone is left off the board rather than shown as a hash.
export const MAX_RIDERS=10000;
const MAX_RIDE=1e6; // metres in one flush: never more than a thousand kilometres
const validId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const validName=value=>typeof value==='string' && [...value].length<=80
  && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
function check(userId,meters,name) {
  if(!validId(userId))throw new Error('Invalid account');
  if(typeof meters!=='number' || !Number.isFinite(meters) || meters<0 || meters>MAX_RIDE)throw new Error('Invalid ride');
  if(!validName(name))throw new Error('Invalid rider name');
}
const round=value=>Math.round(value*1000)/1000;

export function createMemoryCyclingMiles({now=Date.now,maxRiders=MAX_RIDERS}={}) {
  const riders=new Map();
  const ordered=()=>[...riders.values()].sort((a,b)=>b.meters-a.meters || (a.userId<b.userId?-1:a.userId>b.userId?1:0));
  return {
    async add(userId,meters,name) {
      check(userId,meters,name);
      const rider=riders.get(userId);
      if(!rider && riders.size>=maxRiders)return null;
      const next={userId,name,meters:round((rider?.meters??0)+meters),updatedAt:now()};
      riders.set(userId,next);return next.meters;
    },
    async top(limit) {
      return ordered().slice(0,Math.max(0,Math.min(100,limit|0))).map(({userId,name,meters})=>({userId,name,meters}));
    },
    async rank(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      const index=ordered().findIndex(rider=>rider.userId===userId);
      return index<0?null:{rank:index+1,meters:riders.get(userId).meters};
    },
  };
}

// KEYS[1] totals (zset), KEYS[2] riders (hash); ARGV: member, meters, record json, cap.
const ADD=`
  local total=redis.call('ZSCORE',KEYS[1],ARGV[1])
  if not total and redis.call('ZCARD',KEYS[1]) >= tonumber(ARGV[4]) then return false end
  local next=redis.call('ZINCRBY',KEYS[1],ARGV[2],ARGV[1])
  redis.call('HSET',KEYS[2],ARGV[1],ARGV[3])
  return next
`;
export function createRedisCyclingMiles({redis,prefix,now=Date.now,maxRiders=MAX_RIDERS}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid cycling storage');
  const totals=`${prefix}:cycling-miles:v1`,riders=`${prefix}:cycling-riders:v1`;
  const id=userId=>createHash('sha256').update(userId).digest('hex');
  // A row whose record is missing, unparseable or has no user id is skipped: the
  // hashed member must never stand in for an account id.
  const decode=raw=>{
    try {const record=raw?JSON.parse(raw):null;return record && typeof record==='object' && typeof record.userId==='string' ? record : null;}
    catch {return null;}
  };
  return {
    async add(userId,meters,name) {
      check(userId,meters,name);
      const total=await redis.eval(ADD,2,totals,riders,id(userId),round(meters),JSON.stringify({userId,name,updatedAt:now()}),maxRiders);
      return total===null||total===false?null:round(Number(total));
    },
    async top(limit) {
      const count=Math.max(0,Math.min(100,limit|0));
      if(!count)return [];
      const rows=await redis.zrevrange(totals,0,count-1,'WITHSCORES');
      if(!rows.length)return [];
      const members=rows.filter((_,i)=>i%2===0),scores=rows.filter((_,i)=>i%2===1);
      const records=await redis.hmget(riders,...members);
      return members.flatMap((_,i)=>{
        const record=decode(records[i]);
        return record?[{userId:record.userId,name:typeof record.name==='string'?record.name:'',meters:round(Number(scores[i]))}]:[];
      });
    },
    async rank(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      const [index,score]=await Promise.all([redis.zrevrank(totals,id(userId)),redis.zscore(totals,id(userId))]);
      return index===null||score===null?null:{rank:index+1,meters:round(Number(score))};
    },
  };
}
