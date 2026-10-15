import { officesFor, OFFICE_SPEED, officeFree } from '../preview/src/office-contract.js';
import {
  DEFAULT_OFFICE_LAYOUT, OFFICE_LAYOUT_LEGACY, officeLayout, officeLevelElevation, officeLevelFree, officeLevelSegmentFree, officeTransition,
} from '../preview/src/office-layouts.js';

const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const userId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const fail=error=>({ok:false,error,message:error});
const LIMIT=64;
const workspaceId=id=>typeof id==='string'&&/^office-[a-f0-9]{64}$/.test(id);
const LEGACY_LEVEL=officeLayout(OFFICE_LAYOUT_LEGACY).spawn.levelId;
// RIVER_OAKS_OFFICE_LAYOUT selects Jevica's office layout; anything unknown keeps the legacy room.
export function configuredOfficeLayout(value,{onInvalid=()=>{}}={}){
  if(value===undefined||value===null||value==='')return DEFAULT_OFFICE_LAYOUT;
  if(officeLayout(value))return value;
  onInvalid(value);return DEFAULT_OFFICE_LAYOUT;
}
export function createOffices({worldData,players,isAdmin,environment,changed,cancel,officeLayout:configured=DEFAULT_OFFICE_LAYOUT}) {
  if(!officeLayout(configured))throw new Error('Unknown office layout');
  const catalog=officesFor(worldData),grants=new Map(),requests=new Map(),visits=new Map();
  // The server picks each office's layout: Jevica's office follows the configured layout,
  // personal workspaces keep the legacy room. A visit records the layout and the level it
  // was admitted to; a client never names its floor or height.
  const layoutFor=officeId=>workspaceId(officeId)?OFFICE_LAYOUT_LEGACY:configured;
  const access=(id,officeId)=>isAdmin(id)?'owner':grants.get(officeId)?.find(g=>g.userId===id)?.kind??null;
  const leave=id=>{const visit=visits.get(id),player=players.get(id);if(!visit)return;visits.delete(id);if(player){player.poseAt=visit.at;player.moveBudget=.1;player.liftBudget=.1;}changed();};
  const publicVisit=id=>{const v=visits.get(id);return v?{id:v.id,layout:v.layout,levelId:v.levelId,elevation:officeLevelElevation(officeLayout(v.layout),v.levelId),position:[...v.position],yaw:v.yaw}:null;};
  function command(player,m,time,workspace=null) {
    const personal=workspaceId(m.officeId);
    const office=personal&&catalog[0]?{...catalog[0],id:m.officeId}:catalog.find(o=>o.id===m.officeId);
    if(!office)return fail('unknown_office');
    if(!fields(m,['type','action','officeId',...(['invite','approve','deny','revoke'].includes(m.action)?['peerId']:m.action==='move'?['position','yaw','layout','levelId']:m.action==='transition'?['portalId','layout']:[])]))return fail('invalid_office_command');
    const id=player.id,permission=personal?(workspace?.id===office.id&&['owner','accepted'].includes(workspace.role)?workspace.role:null):access(id,office.id),visit=visits.get(id);
    if(personal&&!['enter','move','leave','transition'].includes(m.action))return fail('invalid_office_command');
    if(m.action==='list')return {ok:true,offices:catalog.map(o=>({...o,access:access(id,o.id),requested:(requests.get(o.id)??[]).some(r=>r.userId===id),...(isAdmin(id)?{guests:structuredClone(grants.get(o.id)??[]),requests:structuredClone(requests.get(o.id)??[])}:{})}))};
    if(m.action==='request'){
      if(permission)return {ok:true};
      const pending=requests.get(office.id)??[];
      if(pending.some(r=>r.userId===id))return {ok:true};
      if(pending.length>=LIMIT)return fail('office_request_limit');
      requests.set(office.id,[...pending,{userId:id,name:player.name}]);changed();return {ok:true};
    }
    if(['invite','approve','deny','revoke'].includes(m.action)){
      if(!isAdmin(id))return fail('office_owner_required');
      if(!userId(m.peerId)||isAdmin(m.peerId))return fail('invalid_office_guest');
      const pending=requests.get(office.id)??[],guests=grants.get(office.id)??[];
      if(['approve','deny'].includes(m.action)&&!pending.some(r=>r.userId===m.peerId))return fail('office_request_missing');
      if(['invite','approve'].includes(m.action)){
        if(guests.length>=LIMIT&&!guests.some(g=>g.userId===m.peerId))return fail('office_guest_limit');
        grants.set(office.id,[...guests.filter(g=>g.userId!==m.peerId),{userId:m.peerId,name:players.get(m.peerId)?.name??pending.find(r=>r.userId===m.peerId)?.name??m.peerId,kind:m.action==='invite'?'invited':'accepted'}]);
      }else if(m.action==='revoke'){
        grants.set(office.id,guests.filter(g=>g.userId!==m.peerId));
        if(visits.get(m.peerId)?.id===office.id)leave(m.peerId);
      }
      requests.set(office.id,pending.filter(r=>r.userId!==m.peerId));changed();return {ok:true};
    }
    if(m.action==='leave'){leave(id);return {ok:true};}
    if(!permission){if(personal&&visit?.id===office.id)leave(id);return fail('office_permission_required');}
    if(m.action==='enter'){
      if(visit)return {ok:true,office:publicVisit(id)};
      if(player.altitude>.1||player.vehicle||player.sitting||Math.hypot(player.position[0]-office.entrance[0],player.position[1]-office.entrance[1])>3)return fail('office_lobby_required');
      if(!environment.isFree(...[office.entrance[0],-office.entrance[1]]))return fail('office_lobby_blocked');
      cancel(id);player.gesture=null;player.gestureUntil=0;
      const layoutId=layoutFor(office.id),spawn=officeLayout(layoutId).spawn;
      visits.set(id,{id:office.id,layout:layoutId,levelId:spawn.levelId,position:[...spawn.position],yaw:0,at:time,budget:.1});changed();return {ok:true,office:publicVisit(id)};
    }
    if(m.action==='move'){
      if(!visit||visit.id!==office.id)return fail('office_visit_required');
      // A move names the layout it was computed for; only legacy-room clients may omit it.
      if(m.layout===undefined?visit.layout!==OFFICE_LAYOUT_LEGACY:m.layout!==visit.layout)return fail('office_layout_stale');
      if(m.levelId!==undefined&&m.levelId!==visit.levelId)return fail('office_level_stale');
      const layout=officeLayout(visit.layout);
      if(!Number.isFinite(m.yaw)||!officeLevelFree(layout,visit.levelId,m.position))return fail('office_blocked');
      const budget=Math.min(1,visit.budget+Math.max(0,time-visit.at)/1000);
      const cost=Math.hypot(m.position[0]-visit.position[0],m.position[1]-visit.position[1])/OFFICE_SPEED;
      if(cost>budget+1e-8)return fail('office_too_fast');
      if(!officeLevelSegmentFree(layout,visit.levelId,visit.position,m.position))return fail('office_blocked');
      Object.assign(visit,{position:[...m.position],yaw:Math.atan2(Math.sin(m.yaw),Math.cos(m.yaw)),at:time,budget:budget-cost});changed();return {ok:true,office:publicVisit(id)};
    }
    if(m.action==='transition'){
      if(!visit||visit.id!==office.id)return fail('office_visit_required');
      if(typeof m.portalId!=='string'||m.portalId.length>160||typeof m.layout!=='string')return fail('invalid_office_command');
      if(m.layout!==visit.layout)return fail('office_layout_stale');
      // Fixed endpoints only: from within reach of a stair or lift on this floor, to its pair.
      const moved=officeTransition(officeLayout(visit.layout),{levelId:visit.levelId,position:visit.position},m.portalId);
      if(!moved.ok)return fail(moved.error);
      if([...visits].some(([other,v])=>other!==id&&v.id===visit.id&&v.layout===visit.layout&&v.levelId===moved.levelId
        &&Math.hypot(v.position[0]-moved.position[0],v.position[1]-moved.position[1])<.7))return fail('office_landing_blocked');
      Object.assign(visit,{levelId:moved.levelId,position:moved.position,at:time,budget:.1});changed();return {ok:true,office:publicVisit(id)};
    }
    return fail('invalid_office_command');
  }
  const checkpoint=()=>structuredClone({grants:[...grants],requests:[...requests],visits:[...visits]});
  // Checkpoint v10 visits record their layout and level. Earlier visits were in the legacy
  // room and upgrade to it. A well-formed visit on a layout this server no longer serves for
  // that office (a rollback, or an activation) ends safely; grants and requests are kept.
  function validate(saved={grants:[],requests:[],visits:[]},nextPlayers=players,allowWorkspaces=false,version=10){
    if(!fields(saved,['grants','requests','visits']))throw new Error('Invalid office checkpoint');
    const checkMap=(entries,limit,check)=>{
      if(!Array.isArray(entries)||entries.length>limit)throw new Error('Invalid office map');
      const map=new Map();for(const pair of entries){if(!Array.isArray(pair)||pair.length!==2||map.has(pair[0])||!check(...pair))throw new Error('Invalid office record');map.set(...pair);}return map;
    };
    const checkPeople=(id,items,grant)=>catalog.some(o=>o.id===id)&&Array.isArray(items)&&items.length<=LIMIT&&new Set(items.map(p=>p?.userId)).size===items.length&&items.every(p=>fields(p,grant?['userId','name','kind']:['userId','name'])&&userId(p.userId)&&typeof p.name==='string'&&p.name.length<=160&&(!grant||['invited','accepted'].includes(p.kind)));
    const g=checkMap(saved.grants,catalog.length,(id,items)=>checkPeople(id,items,true));
    checkMap(saved.requests,catalog.length,(id,items)=>checkPeople(id,items,false));
    const placed=v=>version>=10
      ?fields(v,['id','layout','levelId','position','yaw','at','budget'])&&Boolean(officeLayout(v.layout))&&officeLevelFree(officeLayout(v.layout),v.levelId,v.position)
      :fields(v,['id','position','yaw','at','budget'])&&officeFree(v.position);
    checkMap(saved.visits,nextPlayers.size,(id,v)=>nextPlayers.has(id)&&placed(v)&&(catalog.some(o=>o.id===v.id)||allowWorkspaces&&workspaceId(v.id))&&Number.isFinite(v.yaw)&&Number.isFinite(v.at)&&Number.isFinite(v.budget)&&v.budget>=0&&v.budget<=1&&(allowWorkspaces&&workspaceId(v.id)||isAdmin(id)||g.get(v.id)?.some(p=>p.userId===id)));
    const next=structuredClone(saved);
    next.visits=next.visits.map(([id,v])=>[id,version>=10?v:{...v,layout:OFFICE_LAYOUT_LEGACY,levelId:LEGACY_LEVEL}]).filter(([,v])=>v.layout===layoutFor(v.id));
    return next;
  }
  function load(saved){for(const [map,entries]of [[grants,saved.grants],[requests,saved.requests],[visits,saved.visits]]){map.clear();for(const [k,v]of entries)map.set(k,v);}}
  return {command,publicVisit,has:id=>visits.has(id),leave,checkpoint,validate,load,catalog};
}
