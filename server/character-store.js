import { createHash } from 'node:crypto';
import { validateCharacterDefinition } from '../preview/src/character-definition.js';
import { MOVEMENTS, canUseAppearance, sharedAppearance } from '../preview/src/shared-appearances.js';

export const CHARACTER_STORE_LIMITS=Object.freeze({accounts:10000,revisions:64,receipts:64,recordBytes:256*1024});
const owner=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\s\x00-\x1f\x7f]/.test(value);
const requestId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);
const version=value=>Number.isSafeInteger(value)&&value>=0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=value=>createHash('sha256').update(value).digest('hex');
const empty=()=>({schemaVersion:2,version:0,deleted:false,draft:null,revisions:[],receipts:[],selection:null,selectionReceipts:[]});
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const checkOwner=id=>{if(!owner(id))fail('invalid_character_owner');};
const snapshot=state=>structuredClone({version:state.version,draft:state.draft,published:state.revisions.at(-1)??null,deleted:state.deleted});
const selected=state=>state.selection?structuredClone({version:state.selection.version,appearance:state.selection.appearance,
  movement:state.selection.movement,...(state.selection.revision===null?{}:{character:state.revisions[state.selection.revision-1]})}):null;

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
    const legacy=state.schemaVersion===1;
    if(!exact(state,['schemaVersion','version','deleted','draft','revisions','receipts',...(legacy?[]:['selection','selectionReceipts'])])||![1,2].includes(state.schemaVersion)
      ||!version(state.version)||legacy&&state.version<1||typeof state.deleted!=='boolean'
      ||!Array.isArray(state.revisions)||state.revisions.length>CHARACTER_STORE_LIMITS.revisions
      ||!Array.isArray(state.receipts)||state.receipts.length>CHARACTER_STORE_LIMITS.receipts
      ||state.revisions.length>state.version)throw new Error();
    if(legacy){state.schemaVersion=2;state.selection=null;state.selectionReceipts=[];}
    if(!Array.isArray(state.selectionReceipts)||state.selectionReceipts.length>CHARACTER_STORE_LIMITS.receipts
      ||state.version===0&&(state.selection===null||state.draft!==null))throw new Error();
    if(state.deleted){
      if(state.draft!==null||state.revisions.length||state.receipts.length||state.selection!==null||state.selectionReceipts.length)throw new Error();
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
    if(state.selection!==null){
      const value=state.selection,appearance=sharedAppearance(value?.appearance);
      if(!exact(value,['version','appearance','movement','revision'])||!version(value.version)||value.version<1
        ||appearance?.id!==value.appearance||!canUseAppearance(ownerId,value.appearance)||!MOVEMENTS.includes(value.movement)
        ||value.revision!==null&&(!Number.isSafeInteger(value.revision)||value.revision<1
          ||state.revisions[value.revision-1]?.appearanceId!==value.appearance))throw new Error();
    }
    const selectionIds=new Set();previous=1;
    for(const receipt of state.selectionReceipts){
      if(!exact(receipt,['id','fingerprint','appliedVersion'])||!requestId(receipt.id)||selectionIds.has(receipt.id)
        ||typeof receipt.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(receipt.fingerprint)
        ||!version(receipt.appliedVersion)||receipt.appliedVersion<=previous||!state.selection
        ||receipt.appliedVersion>state.selection.version)throw new Error();
      previous=receipt.appliedVersion;selectionIds.add(receipt.id);
    }
    return state;
  }catch{fail('invalid_character_record');}
}

function selectionCommand(command,ownerId){
  if(exact(command,['type','revision'])&&command.type==='character'&&Number.isSafeInteger(command.revision)&&command.revision>0)return {type:'character',revision:command.revision};
  if(exact(command,['type','appearance'])&&command.type==='appearance'){
    const appearance=sharedAppearance(command.appearance);
    if(appearance&&canUseAppearance(ownerId,appearance.id))return {type:'appearance',appearance:appearance.id};
  }
  if(exact(command,['type','movement'])&&command.type==='movement'&&MOVEMENTS.includes(command.movement))return {type:'movement',movement:command.movement};
  fail('invalid_character_selection');
}

export function characterSelectionOperation(ownerId,command,options){
  checkOwner(ownerId);
  const payload=selectionCommand(command,ownerId);
  if(!exact(options,['expectedVersion','requestId'])||!version(options.expectedVersion)||!requestId(options.requestId))fail('invalid_character_operation');
  const {expectedVersion,requestId:id}=options;
  return {command:payload,expectedVersion,requestId:id,fingerprint:hash(JSON.stringify({payload,expectedVersion}))};
}

function selectionResult(state,operation){
  if(state.deleted)fail('character_account_deleted');
  const receipt=state.selectionReceipts.find(item=>item.id===operation.requestId);
  if(!receipt)return null;
  if(receipt.fingerprint!==operation.fingerprint)fail('character_request_reused');
  return {selection:selected(state),appliedVersion:receipt.appliedVersion};
}

function initialSelection(state,value,ownerId){
  if(!object(value)||Object.keys(value).some(key=>!['appearance','movement','character','version'].includes(key))
    ||!MOVEMENTS.includes(value.movement)||value.version!==undefined&&(!version(value.version)||value.version<1))fail('invalid_character_selection');
  const appearance=selectionCommand({type:'appearance',appearance:value.appearance},ownerId).appearance;
  let revision=null;
  if(value.character!==undefined){
    const result=validateCharacterDefinition(value.character,{ownerId});
    if(!result.ok||result.definition.revision<1||result.definition.appearanceId!==appearance)fail('invalid_character_selection');
    revision=result.definition.revision;
    if(!state.revisions[revision-1])fail('character_revision_missing');
    if(JSON.stringify(state.revisions[revision-1])!==JSON.stringify(result.definition))fail('invalid_character_selection');
  }
  return {version:1,appearance,movement:value.movement,revision};
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
  // The immutable revision, tombstone and selected account state share one CAS.
  // Selection has its own version so movement never invalidates a private edit.
  // Room permission/cooldown validation must precede this trusted store boundary.
  async function mutateSelection(ownerId,payload,options,initialize=false){
    checkOwner(ownerId);
    const id=hash(ownerId);
    // Capture caller-owned values before awaiting storage.
    const operation=initialize?null:characterSelectionOperation(ownerId,payload,options);
    payload=initialize?payload:operation.command;
    payload=structuredClone(payload);
    const expectedVersion=operation?.expectedVersion,request=operation?.requestId,fingerprint=operation?.fingerprint;
    for(let attempt=0;attempt<8;attempt++){
      const old=await storage.get(id),state=decode(old,ownerId);
      if(state.deleted)fail('character_account_deleted');
      let receipt;
      if(initialize){
        if(state.selection)return selected(state);
        state.selection=initialSelection(state,payload,ownerId);
      }else{
        const prior=selectionResult(state,operation);
        if(prior)return prior;
        if(!state.selection)fail('character_selection_missing');
        if(state.selection.version!==expectedVersion)fail('character_selection_conflict');
        if(state.selection.version===Number.MAX_SAFE_INTEGER)fail('character_version_capacity');
        if(payload.type==='character'){
          const definition=state.revisions[payload.revision-1];
          if(!definition)fail('character_revision_missing');
          state.selection.appearance=definition.appearanceId;state.selection.revision=payload.revision;
        }else if(payload.type==='appearance'){
          state.selection.appearance=payload.appearance;state.selection.revision=null;
        }else state.selection.movement=payload.movement;
        state.selection.version++;
        receipt={id:request,fingerprint,appliedVersion:state.selection.version};
        state.selectionReceipts.push(receipt);
        if(state.selectionReceipts.length>CHARACTER_STORE_LIMITS.receipts)state.selectionReceipts.shift();
      }
      const raw=JSON.stringify(state);
      if(Buffer.byteLength(raw)>CHARACTER_STORE_LIMITS.recordBytes)fail('character_record_capacity');
      if(await storage.compareAndSet(id,old,raw))return initialize?selected(state):{selection:selected(state),appliedVersion:receipt.appliedVersion};
    }
    fail('character_selection_conflict');
  }
  return {
    async get(ownerId){return snapshot(await read(ownerId));},
    async getSelection(ownerId){return selected(await read(ownerId));},
    async getSelectionResult(ownerId,command,options){
      const operation=characterSelectionOperation(ownerId,command,options);
      return selectionResult(await read(ownerId),operation);
    },
    initializeSelection:(ownerId,preference)=>mutateSelection(ownerId,preference,null,true),
    changeSelection:(ownerId,command,options)=>mutateSelection(ownerId,command,options),
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
