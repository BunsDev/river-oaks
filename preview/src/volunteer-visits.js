import { returnUnroutableVisit } from './community.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const helperVisit=(state,local)=>state.jobs.find(job=>job.id===local.life?.visitId && job.helperId===local.id && job.generation===state.generation);

function release(local,elapsed) {
  Object.assign(local.life,{visitId:null,helping:null,route:[],destination:null,waitUntil:elapsed+1,speed:0,status:'resting'});
  local.life.routeVersion++;
}

export function syncVolunteerVisits(life) {
  const {state}=life;
  for(const local of state.locals) if(local.life.visitId && !helperVisit(state,local)) release(local,life.elapsed);
  if(!state.physicalVisits) return;
  for(const job of state.jobs) {
    const assigned=state.locals.find(local=>local.id===job.helperId);
    const recipient=state.locals.find(local=>local.id===job.localId);
    if(assigned?.life.helping) assigned.life.helping.onSite=job.phase==='assisting' && !life.storm;
    if(life.storm) {job.phase='storm_hold';continue;}
    if(job.phase==='storm_hold') {job.phase='queued';job.approachAttempt=0;}
    const helper=state.locals.find(local=>local.id===job.helperId);
    if(!helper) continue;
    if(['traveling','assisting'].includes(job.phase) && helper.life.destination?.visit!==true) job.phase='queued';
    if(job.phase==='assisting' && distance(helper.position,state.locals.find(local=>local.id===job.localId).position)>1.5) job.phase='queued';
  }
}

// Scheduling owns whom to help and the route. Inference only affects the
// helper's immediate movement; it cannot mark a request complete or spend visits.
export function planVolunteerVisit(life) {
  const {state,navigation}=life;
  if(!state.physicalVisits || !state.running || life.storm || life.planning) return false;
  for(const job of state.jobs) {
    if(job.phase!=='queued' || job.generation!==state.generation) continue;
    const recipient=state.locals.find(local=>local.id===job.localId);
    if(recipient.wish || recipient.wishDisruption) continue;
    const pool=state.locals.filter(local=>!local.indoor && !local.stationary && !local.priority && local!==recipient);
    job.rejectedHelpers ??= [];
    let helper=state.locals.find(local=>local.id===job.helperId);
    if(!helper) {
      helper=pool.filter(local=>!local.wish && !local.wishDisruption && local.id!==state.selectedId && !local.life.visitId && !job.rejectedHelpers.includes(local.id)).sort((a,b)=>distance(a.position,recipient.position)-distance(b.position,recipient.position))[0];
      if(!helper) {
        if(!pool.length || pool.every(local=>job.rejectedHelpers.includes(local.id))) returnUnroutableVisit(state,job.id);
        continue;
      }
      job.helperId=helper.id;job.approachAttempt=0;
      helper.life.helping={name:recipient.name,need:state.scenario.need,onSite:false};
      helper.life.visitId=job.id;helper.life.route=[];helper.life.destination=null;helper.life.routeVersion++;
    }
    const motion=helper.life;
    if(helper.wish || helper.wishDisruption || helper.id===state.selectedId || motion.reactionUntil>life.elapsed && ['pause','stop','greet','redirect','seek_shelter'].includes(motion.action)) continue;
    const angle=Math.atan2(helper.position[1]-recipient.position[1],helper.position[0]-recipient.position[0]);
    const approaches=[0,1,-1,2,-2,3,-3,4].map(offset=>[recipient.position[0]+Math.cos(angle+offset*Math.PI/4)*1.2,recipient.position[1]+Math.sin(angle+offset*Math.PI/4)*1.2]).filter(point=>navigation.canTravel(point,recipient.position));
    const approach=approaches[job.approachAttempt ?? 0];
    if(!approach) {job.rejectedHelpers.push(helper.id);job.helperId=null;release(helper,life.elapsed);continue;}
    job.phase='routing';motion.status='preparing visit';motion.routeVersion++;
    const revision=life.revision,generation=state.generation,version=motion.routeVersion;
    const accept=route=>{
      const live=state.jobs.includes(job) && job.generation===state.generation && generation===state.generation;
      if(!live) return;
      if(life.revision!==revision || motion.routeVersion!==version || motion.visitId!==job.id) {
        if(job.phase==='routing') job.phase='queued';return;
      }
      if(!route?.length) {job.phase='queued';job.approachAttempt++;return;}
      job.phase='traveling';motion.route=route;motion.destination={visit:true,name:recipient.name};motion.waitUntil=0;
    };
    const result=life.routeProvider(helper.position.slice(0,2),approach);
    if(result?.then) {life.planning=true;result.then(accept,()=>accept(null)).finally(()=>{life.planning=false;});}
    else accept(result);
    return true;
  }
  return false;
}

export function observeVolunteerArrivals(life) {
  const {state}=life;
  if(!state.running || life.storm) return;
  for(const job of state.jobs) {
    if(job.phase!=='traveling') continue;
    const helper=state.locals.find(local=>local.id===job.helperId),recipient=state.locals.find(local=>local.id===job.localId);
    if(!helper || helper.life.destination?.visit!==true || distance(helper.position,recipient.position)>1.45 || !life.navigation.canTravel(helper.position,recipient.position)) continue;
    job.phase='assisting';job.arrivedAt=state.elapsed;
    helper.life.helping.onSite=true;
    helper.life.route=[];helper.life.speed=0;helper.life.status='helping neighbor';
  }
}

export function remainingVisitDistance(state,job) {
  const helper=state.locals.find(local=>local.id===job.helperId);
  if(!helper || job.phase!=='traveling') return null;
  let point=helper.position,total=0;
  for(const next of helper.life.route) {total+=distance(point,next);point=next;}
  return total;
}
