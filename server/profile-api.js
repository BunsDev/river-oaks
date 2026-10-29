import { accountName } from '../preview/src/resident-names.js';
import { screenText } from './content-filter.js';

/** A profile is readable through an in-world encounter or an accepted contact. */
export async function profileAction({action,identity,worldId,profiles,social,readBody,visiblePlayer,allowWrite,blocks=null,contentFilter=null}) {
  if(!profiles)return {status:503,value:{error:'Profiles are unavailable.'}};
  if(!['view','save','claim-intro'].includes(action))return {status:404,value:{error:'Not found.'}};
  let data;
  try {data=await readBody();} catch {return {status:400,value:{error:'Invalid profile request.'}};}
  if(action==='claim-intro') {
    if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(key=>key!=='storeId')
      || typeof data.storeId!=='string' || !data.storeId || data.storeId.length>160 || /[\u0000-\u001f\u007f]/.test(data.storeId))
      return {status:400,value:{error:'Invalid store intro.'}};
    if(!await allowWrite(identity.userId))return {status:429,value:{error:'Please wait before starting another intro.'}};
    return {status:200,value:await profiles.claimStoreIntro(identity.userId,worldId,data.storeId)};
  }
  if(action==='save') {
    if(!await allowWrite(identity.userId))return {status:429,value:{error:'Please wait before saving your profile again.'}};
    // The content filter (#292) screens every profile text other residents read.
    if(data && typeof data==='object' && !Array.isArray(data)) {
      for(const key of ['tagline','bio','pronouns']){const screened=screenText(contentFilter,'profile',data[key]);if(!screened.ok)return {status:400,value:{error:screened.message,reason:screened.reason}};data={...data,[key]:screened.text};}
      if(Array.isArray(data.interests)){const interests=[];for(const value of data.interests){const screened=screenText(contentFilter,'profile',value);if(!screened.ok)return {status:400,value:{error:screened.message,reason:screened.reason}};interests.push(screened.text);}data={...data,interests};}
    }
    const result=await profiles.save(identity.userId,data);
    return result.ok?{status:200,value:result}:{status:result.reason==='invalid_profile'?400:409,
      value:{error:result.reason}};
  }
  if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(key=>key!=='peerId')
    || data.peerId!==undefined && (typeof data.peerId!=='string' || !data.peerId || data.peerId.length>160))
    return {status:400,value:{error:'Invalid profile request.'}};
  const peerId=data.peerId??identity.userId;
  let name=identity.name;
  if(peerId!==identity.userId) {
    const visible=await visiblePlayer(identity,peerId);
    const contact=visible?null:(await social?.list(identity.userId))?.find(item=>item.peer.id===peerId && item.status==='accepted');
    // A block either way reads as a profile that is not here (#292).
    if(!visible && !contact || blocks && await blocks.between(identity.userId,peerId))return {status:404,value:{error:'Profile not found.'}};
    name=visible?.name??contact.peer.name;
  }
  return {status:200,value:{profile:{...(await profiles.get(peerId)),userId:peerId,name:accountName(peerId,name)}}};
}
