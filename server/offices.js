import { officesFor, OFFICE_SPEED, officeFree } from '../preview/src/office-contract.js';
import { AVATAR_ENVELOPE } from '../preview/src/workplace-room.js';
import {
  DEFAULT_OFFICE_LAYOUT, OFFICE_BODY_SPACING, OFFICE_LAYOUT_LEGACY, OFFICE_SEAT_REACH, officeLayout, officeLevelFree,
  officeElevationAt, officeLandingSpot, officeSeat, officeStandFree, officeTransition, officeWalk,
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
  // The sole office uses the server-selected layout. Clients cannot choose a floor.
  const layoutFor=()=>configured;
  const access=(id,officeId)=>isAdmin(id)?'owner':grants.get(officeId)?.find(g=>g.userId===id)?.kind??null;
  const leave=id=>{const visit=visits.get(id),player=players.get(id);if(!visit)return;visits.delete(id);if(player){player.poseAt=visit.at;player.moveBudget=.1;player.liftBudget=.1;}changed();};
  const publicVisit=id=>{const v=visits.get(id);return v?{id:v.id,layout:v.layout,levelId:v.levelId,elevation:officeElevationAt(officeLayout(v.layout),v.levelId,v.position),position:[...v.position],yaw:v.yaw,...(v.seat?{seat:{id:v.seat.id}}:{})}:null;};
  // Other visits in the same office and layout, and the plan seats they hold (#363).
  const companions=(id,visit)=>[...visits].filter(([other,v])=>other!==id&&v.id===visit.id&&v.layout===visit.layout).map(([,v])=>v);
  const occupiedBy=(id,visit)=>companions(id,visit).filter(v=>v.seat).map(v=>officeSeat(officeLayout(v.layout),v.seat.id)).filter(Boolean);
  const away=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function command(player,m,time) {
    const office=catalog.find(o=>o.id===m.officeId);
    if(!office)return fail('unknown_office');
    if(!fields(m,['type','action','officeId',...(['invite','revoke'].includes(m.action)?['peerId']:m.action==='move'?['position','yaw','layout','levelId']:m.action==='transition'?['portalId','layout']:m.action==='sit'?['seatId','layout']:m.action==='stand'?['layout']:[])]))return fail('invalid_office_command');
    const id=player.id,permission=access(id,office.id),visit=visits.get(id);
    if(m.action==='list')return {ok:true,offices:catalog.map(o=>({...o,access:access(id,o.id),requested:(requests.get(o.id)??[]).some(r=>r.userId===id),...(isAdmin(id)?{guests:structuredClone(grants.get(o.id)??[]),requests:structuredClone(requests.get(o.id)??[])}:{})}))};
    if(['request','approve','deny'].includes(m.action))return fail('invalid_office_command');
    if(['invite','revoke'].includes(m.action)){
      if(!isAdmin(id))return fail('office_owner_required');
      if(!userId(m.peerId)||isAdmin(m.peerId))return fail('invalid_office_guest');
      const pending=requests.get(office.id)??[],guests=grants.get(office.id)??[];
      if(m.action==='invite'){
        if(guests.length>=LIMIT&&!guests.some(g=>g.userId===m.peerId))return fail('office_guest_limit');
        grants.set(office.id,[...guests.filter(g=>g.userId!==m.peerId),{userId:m.peerId,name:players.get(m.peerId)?.name??pending.find(r=>r.userId===m.peerId)?.name??m.peerId,kind:'invited'}]);
      }else if(m.action==='revoke'){
        grants.set(office.id,guests.filter(g=>g.userId!==m.peerId));
        if(visits.get(m.peerId)?.id===office.id)leave(m.peerId);
      }
      requests.set(office.id,pending.filter(r=>r.userId!==m.peerId));changed();return {ok:true};
    }
    if(m.action==='leave'){leave(id);return {ok:true};}
    if(!permission)return fail('office_permission_required');
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
      if(visit.seat)return fail('office_seated');
      // Other visitors' occupied seats are collision (office-layouts.js).
      const layout=officeLayout(visit.layout),occupied=occupiedBy(id,visit);
      // The target must be standing ground on some floor; the walk below decides which (a stair
      // walk can end on the other floor), and the client never names it.
      if(!Number.isFinite(m.yaw)||!layout.levels.some(level=>officeStandFree(layout,level.id,m.position,occupied)))return fail('office_blocked');
      const budget=Math.min(1,visit.budget+Math.max(0,time-visit.at)/1000);
      const cost=Math.hypot(m.position[0]-visit.position[0],m.position[1]-visit.position[1])/OFFICE_SPEED;
      if(cost>budget+1e-8)return fail('office_too_fast');
      const walked=officeWalk(layout,visit.levelId,visit.position,m.position,occupied);
      if(!walked.ok)return fail('office_blocked');
      Object.assign(visit,{levelId:walked.levelId,position:[...m.position],yaw:Math.atan2(Math.sin(m.yaw),Math.cos(m.yaw)),at:time,budget:budget-cost});changed();return {ok:true,office:publicVisit(id)};
    }
    if(m.action==='transition'){
      if(!visit||visit.id!==office.id)return fail('office_visit_required');
      if(typeof m.portalId!=='string'||m.portalId.length>160||typeof m.layout!=='string')return fail('invalid_office_command');
      if(m.layout!==visit.layout)return fail('office_layout_stale');
      if(visit.seat)return fail('office_seated');
      // Fixed endpoints only: from within reach of a stair or lift on this floor, to its pair.
      const moved=officeTransition(officeLayout(visit.layout),{levelId:visit.levelId,position:visit.position},m.portalId,occupiedBy(id,visit));
      if(!moved.ok)return fail(moved.error);
      // Someone on the landing never keeps a visitor off a floor: arrive beside them instead.
      const bodies=[...visits].filter(([other,v])=>other!==id&&v.id===visit.id&&v.layout===visit.layout&&v.levelId===moved.levelId).map(([,v])=>v.position);
      const arrival=officeLandingSpot(officeLayout(visit.layout),moved.levelId,moved.position,bodies,occupiedBy(id,visit));
      Object.assign(visit,{levelId:moved.levelId,position:arrival,at:time,budget:.1});changed();return {ok:true,office:publicVisit(id)};
    }
    // Seats are plan seats claimed from their stand point, one occupant each. The pose is the
    // plan's; a client never sends one. Standing up returns to the stand point.
    if(m.action==='sit'||m.action==='stand'){
      if(!visit||visit.id!==office.id)return fail('office_visit_required');
      if(typeof m.layout!=='string'||m.action==='sit'&&(typeof m.seatId!=='string'||m.seatId.length>160))return fail('invalid_office_command');
      if(m.layout!==visit.layout)return fail('office_layout_stale');
      const layout=officeLayout(visit.layout),others=companions(id,visit).filter(v=>v.levelId===visit.levelId);
      if(m.action==='sit'){
        if(visit.seat)return fail('office_already_seated');
        const seat=officeSeat(layout,m.seatId);
        if(!seat)return fail('invalid_office_seat');
        if(seat.levelId!==visit.levelId||away(visit.position,seat.stand)>OFFICE_SEAT_REACH)return fail('office_seat_out_of_reach');
        if(others.some(v=>v.seat?.id===seat.id))return fail('office_seat_occupied');
        // Nobody may stand where the taken seat will be collision: inside the seated envelope they
        // would be shut in, and beside the stand point they would keep the occupant seated.
        if(others.some(v=>!v.seat&&!officeStandFree(layout,visit.levelId,v.position,[seat])))return fail('office_seat_blocked');
        Object.assign(visit,{seat:{id:seat.id},position:[...seat.position],yaw:seat.facing,at:time,budget:.1});changed();return {ok:true,office:publicVisit(id)};
      }
      if(!visit.seat)return fail('office_not_seated');
      const seat=officeSeat(layout,visit.seat.id);
      if(!officeLevelFree(layout,visit.levelId,seat.stand,occupiedBy(id,visit))||others.some(v=>away(v.position,seat.stand)<OFFICE_BODY_SPACING))return fail('office_stand_blocked');
      delete visit.seat;Object.assign(visit,{position:[...seat.stand],at:time,budget:.1});changed();return {ok:true,office:publicVisit(id)};
    }
    return fail('invalid_office_command');
  }
  const checkpoint=()=>structuredClone({grants:[...grants],requests:[...requests],visits:[...visits]});
  // Checkpoint v10 visits record their layout and level. Earlier visits were in the legacy
  // room and upgrade to it. A well-formed visit on a layout this server no longer serves for
  // that office (a rollback, or an activation) ends safely; grants and requests are kept.
  // v11 visits may hold a seat: exactly the plan seat's pose on its own floor, one claim per seat.
  function validate(saved={grants:[],requests:[],visits:[]},nextPlayers=players,allowWorkspaces=false,version=11){
    if(!fields(saved,['grants','requests','visits']))throw new Error('Invalid office checkpoint');
    const checkMap=(entries,limit,check)=>{
      if(!Array.isArray(entries)||entries.length>limit)throw new Error('Invalid office map');
      const map=new Map();for(const pair of entries){if(!Array.isArray(pair)||pair.length!==2||map.has(pair[0])||!check(...pair))throw new Error('Invalid office record');map.set(...pair);}return map;
    };
    const checkPeople=(id,items,grant)=>catalog.some(o=>o.id===id)&&Array.isArray(items)&&items.length<=LIMIT&&new Set(items.map(p=>p?.userId)).size===items.length&&items.every(p=>fields(p,grant?['userId','name','kind']:['userId','name'])&&userId(p.userId)&&typeof p.name==='string'&&p.name.length<=160&&(!grant||['invited','accepted'].includes(p.kind)));
    const g=checkMap(saved.grants,catalog.length,(id,items)=>checkPeople(id,items,true));
    checkMap(saved.requests,catalog.length,(id,items)=>checkPeople(id,items,false));
    const seated=(v,layout)=>{
      const seat=fields(v.seat,['id'])?officeSeat(layout,v.seat.id):null;
      return Boolean(seat)&&seat.levelId===v.levelId&&Array.isArray(v.position)&&v.position.length===2&&v.position.every((n,i)=>n===seat.position[i])
        &&v.yaw===seat.facing&&officeLevelFree(layout,v.levelId,seat.stand);
    };
    // A standing visit must stand inside a real floor of its layout, or the checkpoint fails closed.
    // Furniture is different: a plan change (such as R19's desks) can cover a spot someone stood on,
    // and that ends the visit below, not the whole town. The legacy room has no furniture to change.
    const onFloor=v=>{
      const layout=officeLayout(v.layout),level=layout.levels.find(item=>item.id===v.levelId),p=v.position;
      if(!level||!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))return false;
      if(layout.id===OFFICE_LAYOUT_LEGACY)return officeLevelFree(layout,v.levelId,p);
      const r=AVATAR_ENVELOPE.turningRadius,{x0,x1,d0,d1}=level.bounds;
      return p[0]>=x0+r&&p[0]<=x1-r&&p[1]>=d0+r&&p[1]<=d1-r;
    };
    const fits=v=>v.seat!==undefined||officeStandFree(officeLayout(v.layout),v.levelId,v.position);
    const placed=v=>version>=10
      ?fields(v,['id','layout','levelId','position','yaw','at','budget',...(version>=11?['seat']:[])])&&Boolean(officeLayout(v.layout))
        &&(v.seat===undefined?onFloor(v):seated(v,officeLayout(v.layout)))
      :fields(v,['id','position','yaw','at','budget'])&&officeFree(v.position);
    const claims=new Set();
    for(const [,v] of Array.isArray(saved.visits)?saved.visits:[]){
      if(!v?.seat)continue;
      const claim=JSON.stringify([v.id,v.layout,v.seat.id]);
      if(claims.has(claim))throw new Error('Invalid office seat claim');claims.add(claim);
    }
    // No standing visit inside another's occupied seat: commands never produce one.
    for(const [,v] of Array.isArray(saved.visits)?saved.visits:[]){
      if(v?.seat!==undefined||!officeLayout(v?.layout))continue;
      const taken=saved.visits.filter(([,other])=>other?.seat&&other.id===v.id&&other.layout===v.layout).map(([,other])=>officeSeat(officeLayout(other.layout),other.seat?.id)).filter(Boolean);
      const layout=officeLayout(v.layout);
      if(officeStandFree(layout,v.levelId,v.position)&&!officeStandFree(layout,v.levelId,v.position,taken))throw new Error('Invalid office visit beside an occupied seat');
    }
    checkMap(saved.visits,nextPlayers.size,(id,v)=>nextPlayers.has(id)&&placed(v)&&(catalog.some(o=>o.id===v.id)||allowWorkspaces&&workspaceId(v.id))&&Number.isFinite(v.yaw)&&Number.isFinite(v.at)&&Number.isFinite(v.budget)&&v.budget>=0&&v.budget<=1&&(allowWorkspaces&&workspaceId(v.id)||isAdmin(id)||g.get(v.id)?.some(p=>p.userId===id)));
    const next=structuredClone(saved);
    next.requests=[];
    next.grants=next.grants.map(([id,guests])=>[id,guests.filter(g=>g.kind==='invited')]);
    next.visits=next.visits.filter(([id,v])=>catalog.some(o=>o.id===v.id)&&(isAdmin(id)||next.grants.find(([officeId])=>officeId===v.id)?.[1].some(g=>g.userId===id))).map(([id,v])=>[id,version>=10?v:{...v,layout:OFFICE_LAYOUT_LEGACY,levelId:LEGACY_LEVEL}]).filter(([,v])=>v.layout===layoutFor(v.id)&&fits(v));
    return next;
  }
  function load(saved){for(const [map,entries]of [[grants,saved.grants],[requests,saved.requests],[visits,saved.visits]]){map.clear();for(const [k,v]of entries)map.set(k,v);}}
  return {command,publicVisit,has:id=>visits.has(id),leave,checkpoint,validate,load,catalog};
}
