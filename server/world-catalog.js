import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { createHash } from 'node:crypto';
import { compileRegionPackage, editableRegionFromWorld, MAX_REGION_REQUEST_BYTES } from './region-package.js';
import { ApprovedSpaceError, approvedSpaceSources, approvedSpacesCurrent } from '../preview/src/approved-space-plan.js';
import { APPROVED_SPACES } from '../preview/src/approved-spaces.js';
import { isJevicaAdmin } from './admin.js';

const MAX_PUBLISHED_WORLDS=16;
// RIVER_OAKS_APPROVED_SPACES=1 lets a creator region place a reviewed furnished space (#420).
// Off, the default, a catalog serves this empty registry: publishing one fails
// approved_space_unknown, and a draft or revision that keeps one is refused before activation.
export const APPROVED_SPACES_OFF=Object.freeze({registry:Object.freeze([])});
// Whether this catalog can place any reviewed revision; the world directory tells the editor.
const offersApprovedSpaces=policy=>(policy?.registry??APPROVED_SPACES).length>0;
// KEYS[3] holds revoked approved-space revisions (#420); ARGV[5..] are the ones placed.
const PUBLISH=`
  if redis.call('HEXISTS',KEYS[1],ARGV[1]) == 1 then return 0 end
  if redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[3]) then return -1 end
  for i=5,#ARGV do if redis.call('SISMEMBER',KEYS[3],ARGV[i]) == 1 then return -2 end end
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
// A compile failure names the approved-space rule it broke; anything else is invalid.
const regionReason=error=>error instanceof ApprovedSpaceError?error.code:'invalid_region';
// Placing an approved space is the world owner's act: another publisher account cannot
// place a reviewed revision into someone else's world. Jevica's accounts are one owner.
const sameOwner=(actorId,ownerId)=>actorId===ownerId || isJevicaAdmin(actorId)&&isJevicaAdmin(ownerId);
// The last checks before a candidate becomes the live world, shared by both catalogs.
function activationReason(candidate,revoked,policy) {
  if(candidate.sources?.some(source=>revoked(source)))return 'approved_space_revoked';
  if(!approvedSpacesCurrent(candidate.worldData,policy))return 'approved_space_assets';
  return null;
}
const validVersionRequest=(revision,baseRegionSha256)=>Number.isSafeInteger(revision) && revision>=1 && revision<=100000
  && /^[a-f0-9]{64}$/.test(baseRegionSha256);
function retainedVersion(entry,id,decodeWorld=world=>world) {
  const world=decodeWorld(entry?.world),encoded=typeof entry?.region==='string'?entry.region:JSON.stringify(entry?.region);
  if(world?.id!==id || world.template!=='region-v1' || !Number.isSafeInteger(world.revision??1)
    || (world.revision??1)<1 || (world.revision??1)>100000 || digest(encoded)!==world.regionSha256)
    throw new Error('Retained region version is corrupt');
  const region=editableRegionFromWorld(JSON.parse(encoded));
  return {version:{revision:world.revision??1,updatedAt:world.updatedAt??world.createdAt,regionSha256:world.regionSha256},region};
}
const clean=(value,max)=>typeof value==='string' && value===value.trim() && [...value].length>0 && [...value].length<=max
  && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value);
const validDescription=value=>value===undefined || value==='' || clean(value,280);
const defaultWorld=Object.freeze({id:DEFAULT_WORLD_ID,title:'River Oaks District',description:'The original shared district.',template:'river-oaks',ownerId:null,createdAt:0});
function publication(data,ownerId,now,policy) {
  let id;
  try {id=validateWorldId(data?.id);} catch {return null;}
  if(id===DEFAULT_WORLD_ID || !clean(data.title,64) || !validDescription(data.description) || !clean(ownerId,200)
    || Object.keys(data).some(key=>!['id','title','description','region'].includes(key)))return null;
  let region=null;
  if(data.region!==undefined) {
    try {region=compileRegionPackage(data.region,data.title,{worldId:id,approvedSpaces:policy});}
    catch(error) {return {error:regionReason(error),...(error instanceof ApprovedSpaceError?{detail:error.message}:{})};}
  }
  const encoded=region?JSON.stringify(region):'';
  const world={id,title:data.title,description:data.description??'',template:region?'region-v1':'river-oaks',ownerId,createdAt:now(),
    ...(region?{regionSha256:digest(encoded)}:{})};
  return {world,encoded,region,sources:approvedSpaceSources(region)};
}

function draftInput(data,editorId,now,policy) {
  let id;
  try {id=validateWorldId(data?.id);} catch {return null;}
  if(id===DEFAULT_WORLD_ID || !clean(editorId,200) || !/^[a-f0-9]{64}$/.test(data?.baseRegionSha256)
    || !Number.isSafeInteger(data?.expectedDraftVersion) || data.expectedDraftVersion<0 || data.expectedDraftVersion>100000
    || Object.keys(data).some(key=>!['id','baseRegionSha256','expectedDraftVersion','region'].includes(key)))return null;
  let compiled;
  try {compiled=compileRegionPackage(data.region,'Revision draft',{worldId:id,approvedSpaces:policy});} catch {return null;}
  const encoded=JSON.stringify(data.region);
  if(Buffer.byteLength(encoded)>MAX_REGION_REQUEST_BYTES)return null;
  return {id,baseRegionSha256:data.baseRegionSha256,region:data.region,compiledSha256:digest(JSON.stringify(compiled)),
    editedBy:editorId,updatedAt:now(),version:data.expectedDraftVersion+1};
}

export function createRedisWorldCatalog({redis,prefix,now=Date.now,approvedSpaces:policy}={}) {
  if(!redis || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid world catalog configuration');
  const key=`${prefix}:worlds:v1`,regionKey=`${prefix}:regions:v1`,draftKey=`${prefix}:region-drafts:v1`,revocationKey=`${prefix}:approved-space-revocations:v1`;
  const decode=value=>{
    const world=JSON.parse(value);
    if(!world || typeof world!=='object' || Array.isArray(world) || validateWorldId(world.id)===DEFAULT_WORLD_ID
      || !clean(world.title,64) || !validDescription(world.description)
      || !['river-oaks','region-v1'].includes(world.template)
      || (world.template==='region-v1' && !/^[a-f0-9]{64}$/.test(world.regionSha256))
      || !clean(world.ownerId,200) || !Number.isSafeInteger(world.createdAt) || world.createdAt<0
      || world.revision!==undefined && (!Number.isSafeInteger(world.revision) || world.revision<1 || world.revision>100000)
      || world.updatedAt!==undefined && (!Number.isSafeInteger(world.updatedAt) || world.updatedAt<0))throw new Error('Invalid published world');
    return world;
  };
  const retained=async id=>(await redis.lrange(`${prefix}:region-history:${id}`,0,7))
    .map(raw=>retainedVersion(JSON.parse(raw),id,value=>decode(JSON.stringify(value))));
  return {
    approvedSpacesEnabled:offersApprovedSpaces(policy),
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
      const entry=publication(data,ownerId,now,policy);
      if(!entry)return {ok:false,reason:'invalid_world'};
      if(entry.error)return {ok:false,reason:entry.error,...(entry.detail?{detail:entry.detail}:{})};
      const result=await redis.eval(PUBLISH,3,key,regionKey,revocationKey,entry.world.id,JSON.stringify(entry.world),MAX_PUBLISHED_WORLDS,entry.encoded,...entry.sources);
      return result===1?{ok:true,world:entry.world}:result===0?{ok:false,reason:'world_exists'}
        :result===-2?{ok:false,reason:'approved_space_revoked'}:{ok:false,reason:'world_limit'};
    },
    async editable(id) {
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return null;
      const publishedRegion=editableRegionFromWorld(await this.getRegion(id));
      const raw=await redis.hget(draftKey,id),draft=raw?JSON.parse(raw):null;
      if(draft && (draft.id!==id || draft.baseRegionSha256!==world.regionSha256 || !clean(draft.editedBy,200)
        || !Number.isSafeInteger(draft.updatedAt) || draft.updatedAt<0 || !/^[a-f0-9]{64}$/.test(draft.compiledSha256)
        || !Number.isSafeInteger(draft.version) || draft.version<1 || draft.version>100001
        || digest(JSON.stringify(compileRegionPackage(draft.region,'Revision draft',{worldId:id})))!==draft.compiledSha256))throw new Error('Invalid region draft');
      return {world,publishedRegion,draft};
    },
    async history(id) {
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return {ok:false,reason:'missing'};
      return {ok:true,world,versions:(await retained(id)).map(entry=>entry.version)};
    },
    async version(id,revision,baseRegionSha256) {
      if(!validVersionRequest(revision,baseRegionSha256))return {ok:false,reason:'invalid_version'};
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return {ok:false,reason:'missing'};
      if(world.regionSha256!==baseRegionSha256)return {ok:false,reason:'stale'};
      const entry=(await retained(id)).find(value=>value.version.revision===revision);
      return entry?{ok:true,world,...entry}:{ok:false,reason:'missing_version'};
    },
    async saveDraft(data,editorId) {
      const draft=draftInput(data,editorId,now,policy);
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
    async revisionCandidate(id,expectedDraftVersion,actorId) {
      if(!Number.isSafeInteger(expectedDraftVersion) || expectedDraftVersion<1)return {ok:false,reason:'invalid_draft'};
      const editable=await this.editable(id);
      if(!editable)return {ok:false,reason:'missing'};
      const {world,draft}=editable;
      if(!draft || draft.version!==expectedDraftVersion)return {ok:false,reason:'draft_conflict'};
      if((world.revision??1)>=100000)return {ok:false,reason:'world_limit'};
      let worldData;
      try {worldData=compileRegionPackage(draft.region,world.title,{worldId:id,approvedSpaces:policy});} catch(error) {return {ok:false,reason:regionReason(error)};}
      const encoded=JSON.stringify(worldData),sources=approvedSpaceSources(worldData);
      if(sources.length && !sameOwner(actorId,world.ownerId))return {ok:false,reason:'not_owner'};
      const next={...world,revision:(world.revision??1)+1,updatedAt:now(),regionSha256:digest(encoded)};
      return {ok:true,world:next,worldData,encoded,expectedRegionSha256:world.regionSha256,expectedDraftVersion,sources,
        keys:{catalog:key,region:regionKey,draft:draftKey,history:`${prefix}:region-history:${id}`,revocations:revocationKey}};
    },
    /** Rechecked by the room just before it commits a revision; the commit rechecks revocation atomically. */
    async activationReason(candidate) {
      const revoked=candidate.sources?.length?new Set((await redis.smismember(revocationKey,...candidate.sources))
        .flatMap((member,index)=>member?[candidate.sources[index]]:[])):new Set();
      return activationReason(candidate,source=>revoked.has(source),policy);
    },
    /** Stop placing a reviewed revision. Live worlds keep their plan until their owner revises it. */
    async revokeApprovedSpace(source) {
      if(typeof source!=='string' || !/^[a-z0-9-]{1,48}@\d{1,5}$/.test(source))return {ok:false,reason:'invalid_source'};
      await redis.sadd(revocationKey,source);return {ok:true};
    },
  };
}

export function createMemoryWorldCatalog({now=Date.now,approvedSpaces:policy}={}) {
  const worlds=new Map(),regions=new Map(),drafts=new Map(),history=new Map(),revocations=new Set();
  return {
    approvedSpacesEnabled:offersApprovedSpaces(policy),
    async get(id) {return id===DEFAULT_WORLD_ID?{...defaultWorld}:worlds.get(id)??null;},
    async list() {return [{...defaultWorld},...[...worlds.values()].sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id))];},
    async getRegion(id) {return regions.has(id)?structuredClone(regions.get(id)):null;},
    async publish(data,ownerId) {
      const entry=publication(data,ownerId,now,policy);
      if(!entry)return {ok:false,reason:'invalid_world'};
      if(entry.error)return {ok:false,reason:entry.error,...(entry.detail?{detail:entry.detail}:{})};
      const {world,region}=entry;
      if(worlds.has(world.id))return {ok:false,reason:'world_exists'};
      if(worlds.size>=MAX_PUBLISHED_WORLDS)return {ok:false,reason:'world_limit'};
      if(entry.sources.some(source=>revocations.has(source)))return {ok:false,reason:'approved_space_revoked'};
      worlds.set(world.id,world);if(region)regions.set(world.id,region);return {ok:true,world};
    },
    async editable(id) {
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return null;
      return {world:structuredClone(world),publishedRegion:editableRegionFromWorld(await this.getRegion(id)),draft:structuredClone(drafts.get(id)??null)};
    },
    async history(id) {
      const world=await this.get(id);
      if(!world || world.template!=='region-v1')return {ok:false,reason:'missing'};
      return {ok:true,world:structuredClone(world),versions:(history.get(id)??[]).map(entry=>retainedVersion(entry,id).version)};
    },
    async version(id,revision,baseRegionSha256) {
      if(!validVersionRequest(revision,baseRegionSha256))return {ok:false,reason:'invalid_version'};
      const retained=await this.history(id);
      if(!retained.ok)return retained;
      if(retained.world.regionSha256!==baseRegionSha256)return {ok:false,reason:'stale'};
      const entry=(history.get(id)??[]).map(value=>retainedVersion(value,id)).find(value=>value.version.revision===revision);
      return entry?{ok:true,world:retained.world,...entry}:{ok:false,reason:'missing_version'};
    },
    async saveDraft(data,editorId) {
      const draft=draftInput(data,editorId,now,policy);
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
    async revisionCandidate(id,expectedDraftVersion,actorId) {
      if(!Number.isSafeInteger(expectedDraftVersion) || expectedDraftVersion<1)return {ok:false,reason:'invalid_draft'};
      const editable=await this.editable(id);
      if(!editable)return {ok:false,reason:'missing'};
      const {world,draft}=editable;
      if(!draft || draft.version!==expectedDraftVersion)return {ok:false,reason:'draft_conflict'};
      if((world.revision??1)>=100000)return {ok:false,reason:'world_limit'};
      let worldData;
      try {worldData=compileRegionPackage(draft.region,world.title,{worldId:id,approvedSpaces:policy});} catch(error) {return {ok:false,reason:regionReason(error)};}
      const encoded=JSON.stringify(worldData),sources=approvedSpaceSources(worldData);
      if(sources.length && !sameOwner(actorId,world.ownerId))return {ok:false,reason:'not_owner'};
      return {ok:true,world:{...world,revision:(world.revision??1)+1,updatedAt:now(),regionSha256:digest(encoded)},
        worldData,encoded,expectedRegionSha256:world.regionSha256,expectedDraftVersion,sources};
    },
    async activationReason(candidate) {return activationReason(candidate,source=>revocations.has(source),policy);},
    async revokeApprovedSpace(source) {
      if(typeof source!=='string' || !/^[a-z0-9-]{1,48}@\d{1,5}$/.test(source))return {ok:false,reason:'invalid_source'};
      revocations.add(source);return {ok:true};
    },
    async applyRevision(candidate) {
      if(!candidate?.ok)return {ok:false,reason:'invalid_draft'};
      const current=worlds.get(candidate.world.id),draft=drafts.get(candidate.world.id);
      if(!current || current.regionSha256!==candidate.expectedRegionSha256)return {ok:false,reason:'stale'};
      if(!draft || draft.version!==candidate.expectedDraftVersion)return {ok:false,reason:'draft_conflict'};
      // The final state change: revocation, assets and policy are checked in the same turn.
      const blocked=activationReason(candidate,source=>revocations.has(source),policy);
      if(blocked)return {ok:false,reason:blocked};
      const prior=history.get(current.id)??[];
      prior.unshift({world:structuredClone(current),region:structuredClone(regions.get(current.id))});
      history.set(current.id,prior.slice(0,8));
      worlds.set(current.id,structuredClone(candidate.world));regions.set(current.id,structuredClone(candidate.worldData));drafts.delete(current.id);
      return {ok:true,world:structuredClone(candidate.world)};
    },
  };
}
