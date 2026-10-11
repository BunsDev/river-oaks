import { createHash } from 'node:crypto';

const MAX_PROFILES=10000;
const MAX_INTROS=512;
const introKey=(worldId,storeId)=>{
  if(!validId(worldId)||!validId(storeId))throw new Error('Invalid store intro');
  return JSON.stringify([worldId,storeId]);
};
const empty=()=>({tagline:'',bio:'',pronouns:'',interests:[],version:0,updatedAt:0});
const validId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const clean=(value,max)=>typeof value==='string' && value===value.trim() && [...value].length<=max
  && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
const cleanBio=value=>typeof value==='string' && value===value.trim() && [...value].length<=600
  && !/[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
function proposal(data) {
  if(!record(data) || Object.keys(data).some(key=>!['tagline','bio','pronouns','interests','expectedVersion'].includes(key))
    || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion<0 || data.expectedVersion>=100000
    || !clean(data.tagline,100) || !cleanBio(data.bio) || !clean(data.pronouns,32)
    || !Array.isArray(data.interests) || data.interests.length>8
    || data.interests.some(value=>!clean(value,24) || !value)
    || new Set(data.interests.map(value=>value.toLocaleLowerCase())).size!==data.interests.length)return null;
  return {tagline:data.tagline,bio:data.bio,pronouns:data.pronouns,interests:[...data.interests]};
}
function decode(raw) {
  if(!raw)return empty();
  const data=JSON.parse(raw);
  if(!record(data) || Object.keys(data).some(key=>!['tagline','bio','pronouns','interests','version','updatedAt'].includes(key))
    || !proposal({tagline:data.tagline,bio:data.bio,pronouns:data.pronouns,interests:data.interests,expectedVersion:0})
    || !Number.isSafeInteger(data.version) || data.version<1 || data.version>100000
    || !Number.isSafeInteger(data.updatedAt) || data.updatedAt<0)throw new Error('Invalid profile record');
  return data;
}
const invalid=()=>({ok:false,reason:'invalid_profile'});

export function createMemoryProfiles({now=Date.now}={}) {
  const records=new Map(), intros=new Map();
  return {
    async claimStoreIntro(userId,worldId,storeId) {
      if(!validId(userId))throw new Error('Invalid account');
      const key=introKey(worldId,storeId), seen=intros.get(userId)??new Set();
      if(seen.has(key)||seen.size>=MAX_INTROS||!intros.has(userId)&&intros.size>=MAX_PROFILES)return {firstVisit:false};
      seen.add(key);intros.set(userId,seen);return {firstVisit:true};
    },
    async get(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      return structuredClone(records.get(userId)??empty());
    },
    async save(userId,data) {
      const fields=proposal(data);
      if(!validId(userId) || !fields)return invalid();
      const current=records.get(userId);
      if((current?.version??0)!==data.expectedVersion)return {ok:false,reason:'profile_conflict'};
      if(!current && records.size>=MAX_PROFILES)return {ok:false,reason:'profile_limit'};
      const profile={...fields,version:data.expectedVersion+1,updatedAt:now()};
      records.set(userId,profile);return {ok:true,profile:structuredClone(profile)};
    },
  };
}

const SAVE=`
  local old=redis.call('HGET',KEYS[1],ARGV[1])
  local version=old and cjson.decode(old).version or 0
  if version ~= tonumber(ARGV[2]) then return 'profile_conflict' end
  if not old and redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[4]) then return 'profile_limit' end
  redis.call('HSET',KEYS[1],ARGV[1],ARGV[3])
  return 'ok'
`;
const CLAIM_INTRO=`
  local raw=redis.call('HGET',KEYS[1],ARGV[1])
  local seen=raw and cjson.decode(raw) or {}
  for _,value in ipairs(seen) do if value == ARGV[2] then return 0 end end
  if #seen >= tonumber(ARGV[3]) then return 0 end
  if not raw and redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
  table.insert(seen,ARGV[2])
  redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(seen))
  return 1
`;
export function createRedisProfiles({redis,prefix,now=Date.now}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid profile storage');
  const key=`${prefix}:profiles:v1`;
  const id=userId=>createHash('sha256').update(userId).digest('hex');
  return {
    async claimStoreIntro(userId,worldId,storeId) {
      if(!validId(userId))throw new Error('Invalid account');
      const value=introKey(worldId,storeId);
      const first=await redis.eval(CLAIM_INTRO,1,`${prefix}:store-intros:v1`,id(userId),value,MAX_INTROS,MAX_PROFILES);
      return {firstVisit:first===1};
    },
    async get(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      return decode(await redis.hget(key,id(userId)));
    },
    async save(userId,data) {
      const fields=proposal(data);
      if(!validId(userId) || !fields)return invalid();
      const profile={...fields,version:data.expectedVersion+1,updatedAt:now()};
      const reason=await redis.eval(SAVE,1,key,id(userId),data.expectedVersion,JSON.stringify(profile),MAX_PROFILES);
      return reason==='ok'?{ok:true,profile}:{ok:false,reason};
    },
  };
}
