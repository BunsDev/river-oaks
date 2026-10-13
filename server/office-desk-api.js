export const OFFICE_DESK_BODY_LIMIT=98304;
import { deskFields } from '../preview/src/office-desk-contract.js';
const STATUS={invalid_desk:400,desk_conflict:409,desk_missing:404,desk_limit:409};
/** The authenticated account alone owns this document, including while visiting another owner's office. */
export async function officeDeskAction({action,identity,desk,readBody,hasVisit,allow}){
 if(!desk)return {status:503,value:{error:'desk_unavailable'}};
 if(!['read','save','remove'].includes(action))return {status:404,value:{error:'Not found.'}};
 if(!await allow(identity.userId,action))return {status:429,value:{error:'desk_rate_limited'}};
 if(!await hasVisit(identity))return {status:403,value:{error:'office_visit_required'}};
 let data;try{data=await readBody();}catch{return {status:400,value:{error:'invalid_desk'}};}
 if(action==='read')return deskFields(data,[]) ? {status:200,value:{ok:true,desk:await desk.read(identity.userId)}}:{status:400,value:{error:'invalid_desk'}};
 const result=await desk[action](identity.userId,data);
 return {status:result.ok?200:STATUS[result.reason]??409,value:result.ok?result:{error:result.reason}};
}
