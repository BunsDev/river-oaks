import {createHmac,timingSafeEqual} from 'node:crypto';
const MAX_BODY=256*1024,MAX_AGE=5*60*1000,MAX_PENDING=8;
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const failure=status=>Object.assign(new Error('Webhook request rejected'),{status});
function signatureParts(header,now){
 if(typeof header!=='string'||header.length>512)return null;
 const fields=header.split(',').map(part=>part.trim().split('='));
 if(fields.length!==2||fields.some(pair=>pair.length!==2))return null;
 const values=Object.fromEntries(fields);
 if(Object.keys(values).length!==2||!Object.hasOwn(values,'t')||!Object.hasOwn(values,'v1')
  ||!/^[1-9][0-9]{0,15}$/.test(values.t)||!/^[a-fA-F0-9]{64}$/.test(values.v1))return null;
 const timestamp=Number(values.t);
 return Number.isSafeInteger(timestamp)&&Math.abs(now-timestamp)<=MAX_AGE?values:null;
}
function readBody(req){
 return new Promise((resolve,reject)=>{
  let size=0;const chunks=[];
  const finish=(error,value)=>{clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('error',errorEvent);req.off('aborted',aborted);if(error){req.resume();reject(error);}else resolve(value);};
  const data=chunk=>{size+=chunk.length;if(size>MAX_BODY)return finish(failure(413));chunks.push(chunk);};
  const end=()=>finish(null,Buffer.concat(chunks));
  const errorEvent=()=>finish(failure(400)),aborted=()=>finish(failure(400));
  const timer=setTimeout(()=>finish(failure(408)),5000);timer.unref();
  req.on('data',data);req.once('end',end);req.once('error',errorEvent);req.once('aborted',aborted);
 });
}
// WorkOS signs timestamp + '.' + the original UTF-8 body, not parsed JSON.
// https://workos.com/docs/events/data-syncing/webhooks
// The callback, given the account and the event id, must complete idempotent erasure,
// session revocation and disconnect before resolving. Failed deliveries receive 503 so the provider can retry.
export function createWorkOSDeletionHandler({secret=null,onDelete,now=Date.now}={}){
 if(secret!==null&&(typeof secret!=='string'||!secret.length||secret.length>4096))throw new TypeError('Invalid webhook configuration');
 if(secret!==null&&typeof onDelete!=='function')throw new TypeError('Deletion callback is required');
 let pending=0;
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/workos/events'||secret===null)return false;
  if(req.method!=='POST'){res.setHeader('Allow','POST');json(res,405,{error:'webhook_method_not_allowed'});return true;}
  if(url.search){json(res,400,{error:'invalid_webhook_request'});return true;}
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'webhook_json_required'});return true;}
  const parts=signatureParts(req.headers['workos-signature'],now());
  if(!parts){json(res,401,{error:'invalid_webhook_signature'});return true;}
  if(pending>=MAX_PENDING){json(res,503,{error:'webhook_unavailable'});return true;}
  pending++;
  try{
   let body;
   try{body=await readBody(req);}catch(error){res.setHeader('Connection','close');json(res,error.status??400,{error:'invalid_webhook_request'});return true;}
   const expected=createHmac('sha256',secret).update(parts.t+'.').update(body).digest();
   if(!timingSafeEqual(expected,Buffer.from(parts.v1,'hex'))){json(res,401,{error:'invalid_webhook_signature'});return true;}
   let event;
   try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{json(res,400,{error:'invalid_webhook_event'});return true;}
   if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.event!=='string'
    ||typeof event.id!=='string'||!/^event_[A-Za-z0-9]{1,122}$/.test(event.id)){json(res,400,{error:'invalid_webhook_event'});return true;}
   if(event.event!=='user.deleted'){json(res,200,{ok:true});return true;}
   const id=event.data?.id;
   if(event.data?.object!=='user'||typeof id!=='string'||!/^user_[A-Za-z0-9]{1,123}$/.test(id)){json(res,400,{error:'invalid_webhook_event'});return true;}
   try{await onDelete(id,event.id);}catch{json(res,503,{error:'webhook_unavailable'});return true;}
   json(res,200,{ok:true});return true;
  }finally{pending--;}
 };
}
