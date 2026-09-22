import { ozFolkFor } from './oz-folk.js';
import { turnToward } from './gait.js';
import { createResidentNavigation } from './navigation.js';
import { residentContext } from './personas.js';
import { helperVisit,syncVolunteerVisits,planVolunteerVisit,observeVolunteerArrivals } from './volunteer-visits.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const ACTIONS=new Set(['continue','pause','greet','redirect','seek_shelter','slow','stop']);
const SOURCES=new Set(['jev','local_rules','safety_override']);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export function createResidentLife(world,state,routeProvider=null) {
  const navigation=createResidentNavigation(world);
  if(!navigation) return null;
  const stops=(world.communityLocations ?? []).filter(stop=>navigation.free(stop.position));
  // These small awnings exist in the interpreted storefront mesh, not a shelter registry.
  const shelters=(world.stores ?? []).map(store=>({id:store.id,name:store.name,position:[store.facade[0]+store.outward[0]*0.9,store.facade[1]+store.outward[1]*0.9]})).filter(stop=>navigation.free(stop.position));
  state.locals.forEach((local,index)=>{
    local.folk=ozFolkFor(local.id).name;
    local.life={speed:0,distance:0,heading:index*2.4,status:'resting',action:'continue',source:'local_rules',route:[],routeVersion:0,destination:null,waitUntil:0.5+index*0.17,reactionUntil:0,visits:0,blocked:false};
  });
  return {state,navigation,routeProvider:routeProvider ?? navigation.route,planning:false,stops,shelters,elapsed:0,storm:false,revision:0,packet:null,cursor:0,paused:false,stats:{jev:0,local_rules:0,safety_override:0,latency_ms:null}};
}

function plan(life,local,index) {
  const motion=local.life,sheltering=life.storm || motion.action==='seek_shelter';
  let candidates=(sheltering?life.shelters:life.stops).filter(stop=>sheltering || distance(local.position,stop.position)>4);
  candidates.sort((a,b)=>distance(a.position,local.position)-distance(b.position,local.position));
  candidates=candidates.slice(0,6);
  if(!sheltering && candidates.length) {
    const offset=(index+motion.visits)%Math.min(3,candidates.length);
    candidates=[...candidates.slice(offset),...candidates.slice(0,offset)];
  }
  // One route search per update; failed destinations are retried on later updates.
  const candidate=candidates[motion.attempt ?? 0];
  if(!candidate) {motion.waitUntil=life.elapsed+5;motion.attempt=0;motion.status=sheltering?'shelter unavailable':'resting';return;}
  const revision=life.revision,generation=life.state.generation,routeVersion=motion.routeVersion;
  const accept=route=>{
    if(life.revision!==revision || life.state.generation!==generation || motion.routeVersion!==routeVersion) return;
    if(!route) {motion.attempt=(motion.attempt ?? 0)+1;motion.waitUntil=life.elapsed+0.2;return;}
    motion.route=route;motion.destination={id:candidate.id,name:candidate.name,shelter:sheltering};motion.attempt=0;
  };
  const result=life.routeProvider(local.position.slice(0,2),candidate.position.slice(0,2));
  if(result?.then) {
    life.planning=true;
    result.then(accept,()=>accept(null)).finally(()=>{life.planning=false;});
  } else accept(result);
}

export function stepResidentLife(life,delta,{paused=false,visitor=null,storm=false,humidity=0.72,hour=15}={}) {
  if(!life || !Number.isFinite(delta) || delta<=0) return;
  const {state}=life;
  if(life.storm!==storm || life.paused!==paused) {
    life.revision++;life.packet=null;life.paused=paused;
    if(life.storm!==storm) {
      life.storm=storm;
      for(const local of state.locals) Object.assign(local.life,{route:[],destination:null,waitUntil:life.elapsed,reactionUntil:0,attempt:0});
    }
  }
  for(const local of state.locals) {local.life.previousSpeed=local.life.speed>0 ? local.life.velocity ?? local.life.speed : 0;local.life.speed=0;}
  syncVolunteerVisits(life);
  const activeVisits=state.physicalVisits && state.running && state.jobs.length>0;
  if(paused && !activeVisits) return;
  const dt=Math.min(delta,0.08);life.elapsed+=dt;
  const held=local=>Boolean(local.abducted) || (!storm && !local.life.visitId && Boolean(local.visitorReaction)) || state.selectedId===local.id || (!local.life.visitId && visitor && distance(visitor,local.position)<2.8) || (!storm && local.status==='aid_en_route');
  // Rotate ownership of the route-search slot so inaccessible stops cannot starve others.
  let planned=planVolunteerVisit(life);const cursor=life.cursor;
  for(let offset=0;offset<state.locals.length;offset++) {
    const index=(cursor+offset)%state.locals.length,local=state.locals[index],motion=local.life;
    const visit=helperVisit(state,local);
    if(paused && !visit) continue;
    if (local.indoor) { motion.status = state.selectedId === local.id ? 'chatting' : 'at work'; continue; }
    motion.blocked=false;
    if(storm) {motion.action='seek_shelter';motion.source='safety_override';}
    else if(life.elapsed>=motion.reactionUntil) {
      if(motion.destination?.shelter) {motion.routeVersion++;motion.route=[];motion.destination=null;motion.waitUntil=life.elapsed;}
      motion.action=hour<6 || hour>=22?'pause':humidity>0.85?'slow':'continue';motion.source='local_rules';
    }
    if(held(local)) {motion.status=state.selectedId===local.id?'chatting':'greeting visitor';continue;}
    if(visit && (!state.running || !storm && ['routing','assisting'].includes(visit.phase))) {motion.status=!state.running?'visit paused':visit.phase==='assisting'?'helping neighbor':'preparing visit';continue;}
    if(['pause','greet','stop'].includes(motion.action)) {motion.status=motion.action==='greet'?'greeting':'paused';continue;}
    if(!motion.route.length && life.elapsed>=motion.waitUntil && !planned && !life.planning && (!visit || storm || motion.action==='seek_shelter')) {
      planned=true;life.cursor=(index+1)%state.locals.length;plan(life,local,index);
    }
    if(!motion.route.length) continue;
    while(motion.route.length>1 && distance(local.position,motion.route[0])<0.025) motion.route.shift();
    const target=motion.route[0],length=distance(local.position,target);
    if(length<0.025) {
      motion.route.shift();
      if(!motion.route.length) {
        motion.visits++;motion.status=motion.destination.shelter?'sheltered':'resting';
        motion.waitUntil=motion.destination.shelter?Infinity:life.elapsed+(motion.destination.returning?1:6+index%5*2);
        if(!motion.destination.returning && !motion.destination.visit) {local.anchorId=motion.destination.id;local.anchorName=motion.destination.name;local.persona.anchorName=motion.destination.name;}
      }
      continue;
    }
    const desiredHeading=Math.atan2(target[0]-local.position[0],-(target[1]-local.position[1]));
    motion.heading=turnToward(motion.heading,desiredHeading,dt,7.5);
    const turnAllowance=Math.max(0,Math.cos(desiredHeading-motion.heading));
    const cruise=(1.05+index%4*0.07)*(motion.action==='slow'?0.58:1);
    // Decelerate for the destination, not for intermediate navigation samples.
    const remaining=motion.route.reduce((total,point,i)=>total+(i?distance(motion.route[i-1],point):length),0);
    const desired=Math.min(cruise,Math.sqrt(2*1.8*Math.max(0,remaining-0.02)));
    const previous=motion.previousSpeed ?? 0,rate=desired>previous?1.4:1.8;
    const speed=previous+clamp(desired-previous,-rate*dt,rate*dt);
    const travel=Math.min(length,(previous+speed)*0.5*dt)*turnAllowance;
    const dx=(target[0]-local.position[0])/length,dy=(target[1]-local.position[1])/length;
    const occupied=point=>state.locals.some(other=>other!==local && distance(point,other.position)<0.7 && distance(point,other.position)<distance(local.position,other.position)) || (visitor && distance(point,visitor)<0.7 && distance(point,visitor)<distance(local.position,visitor));
    const clear=point=>!occupied(point) && life.navigation.canTravel(local.position,point);
    let next=[local.position[0]+dx*travel,local.position[1]+dy*travel];
    if(occupied(next)) {
      // Yield to the right first. A bounded lateral step lets opposing walkers
      // pass while still respecting footprints and trunks on every frame.
      for(const angle of [-Math.PI/3,-Math.PI/2,Math.PI/3,Math.PI/2]) {
        const c=Math.cos(angle),s=Math.sin(angle),candidate=[local.position[0]+(dx*c-dy*s)*travel,local.position[1]+(dx*s+dy*c)*travel];
        if(clear(candidate) && life.navigation.canWalk(local.position,candidate)) {next=candidate;break;}
      }
    }
    motion.blocked=!clear(next);
    if(motion.blocked) {motion.status='waiting for space';continue;}
    local.position=[next[0],next[1],life.navigation.ground(next)];motion.distance+=travel;motion.speed=travel/dt;motion.velocity=speed;
    motion.status=turnAllowance<0.5?'turning':motion.destination?.shelter?'seeking cover':visit?'volunteering':'walking';
  }
  observeVolunteerArrivals(life);
}

export function residentPacket(life,tick,{visitor=null,hour=15,humidity=0.72}={}) {
  if(!life || !Number.isInteger(tick) || tick<0) return null;
  const agents=life.state.locals.filter(local=>!local.indoor && local.id!==life.state.selectedId && (!life.paused || life.state.running && helperVisit(life.state,local))).map(local=>{
    const nearby=life.state.locals.filter(other=>other!==local).map(other=>({id:other.id,kind:'resident',distance_m:distance(local.position,other.position)})).filter(other=>other.distance_m<12);
    if(visitor && distance(visitor,local.position)<12) nearby.push({id:'visitor',kind:'pedestrian',distance_m:distance(visitor,local.position)});
    nearby.sort((a,b)=>a.distance_m-b.distance_m);
    return {id:local.id,kind:'resident',position:[...local.position],activity:`${local.life.status}; ${local.life.destination?.name ?? local.anchorName}`.slice(0,64),role_context:residentContext(local),nearby:nearby.slice(0,16),blocked:local.life.blocked,vehicle_distance_m:null};
  });
  if(!agents.length) return null;
  life.packet={tick,generation:life.state.generation,revision:life.revision,at:life.elapsed,ids:agents.map(a=>a.id)};
  return {schema_version:1,tick,agents,weather:{storm:life.storm,rain:life.storm?1:0,humidity:clamp(humidity,0,1)},hour:clamp(hour,0,23.99)};
}

export function applyResidentDecisions(life,response) {
  const packet=life?.packet;
  if(!packet || packet.generation!==life.state.generation || packet.revision!==life.revision || life.elapsed-packet.at>2.5) return false;
  if(!response || response.schema_version!==1 || response.tick!==packet.tick || !Number.isFinite(response.latency_ms) || response.latency_ms<0 || !Array.isArray(response.decisions) || response.decisions.length!==packet.ids.length) return false;
  const ids=new Set(packet.ids),seen=new Set();
  for(const decision of response.decisions) {
    if(!decision || !ids.has(decision.id) || seen.has(decision.id) || !ACTIONS.has(decision.action) || !SOURCES.has(decision.source)) return false;
    seen.add(decision.id);
  }
  for(const decision of response.decisions) {
    const local=life.state.locals.find(l=>l.id===decision.id),motion=local.life;
    if(local.id===life.state.selectedId || life.paused && (!life.state.running || !helperVisit(life.state,local))) continue;
    let action=life.storm?'seek_shelter':decision.action,source=life.storm?'safety_override':decision.source;
    if(action==='redirect' || action==='seek_shelter' && motion.action!=='seek_shelter') {
      motion.routeVersion++;motion.route=[];motion.destination=null;motion.waitUntil=life.elapsed;motion.visits++;motion.attempt=0;
    }
    if(action==='redirect') {
      for(let meters=3;meters>=0.5;meters-=0.5) {
        const reverse=[local.position[0]-Math.sin(motion.heading)*meters,local.position[1]+Math.cos(motion.heading)*meters];
        if(life.navigation.canTravel(local.position,reverse)) {motion.route=[reverse];motion.destination={returning:true,shelter:false,name:local.anchorName};break;}
      }
      if(!motion.route.length) {action='stop';source='safety_override';}
    }
    Object.assign(motion,{action,source,reactionUntil:life.elapsed+2.5});life.stats[source]++;
  }
  life.stats.latency_ms=response.latency_ms;life.packet=null;return true;
}
