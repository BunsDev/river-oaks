import { recoverDistrictCommonsCheckpoint } from './district-commons-checkpoint-migration.js';
import { characterSelectionOperation } from './character-store.js';
import { defaultAppearanceFor } from '../preview/src/shared-appearances.js';
import { randomUUID } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { createSharedWorld, migrateWorldCheckpoint } from './world.js';
import { recoverDistrictHeightCheckpoint } from './district-checkpoint-migration.js';
import { recoverDistrictInteriorCheckpoint } from './district-interior-checkpoint-migration.js';
import { recoverDistrictLevelsCheckpoint } from './district-level-checkpoint-migration.js';
import { recoverDistrictTowerCheckpoint } from './district-tower-checkpoint-migration.js';
import { recoverDistrictGardensCheckpoint } from './district-gardens-checkpoint-migration.js';
import { isJevicaAdmin } from './admin.js';
import { districtRevisionOf } from '../preview/src/garden-campus-district.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { placesOf } from '../preview/src/places.js';
import { createRideFlush } from './ride-flush.js';

const LEASE_MS=5000, REPLY_MS=15000, REQUEST_MS=7000, TICK_MS=200;
// The lease token's generation (see createRedisRoom): plain rooms write it, selection-aware rooms one more.
export const WRITER_GENERATION=19;
// A player whose socket left (or whose edge stopped reporting) keeps their place, seat and
// hosting this long, so a reconnect on a slow network resumes instead of starting over.
export const LEAVE_GRACE_MS=30_000;
// An edge that stops reporting a connection (it crashed or lost Redis) is given longer than a
// clean leave: its players reconnect elsewhere within the grace either way.
export const HEARTBEAT_TIMEOUT_MS=40_000;
const MAX_QUEUE=4096, BATCH_SIZE=256, MAX_BYTES=16*1024*1024;
const MAX_SELECTIONS=64,MAX_SELECTION_REPLIES=8;
const selectionTypes=['appearance','character','movement'];
const terminalSelectionErrors=new Set(['character_selection_conflict','character_request_reused','character_account_deleted',
  'character_revision_missing','character_selection_missing','character_version_capacity','character_record_capacity',
  'character_account_capacity','invalid_character_selection','invalid_character_operation','invalid_character_owner','invalid_character_record']);
const ENQUEUE=`
  if redis.call('LLEN',KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
  redis.call('RPUSH',KEYS[1],ARGV[2])
  return 1
`;
const ACQUIRE=`
  local owner = redis.call('GET',KEYS[1])
  local generation = owner and tonumber(string.match(owner,'^v(%d+):')) or 2
  local requested = tonumber(string.match(ARGV[1],'^v(%d+):')) or 2
  if owner and generation < requested then
    redis.call('DEL',KEYS[1])
    owner = false
  end
  local owned = owner == ARGV[1]
  if owned then redis.call('PEXPIRE',KEYS[1],ARGV[2])
  elseif not redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]) then
    return {0,false,{},redis.call('GET',KEYS[4])}
  end
  local checkpoint = false
  if not owned or ARGV[4] == '1' then checkpoint = redis.call('GET',KEYS[2]) end
  return {owned and 1 or 2,checkpoint,redis.call('LRANGE',KEYS[3],0,tonumber(ARGV[3])-1),false}
`;
const RELEASE=`
  if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end
  return 0
`;
// Every durable mutation, including replies and queue removal, is fenced by the
// same lease token. No result is visible until its world state is committed.
const COMMIT=`-- COMMIT_ROOM
  if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
  local replies=tonumber(ARGV[7])
  if ARGV[8] ~= '' then
    local offset=5+replies
    local oldMeta=redis.call('HGET',KEYS[offset+1],ARGV[8])
    local oldRegion=redis.call('HGET',KEYS[offset+2],ARGV[8])
    local draft=redis.call('HGET',KEYS[offset+3],ARGV[8])
    if not oldMeta or not oldRegion or not draft then return 0 end
    local meta=cjson.decode(oldMeta)
    if meta.regionSha256 ~= ARGV[9] or cjson.decode(draft).version ~= tonumber(ARGV[10]) then return 0 end
    redis.call('LPUSH',KEYS[offset+4],cjson.encode({world=meta,region=oldRegion}))
    redis.call('LTRIM',KEYS[offset+4],0,7)
    redis.call('HSET',KEYS[offset+1],ARGV[8],ARGV[11])
    redis.call('HSET',KEYS[offset+2],ARGV[8],ARGV[12])
    redis.call('HDEL',KEYS[offset+3],ARGV[8])
  end
  redis.call('SET',KEYS[2],ARGV[2])
  redis.call('SET',KEYS[3],ARGV[3])
  redis.call('SET',KEYS[5],ARGV[13],'EX',30)
  if tonumber(ARGV[4]) > 0 then redis.call('LTRIM',KEYS[4],ARGV[4],-1) end
  for i=1,replies do redis.call('SET',KEYS[5+i],ARGV[13+i],'PX',ARGV[6]) end
  redis.call('PEXPIRE',KEYS[1],ARGV[5])
  return 1
`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rejected=error=>({ok:false,error,message:error});
const id=value=>typeof value==='string' && value.length>0 && value.length<=160;
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const pack=value=>{
  const json=JSON.stringify(value);
  if(Buffer.byteLength(json)>MAX_BYTES)throw new Error('Town state capacity exceeded');
  return deflateSync(json);
};
const unpack=buffer=>JSON.parse(inflateSync(buffer,{maxOutputLength:MAX_BYTES}).toString('utf8'));
const validIdentity=identity=>record(identity) && id(identity.userId) && id(identity.sessionId)
  && typeof identity.name==='string' && identity.name.length<=80 && Number.isFinite(identity.expiresAt);
function validOperation(operation) {
  if(!record(operation))return false;
  if(operation.type==='join')return validIdentity(operation.identity) && id(operation.connectionId);
  if(operation.type==='kick')return id(operation.userId) && (operation.sessionId===undefined || id(operation.sessionId));
  if(operation.type==='revise')return id(operation.actorId) && Number.isSafeInteger(operation.expectedDraftVersion)
    && operation.expectedDraftVersion>=1 && operation.expectedDraftVersion<=100001;
  return ['command','heartbeat','leave'].includes(operation.type) && id(operation.userId) && id(operation.connectionId)
    && (operation.type!=='command' || record(operation.message));
}

function restoreSelections(previous,enabled){
  const pending=new Map(),versions=new Map(),replies=new Set();
  if(previous?.version!==3)return {pending,versions};
  const fail=()=>{throw new Error('Invalid durable character selection');};
  if(!enabled||!Array.isArray(previous.pendingSelections)||previous.pendingSelections.length>MAX_SELECTIONS
    ||!Array.isArray(previous.selectionVersions)||previous.selectionVersions.length>MAX_SELECTIONS)fail();
  for(const value of previous.pendingSelections){
    if(!record(value)||Object.keys(value).length!==7||!id(value.userId)||pending.has(value.userId)
      ||!id(value.connectionId)||!validIdentity(value.identity)||value.identity.userId!==value.userId
      ||!Number.isFinite(value.preparedAt)||value.preparedAt<0||value.preparedAt>previous.lastTick
      ||typeof value.appearanceChanged!=='boolean'||!record(value.operation)||Object.keys(value.operation).length!==4
      ||!Array.isArray(value.replyIds)||!value.replyIds.length||value.replyIds.length>MAX_SELECTION_REPLIES)fail();
    let operation;
    try{operation=characterSelectionOperation(value.userId,value.operation.command,
      {expectedVersion:value.operation.expectedVersion,requestId:value.operation.requestId});}catch{fail();}
    if(operation.fingerprint!==value.operation.fingerprint)fail();
    for(const reply of value.replyIds){if(typeof reply!=='string'||!/^[a-f0-9-]{36}$/.test(reply)||replies.has(reply))fail();replies.add(reply);}
    pending.set(value.userId,structuredClone({...value,operation}));
  }
  for(const entry of previous.selectionVersions){
    if(!Array.isArray(entry)||entry.length!==2||!id(entry[0])||versions.has(entry[0])
      ||!Number.isSafeInteger(entry[1])||entry[1]<1)fail();
    versions.set(...entry);
  }
  return {pending,versions};
}

/** Private room coordinator. Authentication and connection IDs come from the server. */
export function createRedisRoom({redis,prefix,worldData,worldId=DEFAULT_WORLD_ID,now=Date.now,authorize,isAdmin=isJevicaAdmin,regionCatalog=null,regionSha256=null,avatarPreferences=null,characters=null,voice=null,cyclingMiles=null,screeningHosts=[],officeLayout,campusOperators=[],districtEpoch=0}) {
  if(!redis || typeof authorize!=='function' || typeof prefix!=='string' || !prefix || prefix.length>180) throw new Error('Invalid room configuration');
  validateWorldId(worldId);
  if(characters&&!['getSelection','initializeSelection','getSelectionResult','changeSelection','getRevision'].every(key=>typeof characters[key]==='function'))throw new Error('Invalid character selection store');
  const tag=prefix.includes('{')?prefix:`{${prefix}}`;
  // The tick merges each commit's drain by hand (see runTick), so no world getter.
  const rides=cyclingMiles?createRideFlush({world:()=>null,store:cyclingMiles,warn:detail=>console.warn(JSON.stringify({...detail,worldId}))}):null;
  if(!/^\{[^{}]+\}$/.test(tag))throw new Error('Room prefix must be one Redis hash tag');
  const keys={lease:`${tag}:lease`,state:`${tag}:state`,view:`${tag}:view`,queue:`${tag}:queue`,population:`${tag}:population`};
  // Monotonic writer generation, not the checkpoint version. A newer writer atomically fences an
  // older lease; peers/future generations retain it. Until checkpoint v13 (garden campus leases)
  // the generation was the checkpoint version, one more for selection-aware rooms, which
  // additionally require durable envelope v3 intents: so v13 and v14 writers both write v13
  // checkpoints. Checkpoint v14 (world rules, #596) must fence both, so its writers are v15 and
  // v16; checkpoint v15 (crime, #597) writers are v17 and v18; checkpoint v16 (police, #598) writers are v19 and v20. Raise WRITER_GENERATION by two with every checkpoint version an older writer cannot read.
  const token=`v${characters?WRITER_GENERATION+1:WRITER_GENERATION}:${randomUUID()}`;
  // The default district's revision and the operator's switch epoch (#512): a town committed
  // at a newer epoch, or at this epoch under another revision, is never coordinated here.
  if(!Number.isSafeInteger(districtEpoch) || districtEpoch<0)throw new Error('Invalid district epoch');
  const district=worldId===DEFAULT_WORLD_ID?{revision:districtRevisionOf(worldData),epoch:districtEpoch}:null;
  // Every replacement and recovery probe uses this coordinator's current configuration.
  const worldOptions={now,isAdmin,worldId,screeningHosts,officeLayout,campusOperators};
  let closed=false,pendingTick=null,lastAttempt=-Infinity,lastView=null,cached=null;
  async function read() {
    const buffer=await redis.getBuffer(keys.view);
    lastView=buffer?unpack(buffer):null;
    return lastView;
  }
  async function runTick() {
    if(closed)return null;
    if(performance.now()-lastAttempt<TICK_MS)return lastView;
    lastAttempt=performance.now();
    const [ownership,stored,batch,otherView]=await redis.evalBuffer(ACQUIRE,4,keys.lease,keys.state,keys.queue,keys.view,token,LEASE_MS,BATCH_SIZE,cached?'0':'1');
    if(!ownership){cached=null;lastView=otherView?unpack(otherView):null;return lastView;}
    // A fresh lease always reloads durable state, even for this process's token.
    // A tentative mutation is reusable only after its fenced commit succeeds.
    if(ownership===2)cached=null;
    const time=now();
    let previous=cached?.previous??null,connections=cached?.connections??new Map();
    if(!cached && stored) {
      previous=unpack(stored);
    }
    let currentData=cached?.currentData??worldData;
    let currentHash=cached?.currentHash??previous?.regionSha256??regionSha256;
    if(!cached && previous?.regionSha256 && previous.regionSha256!==regionSha256) {
      if(!regionCatalog || (await regionCatalog.get(worldId))?.regionSha256!==previous.regionSha256)
        throw new Error('Invalid durable town region');
      currentData=await regionCatalog.getRegion(worldId);
    }
    let world=cached?.world??createSharedWorld(currentData,worldOptions);
    let districtMigration = null;
    if(!cached && previous) {
      let checkpointReason = 'unknown';
      if(!record(previous) || !(previous.version===1 && worldId===DEFAULT_WORLD_ID || [2,...(characters?[3]:[])].includes(previous.version) && previous.worldId===worldId)
        || !Number.isSafeInteger(previous.revision) || previous.revision<0
        || (previous.regionSha256!==undefined && (worldId===DEFAULT_WORLD_ID || !/^[a-f0-9]{64}$/.test(previous.regionSha256)))
        || !Number.isFinite(previous.lastTick) || !Array.isArray(previous.connections)) {
        const error = new Error('Invalid durable town checkpoint');
        error.checkpointReason = checkpointReason;
        throw error;
      }
      if (district) {
        const saved = previous.district ?? { revision: null, epoch: 0 };
        if (saved.epoch > district.epoch || saved.epoch === district.epoch && (saved.revision ?? null) !== district.revision) {
          const error = new Error('Invalid durable town district');
          error.checkpointReason = saved.epoch > district.epoch ? 'newer_district_epoch' : 'district_epoch_unchanged';
          throw error;
        }
      }
      if (!world.restore(previous.checkpoint, { onFailure: reason => { checkpointReason = reason; } }).ok) {
        // The garage/Gardens district revision switch (#512) chains the older garage recoveries itself.
        const commons = recoverDistrictCommonsCheckpoint({ worldData: currentData, checkpoint: previous.checkpoint, ...worldOptions });
        const gardens = commons.ok ? commons : recoverDistrictGardensCheckpoint({ worldData: currentData, checkpoint: previous.checkpoint, ...worldOptions });
        const tower = gardens.ok ? gardens : recoverDistrictTowerCheckpoint({ worldData: currentData, checkpoint: previous.checkpoint, ...worldOptions });
        const levels = tower.ok ? tower : recoverDistrictLevelsCheckpoint({ worldData: currentData, checkpoint: previous.checkpoint, ...worldOptions });
        const interior = levels.ok ? levels : recoverDistrictInteriorCheckpoint({ worldData: currentData, checkpoint: previous.checkpoint, ...worldOptions });
        const recovered = interior.ok ? interior
          : recoverDistrictHeightCheckpoint({ worldData: currentData, checkpoint: previous.checkpoint, ...worldOptions });
        if (!recovered.ok || !world.restore(recovered.checkpoint, { onFailure: reason => { checkpointReason = reason; } }).ok) {
          const error = new Error('Invalid durable town checkpoint');
          error.checkpointReason = checkpointReason;
          throw error;
        }
        districtMigration = commons.ok ? { kind: 'commons', from: commons.from, to: commons.to, moved: commons.moved.length }
          : gardens.ok ? { kind: 'gardens', from: gardens.from, to: gardens.to, moved: gardens.moved.length }
          : tower.ok ? { kind: 'tower', from: tower.from }
          : levels.ok ? { kind: 'levels', from: levels.from }
          : interior.ok ? { kind: 'interior', from: interior.from }
          : { kind: 'height', from: recovered.revision };
      }
      for(const connection of previous.connections) {
        if(!record(connection) || !validIdentity(connection.identity) || !id(connection.connectionId) || !Number.isFinite(connection.lastSeen)
          || !(connection.leftAt===null || Number.isFinite(connection.leftAt)) || connections.has(connection.identity.userId)
          || !world.players.has(connection.identity.userId)) throw new Error('Invalid durable town presence');
        connections.set(connection.identity.userId,connection);
      }
      if(connections.size!==world.players.size)throw new Error('Invalid durable town roster');
    }
    const {pending:pendingSelections,versions:selectionVersions}=restoreSelections(previous,Boolean(characters));
    for(const userId of selectionVersions.keys())if(!world.players.has(userId))throw new Error('Invalid durable character selection');
    // Cache only within this commit: presence and queued commands share current
    // ban/session checks, while the next tick observes revocation immediately.
    const authorizations=new Map();
    const allowed=identity=>{
      const key=JSON.stringify([identity.userId,identity.sessionId]);
      if(!authorizations.has(key))authorizations.set(key,Promise.resolve().then(()=>authorize(identity)).then(value=>value===true));
      return authorizations.get(key);
    };
    const removedUsers=[];
    const remove=userId=>{connections.delete(userId);selectionVersions.delete(userId);world.leave(userId);removedUsers.push(userId);};
    const presence=await Promise.all([...connections.values()].map(async connection=>({connection,authorized:await allowed(connection.identity)})));
    for(const {connection,authorized} of presence) {
      if(!authorized || time-connection.identity.expiresAt>=10000 || connection.leftAt!==null && time-connection.leftAt>=LEAVE_GRACE_MS || time-connection.lastSeen>=HEARTBEAT_TIMEOUT_MS) remove(connection.identity.userId);
    }
    // Real clocks govern cooldowns/presence; simulation never catches up offline.
    if(connections.size)world.step(previous?Math.min(0.25,Math.max(0,(time-previous.lastTick)/1000)):0);
    // Accepted bicycle metres leave the world here, so the checkpoint carries
    // none; they reach the (cross-world) store only once this tick commits,
    // and off the lease's critical path. A lost lease drops this tick's drain:
    // the previous checkpoint, which the next owner loads, still holds it.
    const drained=rides?world.drainRides():[];
    let revisionUpdate=null;
    const replies=[];
    const accountSelection=async userId=>{
      const current=await characters.getSelection(userId);
      if(current)return current;
      const local=world.accountAppearance(userId);
      const legacy=avatarPreferences?(await avatarPreferences.get(userId)??await avatarPreferences.initialize(userId,local)):local;
      return characters.initializeSelection(userId,legacy);
    };
    const projectSelection=(userId,preference,appearanceChanged=false)=>{
      if(!preference||!world.players.has(userId))return;
      if(preference.version<(selectionVersions.get(userId)??0))return world.applyAccountAppearance(userId,world.accountAppearance(userId));
      const player=world.commitAccountSelection(userId,preference,{appearanceChanged});
      selectionVersions.set(userId,preference.version);
      return player;
    };
    const clearDeletedSelection=userId=>{
      selectionVersions.delete(userId);
      return world.applyAccountAppearance(userId,{appearance:defaultAppearanceFor(userId),movement:'upright'});
    };
    const syncAccount=async userId=>{
      if(characters){
        if(!pendingSelections.has(userId))try{projectSelection(userId,await accountSelection(userId));}
        catch(error){if(error.code==='character_account_deleted')clearDeletedSelection(userId);else throw error;}
        return;
      }
      if(!avatarPreferences)return;
      const preference=await avatarPreferences.get(userId)
        ?? await avatarPreferences.initialize(userId,world.accountAppearance(userId));
      world.applyAccountAppearance(userId,preference);
    };
    const selectionReply=(userId,result,appearanceChanged=false)=>{
      const player=projectSelection(userId,result.selection,appearanceChanged);
      return {ok:true,appliedVersion:result.appliedVersion,selectionVersion:Math.max(result.selection.version,selectionVersions.get(userId)??0),...(player?{player}:{})};
    };
    // Only intents read from the previous fenced commit may mutate accounts.
    // A lost reply/lease is recovered by the same durable account receipt.
    for(const intent of pendingSelections.values()){
      let result;
      const opts={expectedVersion:intent.operation.expectedVersion,requestId:intent.operation.requestId};
      try{
        let applied=await characters.getSelectionResult(intent.userId,intent.operation.command,opts);
        if(!applied){
          const connection=connections.get(intent.userId);
          if(!connection||connection.connectionId!==intent.connectionId||intent.identity.expiresAt<=time||!await allowed(intent.identity))result=rejected('session_invalid');
          else applied=await characters.changeSelection(intent.userId,intent.operation.command,opts);
        }
        if(applied)result=selectionReply(intent.userId,applied,intent.appearanceChanged);
      }catch(error){
        if(!terminalSelectionErrors.has(error.code))continue;
        result=rejected(error.code);
        if(error.code==='character_account_deleted'){
          clearDeletedSelection(intent.userId);
        }else try{projectSelection(intent.userId,await characters.getSelection(intent.userId));}catch{ /* Next heartbeat retries account sync. */ }
      }
      if(result){pendingSelections.delete(intent.userId);for(const id of intent.replyIds)replies.push({key:`${tag}:reply:${id}`,result});}
    }
    async function apply(operation,queueId) {
      if(!validOperation(operation))return rejected('invalid_operation');
      if(operation.type==='revise') {
        if(pendingSelections.size)return rejected('world_busy');
        if(!regionCatalog || !isAdmin(operation.actorId) || revisionUpdate)return rejected('admin_only');
        const candidate=await regionCatalog.revisionCandidate(worldId,operation.expectedDraftVersion);
        if(!candidate.ok)return rejected(candidate.reason);
        let checkpoint;
        try {checkpoint=world.checkpoint();} catch {return rejected('world_busy');}
        const migrated=migrateWorldCheckpoint({fromData:currentData,toData:candidate.worldData,checkpoint,...worldOptions});
        if(!migrated.ok)return rejected(migrated.error);
        const next=createSharedWorld(candidate.worldData,worldOptions);
        if(!next.restore(migrated.checkpoint).ok)return rejected('incompatible_region');
        if(rides)drained.push(...world.drainRides());
        world=next;currentData=candidate.worldData;currentHash=candidate.world.regionSha256;
        connections.clear();selectionVersions.clear();revisionUpdate=candidate;
        return {ok:true,world:candidate.world,disconnectedPlayers:migrated.disconnectedPlayers,
          clearedWishes:migrated.clearedWishes};
      }
      if(operation.type==='join') {
        if(pendingSelections.has(operation.identity.userId))return rejected('character_selection_pending');
        if(operation.identity.expiresAt<=time || !await allowed(operation.identity))return rejected('session_invalid');
        let result;
        if(world.players.has(operation.identity.userId)) {
          result={ok:true,player:world.rename(operation.identity)};
        } else result=world.join(operation.identity);
        if(result.ok && (avatarPreferences||characters)) {
          // A full or broken appearance store (or a look removed from the catalog)
          // must not keep anyone out of the town: they keep the default look.
          try {
            if(characters)result.player=projectSelection(operation.identity.userId,await accountSelection(operation.identity.userId));
            else{
              const preference=await avatarPreferences.initialize(operation.identity.userId,world.accountAppearance(operation.identity.userId));
              result.player=world.applyAccountAppearance(operation.identity.userId,preference);
            }
          } catch(error) {
            if(characters&&error.code==='character_account_deleted')result.player=clearDeletedSelection(operation.identity.userId);
            else console.warn(JSON.stringify({event:'room_appearance_unavailable',worldId}));
          }
        }
        if(result.ok)connections.set(operation.identity.userId,{identity:operation.identity,connectionId:operation.connectionId,lastSeen:time,leftAt:null});
        return result;
      }
      const connection=connections.get(operation.userId);
      if(operation.type==='kick') {
        if(connection && (!operation.sessionId || operation.sessionId===connection.identity.sessionId))remove(operation.userId);
        return {ok:true};
      }
      if(!connection || connection.connectionId!==operation.connectionId || connection.leftAt!==null)return rejected('stale_connection');
      if(!await allowed(connection.identity)){remove(operation.userId);return rejected('session_invalid');}
      if(connection.identity.expiresAt<=time)return rejected('session_expired');
      if(operation.type==='leave'){connection.leftAt=time;return {ok:true};}
      connection.lastSeen=time;
      if(operation.type==='heartbeat') {
        await syncAccount(operation.userId);
        return {ok:true};
      }
      if(characters&&selectionTypes.includes(operation.message.type)){
        try{
          const metadata=operation.selection===undefined&&operation.message.type!=='character'
            ?{expectedVersion:(await accountSelection(operation.userId)).version,requestId:queueId}:operation.selection;
          const selection=characterSelectionOperation(operation.userId,operation.message,metadata);
          const pending=pendingSelections.get(operation.userId);
          if(pending){
            if(pending.operation.requestId===selection.requestId&&pending.operation.fingerprint!==selection.fingerprint)return rejected('character_request_reused');
            if(pending.operation.requestId!==selection.requestId)return rejected('character_selection_pending');
            if(pending.replyIds.includes(queueId))return null;
            if(pending.replyIds.length>=MAX_SELECTION_REPLIES)return rejected('character_selection_pending');
            pending.replyIds.push(queueId);return null;
          }
          const replay=await characters.getSelectionResult(operation.userId,selection.command,metadata);
          if(replay)return selectionReply(operation.userId,replay);
          const current=await accountSelection(operation.userId);
          if(current.version!==selection.expectedVersion||current.version<(selectionVersions.get(operation.userId)??0))return rejected('character_selection_conflict');
          projectSelection(operation.userId,current);
          const definition=selection.command.type==='character'?await characters.getRevision(operation.userId,selection.command.revision):null;
          if(selection.command.type==='character'&&!definition)return rejected('character_revision_missing');
          const prepared=world.prepareAccountSelection(operation.userId,selection.command,{characterDefinition:definition});
          if(!prepared.ok)return prepared;
          if(pendingSelections.size>=MAX_SELECTIONS)return rejected('character_selection_pending');
          const appearanceChanged=selection.command.type==='character'?current.character?.revision!==selection.command.revision
            :selection.command.type==='appearance'&&(current.appearance!==selection.command.appearance||Boolean(current.character));
          const {userId,name,sessionId,expiresAt}=connection.identity;
          pendingSelections.set(operation.userId,{userId,connectionId:operation.connectionId,identity:{userId,name,sessionId,expiresAt},
            operation:selection,preparedAt:time,appearanceChanged,replyIds:[queueId]});
          return null;
        }catch(error){return rejected(terminalSelectionErrors.has(error.code)?error.code:'character_unavailable');}
      }
      if(pendingSelections.has(operation.userId))return rejected('character_selection_pending');
      if(avatarPreferences && ['appearance','movement'].includes(operation.message.type))
        await syncAccount(operation.userId);
      const result=world.command(operation.userId,operation.message,{sessionId:connection.identity.sessionId??null});
      if(result.ok && avatarPreferences && ['appearance','movement'].includes(operation.message.type))
        await avatarPreferences.save(operation.userId,world.accountAppearance(operation.userId));
      return result;
    }
    // Each operation is isolated. A throw used to abort the tick before the
    // commit trimmed the queue, so the same entry re-threw on every later tick
    // and the world froze. Now it fails alone: a malformed entry is dropped
    // with the batch, and a failing operation is answered and undone.
    for(const raw of batch) {
      let entry=null;
      try {entry=JSON.parse(raw);} catch { /* dropped below */ }
      if(!record(entry) || typeof entry.id!=='string' || !/^[a-f0-9-]{36}$/.test(entry.id)) {
        console.warn(JSON.stringify({event:'room_operation_dropped',worldId}));
        continue;
      }
      const operation=entry.operation, joining=operation?.type==='join' ? operation.identity?.userId : null;
      const wasPlaying=joining ? world.players.has(joining) : false;
      let result;
      try {result=await apply(operation,entry.id);}
      catch {
        if(joining && !wasPlaying && connections.get(joining)?.connectionId!==operation.connectionId)world.leave(joining);
        console.warn(JSON.stringify({event:'room_operation_failed',worldId,type:operation?.type??null}));
        result=rejected('operation_failed');
      }
      if(result!==null)replies.push({key:`${tag}:reply:${entry.id}`,result});
    }
    if(closed){cached=null;return null;}
    // Shared voice: the lease holder is the one place with both the live world
    // and the authoritative connections, so it reconciles leases here, after
    // this tick's kicks and before the snapshot carries the result. A failure
    // never blocks the tick; the next one and the sweep retry.
    if(voice) {
      try {
        const stamped=await voice.reconcileWorld({worldId,removed:removedUsers,
          present:[...connections.values()].filter(connection=>connection.leftAt===null)
            .map(connection=>({userId:connection.identity.userId,connectionId:connection.connectionId,space:world.voiceSpaceOf(connection.identity.userId)}))});
        for(const [userId,participantIdentity] of stamped)world.setVoice(userId,participantIdentity);
      } catch {console.warn(JSON.stringify({event:'voice_reconcile_failed',worldId}));}
    }
    const revision=(previous?.revision??0)+1;
    const snapshot={...world.snapshot(),serverTimeMs:time};if(currentHash)snapshot.regionSha256=currentHash;if(world.districtRevision)snapshot.districtRevision=world.districtRevision;
    const view={worldId,snapshot,connections:[...connections.values()].map(({identity,connectionId})=>({userId:identity.userId,connectionId,sessionId:identity.sessionId,expiresAt:identity.expiresAt})),revision};
    const checkpoint={version:characters?3:2,worldId,revision,lastTick:time,connections:[...connections.values()],checkpoint:world.checkpoint(),
      ...(characters?{pendingSelections:[...pendingSelections.values()],selectionVersions:[...selectionVersions]}:{}),
      ...(previous?.regionSha256||revisionUpdate?{regionSha256:currentHash}:{}),
      ...(district&&(district.epoch||district.revision)?{district}:{})};
    const revisionKeys=revisionUpdate?['catalog','region','draft','history'].map(key=>revisionUpdate.keys[key]):[];
    const visitors=[...connections.values()].filter(connection=>connection.leftAt===null).length;
    const committed=await redis.eval(COMMIT,5+replies.length+revisionKeys.length,keys.lease,keys.state,keys.view,keys.queue,keys.population,
      ...replies.map(reply=>reply.key),...revisionKeys,
      token,pack(checkpoint),pack(view),batch.length,LEASE_MS,REPLY_MS,replies.length,
      revisionUpdate?.world.id??'',revisionUpdate?.expectedRegionSha256??'',revisionUpdate?.expectedDraftVersion??0,
      revisionUpdate?JSON.stringify(revisionUpdate.world):'',revisionUpdate?.encoded??'',
      visitors,
      ...replies.map(reply=>JSON.stringify(reply.result)));
    if(!committed){cached=null;return read();}
    if (districtMigration) console.info(JSON.stringify(districtMigration.kind === 'commons'
      ? { event: 'district_commons_checkpoint_migrated', from: districtMigration.from, to: districtMigration.to, moved: districtMigration.moved }
      : districtMigration.kind === 'gardens'
      ? { event: 'district_gardens_checkpoint_migrated', from: districtMigration.from, to: districtMigration.to, moved: districtMigration.moved }
      : districtMigration.kind === 'tower'
      ? { event: 'district_tower_checkpoint_migrated', from: districtMigration.from, to: 'penthouse_tower_33m' }
      : districtMigration.kind === 'levels'
      ? { event: 'district_levels_checkpoint_migrated', from: districtMigration.from, to: 'gallery_plan_v2' }
      : districtMigration.kind === 'interior'
        ? { event: 'district_interior_checkpoint_migrated', from: districtMigration.from, to: 'gallery_plan_v1' }
        : { event: 'district_height_checkpoint_migrated', from: districtMigration.from, to: 'photographed_heights' }));
    cached={world,connections,previous:checkpoint,currentData,currentHash};lastView=view;
    if(rides){rides.merge(drained);void rides.send();}
    return view;
  }
  function tick() {
    if(closed)return Promise.resolve(null);
    if(!pendingTick)pendingTick=runTick().catch(error=>{cached=null;throw error;}).finally(()=>{pendingTick=null;});
    return pendingTick;
  }
  async function request(operation) {
    if(closed)return rejected('room_closed');
    if(!validOperation(operation))return rejected('invalid_operation');
    const requestId=randomUUID(),replyKey=`${tag}:reply:${requestId}`;
    let serialized;
    try {serialized=JSON.stringify({id:requestId,operation});}catch{return rejected('invalid_operation');}
    if(Buffer.byteLength(serialized)>8192)return rejected('invalid_operation');
    const deadline=performance.now()+REQUEST_MS;
    const timeoutResult=()=>({...rejected('request_timeout'),message:'Request outcome is pending. Refresh the town before retrying.'});
    let timer;
    const execute=async()=>{
      if(!await redis.eval(ENQUEUE,1,keys.queue,MAX_QUEUE,serialized))return rejected('queue_full');
      while(performance.now()<deadline) {
        // A follower drives acquisition as well: if the previous function stopped,
        // its lease expires and accepted durable operations can still complete.
        await tick();
        const reply=await redis.get(replyKey);
        if(reply)return JSON.parse(reply);
        if(closed)return rejected('room_closed');
        await delay(100);
      }
      return timeoutResult();
    };
    // Also bound a stalled Redis call or authorization/commit; the durable queue
    // remains authoritative when the response deadline expires first.
    try {
      return await Promise.race([execute(),new Promise(resolve=>{timer=setTimeout(()=>resolve(timeoutResult()),REQUEST_MS);})]);
    } finally {clearTimeout(timer);}
  }

  async function close() {
    closed=true;cached=null;
    await redis.eval(RELEASE,1,keys.lease,token);
    if(rides)await rides.settle();
  }
  async function listPlaces() {
    const data=regionCatalog && worldId!==DEFAULT_WORLD_ID ? await regionCatalog.getRegion(worldId) : worldData;
    return placesOf(data);
  }
  async function resolvePlace(placeId) {
    return (await listPlaces()).find(place=>place.id===placeId)??null;
  }
  return {worldId,districtRevision:districtRevisionOf(worldData),request,tick,read,resolvePlace,listPlaces,close};
}
