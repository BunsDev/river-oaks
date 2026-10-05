/** Identity, venue and cancellation authority come from the authenticated edge. */
export async function eventAction({action,identity,events,readBody,resolveVenue,allowWrite,isAdmin}) {
  if(!events)return {status:503,value:{error:'Events are unavailable.'}};
  if(!['list','create','rsvp','cancel'].includes(action))return {status:404,value:{error:'Not found.'}};
  const admin=isAdmin(identity.userId);
  if(action==='list')return {status:200,value:{events:await events.list(identity.userId,admin)}};
  let data;
  try {data=await readBody();} catch {return {status:400,value:{error:'Invalid event request.'}};}
  if(!data || typeof data!=='object' || Array.isArray(data))return {status:400,value:{error:'Invalid event request.'}};
  if(!await allowWrite(identity.userId))return {status:429,value:{error:'Please wait before changing events.'}};
  let result;
  if(action==='create')result=await events.create(identity,data,await resolveVenue(data.placeId));
  else {
    if(Object.keys(data).some(key=>!['id',...(action==='rsvp'?['going']:[])].includes(key)))
      return {status:400,value:{error:'Invalid event request.'}};
    result=action==='rsvp'?await events.rsvp(identity.userId,data.id,data.going):await events.cancel(identity.userId,data.id,admin);
  }
  return {status:result.ok?(action==='create'?201:200):result.reason==='invalid_event'?400:result.reason==='event_forbidden'?403
    :result.reason==='event_missing'?404:409,value:result.ok?result:{error:result.reason}};
}
