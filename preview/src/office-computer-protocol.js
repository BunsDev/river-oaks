// TypeSafe Computer embed contract (#486), version 1: Place's side of the five lifecycle
// messages proposed for Computer's docs/PLACE_EMBED.md (TypeSafeAI/typesafe-computer#33).
// Messages carry lifecycle metadata only: no documents, credentials, account ids or URLs.
export const EMBED_PROTOCOL='typesafe-place-embed',EMBED_VERSION=1;
export const EMBED_STATES=['loading','signin-required','account-confirmation','usable','error'];
// saved: the Computer account acknowledged the latest change. offline: kept in this browser only.
export const EMBED_SYNC=['none','pending','saved','offline','failed'];
export const EMBED_ERRORS=['auth-failed','account-load-failed','unavailable'];
export const EMBED_RESULTS=['ready','cancelled','attention'];
// A ready close says what Computer resolved: saved to the account, kept in this browser, or nothing to save.
export const EMBED_PERSISTENCE=['saved','local','none'];
// Fixed, reviewed paths on the configured origin. Messages never supply a URL.
export const EMBED_PATHS={frame:'/?embed=place',signIn:'/api/auth/login',open:'/'};
const ID=/^[A-Za-z0-9_-]{16,64}$/;
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);

/** An exact public HTTPS origin, or null. Loopback http is accepted only when the caller allows it (development fixtures). */
export function computerOrigin(value,{allowLoopback=false}={}){
 if(typeof value!=='string'||!value||value!==value.trim())return null;
 let url;try{url=new URL(value);}catch{return null;}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||value.replace(/\/$/,'')!==url.origin)return null;
 if(url.protocol==='https:')return url.origin;
 return url.protocol==='http:'&&allowLoopback&&LOOPBACK.has(url.hostname)&&url.port?url.origin:null;
}
/** Build-time configuration. Missing, invalid or disabled configuration returns null and loads nothing. */
export function computerConfig(env={}){
 const value=env.VITE_TYPESAFE_COMPUTER_ORIGIN;if(!value||value==='off')return null;
 const origin=computerOrigin(value,{allowLoopback:Boolean(env.DEV)&&env.VITE_TYPESAFE_COMPUTER_TEST_LOOPBACK==='1'});if(!origin)return null;
 return {origin,frameURL:origin+EMBED_PATHS.frame,signInURL:origin+EMBED_PATHS.signIn,openURL:origin+EMBED_PATHS.open};
}

const base=(type,instanceId)=>({protocol:EMBED_PROTOCOL,version:EMBED_VERSION,type,instanceId});
export const initMessage=instanceId=>base('init',instanceId);
export const prepareCloseMessage=(instanceId,requestId)=>({...base('prepare-close',instanceId),requestId});
// getRandomValues, unlike randomUUID, also exists on plain-http development origins (phones on a LAN).
const randomHex=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
export const embedId=(random=randomHex)=>random().replace(/[^A-Za-z0-9_-]/g,'');

const exactly=(data,keys)=>{const own=Object.keys(data);return own.length===keys.length&&keys.every(k=>Object.hasOwn(data,k));};
/** Validates the shape of a child message. Origin, source, instance and request are checked by the frame owner. */
export function parseChildMessage(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const proto=Object.getPrototypeOf(data);if(proto!==Object.prototype&&proto!==null)return null;
 if(data.protocol!==EMBED_PROTOCOL||data.version!==EMBED_VERSION||typeof data.instanceId!=='string'||!ID.test(data.instanceId))return null;
 const common=['protocol','version','type','instanceId'];
 if(data.type==='status'){
  const error=data.state==='error';
  if(!exactly(data,[...common,'state','sync',...(error?['code']:[])])||!EMBED_STATES.includes(data.state)||!EMBED_SYNC.includes(data.sync))return null;
  if(error&&!EMBED_ERRORS.includes(data.code))return null;
  return error?{type:'status',instanceId:data.instanceId,state:data.state,sync:data.sync,code:data.code}:{type:'status',instanceId:data.instanceId,state:data.state,sync:data.sync};
 }
 if(data.type==='request-close')return exactly(data,common)?{type:'request-close',instanceId:data.instanceId}:null;
 if(data.type==='close-result'){
  const ready=data.result==='ready';
  if(!exactly(data,[...common,'requestId','result',...(ready?['persistence']:[])])||typeof data.requestId!=='string'||!ID.test(data.requestId)||!EMBED_RESULTS.includes(data.result))return null;
  if(ready&&!EMBED_PERSISTENCE.includes(data.persistence))return null;
  return {type:'close-result',instanceId:data.instanceId,requestId:data.requestId,result:data.result,...(ready?{persistence:data.persistence}:{})};
 }
 return null;
}
