import { createHash } from 'node:crypto';
import { BOARD_IDS, boardId } from '../preview/src/leaderboard-boards.js';

// Lifetime leaderboard totals per account, shared across worlds (the caller
// passes the cross-world account prefix). One store holds every board in
// leaderboard-boards.js: distances in metres, hours played in seconds. The
// Memory and Redis twins keep one contract: add(userId, amount, name, board)
// → total | null (over the board's rider cap), top(limit, board) → [{userId,
// name, total}] best first, rank(userId, board) → {rank, total} | null; board
// defaults to 'cycling'. eraseUser removes the account from every board.
// Names are the public roster names at flush time, so
// a board never has to read profiles. Redis keeps a sorted set of totals and a
// hash of {userId, name, updatedAt}; the member is the hashed user id, and the
// stored user id lets top() return the real id to the transport (never to clients);
// a rider whose record is gone is left off the board rather than shown as a hash.
// Cycling keeps its original keys, so no banked mile moves; every other board
// has its own sorted set and shares the one name hash (one name per account).
export const MAX_RIDERS=10000;
const MAX_RIDE=1e6; // one flush: never more than a thousand kilometres (or eleven days)
const validId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const validName=value=>typeof value==='string' && [...value].length<=80
  && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
const validBoard=board=>{if(!boardId(board))throw new Error('Invalid board');return board;};
function check(userId,amount,name,board) {
  if(!validId(userId))throw new Error('Invalid account');
  if(typeof amount!=='number' || !Number.isFinite(amount) || amount<0 || amount>MAX_RIDE)throw new Error('Invalid ride');
  if(!validName(name))throw new Error('Invalid rider name');
  validBoard(board);
}
const round=value=>Math.round(value*1000)/1000;

export function createMemoryCyclingMiles({now=Date.now,maxRiders=MAX_RIDERS}={}) {
  const boards=new Map(),names=new Map();
  const riders=board=>{if(!boards.has(board))boards.set(board,new Map());return boards.get(board);};
  const ordered=board=>[...riders(board).entries()].sort((a,b)=>b[1]-a[1] || (a[0]<b[0]?-1:a[0]>b[0]?1:0));
  return {
    async add(userId,amount,name,board='cycling') {
      check(userId,amount,name,board);
      const totals=riders(board),total=totals.get(userId);
      if(total===undefined && totals.size>=maxRiders)return null;
      const next=round((total??0)+amount);
      totals.set(userId,next);names.set(userId,{name,updatedAt:now()});return next;
    },
    async top(limit,board='cycling') {
      validBoard(board);
      return ordered(board).slice(0,Math.max(0,Math.min(100,limit|0))).map(([userId,total])=>({userId,name:names.get(userId)?.name??'',total}));
    },
    async rank(userId,board='cycling') {
      if(!validId(userId))throw new Error('Invalid account');
      validBoard(board);
      const index=ordered(board).findIndex(([id])=>id===userId);
      return index<0?null:{rank:index+1,total:riders(board).get(userId)};
    },
    // Account erasure: every total and the board name.
    async eraseUser(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      for(const totals of boards.values())totals.delete(userId);
      names.delete(userId);
    },
  };
}

// KEYS[1] totals (zset), KEYS[2] riders (hash); ARGV: member, amount, record json, cap.
const ADD=`
  local total=redis.call('ZSCORE',KEYS[1],ARGV[1])
  if not total and redis.call('ZCARD',KEYS[1]) >= tonumber(ARGV[4]) then return false end
  local next=redis.call('ZINCRBY',KEYS[1],ARGV[2],ARGV[1])
  redis.call('HSET',KEYS[2],ARGV[1],ARGV[3])
  return next
`;
// KEYS[1] riders (hash), KEYS[2..] every board's totals; ARGV[1] member.
const ERASE=`for i=2,#KEYS do redis.call('ZREM',KEYS[i],ARGV[1]) end redis.call('HDEL',KEYS[1],ARGV[1]) return 1`;
export function createRedisCyclingMiles({redis,prefix,now=Date.now,maxRiders=MAX_RIDERS}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid cycling storage');
  const riders=`${prefix}:cycling-riders:v1`;
  const totals=board=>validBoard(board)==='cycling'?`${prefix}:cycling-miles:v1`:`${prefix}:leaderboard:${board}:v1`;
  const id=userId=>createHash('sha256').update(userId).digest('hex');
  // A row whose record is missing, unparseable or has no user id is skipped: the
  // hashed member must never stand in for an account id.
  const decode=raw=>{
    try {const record=raw?JSON.parse(raw):null;return record && typeof record==='object' && typeof record.userId==='string' ? record : null;}
    catch {return null;}
  };
  return {
    async add(userId,amount,name,board='cycling') {
      check(userId,amount,name,board);
      const total=await redis.eval(ADD,2,totals(board),riders,id(userId),round(amount),JSON.stringify({userId,name,updatedAt:now()}),maxRiders);
      return total===null||total===false?null:round(Number(total));
    },
    async top(limit,board='cycling') {
      const key=totals(board),count=Math.max(0,Math.min(100,limit|0));
      if(!count)return [];
      const rows=await redis.zrevrange(key,0,count-1,'WITHSCORES');
      if(!rows.length)return [];
      const members=rows.filter((_,i)=>i%2===0),scores=rows.filter((_,i)=>i%2===1);
      const records=await redis.hmget(riders,...members);
      return members.flatMap((_,i)=>{
        const record=decode(records[i]);
        return record?[{userId:record.userId,name:typeof record.name==='string'?record.name:'',total:round(Number(scores[i]))}]:[];
      });
    },
    async rank(userId,board='cycling') {
      if(!validId(userId))throw new Error('Invalid account');
      const key=totals(board);
      const [index,score]=await Promise.all([redis.zrevrank(key,id(userId)),redis.zscore(key,id(userId))]);
      return index===null||score===null?null:{rank:index+1,total:round(Number(score))};
    },
    async eraseUser(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      const keys=[riders,...BOARD_IDS.map(totals)];
      await redis.eval(ERASE,keys.length,...keys,id(userId));
    },
  };
}
