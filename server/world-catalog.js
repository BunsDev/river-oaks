import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { createHash } from 'node:crypto';
import { compileRegionPackage, editableRegionFromWorld, MAX_REGION_REQUEST_BYTES } from './region-package.js';

const MAX_PUBLISHED_WORLDS=16;
const PUBLISH=`
  if redis.call('HEXISTS',KEYS[1],ARGV[1]) == 1 then return 0 end
  if redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[3]) then return -1 end
  redis.call('HSET',KEYS[1],ARGV[1],ARGV[2])
  if ARGV[4] ~= '' then redis.call('HSET',KEYS[2],ARGV[1],ARGV[4]) end
  return 1
`;
const SAVE_DRAFT=`
  local raw=redis.call('HGET',KEYS[1],ARGV[1])
  if not raw then return 'missing' end
  local world=cjson.decode(raw)
  if world.template ~= 'region-v1' then return 'unsupported' end
  if world.regionSha256 ~= ARGV[2] then return 'stale' end
  local current=redis.call('HGET',KEYS[2],ARGV[1])
  local version=current and cjson.decode(current).version or 0
  if version ~= tonumber(ARGV[4]) then return 'draft_conflict' end
  redis.call('HSET',KEYS[2],ARGV[1],ARGV[3])
  return 'ok'
`;
const DISCARD_DRAFT=`
  local current=redis.call('HGET',KEYS[1],ARGV[1])
  if not current then return 'missing' end
  if cjson.decode(current).version ~= tonumber(ARGV[2]) then return 'draft_conflict' end
  redis.call('HDEL',KEYS[1],ARGV[1])
  return 'ok'
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

function draftInput(data,editorId,now) {
  let id;
  try {id=validateWorldId(data?.id);} catch {return null;}
  if(id===DEFAULT_WORLD_ID || !clean(editorId,200) || !/^[a-f0-9]{64}$/.test(data?.baseRegionSha256)
    || !Number.isSafeInteger(data?.expectedDraftVersion) || data.expectedDraftVersion<0 || data.expectedDraftVersion>100000
    || Object.keys(data).some(key=>!['id','baseRegionSha256','expectedDraftVersion','region'].includes(key)))return null;
  let compiled;
  try {compiled=compileRegionPackage(data.region,'Revision draft');} catch {return null;}
  const encoded=JSON.stringify(data.region);
  if(Buffer.byteLength(encoded)>MAX_REGION_REQUEST_BYTES)return null;
  return {id,baseRegionSha256:data.baseRegionSha256,region:data.region,compiledSha256:digest(JSON.stringify(compiled)),
    editedBy:editorId,updatedAt:now(),version:data.expectedDraftVersion+1};
}

export function createRedisWorldCatalog({redis,prefix,now=Date.now}={}) {
  if(!redis || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid world catalog configuration');
  const key=`${prefix}:worlds:v1`,regionKey=`${prefix}:regions:v1`,draftKey=`${prefix}:region-drafts:v1`;
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
    async editable(id) {
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return null;
      const publishedRegion=editableRegionFromWorld(await this.getRegion(id));
      const raw=await redis.hget(draftKey,id),draft=raw?JSON.parse(raw):null;
      if(draft && (draft.id!==id || draft.baseRegionSha256!==world.regionSha256 || !clean(draft.editedBy,200)
        || !Number.isSafeInteger(draft.updatedAt) || draft.updatedAt<0 || !/^[a-f0-9]{64}$/.test(draft.compiledSha256)
        || !Number.isSafeInteger(draft.version) || draft.version<1 || draft.version>100001
        || digest(JSON.stringify(compileRegionPackage(draft.region,'Revision draft')))!==draft.compiledSha256))throw new Error('Invalid region draft');
      return {world,publishedRegion,draft};
    },
    async saveDraft(data,editorId) {
      const draft=draftInput(data,editorId,now);
      if(!draft)return {ok:false,reason:'invalid_draft'};
      const result=await redis.eval(SAVE_DRAFT,2,key,draftKey,draft.id,draft.baseRegionSha256,JSON.stringify(draft),draft.version-1);
      return result==='ok'?{ok:true,draft}: {ok:false,reason:result};
    },
    async discardDraft(id,expectedDraftVersion) {
      try {validateWorldId(id);} catch {return {ok:false,reason:'invalid_draft'};}
      if(!Number.isSafeInteger(expectedDraftVersion) || expectedDraftVersion<0)return {ok:false,reason:'invalid_draft'};
      const result=await redis.eval(DISCARD_DRAFT,1,draftKey,id,expectedDraftVersion);
      return result==='ok'?{ok:true,removed:true}:result==='missing'?{ok:true,removed:false}:{ok:false,reason:result};
    },
  };
}

export function createMemoryWorldCatalog({now=Date.now}={}) {
  const worlds=new Map(),regions=new Map(),drafts=new Map();
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
    async editable(id) {
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return null;
      return {world:structuredClone(world),publishedRegion:editableRegionFromWorld(await this.getRegion(id)),draft:structuredClone(drafts.get(id)??null)};
    },
    async saveDraft(data,editorId) {
      const draft=draftInput(data,editorId,now);
      if(!draft)return {ok:false,reason:'invalid_draft'};
      const world=worlds.get(draft.id);
      if(!world)return {ok:false,reason:'missing'};
      if(world.template!=='region-v1')return {ok:false,reason:'unsupported'};
      if(world.regionSha256!==draft.baseRegionSha256)return {ok:false,reason:'stale'};
      if((drafts.get(draft.id)?.version??0)!==draft.version-1)return {ok:false,reason:'draft_conflict'};
      drafts.set(draft.id,structuredClone(draft));return {ok:true,draft:structuredClone(draft)};
    },
    async discardDraft(id,expectedDraftVersion) {
      if(!Number.isSafeInteger(expectedDraftVersion) || expectedDraftVersion<0)return {ok:false,reason:'invalid_draft'};
      const current=drafts.get(id);
      if(!current)return {ok:true,removed:false};
      if(current.version!==expectedDraftVersion)return {ok:false,reason:'draft_conflict'};
      drafts.delete(id);return {ok:true,removed:true};
    },
  };
}
