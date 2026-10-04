/** Authenticated group actions shared by the local and Redis world gateways. */
const keys=(value,allowed)=>value && typeof value==='object' && !Array.isArray(value)
  && Object.keys(value).every(key=>allowed.includes(key));
const groupId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const userId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/u.test(value);
const failure=(status,error)=>({status,value:{error}});

export async function groupAction({action,identity,groups,social,readBody,allowWrite}) {
  if(!groups)return failure(503,'Groups are unavailable.');
  if(action==='list')return {status:200,value:{groups:await groups.list(identity.userId)}};
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
    return group?{status:200,value:{group}}:failure(404,'Group not found.');
  }
  if(!await allowWrite(identity.userId))return failure(429,'Please wait before changing groups.');
  let result;
  if(action==='create')result=await groups.create(identity,data);
  else if(action==='invite') {
    const contact=(await social?.list(identity.userId))?.find(item=>item.status==='accepted' && item.peer.id===data.peerId);
    if(!contact)return failure(409,'Add this resident as a contact before inviting them.');
    result=await groups.invite(identity,data.groupId,{userId:contact.peer.id,name:contact.peer.name});
  }
  else if(action==='accept')result=await groups.accept(identity.userId,data.groupId);
  else if(action==='decline')result=await groups.decline(identity.userId,data.groupId);
  else if(action==='leave')result=await groups.leave(identity.userId,data.groupId);
  else if(action==='remove')result=await groups.remove(identity,data.groupId,data.memberId);
  else result=await groups.send(identity,data.groupId,data.text);
  if(result.ok)return {status:200,value:result};
  const status=result.reason==='invalid'?400:result.reason==='limit'?429:result.reason==='forbidden'?403:409;
  const message={invalid:'Invalid group request.',limit:'Group limit reached.',forbidden:'Only the group owner can do that.',
    existing:'This resident already belongs to or has an invitation to the group.',missing:'Group or membership is no longer available.'}[result.reason]
    ??'Group action could not be completed.';
  return failure(status,message);
}
