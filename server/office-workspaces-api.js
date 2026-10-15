import { deskFields } from '../preview/src/office-desk-contract.js';
const fields={provision:[],list:[],invite:['workspaceId','peerId'],accept:['workspaceId'],revoke:['workspaceId','peerId'],read:['workspaceId'],save:['workspaceId','expectedVersion','operationId','task'],remove:['workspaceId','expectedVersion','operationId','id']};
const status={invalid_office:400,invalid_office_member:400,invalid_desk:400,office_access_denied:403,office_owner_required:403,office_invitation_required:403,desk_missing:404,desk_conflict:409,office_operation_conflict:409,office_limit:409,desk_limit:409,office_busy:503};
/** Caller owns session/waitlist/ban/CSRF checks; visit must be session-fenced. */
export async function officeWorkspaceAction({action,identity,workspaces,readBody,visit,allow,isApproved}){
 const error=(code,message)=>({status:code,value:{error:message}});
 if(!workspaces)return error(503,'office_unavailable');
 if(!Object.hasOwn(fields,action))return error(404,'Not found.');
 try{
  if(!await allow(identity.userId,action))return error(429,'desk_rate_limited');
  let data;try{data=await readBody();}catch{return error(400,'invalid_office');}
  if(!deskFields(data,fields[action]))return error(400,'invalid_office');
  if(action==='provision')return {status:200,value:{ok:true,workspace:await workspaces.provision(identity.userId)}};
  if(action==='list')return {status:200,value:{ok:true,workspaces:await workspaces.list(identity.userId)}};
  if(['read','save','remove'].includes(action)){
   const active=await visit(identity);if(!active||active.id!==data.workspaceId)return error(403,'office_visit_required');
  }
  if(action==='invite'&&(!isApproved||!await isApproved(data.peerId)))return error(403,'office_peer_unavailable');
  const {workspaceId,...payload}=data;
  const result=await (['invite','revoke'].includes(action)?workspaces[action](identity.userId,workspaceId,data.peerId)
   :['save','remove'].includes(action)?workspaces[action](identity.userId,workspaceId,payload):workspaces[action](identity.userId,workspaceId));
  return result.ok?{status:200,value:result}:error(status[result.reason]??409,result.reason);
 }catch{return error(503,'office_unavailable');}
}
