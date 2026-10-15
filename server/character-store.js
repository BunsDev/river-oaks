import { createHash } from 'node:crypto';
import { validateCharacterDefinition } from '../preview/src/character-definition.js';

export const CHARACTER_STORE_LIMITS=Object.freeze({accounts:10000,revisions:64,receipts:64,recordBytes:256*1024});
const owner=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\s\x00-\x1f\x7f]/.test(value);
const requestId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);
const version=value=>Number.isSafeInteger(value)&&value>=0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=value=>createHash('sha256').update(value).digest('hex');
const empty=()=>({schemaVersion:1,version:0,deleted:false,draft:null,revisions:[],receipts:[]});
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const checkOwner=id=>{if(!owner(id))fail('invalid_character_owner');};
const snapshot=state=>structuredClone({version:state.version,draft:state.draft,published:state.revisions.at(-1)??null,deleted:state.deleted});

function canonical(value,ownerId,revision,code='invalid_character_definition'){
  const result=validateCharacterDefinition(value,{ownerId});
  if(!result.ok||result.definition.revision!==revision)fail(code);
  return result.definition;
}

function decode(raw,ownerId){
  if(raw===null)return empty();
  try{
    if(typeof raw!=='string'||Buffer.byteLength(raw)>CHARACTER_STORE_LIMITS.recordBytes)throw new Error();
    const state=JSON.parse(raw);
    if(!exact(state,['schemaVersion','version','deleted','draft','revisions','receipts'])||state.schemaVersion!==1
      ||!version(state.version)||state.version<1||typeof state.deleted!=='boolean'
      ||!Array.isArray(state.revisions)||state.revisions.length>CHARACTER_STORE_LIMITS.revisions
      ||!Array.isArray(state.receipts)||state.receipts.length>CHARACTER_STORE_LIMITS.receipts
      ||state.revisions.length>state.version)throw new Error();
    if(state.deleted){
      if(state.draft!==null||state.revisions.length||state.receipts.length)throw new Error();
      return state;
    }
    if(state.draft!==null)state.draft=canonical(state.draft,ownerId,0,'invalid_character_record');
    state.revisions=state.revisions.map((item,i)=>canonical(item,ownerId,i+1,'invalid_character_record'));
    const ids=new Set();let previous=0;
    for(const receipt of state.receipts){
      if(!exact(receipt,['id','fingerprint','appliedVersion','revision'])||!requestId(receipt.id)||ids.has(receipt.id)
        ||typeof receipt.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(receipt.fingerprint)
        ||!version(receipt.appliedVersion)||receipt.appliedVersion<=previous||receipt.appliedVersion>state.version
        ||receipt.revision!==null&&(!Number.isSafeInteger(receipt.revision)||receipt.revision<1||receipt.revision>state.revisions.length))throw new Error();
      previous=receipt.appliedVersion;ids.add(receipt.id);
    }
    return state;
  }catch{fail('invalid_character_record');}
}

function operation(state,kind,payload,{expectedVersion,requestId:id}={}){
  if(!version(expectedVersion)||!requestId(id))fail('invalid_character_operation');
  if(state.deleted)fail('character_account_deleted');
  const fingerprint=hash(JSON.stringify({kind,payload,expectedVersion}));
  const prior=state.receipts.find(receipt=>receipt.id===id);
  if(prior){
    if(prior.fingerprint!==fingerprint)fail('character_request_reused');
    return {unchanged:true,receipt:prior};
  }
  if(expectedVersion!==state.version)fail('character_conflict');
  if(state.version===Number.MAX_SAFE_INTEGER)fail('character_version_capacity');
  let revision=null;
  if(kind==='draft')state.draft=payload;
  else{
    const source=kind==='publish'?state.draft:state.revisions[payload-1];
    if(!source)fail(kind==='publish'?'character_draft_missing':'character_revision_missing');
    if(state.revisions.length>=CHARACTER_STORE_LIMITS.revisions)fail('character_revision_capacity');
    revision=state.revisions.length+1;
    state.revisions.push({...structuredClone(source),revision});
  }
  state.version++;
  const receipt={id,fingerprint,appliedVersion:state.version,revision};
  state.receipts.push(receipt);
  if(state.receipts.length>CHARACTER_STORE_LIMITS.receipts)state.receipts.shift();
  return {unchanged:false,receipt};
}

function createStore(storage){
  const read=async ownerId=>{checkOwner(ownerId);return decode(await storage.get(hash(ownerId)),ownerId);};
  async function mutate(ownerId,kind,payload,options){
    checkOwner(ownerId);
    if(kind==='draft')payload=canonical(payload,ownerId,0);
    if(kind==='rollback'&&(!Number.isSafeInteger(payload)||payload<1))fail('invalid_character_operation');
    const id=hash(ownerId);
    for(let attempt=0;attempt<8;attempt++){
      const old=await storage.get(id),state=decode(old,ownerId);
      const result=operation(state,kind,payload,options);
      const response={state:snapshot(state),appliedVersion:result.receipt.appliedVersion,revision:result.receipt.revision};
      if(result.unchanged)return response;
      const raw=JSON.stringify(state);
      if(Buffer.byteLength(raw)>CHARACTER_STORE_LIMITS.recordBytes)fail('character_record_capacity');
      if(await storage.compareAndSet(id,old,raw))return response;
      // Re-read on an atomic CAS miss: the same request can replay its receipt;
      // a competing editor will fail the explicit version comparison.
    }
    fail('character_conflict');
  }
  return {
    async get(ownerId){return snapshot(await read(ownerId));},
    async getRevision(ownerId,revision){
      if(!Number.isSafeInteger(revision)||revision<1)fail('invalid_character_operation');
      const state=await read(ownerId);return structuredClone(state.revisions[revision-1]??null);
    },
    saveDraft:(ownerId,definition,options)=>mutate(ownerId,'draft',definition,options),
    publish:(ownerId,options)=>mutate(ownerId,'publish',null,options),
    rollback:(ownerId,revision,options)=>mutate(ownerId,'rollback',revision,options),
    async deleteAccount(ownerId){
      checkOwner(ownerId);const id=hash(ownerId);
      for(let attempt=0;attempt<8;attempt++){
        const old=await storage.get(id);let state;
        // Account deletion must also remove corrupt private records. Only the
        // trusted account-deletion boundary calls this unconditional operation.
        try{state=decode(old,ownerId);}catch{state=empty();}
        if(state.deleted)return;
        const deleted={...empty(),version:Math.min(Number.MAX_SAFE_INTEGER,state.version+1),deleted:true};
        if(await storage.compareAndSet(id,old,JSON.stringify(deleted)))return;
      }
      fail('character_conflict');
    },
  };
}

export function createMemoryCharacterStore(){
  const records=new Map();
  return createStore({
    async get(id){return records.get(id)??null;},
    async compareAndSet(id,old,raw){
      if((records.get(id)??null)!==old)return false;
      if(!records.has(id)&&records.size>=CHARACTER_STORE_LIMITS.accounts)fail('character_account_capacity');
      records.set(id,raw);return true;
    },
  });
}

const CAS=`
  local old=redis.call('HGET',KEYS[1],ARGV[1])
  if (old and '1' or '0') ~= ARGV[5] or (old or '') ~= ARGV[2] then return 0 end
  if not old and redis.call('HLEN',KEYS[1]) >= tonumber(ARGV[4]) then return -1 end
  redis.call('HSET',KEYS[1],ARGV[1],ARGV[3])
  return 1
`;
export function createRedisCharacterStore({redis,prefix}={}){
  if(!redis?.hget||!redis?.eval||typeof prefix!=='string'||!/^\{[^{}]+\}$/.test(prefix))throw new TypeError('Invalid character storage');
  const key=`${prefix}:characters:v1`;
  return createStore({
    get:id=>redis.hget(key,id),
    async compareAndSet(id,old,raw){
      const result=await redis.eval(CAS,1,key,id,old??'',raw,CHARACTER_STORE_LIMITS.accounts,old===null?'0':'1');
      if(result===-1)fail('character_account_capacity');
      return result===1;
    },
  });
}
