import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { createHash } from 'node:crypto';
import { compileRegionPackage } from './region-package.js';

const MAX_PUBLISHED_WORLDS=16;
const PUBLISH=`
  if redis.call('HEXISTS',KEYS[1],ARGV[1]) == 1 then return 0 end
  if redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[3]) then return -1 end
  redis.call('HSET',KEYS[1],ARGV[1],ARGV[2])
  if ARGV[4] ~= '' then redis.call('HSET',KEYS[2],ARGV[1],ARGV[4]) end
  return 1
`;
const digest=value=>createHash('sha256').update(value).digest('hex');
const clean=(value,max)=>typeof value==='string' && value===value.trim() && [...value].length>0 && [...value].length<=max
  && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value);
const validDescription=value=>value===undefined || value==='' || clean(value,280);
const defaultWorld=Object.freeze({id:DEFAULT_WORLD_ID,title:'River Oaks District',description:'The original shared district.',template:'river-oaks',ownerId:null,createdAt:0});
function publication(data,ownerId,now) {
  let id;
  try {id=validateWorldId(data?.id);} catch {return null;}
  if(id===DEFAULT_WORLD_ID || !clean(data.title,64) || !validDescription(data.description) || !clean(ownerId,200)
    || Object.keys(data).some(key=>!['id','title','description','region'].includes(key)))return null;
  let region=null;
  if(data.region!==undefined) {
    try {region=compileRegionPackage(data.region,data.title);} catch {return {error:'invalid_region'};}
  }
  const encoded=region?JSON.stringify(region):'';
  const world={id,title:data.title,description:data.description??'',template:region?'region-v1':'river-oaks',ownerId,createdAt:now(),
    ...(region?{regionSha256:digest(encoded)}:{})};
  return {world,encoded,region};
}

export function createRedisWorldCatalog({redis,prefix,now=Date.now}={}) {
  if(!redis || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid world catalog configuration');
  const key=`${prefix}:worlds:v1`,regionKey=`${prefix}:regions:v1`;
  const decode=value=>{
    const world=JSON.parse(value);
    if(!world || typeof world!=='object' || Array.isArray(world) || validateWorldId(world.id)===DEFAULT_WORLD_ID
      || !clean(world.title,64) || !validDescription(world.description)
      || !['river-oaks','region-v1'].includes(world.template)
      || (world.template==='region-v1' && !/^[a-f0-9]{64}$/.test(world.regionSha256))
      || !clean(world.ownerId,200) || !Number.isSafeInteger(world.createdAt) || world.createdAt<0)throw new Error('Invalid published world');
    return world;
  };
  return {
    async get(id) {
      try {validateWorldId(id);} catch {return null;}
      if(id===DEFAULT_WORLD_ID)return {...defaultWorld};
      const value=await redis.hget(key,id);
      return value?decode(value):null;
    },
    async list() {
      const values=await redis.hvals(key);
      if(values.length>MAX_PUBLISHED_WORLDS)throw new Error('World catalog capacity exceeded');
      return [{...defaultWorld},...values.map(decode).sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id))];
    },
    async getRegion(id) {
      const meta=await this.get(id);
      if(!meta || meta.template!=='region-v1')return null;
      const encoded=await redis.hget(regionKey,id);
      if(!encoded || digest(encoded)!==meta.regionSha256)throw new Error('Published region is missing or corrupt');
      return JSON.parse(encoded);
    },
    async publish(data,ownerId) {
      const entry=publication(data,ownerId,now);
      if(!entry)return {ok:false,reason:'invalid_world'};
      if(entry.error)return {ok:false,reason:entry.error};
      const result=await redis.eval(PUBLISH,2,key,regionKey,entry.world.id,JSON.stringify(entry.world),MAX_PUBLISHED_WORLDS,entry.encoded);
      return result===1?{ok:true,world:entry.world}:result===0?{ok:false,reason:'world_exists'}:{ok:false,reason:'world_limit'};
    },
  };
}

export function createMemoryWorldCatalog({now=Date.now}={}) {
  const worlds=new Map(),regions=new Map();
  return {
    async get(id) {return id===DEFAULT_WORLD_ID?{...defaultWorld}:worlds.get(id)??null;},
    async list() {return [{...defaultWorld},...[...worlds.values()].sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id))];},
    async getRegion(id) {return regions.has(id)?structuredClone(regions.get(id)):null;},
    async publish(data,ownerId) {
      const entry=publication(data,ownerId,now);
      if(!entry)return {ok:false,reason:'invalid_world'};
      if(entry.error)return {ok:false,reason:entry.error};
      const {world,region}=entry;
      if(worlds.has(world.id))return {ok:false,reason:'world_exists'};
      if(worlds.size>=MAX_PUBLISHED_WORLDS)return {ok:false,reason:'world_limit'};
      worlds.set(world.id,world);if(region)regions.set(world.id,region);return {ok:true,world};
    },
  };
}
