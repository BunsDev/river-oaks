import { guardGroup, guardResult } from './name-guard.js';
import { screenText } from './content-filter.js';
/** Authenticated group actions shared by the local and Redis world gateways. */
const keys=(value,allowed)=>value && typeof value==='object' && !Array.isArray(value)
  && Object.keys(value).every(key=>allowed.includes(key));
const groupId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const userId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/u.test(value);
const failure=(status,error)=>({status,value:{error}});

// A group shared with a blocked resident stays, without their messages (#292).
const unblocked=(group,hidden)=>!hidden?.size||!group?group:{...group,
  ...(group.latest&&hidden.has(group.latest.authorId)?{latest:null}:{}),
  ...(Array.isArray(group.messages)?{messages:group.messages.filter(item=>!hidden.has(item.authorId))}:{})};

export async function groupAction({action,identity,groups,social,readBody,allowWrite,blocks=null,contentFilter=null}) {
  if(!groups)return failure(503,'Groups are unavailable.');
  const hidden=blocks&&['list','read'].includes(action)?await blocks.hidden(identity.userId):null;
  if(action==='list')return {status:200,value:{groups:(await groups.list(identity.userId)).map(group=>guardGroup(unblocked(group,hidden)))}};
  if(!['read','create','invite','accept','decline','leave','remove','send'].includes(action))return failure(404,'Not found.');
  let data;
  try{data=await readBody();}catch{return failure(400,'Invalid group request.');}
  const fields={read:['groupId'],create:['name','description'],invite:['groupId','peerId'],
    accept:['groupId'],decline:['groupId'],leave:['groupId'],remove:['groupId','memberId'],send:['groupId','text']};
  if(!keys(data,fields[action]) || action!=='create'&&!groupId(data.groupId)
    || action==='invite'&&!userId(data.peerId) || action==='remove'&&!userId(data.memberId))
    return failure(400,'Invalid group request.');
  if(action==='read') {
    const group=await groups.read(identity.userId,data.groupId);
    return group?{status:200,value:{group:guardGroup(unblocked(group,hidden))}}:failure(404,'Group not found.');
  }
  if(!await allowWrite(identity.userId))return failure(429,'Please wait before changing groups.');
  // The content filter (#292) screens a group's name, description and messages before the store sees them.
  const texts=action==='create'?{name:data.name,description:data.description}:action==='send'?{text:data.text}:{};
  for(const [key,value] of Object.entries(texts)){const screened=screenText(contentFilter,'group',value);if(!screened.ok)return {status:400,value:{error:screened.message,reason:screened.reason}};data={...data,[key]:screened.text};}
  let result;
  if(action==='create')result=await groups.create(identity,data);
  else if(action==='invite') {
    // A contact a block could not end yet is not one.
    const contact=(await social?.list(identity.userId))?.find(item=>item.status==='accepted' && item.peer.id===data.peerId);
    if(!contact||await blocks?.between(identity.userId,data.peerId))return failure(409,'Add this resident as a contact before inviting them.');
    result=await groups.invite(identity,data.groupId,{userId:contact.peer.id,name:contact.peer.name});
  }
  else if(action==='accept')result=await groups.accept(identity.userId,data.groupId);
  else if(action==='decline')result=await groups.decline(identity.userId,data.groupId);
  else if(action==='leave')result=await groups.leave(identity.userId,data.groupId);
  else if(action==='remove')result=await groups.remove(identity,data.groupId,data.memberId);
  else result=await groups.send(identity,data.groupId,data.text);
  if(result.ok)return {status:200,value:guardResult(result)};
  const status=result.reason==='invalid'?400:result.reason==='limit'?429:result.reason==='forbidden'?403:409;
  const message={invalid:'Invalid group request.',limit:'Group limit reached.',forbidden:'Only the group owner can do that.',
    existing:'This resident already belongs to or has an invitation to the group.',missing:'Group or membership is no longer available.'}[result.reason]
    ??'Group action could not be completed.';
  return failure(status,message);
}
