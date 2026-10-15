import { createHash } from 'node:crypto';
import { DESK_LIMITS, deskFields, deskId, validDeskTask, validDeskVersion, emptyDesk, stampDeskTask } from '../preview/src/office-desk-contract.js';
const MAX_ACCOUNTS=10000,MAX_RECEIPTS=32;
const publicDesk=({schemaVersion,receipts,...desk})=>structuredClone(desk);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validUser=id=>typeof id==='string'&&id.length>0&&id.length<=160&&!/[\u0000-\u001f\u007f]/.test(id);
function decode(raw){
 if(!raw)return emptyDesk();const d=JSON.parse(raw);
 if(!deskFields(d,['version','activeId','tasks','updatedAt','schemaVersion','receipts'])||!validDeskVersion(d.version)||!Number.isSafeInteger(d.updatedAt)||d.updatedAt<0
  ||(d.schemaVersion!==undefined&&d.schemaVersion!==2)||(d.receipts!==undefined&&(!Array.isArray(d.receipts)||d.receipts.length>MAX_RECEIPTS||!d.receipts.every(r=>deskId(r.id)&&/^[a-f0-9]{64}$/.test(r.digest))))
  ||!Array.isArray(d.tasks)||d.tasks.length>DESK_LIMITS.tasks||!d.tasks.every(validDeskTask)||new Set(d.tasks.map(t=>t.id)).size!==d.tasks.length
  ||(d.activeId!==null&&!d.tasks.some(t=>t.id===d.activeId)))throw new Error('Invalid desk record');
 return d;
}
function service({read,commit,now}){
 async function change(userId,data,remove){
  if(!validUser(userId)||!deskFields(data,remove?['expectedVersion','id','operationId']:['expectedVersion','task','operationId'])||!validDeskVersion(data.expectedVersion)
   ||(data.operationId!==undefined&&!deskId(data.operationId))||(remove?!deskId(data.id):!validDeskTask(data.task)))return {ok:false,reason:'invalid_desk'};
  const fingerprint=digest([remove,data.expectedVersion,remove?data.id:data.task]);
  for(let attempt=0;attempt<2;attempt++){
   const current=await read(userId),receipt=current.receipts?.find(r=>r.id===data.operationId);
   if(receipt)return receipt.digest===fingerprint?{ok:true,desk:publicDesk(current)}:{ok:false,reason:'desk_operation_conflict'};
   if(current.version!==data.expectedVersion)return {ok:false,reason:'desk_conflict'};
   const id=remove?data.id:data.task.id,index=current.tasks.findIndex(t=>t.id===id);
   if(remove&&index<0)return {ok:false,reason:'desk_missing'};
   if(!remove&&index<0&&current.tasks.length>=DESK_LIMITS.tasks)return {ok:false,reason:'desk_limit'};
   const tasks=structuredClone(current.tasks),time=now();
   if(remove)tasks.splice(index,1);else{
    const task=stampDeskTask(data.task,current.tasks[index],time);
    if(index<0)tasks.unshift(task);else tasks[index]=task;
   }
   const desk={version:current.version+1,activeId:remove?(current.activeId===id?tasks[0]?.id??null:current.activeId):id,tasks,updatedAt:time};
   if(Buffer.byteLength(JSON.stringify(desk))>DESK_LIMITS.bytes)return {ok:false,reason:'desk_limit'};
   const receipts=[...(current.receipts??[])];if(data.operationId)receipts.push({id:data.operationId,digest:fingerprint});
   const record={...desk,schemaVersion:2,receipts:receipts.slice(-MAX_RECEIPTS)};
   const reason=await commit(userId,current.version,record);
   if(reason==='ok')return {ok:true,desk};
   if(reason!=='desk_conflict')return {ok:false,reason};
  }
  return {ok:false,reason:'desk_conflict'};
 }
 return {async read(id){if(!validUser(id))throw new Error('Invalid account');return publicDesk(await read(id));},save:(id,data)=>change(id,data,false),remove:(id,data)=>change(id,data,true)};
}
export function createMemoryOfficeDesk({now=Date.now}={}){
 const records=new Map();
 return service({now,read:async id=>structuredClone(records.get(id)??emptyDesk()),commit:async(id,version,desk)=>{
  if((records.get(id)?.version??0)!==version)return 'desk_conflict';
  if(!records.has(id)&&records.size>=MAX_ACCOUNTS)return 'desk_limit';
  records.set(id,structuredClone(desk));return 'ok';
 }});
}
const SAVE=`
 local raw=redis.call('HGET',KEYS[1],ARGV[1])
 local version=raw and cjson.decode(raw).version or 0
 if version~=tonumber(ARGV[2]) then return 'desk_conflict' end
 if not raw and redis.call('HLEN',KEYS[1])>=tonumber(ARGV[4]) then return 'desk_limit' end
 redis.call('HSET',KEYS[1],ARGV[1],ARGV[3])
 return 'ok'
`;
export function createRedisOfficeDesk({redis,prefix,now=Date.now}){
 if(!redis?.eval||typeof prefix!=='string'||!/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid desk storage');
 const key=`${prefix}:office-desk:v1`,id=user=>createHash('sha256').update(user).digest('hex');
 return service({now,read:async user=>decode(await redis.hget(key,id(user))),commit:(user,version,desk)=>redis.eval(SAVE,1,key,id(user),version,JSON.stringify(desk),MAX_ACCOUNTS)});
}
