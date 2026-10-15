import { createHash, randomUUID } from 'node:crypto';
import { DESK_LIMITS, deskFields, deskId, validDeskTask, validDeskVersion, emptyDesk, stampDeskTask } from '../preview/src/office-desk-contract.js';

const MAX_WORKSPACES=10000, MAX_MEMBERS=32, MAX_JOINED=64, MAX_RECEIPTS=32;
const userId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
export const officeWorkspaceId=owner=>`office-${hash(owner)}`;
const fail=reason=>({ok:false,reason});
const member=(w,user)=>w.members.find(m=>m.userId===user);
const allowed=(w,user)=>w.ownerId===user||member(w,user)?.status==='accepted';
const summary=(w,user)=>({id:w.id,ownerId:w.ownerId,role:w.ownerId===user?'owner':member(w,user)?.status??null,revision:w.revision,
 members:w.ownerId===user?structuredClone(w.members):[],createdAt:w.createdAt,updatedAt:w.updatedAt});
function metadata(w){
 if(w.schemaVersion!==1||!userId(w.ownerId)||w.id!==officeWorkspaceId(w.ownerId)||!validDeskVersion(w.revision)
  ||!Array.isArray(w.members)||w.members.length>MAX_MEMBERS||!w.members.every(m=>userId(m.userId)&&['invited','accepted'].includes(m.status)&&deskId(m.epoch))
  ||new Set(w.members.map(m=>m.userId)).size!==w.members.length)throw Error('Invalid office workspace metadata');
 return w;
}
function decode(raw){
 if(!raw)return null;const w=metadata(JSON.parse(raw));
 if(!Array.isArray(w.receipts)||w.receipts.length>MAX_RECEIPTS
  ||!validDeskVersion(w.desk?.version)||!Array.isArray(w.desk.tasks)||w.desk.tasks.length>DESK_LIMITS.tasks||!w.desk.tasks.every(validDeskTask))throw Error('Invalid office workspace record');
 return w;
}
function service({read,readMetadata,index,commit,now}){
 async function mutate(actor,id,change){
  if(!userId(actor)||!/^office-[a-f0-9]{64}$/.test(id??''))return fail('invalid_office');
  for(let attempt=0;attempt<8;attempt++){
   const raw=await read(id),w=decode(raw);if(!w)return fail('office_access_denied');
   const next=structuredClone(w),result=change(next);
   if(!result.ok||result.unchanged)return result;
   next.revision++;next.updatedAt=now();
   const outcome=await commit(id,raw,JSON.stringify(next));
   if(outcome==='ok')return result;
   if(outcome!=='conflict')return fail(outcome);
  }
  return fail('office_busy');
 }
 async function provision(owner){
  if(!userId(owner))throw Error('Invalid office owner');const id=officeWorkspaceId(owner);
  for(let attempt=0;attempt<8;attempt++){
   const existing=await readMetadata(id);if(existing)return summary(metadata(existing),owner);
   const w={schemaVersion:1,id,ownerId:owner,revision:0,members:[],desk:emptyDesk(),receipts:[],createdAt:now(),updatedAt:now()};
   const result=await commit(id,null,JSON.stringify(w));if(result==='ok')return summary(w,owner);
   if(result!=='conflict')throw Error(result);
  }
  throw Error('office_busy');
 }
 const membership=(action,actor,id,target)=>mutate(actor,id,w=>{
  if(action!=='accept'&&w.ownerId!==actor)return fail('office_owner_required');
  if(!userId(target)||target===w.ownerId)return fail('invalid_office_member');
  const m=member(w,target);
  if(action==='accept'){
   if(!m)return fail('office_invitation_required');
   if(m.status==='accepted')return {ok:true,unchanged:true};m.status='accepted';
  }else if(action==='invite'){
   if(m)return {ok:true,unchanged:true};if(w.members.length>=MAX_MEMBERS)return fail('office_limit');
   w.members.push({userId:target,status:'invited',epoch:randomUUID()});
  }else{
   if(!m)return {ok:true,unchanged:true};w.members=w.members.filter(m=>m.userId!==target);
   w.receipts=w.receipts.filter(r=>r.actor!==target);
  }
  return {ok:true};
 });
 function changeDesk(actor,id,data,remove){
  if(!deskFields(data,remove?['expectedVersion','operationId','id']:['expectedVersion','operationId','task'])||!validDeskVersion(data.expectedVersion)
   ||!deskId(data.operationId)||(remove?!deskId(data.id):!validDeskTask(data.task)))return Promise.resolve(fail('invalid_desk'));
  const digest=hash(JSON.stringify([remove,data.expectedVersion,remove?data.id:data.task]));
  return mutate(actor,id,w=>{
   if(!allowed(w,actor))return fail('office_access_denied');
   const epoch=w.ownerId===actor?'owner':member(w,actor).epoch;
   const receipt=w.receipts.find(r=>r.actor===actor&&r.epoch===epoch&&r.id===data.operationId);
   if(receipt)return receipt.digest===digest?{ok:true,unchanged:true,desk:structuredClone(w.desk)}:fail('office_operation_conflict');
   if(w.desk.version!==data.expectedVersion)return fail('desk_conflict');
   const taskId=remove?data.id:data.task.id,i=w.desk.tasks.findIndex(t=>t.id===taskId);
   if(remove&&i<0)return fail('desk_missing');
   if(!remove&&i<0&&w.desk.tasks.length>=DESK_LIMITS.tasks)return fail('desk_limit');
   const time=now();
   if(remove)w.desk.tasks.splice(i,1);else{const task=stampDeskTask(data.task,w.desk.tasks[i],time);if(i<0)w.desk.tasks.unshift(task);else w.desk.tasks[i]=task;}
   w.desk.version++;w.desk.updatedAt=time;w.desk.activeId=remove?(w.desk.activeId===taskId?w.desk.tasks[0]?.id??null:w.desk.activeId):taskId;
   if(Buffer.byteLength(JSON.stringify(w.desk))>DESK_LIMITS.bytes)return fail('desk_limit');
   w.receipts.push({actor,epoch,id:data.operationId,digest});w.receipts=w.receipts.slice(-MAX_RECEIPTS);
   return {ok:true,desk:structuredClone(w.desk)};
  });
 }
 return {provision,
  async list(actor){if(!userId(actor))throw Error('Invalid office user');const ids=await index(actor);const rows=await Promise.all(ids.map(id=>readMetadata(id).then(w=>w&&metadata(w))));return rows.filter(w=>w&&(w.ownerId===actor||member(w,actor))).map(w=>summary(w,actor));},
  async authorize(actor,id){if(!userId(actor)||!/^office-[a-f0-9]{64}$/.test(id??''))return fail('invalid_office');const value=await readMetadata(id),w=value&&metadata(value);return w&&allowed(w,actor)?{ok:true,workspace:{id:w.id,ownerId:w.ownerId,role:w.ownerId===actor?'owner':'accepted'}}:fail('office_access_denied');},
  async read(actor,id){if(!userId(actor)||!/^office-[a-f0-9]{64}$/.test(id??''))return fail('invalid_office');const w=decode(await read(id));return w&&allowed(w,actor)?{ok:true,workspace:summary(w,actor),desk:structuredClone(w.desk)}:fail('office_access_denied');},
  invite:(actor,id,target)=>membership('invite',actor,id,target),accept:(actor,id)=>membership('accept',actor,id,actor),revoke:(actor,id,target)=>membership('revoke',actor,id,target),
  save:(actor,id,data)=>changeDesk(actor,id,data,false),remove:(actor,id,data)=>changeDesk(actor,id,data,true)};
}
export function createMemoryOfficeWorkspaces({now=Date.now}={}){
 const records=new Map(),indices=new Map();
 return service({now,read:async id=>records.has(id)?JSON.stringify(records.get(id)):null,
  readMetadata:async id=>{const w=records.get(id);if(!w)return null;const {desk,receipts,...fields}=w;return structuredClone(fields);},
  index:async user=>[...(indices.get(user)??[])],commit:async(id,raw,next)=>{
  if((records.has(id)?JSON.stringify(records.get(id)):null)!==raw)return 'conflict';
  if(!raw&&records.size>=MAX_WORKSPACES)return 'office_limit';
  const w=JSON.parse(next),before=raw?JSON.parse(raw):null,users=[w.ownerId,...w.members.map(m=>m.userId)];
  for(const user of users){const set=indices.get(user);if(!set?.has(id)&&(set?.size??0)>=MAX_JOINED)return 'office_limit';}
  for(const user of before?[before.ownerId,...before.members.map(m=>m.userId)]:[]){if(!users.includes(user)){const set=indices.get(user);set?.delete(id);if(!set?.size)indices.delete(user);}}
  for(const user of users){if(!indices.has(user))indices.set(user,new Set());indices.get(user).add(id);}
  records.set(id,w);return 'ok';
 }});
}
// Workspace, membership, shared tasks and discovery indices change in one Redis
// operation. Every key shares the caller's hash tag for Redis Cluster safety.
const COMMIT=`
 local raw=redis.call('HGET',KEYS[1],ARGV[1])
 if (raw or '')~=ARGV[2] then return 'conflict' end
 if not raw and redis.call('HLEN',KEYS[1])>=tonumber(ARGV[4]) then return 'office_limit' end
 local w=cjson.decode(ARGV[3])
 local users={w.ownerId}
 for _,m in ipairs(w.members) do table.insert(users,m.userId) end
 for _,user in ipairs(users) do
  local list=cjson.decode(redis.call('HGET',KEYS[2],user) or '[]')
  local found=false
  for _,id in ipairs(list) do if id==ARGV[1] then found=true end end
  if not found and #list>=tonumber(ARGV[5]) then return 'office_limit' end
 end
 local all={}
 for _,u in ipairs(users) do all[u]=true end
 if raw then
  local old=cjson.decode(raw)
  local prior={old.ownerId}
  for _,m in ipairs(old.members) do table.insert(prior,m.userId) end
  for _,u in ipairs(prior) do if not all[u] then
   local list=cjson.decode(redis.call('HGET',KEYS[2],u) or '[]')
   local kept={}
   for _,id in ipairs(list) do if id~=ARGV[1] then table.insert(kept,id) end end
   if #kept==0 then redis.call('HDEL',KEYS[2],u) else redis.call('HSET',KEYS[2],u,cjson.encode(kept)) end
  end end
 end
 for _,u in ipairs(users) do
  local list=cjson.decode(redis.call('HGET',KEYS[2],u) or '[]')
  local found=false
  for _,id in ipairs(list) do if id==ARGV[1] then found=true end end
  if not found then table.insert(list,ARGV[1]) end
  redis.call('HSET',KEYS[2],u,cjson.encode(list))
 end
 redis.call('HSET',KEYS[1],ARGV[1],ARGV[3])
 return 'ok'
`;
export function createRedisOfficeWorkspaces({redis,prefix,now=Date.now}){
 if(!redis?.eval||typeof prefix!=='string'||!/^\{[^{}]+\}$/.test(prefix))throw Error('Invalid workspace storage');
 const key=`${prefix}:office-workspaces:v1`,lookup=`${prefix}:office-workspaces-index:v1`;
 return service({now,read:id=>redis.hget(key,id),readMetadata:async id=>{
   const raw=await redis.eval(METADATA,1,key,id);if(!raw)return null;
   const w=JSON.parse(raw);
   // Redis cjson encodes an empty Lua array as {}.
   if(w.members&&Object.getPrototypeOf(w.members)===Object.prototype&&Object.keys(w.members).length===0)w.members=[];
   return w;
  },index:async user=>JSON.parse(await redis.hget(lookup,user)??'[]'),
  commit:(id,raw,next)=>redis.eval(COMMIT,2,key,lookup,id,raw??'',next,MAX_WORKSPACES,MAX_JOINED)});
}

// Read the canonical record at execution time: no secondary index/cache can
// lag revocation. Redis still decodes a bounded document, but task text and
// retry receipts never cross the wire for discovery or visit authorization.
const METADATA=`
 local raw=redis.call('HGET',KEYS[1],ARGV[1])
 if not raw then return false end
 local w=cjson.decode(raw)
 return cjson.encode({schemaVersion=w.schemaVersion,id=w.id,ownerId=w.ownerId,
  revision=w.revision,members=w.members,createdAt=w.createdAt,updatedAt=w.updatedAt})
`;
