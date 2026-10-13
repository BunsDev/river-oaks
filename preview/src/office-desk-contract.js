export const DESK_LIMITS=Object.freeze({tasks:24,title:120,notes:4000,result:8000,links:5,linkLabel:80,url:2048,bytes:131072});
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const deskFields=(v,keys)=>record(v)&&Object.keys(v).every(k=>keys.includes(k));
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v);
export const deskId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
export function safeDeskURL(value){
 if(!text(value,DESK_LIMITS.url)||value!==value.trim())return false;
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
}
export function validDeskTask(t){
 return deskFields(t,['id','title','notes','links','result','status'])&&deskId(t.id)&&text(t.title,DESK_LIMITS.title)&&Boolean(t.title.trim())
  &&text(t.notes,DESK_LIMITS.notes)&&text(t.result,DESK_LIMITS.result)&&['open','done'].includes(t.status)
  &&Array.isArray(t.links)&&t.links.length<=DESK_LIMITS.links&&t.links.every(l=>deskFields(l,['label','url'])&&text(l.label,DESK_LIMITS.linkLabel)&&Boolean(l.label.trim())&&safeDeskURL(l.url));
}
export const validDeskVersion=v=>Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER;
export const emptyDesk=()=>({version:0,activeId:null,tasks:[],updatedAt:0});
