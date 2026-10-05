import { randomUUID } from 'node:crypto';

const MAX_GROUPS=12, MAX_MEMBERS=32, MAX_MESSAGES=60;
const invalid={ok:false,reason:'invalid'};
const validUserId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/u.test(value);
const validGroupId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const safeText=(value,max)=>typeof value==='string' && [...value.trim()].length<=max
  && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
const cleanName=value=>safeText(value,60) && value.trim() ? value.trim() : 'Resident';
const member=(record,id)=>record.members.find(item=>item.id===id);
const array=value=>Array.isArray(value)?value:[];
const invited=(record,id)=>array(record.invites).find(item=>item.id===id);
const summary=(record,userId)=>({id:record.id,name:record.name,description:record.description,
  ownerId:record.ownerId,ownerName:record.members[0].name,status:member(record,userId)?'member':'invited',
  role:record.ownerId===userId?'owner':member(record,userId)?'member':null,
  memberCount:record.members.length,latest:member(record,userId)?array(record.messages).at(-1)??null:null});
const detail=(record,userId)=>({id:record.id,name:record.name,description:record.description,ownerId:record.ownerId,
  members:structuredClone(record.members),...(record.ownerId===userId?{invites:structuredClone(array(record.invites))}:{}),
  messages:structuredClone(array(record.messages)),createdAt:record.createdAt});
function creation(actor,data,createId,now) {
  if(!validUserId(actor?.userId) || !safeText(data?.name,40) || !data.name.trim()
    || !safeText(data.description??'',160))return null;
  const id=createId();if(!validGroupId(id))throw new Error('Invalid generated group ID');
  return {id,name:data.name.trim(),description:(data.description??'').trim(),ownerId:actor.userId,
    members:[{id:actor.userId,name:cleanName(actor.name)}],invites:[],messages:[],createdAt:now()};
}
function invitation(actor,target) {
  return validUserId(actor?.userId) && validUserId(target?.userId) && actor.userId!==target.userId
    ? {id:target.userId,name:cleanName(target.name),invitedBy:actor.userId}:null;
}
function messageFor(actor,text,createId,now) {
  if(!validUserId(actor?.userId) || !safeText(text,280) || !text.trim())return null;
  return {id:createId(),authorId:actor.userId,authorName:cleanName(actor.name),text:text.trim(),at:now()};
}

export function createMemoryGroups({now=Date.now,createId=randomUUID}={}) {
  const records=new Map(),indexes=new Map();
  const index=id=>indexes.get(id)??new Set();
  const add=(id,groupId)=>{if(!indexes.has(id))indexes.set(id,new Set());indexes.get(id).add(groupId);};
  const drop=(id,groupId)=>{index(id).delete(groupId);if(index(id).size===0)indexes.delete(id);};
  return {
    async list(userId) {
      if(!validUserId(userId))throw new Error('Invalid account');
      return [...index(userId)].map(id=>records.get(id)).filter(record=>record&&(member(record,userId)||invited(record,userId))).map(record=>summary(record,userId))
        .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    },
    async read(userId,id) {
      if(!validUserId(userId)||!validGroupId(id))return null;
      const record=records.get(id);return record&&member(record,userId)?detail(record,userId):null;
    },
    async create(actor,data) {
      const record=creation(actor,data,createId,now);if(!record)return invalid;
      if(index(actor.userId).size>=MAX_GROUPS)return {ok:false,reason:'limit'};
      if(records.has(record.id))return {ok:false,reason:'existing'};
      records.set(record.id,record);add(actor.userId,record.id);
      return {ok:true,group:summary(record,actor.userId)};
    },
    async invite(actor,id,target) {
      const invite=invitation(actor,target);if(!validGroupId(id)||!invite)return invalid;
      const record=records.get(id);if(!record)return {ok:false,reason:'missing'};
      if(record.ownerId!==actor.userId)return {ok:false,reason:'forbidden'};
      if(member(record,target.userId)||invited(record,target.userId))return {ok:false,reason:'existing'};
      if(record.members.length+record.invites.length>=MAX_MEMBERS || index(target.userId).size>=MAX_GROUPS)return {ok:false,reason:'limit'};
      record.invites.push(invite);add(target.userId,id);return {ok:true};
    },
    async accept(userId,id) {
      if(!validUserId(userId)||!validGroupId(id))return invalid;
      const record=records.get(id),invite=record&&invited(record,userId);
      if(!invite)return {ok:false,reason:'missing'};
      record.invites=record.invites.filter(item=>item.id!==userId);
      record.members.push({id:userId,name:invite.name});return {ok:true};
    },
    async decline(userId,id) {
      if(!validUserId(userId)||!validGroupId(id))return invalid;
      const record=records.get(id);if(!record||!invited(record,userId))return {ok:false,reason:'missing'};
      record.invites=record.invites.filter(item=>item.id!==userId);drop(userId,id);return {ok:true};
    },
    async leave(userId,id) {
      if(!validUserId(userId)||!validGroupId(id))return invalid;
      const record=records.get(id);if(!record||!member(record,userId))return {ok:false,reason:'missing'};
      if(record.ownerId===userId){for(const person of [...record.members,...record.invites])drop(person.id,id);records.delete(id);}
      else {record.members=record.members.filter(item=>item.id!==userId);drop(userId,id);}
      return {ok:true};
    },
    async remove(actor,id,targetId) {
      if(!validUserId(actor?.userId)||!validUserId(targetId)||!validGroupId(id)||actor.userId===targetId)return invalid;
      const record=records.get(id);if(!record)return {ok:false,reason:'missing'};
      if(record.ownerId!==actor.userId)return {ok:false,reason:'forbidden'};
      if(!member(record,targetId)&&!invited(record,targetId))return {ok:false,reason:'missing'};
      record.members=record.members.filter(item=>item.id!==targetId);
      record.invites=record.invites.filter(item=>item.id!==targetId);
      drop(targetId,id);return {ok:true};
    },
    async send(actor,id,text) {
      if(!validGroupId(id))return invalid;
      const message=messageFor(actor,text,createId,now);if(!message)return invalid;
      const record=records.get(id);if(!record||!member(record,actor.userId))return {ok:false,reason:'missing'};
      record.messages.push(message);if(record.messages.length>MAX_MESSAGES)record.messages.shift();
      member(record,actor.userId).name=message.authorName;
      return {ok:true,message};
    },
  };
}

// Two fixed hash keys keep every change atomic across Vercel instances and
// in one Redis Cluster slot. Account indexes hold at most twelve group IDs.
const CHANGE=`
local action,id,actor,target,payload=ARGV[1],ARGV[2],ARGV[3],ARGV[4],ARGV[5]
local function index(user)
  local raw=redis.call('HGET',KEYS[2],user)
  return raw and cjson.decode(raw) or {}
end
local function contains(items,id)
  for _,item in ipairs(items) do if item.id==id then return true end end
  return false
end
local function has(items,id)
  for _,value in ipairs(items) do if value==id then return true end end
  return false
end
local function add(user)
  local items=index(user)
  if not has(items,id) then table.insert(items,id) end
  redis.call('HSET',KEYS[2],user,cjson.encode(items))
end
local function drop(user)
  local items=index(user)
  for i=#items,1,-1 do if items[i]==id then table.remove(items,i) end end
  if #items==0 then redis.call('HDEL',KEYS[2],user)
  else redis.call('HSET',KEYS[2],user,cjson.encode(items)) end
end
if action=='create' then
  if #index(actor)>=12 then return 'limit' end
  if redis.call('HEXISTS',KEYS[1],id)==1 then return 'existing' end
  redis.call('HSET',KEYS[1],id,payload)
  add(actor)
  return 'ok'
end
local raw=redis.call('HGET',KEYS[1],id)
if not raw then return 'missing' end
local record=cjson.decode(raw)
if action=='invite' then
  if record.ownerId~=actor then return 'forbidden' end
  if contains(record.members,target) or contains(record.invites,target) then return 'existing' end
  if #record.members+#record.invites>=32 or #index(target)>=12 then return 'limit' end
  table.insert(record.invites,cjson.decode(payload))
  add(target)
elseif action=='accept' then
  if not contains(record.invites,actor) then return 'missing' end
  for i=#record.invites,1,-1 do
    if record.invites[i].id==actor then
      table.insert(record.members,{id=actor,name=record.invites[i].name})
      table.remove(record.invites,i)
    end
  end
elseif action=='decline' then
  if not contains(record.invites,actor) then return 'missing' end
  for i=#record.invites,1,-1 do if record.invites[i].id==actor then table.remove(record.invites,i) end end
  drop(actor)
elseif action=='leave' then
  if not contains(record.members,actor) then return 'missing' end
  if record.ownerId==actor then
    for _,person in ipairs(record.members) do drop(person.id) end
    for _,person in ipairs(record.invites) do drop(person.id) end
    redis.call('HDEL',KEYS[1],id)
    return 'ok'
  end
  for i=#record.members,1,-1 do if record.members[i].id==actor then table.remove(record.members,i) end end
  drop(actor)
elseif action=='remove' then
  if record.ownerId~=actor then return 'forbidden' end
  if not contains(record.members,target) and not contains(record.invites,target) then return 'missing' end
  for i=#record.members,1,-1 do if record.members[i].id==target then table.remove(record.members,i) end end
  for i=#record.invites,1,-1 do if record.invites[i].id==target then table.remove(record.invites,i) end end
  drop(target)
elseif action=='send' then
  if not contains(record.members,actor) then return 'missing' end
  local message=cjson.decode(payload)
  table.insert(record.messages,message)
  if #record.messages>60 then table.remove(record.messages,1) end
  for _,person in ipairs(record.members) do if person.id==actor then person.name=message.authorName end end
else return 'invalid' end
redis.call('HSET',KEYS[1],id,cjson.encode(record))
return 'ok'
`;

export function createRedisGroups({redis,prefix,now=Date.now,createId=randomUUID}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid group storage');
  const keys=[`${prefix}:groups:records`,`${prefix}:groups:index`];
  const change=async(action,id,actor,target='',payload='')=>{
    const reason=await redis.eval(CHANGE,2,...keys,action,id,actor,target,payload);
    return {ok:reason==='ok',...(reason==='ok'?{}:{reason})};
  };
  const readRecord=async id=>{const raw=await redis.hget(keys[0],id);return raw?JSON.parse(raw):null;};
  return {
    async list(userId) {
      if(!validUserId(userId))throw new Error('Invalid account');
      const ids=array(JSON.parse(await redis.hget(keys[1],userId)??'[]'));
      if(ids.length>MAX_GROUPS)throw new Error('Invalid group index');
      if(!ids.length)return [];
      const records=await redis.hmget(keys[0],...ids);
      return records.filter(Boolean).map(raw=>JSON.parse(raw)).filter(record=>member(record,userId)||invited(record,userId)).map(record=>summary(record,userId))
        .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    },
    async read(userId,id) {
      if(!validUserId(userId)||!validGroupId(id))return null;
      const record=await readRecord(id);return record&&member(record,userId)?detail(record,userId):null;
    },
    async create(actor,data) {
      const record=creation(actor,data,createId,now);if(!record)return invalid;
      const result=await change('create',record.id,actor.userId,'',JSON.stringify(record));
      return result.ok?{ok:true,group:summary(record,actor.userId)}:result;
    },
    async invite(actor,id,target) {
      const invite=invitation(actor,target);if(!validGroupId(id)||!invite)return invalid;
      return change('invite',id,actor.userId,target.userId,JSON.stringify(invite));
    },
    async accept(userId,id){return validUserId(userId)&&validGroupId(id)?change('accept',id,userId):invalid;},
    async decline(userId,id){return validUserId(userId)&&validGroupId(id)?change('decline',id,userId):invalid;},
    async leave(userId,id){return validUserId(userId)&&validGroupId(id)?change('leave',id,userId):invalid;},
    async remove(actor,id,targetId){return validUserId(actor?.userId)&&validUserId(targetId)&&validGroupId(id)&&actor.userId!==targetId
      ? change('remove',id,actor.userId,targetId):invalid;},
    async send(actor,id,text){
      if(!validGroupId(id))return invalid;
      const message=messageFor(actor,text,createId,now);if(!message)return invalid;
      const result=await change('send',id,actor.userId,'',JSON.stringify(message));
      return result.ok?{ok:true,message}:result;
    },
  };
}
