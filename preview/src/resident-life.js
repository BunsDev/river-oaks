import { personElevation as feetHeight } from './person-position.js';
import { turnToward } from './gait.js';
import { createResidentNavigation } from './navigation.js';
import { residentContext } from './personas.js';
import { helperVisit,syncVolunteerVisits,planVolunteerVisit,observeVolunteerArrivals } from './volunteer-visits.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const ACTIONS=new Set(['continue','pause','greet','redirect','seek_shelter','slow','stop']);
const SOURCES=new Set(['jev','local_rules','safety_override']);
const HELP_WAIT=30;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
// Collision avoidance is physical occupancy, not a projection of every visible
// person onto the street. Low flight still overlaps a standing pedestrian.
const sharesWalkingSpace=(local,other)=>other!==local && !other.abducted && !other.indoor
  && (local.storeId??null)===(other.storeId??null) && Math.abs(feetHeight(local)-feetHeight(other))<1.8;
const streetVisitor=(local,visitor,pose)=>visitor && (!pose ||
  (pose.roomId??null)===(local.storeId??null) && Math.abs(feetHeight(local)-pose.ground-(pose.altitude??0))<1.8) ? visitor : null;


export function createResidentLife(world,state,routeProvider=null) {
  const navigation=createResidentNavigation(world);
  if(!navigation) return null;
  const stops=(world.communityLocations ?? []).map(stop=>({...stop,position:navigation.sidewalkPoint(stop.position)})).filter(stop=>navigation.free(stop.position));
  // These small awnings exist in the interpreted storefront mesh, not a shelter registry.
  const shelters=(world.stores ?? []).map(store=>({id:store.id,name:store.name,position:[store.facade[0]+store.outward[0]*0.9,store.facade[1]+store.outward[1]*0.9]})).filter(stop=>navigation.free(stop.position));
  state.locals.forEach((local,index)=>{
    if(!local.indoor&&!local.stationary){const point=navigation.sidewalkPoint(local.position);local.position=[...point,navigation.ground(point)];}
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

function passingHeading(life,local,heading,speed,visitor,obstacles=[]) {
  const forward=[Math.sin(heading),-Math.cos(heading)],right=[forward[1],-forward[0]];
  const neighbors=life.state.locals.filter(other=>sharesWalkingSpace(local,other)).map(other=>({position:other.position,speed:other.life?.previousSpeed ?? 0,heading:other.life?.heading ?? 0}));
  if(visitor)neighbors.push({position:visitor,speed:0,heading:0});
  for(const position of obstacles)neighbors.push({position,speed:0,heading:0});
  let offset=0;
  for(const other of neighbors) {
    const dx=other.position[0]-local.position[0],dy=other.position[1]-local.position[1];
    const ahead=dx*forward[0]+dy*forward[1],lateral=dx*right[0]+dy*right[1];
    const approaching=Math.max(0,-other.speed*Math.cos(other.heading-heading));
    const lookahead=1.2+speed*0.8+approaching*0.5;
    if(ahead<=0 || ahead>=lookahead || Math.abs(lateral)>=1)continue;
    // Begin passing before personal space is exhausted. Opposing walkers both
    // keep right; somebody already alongside is passed on their open side.
    const side=lateral>0.15?-1:1;
    const turn=-side*Math.atan2(1+side*lateral,Math.max(0.6,ahead))*clamp((lookahead-ahead)/0.8,0,1);
    if(Math.abs(turn)>Math.abs(offset))offset=turn;
  }
  const clearOfPeople=direction=>neighbors.every(other=>{
    const dx=other.position[0]-local.position[0],dy=other.position[1]-local.position[1];
    const along=clamp(dx*Math.sin(direction)-dy*Math.cos(direction),0,0.7);
    const gap=Math.hypot(dx-Math.sin(direction)*along,dy+Math.cos(direction)*along);
    return gap>=Math.min(0.7,Math.hypot(dx,dy))-1e-8;
  });
  for(const turn of [offset,-offset,0]) {
    const direction=heading+turn,probe=[local.position[0]+Math.sin(direction)*0.7,local.position[1]-Math.cos(direction)*0.7];
    if(clearOfPeople(direction) && life.navigation.canWalk(local.position,probe))return direction;
  }
  if(!clearOfPeople(heading))for(const turn of [-Math.PI/2,Math.PI/2,-Math.PI*2/3,Math.PI*2/3,Math.PI]) {
    const direction=heading+turn,probe=[local.position[0]+Math.sin(direction)*0.7,local.position[1]-Math.cos(direction)*0.7];
    if(clearOfPeople(direction) && life.navigation.canWalk(local.position,probe))return direction;
  }
  return heading;
}

function recoverRoute(life,local) {
  const motion=local.life,previous=motion.route,end=previous.at(-1),pending=[];
  const revision=life.revision,generation=life.state.generation,version=++motion.routeVersion;
  motion.replanAt=life.elapsed+1;motion.route=pending;
  const accept=route=>{
    if(life.state.generation!==generation || motion.routeVersion!==version)return;
    if(life.revision!==revision) {
      // Pause invalidates the response, but the original route still needs a
      // retry. Weather or another owner replaces this pending route outright.
      if(motion.route===pending)motion.route=previous;
      return;
    }
    motion.route=route?.length?route:previous;
  };
  const result=life.routeProvider(local.position.slice(0,2),end);
  if(result?.then){life.planning=true;result.then(accept,()=>accept(null)).finally(()=>{life.planning=false;});}
  else accept(result);
}

// Standing and walking share the same heading. The renderer must not keep a
// separate conversation yaw that disappears when the route starts again.
function turnResident(motion,target,dt,responsiveness=7.5) {
  const eased=turnToward(motion.heading,target,dt,responsiveness);
  motion.heading+=clamp(eased-motion.heading,-3.2*dt,3.2*dt);
}

function faceConversationPartners(state,visitor,storm,dt) {
  for(const local of state.locals) {
    if(local.indoor || local.stationary || local.abducted) continue;
    const motion=local.life;
    const greeting=!storm && !motion.visitId && local.visitorReaction && !local.visitorReaction.passive;
    const visit=state.jobs.find(job=>job.phase==='assisting' && (job.helperId===local.id || job.localId===local.id));
    const partner=visit && state.selectedId!==local.id ? state.locals.find(other=>other.id===(visit.helperId===local.id?visit.localId:visit.helperId)) : null;
    const target=visitor && (state.selectedId===local.id || greeting || !storm && local.status==='aid_en_route') ? visitor : partner?.position;
    if(!target || distance(local.position,target)<.001) continue;
    turnResident(motion,Math.atan2(target[0]-local.position[0],-(target[1]-local.position[1])),dt,9.75);
  }
}

export function stepResidentLife(life,delta,{paused=false,visitor=null,visitorPose=null,obstacles=[],storm=false,humidity=0.72,hour=15}={}) {
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
  const dt=Math.min(delta,0.08);
  faceConversationPartners(state,visitor,storm,dt);
  if(paused && !activeVisits) return;
  life.elapsed+=dt;
  // A nearby visitor participates in passing and collision avoidance below.
  // Only an explicit interaction owns the route; a passing nod never stops it.
  // Someone who has just told Jevica what would help waits for it rather than
  // wandering off; once help arrives, or after half a minute without it, they
  // carry on.
  const awaitingHelp=local=>{
    // Help that has arrived (a kit or a dispatched volunteer) also ends the wait.
    if(!local.priority||local.status!=='needs_help'||!local.needKnown||['supply','dispatch'].includes(local.lastInteraction)){delete local.life.helpWait;return false;}
    // A storm cancels this ask's wait: keep the expired marker so clearing
    // skies do not start a fresh one until the scenario resets and she is asked again.
    if(storm||local.askedInStorm){
      if(local.life.helpWait?.generation===state.generation)local.life.helpWait.until=Math.min(local.life.helpWait.until,life.elapsed);
      else local.life.helpWait={generation:state.generation,until:life.elapsed};
      return false;
    }
    if(local.life.helpWait?.generation!==state.generation)local.life.helpWait={generation:state.generation,until:life.elapsed+HELP_WAIT};
    return life.elapsed<local.life.helpWait.until;
  };
  const held=local=>awaitingHelp(local) || Boolean(local.abducted || local.force || local.wish || local.wishDisruption) || (!storm && !local.life.visitId && Boolean(local.visitorReaction) && !local.visitorReaction.passive) || state.selectedId===local.id || (!storm && local.status==='aid_en_route');
  // Rotate ownership of the route-search slot so inaccessible stops cannot starve others.
  let planned=planVolunteerVisit(life);const cursor=life.cursor;
  for(let offset=0;offset<state.locals.length;offset++) {
    const index=(cursor+offset)%state.locals.length,local=state.locals[index],motion=local.life;
    const visit=helperVisit(state,local);
    if(local.abducted || visit && state.locals.find(person=>person.id===visit.localId)?.abducted) {motion.status='unavailable';continue;}
    if(paused && !visit) continue;
    if (local.indoor || local.stationary) { motion.status = state.selectedId === local.id ? 'chatting' : 'at work'; continue; }
    motion.blocked=false;
    if(storm) {motion.action='seek_shelter';motion.source='safety_override';}
    else if(life.elapsed>=motion.reactionUntil) {
      if(motion.destination?.shelter) {motion.routeVersion++;motion.route=[];motion.destination=null;motion.waitUntil=life.elapsed;}
      motion.action=hour<6 || hour>=22?'pause':humidity>0.85?'slow':'continue';motion.source='local_rules';
    }
    if(held(local)) {motion.status=local.force?'held by the Force':local.wishDisruption ?? (local.wish ? 'enchanted' : state.selectedId===local.id?'chatting':'greeting visitor');continue;}
    if(visit && (!state.running || !storm && ['routing','assisting'].includes(visit.phase))) {motion.status=!state.running?'visit paused':visit.phase==='assisting'?'helping neighbor':'preparing visit';continue;}
    if(['pause','greet','stop'].includes(motion.action)) {motion.status=motion.action==='greet'?'greeting':'paused';continue;}
    if(!motion.route.length && life.elapsed>=motion.waitUntil && !planned && !life.planning && (!visit || storm || motion.action==='seek_shelter')) {
      planned=true;life.cursor=(index+1)%state.locals.length;plan(life,local,index);
    }
    if(!motion.route.length) continue;
    while(motion.route.length>1 && distance(local.position,motion.route[0])<0.025) motion.route.shift();
    const target=motion.route[0],length=distance(local.position,target);
    const nearbyVisitor=streetVisitor(local,visitor,visitorPose);
    const occupiedArrival=!visit && motion.route.length===1 && length<1 && life.navigation.canWalk(local.position,target)
      && state.locals.some(other=>sharesWalkingSpace(local,other) && distance(other.position,target)<0.7 && distance(local.position,other.position)>=0.7
        && (!other.life?.route.length || distance(other.life.route.at(-1),target)<0.25));
    if(length<0.025 || occupiedArrival) {
      motion.route.shift();
      if(!motion.route.length) {
        motion.visits++;motion.status=motion.destination.shelter?'sheltered':'resting';
        motion.waitUntil=motion.destination.shelter?Infinity:life.elapsed+(motion.destination.returning?1:6+index%5*2);
        if(!motion.destination.returning && !motion.destination.visit) {local.anchorId=motion.destination.id;local.anchorName=motion.destination.name;local.persona.anchorName=motion.destination.name;}
      }
      continue;
    }
    const routeHeading=Math.atan2(target[0]-local.position[0],-(target[1]-local.position[1]));
    const previous=motion.previousSpeed ?? 0;
    const nearbyObjects=obstacles.filter(position=>Math.abs(feetHeight(local)-position[2])<1.8);
    const desiredHeading=passingHeading(life,local,routeHeading,previous,nearbyVisitor,nearbyObjects);
    turnResident(motion,desiredHeading,dt);
    const turnAllowance=Math.max(0,Math.cos(desiredHeading-motion.heading));
    const cruise=(1.05+index%4*0.07)*(motion.action==='slow'?0.58:1);
    // Brake for a sharp route corner as well as the final arrival. Collinear
    // navigation samples retain cruising speed.
    const remaining=motion.route.reduce((total,point,i)=>total+(i?distance(motion.route[i-1],point):length),0);
    let desired=Math.min(cruise,Math.sqrt(2*1.8*Math.max(0,remaining-0.02)));
    if(motion.route.length>1) {
      const following=motion.route[1],exitHeading=Math.atan2(following[0]-target[0],-(following[1]-target[1]));
      const cornerSpeed=0.28+(cruise-0.28)*Math.max(0,Math.cos(exitHeading-routeHeading));
      desired=Math.min(desired,Math.sqrt(cornerSpeed**2+2*1.8*Math.max(0,length-0.1)));
    }
    desired*=turnAllowance**2;
    const rate=desired>previous?1.4:1.8;
    const speed=previous+clamp(desired-previous,-rate*dt,rate*dt);
    const travel=Math.min(length,(previous+speed)*0.5*dt)*turnAllowance;
    const dx=Math.sin(motion.heading),dy=-Math.cos(motion.heading);
    const occupied=point=>state.locals.some(other=>sharesWalkingSpace(local,other) && distance(point,other.position)<0.7 && distance(point,other.position)<distance(local.position,other.position)) || (nearbyVisitor && distance(point,nearbyVisitor)<0.7 && distance(point,nearbyVisitor)<distance(local.position,nearbyVisitor)) || nearbyObjects.some(position=>distance(point,position)<.7&&distance(point,position)<distance(local.position,position));
    const clear=point=>!occupied(point) && life.navigation.canWalk(local.position,point);
    const next=[local.position[0]+dx*travel,local.position[1]+dy*travel];
    motion.blocked=!clear(next);
    if(motion.blocked) {
      motion.status='waiting for space';
      // Passing and turn easing can displace a body from its planned segment.
      // Rejoin the same destination through the bounded route-search slot.
      if(!occupied(next) && !planned && !life.planning && life.elapsed>=(motion.replanAt ?? 0)) {
        planned=true;life.cursor=(index+1)%state.locals.length;recoverRoute(life,local);
      }
      continue;
    }
    local.position=[next[0],next[1],life.navigation.ground(next)];motion.distance+=travel;motion.speed=travel/dt;motion.velocity=speed;
    motion.status=turnAllowance<0.5?'turning':motion.destination?.shelter?'seeking cover':visit?'volunteering':'walking';
  }
  observeVolunteerArrivals(life);
}

export function residentPacket(life,tick,{visitor=null,visitorPose=null,hour=15,humidity=0.72}={}) {
  if(!life || !Number.isInteger(tick) || tick<0) return null;
  const agents=life.state.locals.filter(local=>!local.abducted && !local.indoor && !local.stationary && local.id!==life.state.selectedId && (!life.paused || life.state.running && helperVisit(life.state,local))).map(local=>{
    const nearby=life.state.locals.filter(other=>sharesWalkingSpace(local,other)).map(other=>({id:other.id,kind:'resident',distance_m:distance(local.position,other.position)})).filter(other=>other.distance_m<12);
    if(streetVisitor(local,visitor,visitorPose) && distance(visitor,local.position)<12) nearby.push({id:'visitor',kind:'pedestrian',distance_m:distance(visitor,local.position)});
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
    if(local.abducted || local.force || local.id===life.state.selectedId || life.paused && (!life.state.running || !helperVisit(life.state,local))) continue;
    let action=life.storm?'seek_shelter':decision.action,source=life.storm?'safety_override':decision.source;
    if(action==='redirect' || action==='seek_shelter' && motion.action!=='seek_shelter') {
      motion.routeVersion++;motion.route=[];motion.destination=null;motion.waitUntil=life.elapsed;motion.visits++;motion.attempt=0;
    }
    if(action==='redirect') {
      for(let meters=3;meters>=0.5;meters-=0.5) {
        const reverse=[local.position[0]-Math.sin(motion.heading)*meters,local.position[1]+Math.cos(motion.heading)*meters];
        if(life.navigation.canWalk(local.position,reverse)) {motion.route=[reverse];motion.destination={returning:true,shelter:false,name:local.anchorName};break;}
      }
      if(!motion.route.length) {action='stop';source='safety_override';}
    }
    Object.assign(motion,{action,source,reactionUntil:life.elapsed+2.5});life.stats[source]++;
  }
  life.stats.latency_ms=response.latency_ms;life.packet=null;return true;
}
