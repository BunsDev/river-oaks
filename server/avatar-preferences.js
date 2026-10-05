import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { MOVEMENTS, canUseAppearance, defaultAppearanceFor, sharedAppearance } from '../preview/src/shared-appearances.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';

const MAX_ACCOUNTS=10000;
const validId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const normalize=(value,userId,{legacy=false}={})=>{
  const appearance=sharedAppearance(value?.appearance)?.id;
  if(!appearance || !MOVEMENTS.includes(value?.movement))throw new Error('Invalid account appearance');
  if(!canUseAppearance(userId,appearance) && !legacy)throw new Error('Account cannot use this appearance');
  return {appearance:canUseAppearance(userId,appearance)?appearance:defaultAppearanceFor(userId),movement:value.movement};
};
const initial=userId=>({appearance:defaultAppearanceFor(userId),movement:'upright'});
function decode(raw,userId) {
  if(raw===null)return null;
  const value=JSON.parse(raw),preference=normalize(value,userId,{legacy:true});
  if(!Number.isSafeInteger(value.version) || value.version<1 || value.version>1000000
    || Object.keys(value).some(key=>!['appearance','movement','version'].includes(key)))throw new Error('Invalid account appearance record');
  return {...preference,version:value.version};
}

export function createMemoryAvatarPreferences() {
  const records=new Map();
  return {
    async get(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      return structuredClone(records.get(userId)??null);
    },
    async initialize(userId,value=initial(userId)) {
      if(!validId(userId))throw new Error('Invalid account');
      const preference=normalize(value,userId);
      if(!records.has(userId)) {
        if(records.size>=MAX_ACCOUNTS)throw new Error('Account appearance capacity exceeded');
        records.set(userId,{...preference,version:1});
      }
      return structuredClone(records.get(userId));
    },
    async save(userId,value) {
      if(!validId(userId))throw new Error('Invalid account');
      const preference=normalize(value,userId),old=records.get(userId);
      if(!old && records.size>=MAX_ACCOUNTS)throw new Error('Account appearance capacity exceeded');
      if(old?.appearance!==preference.appearance || old?.movement!==preference.movement)
        records.set(userId,{...preference,version:(old?.version??0)+1});
      return structuredClone(records.get(userId));
    },
  };
}

const INITIALIZE=`
  local old=redis.call('HGET',KEYS[1],ARGV[1])
  if old then return old end
  if redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[3]) then return redis.error_reply('Account appearance capacity exceeded') end
  redis.call('HSET',KEYS[1],ARGV[1],ARGV[2])
  return ARGV[2]
`;
const SAVE=`
  local old=redis.call('HGET',KEYS[1],ARGV[1])
  if not old and redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[4]) then return redis.error_reply('Account appearance capacity exceeded') end
  local version=0
  if old then
    local value=cjson.decode(old)
    if value.appearance == ARGV[2] and value.movement == ARGV[3] then return old end
    version=value.version
  end
  local value=cjson.encode({appearance=ARGV[2],movement=ARGV[3],version=version+1})
  redis.call('HSET',KEYS[1],ARGV[1],value)
  return value
`;
export function createRedisAvatarPreferences({redis,prefix}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid account appearance storage');
  const key=`${prefix}:avatar-preferences:v1`,id=userId=>{
    if(!validId(userId))throw new Error('Invalid account');
    return createHash('sha256').update(userId).digest('hex');
  };
  return {
    async get(userId) {return decode(await redis.hget(key,id(userId)),userId);},
    async initialize(userId,value=initial(userId)) {
      const preference=normalize(value,userId);
      return decode(await redis.eval(INITIALIZE,1,key,id(userId),JSON.stringify({...preference,version:1}),MAX_ACCOUNTS),userId);
    },
    async save(userId,value) {
      const preference=normalize(value,userId);
      return decode(await redis.eval(SAVE,1,key,id(userId),preference.appearance,preference.movement,MAX_ACCOUNTS),userId);
    },
  };
}

// Before the account store existed, the default town checkpoint held the only
// durable look for many residents. Seed from it when their first new visit is
// to a different world, then let the account store own subsequent changes.
export async function legacyDefaultAppearance(redis,stateKey,userId) {
  if(!validId(userId))throw new Error('Invalid account');
  const packed=await redis.getBuffer(stateKey);
  if(!packed)return null;
  const room=JSON.parse(inflateSync(packed,{maxOutputLength:16*1024*1024}).toString('utf8'));
  const saved=room?.checkpoint;
  if(![1,2].includes(room?.version) || room.version===2 && room.worldId!==DEFAULT_WORLD_ID
    || !saved || ![1,2,3].includes(saved.version) || saved.version>=2 && saved.worldId!==DEFAULT_WORLD_ID)
    throw new Error('Invalid legacy account appearance checkpoint');
  const envelope=saved.version===1
    ? {version:saved.version,worldFingerprint:saved.worldFingerprint,payload:saved.payload}
    : {version:saved.version,worldId:saved.worldId,worldFingerprint:saved.worldFingerprint,payload:saved.payload};
  if(createHash('sha256').update(JSON.stringify(envelope)).digest('hex')!==saved.checksum
    || !Array.isArray(saved.payload?.appearances??[]) || !Array.isArray(saved.payload?.movements??[])
    || !Array.isArray(saved.payload?.players))
    throw new Error('Invalid legacy account appearance checkpoint');
  const appearance=(saved.payload.appearances??[]).find(entry=>Array.isArray(entry) && entry[0]===userId)?.[1]
    ?? saved.payload.players.find(player=>player?.id===userId)?.appearance;
  if(!appearance)return null;
  const movement=(saved.payload.movements??[]).find(entry=>Array.isArray(entry) && entry[0]===userId)?.[1]??'upright';
  return normalize({appearance,movement},userId,{legacy:true});
}
