import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictGardensCheckpoint } from './district-gardens-checkpoint-migration.js';
import { attachEastGardenCommons, detachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { objectCollider } from '../preview/src/creator-object.js';
import { createResidentNavigation } from '../preview/src/navigation.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rejected = () => ({ok:false,error:'invalid_checkpoint'});

/** Only exact composed sources can migrate; the Redis district epoch still fences writers. */
export function recoverDistrictCommonsCheckpoint({worldData,checkpoint,worldId=DEFAULT_WORLD_ID,...options}={}) {
  try {
    if(worldId!==DEFAULT_WORLD_ID || !worldData?.gardenCampus || !checkpoint)return rejected();
    const forward=Boolean(worldData.eastGardenCommons);
    const sourceData=forward?detachEastGardenCommons(worldData):attachEastGardenCommons(worldData);
    const source=createSharedWorld(sourceData,{worldId,...options});
    if(!source.restore(checkpoint).ok){
      if(!forward)return rejected();
      const prior=recoverDistrictGardensCheckpoint({worldData:sourceData,checkpoint,worldId,...options});
      if(!prior.ok || !source.restore(prior.checkpoint).ok)return rejected();
    }
    // Leaving removed chairs follows ordinary shared-game departure semantics.
    // The source checkpoint prunes only games whose participants have left; no
    // District table, account or private/practice game is rewritten.
    if(!forward)for(const player of source.snapshot().players){
      if(player.sitting?.buildId?.startsWith('bench:plaza-salon-chess-commons-')
        && !source.command(player.id,{type:'stand'}).ok)return rejected();
    }
    let {checksum:_checksum,...envelope}=source.checkpoint();
    // The Lantern Walk exists only in the Commons; rolling back leaves it behind.
    if(!forward)delete envelope.payload.lanternWalk;
    const moved=[],movedResidents=[];
    if(!forward){
      const environment=createWalkingEnvironment(worldData,envelope.payload.builds.map(objectCollider).filter(Boolean));
      const outside=player=>player.position[0]>worldData.bounds_m[2]-.35
        || player.altitude>.1 && !environment.canFly(player.position[0],
          environment.groundAt(player.position[0],-player.position[1])+player.altitude,-player.position[1]);
      const placed=envelope.payload.players.filter(p=>!outside(p)).map(p=>p.position);
      for(const player of envelope.payload.players.filter(outside)){
        let destination=null;
        const edge=worldData.bounds_m[2];
        for(let row=0;row<20&&!destination;row++)for(let column=0;column<20&&!destination;column++){
          const east=edge-1-column*.9,north=-1335+(row%2?1:-1)*Math.ceil(row/2)*.9;
          if(!environment.isFree(east,-north)||environment.roomAt(east,-north)||placed.some(p=>Math.hypot(p[0]-east,p[1]-north)<.9))continue;
          destination=[east,north,environment.groundAt(east,-north)];
        }
        if(!destination)return rejected();
        Object.assign(player,{position:destination,altitude:0,buildingId:null,levelId:null,vehicle:null,sitting:null,cycling:null,gesture:null,gestureUntil:0});
        placed.push(destination);moved.push(player.id);
      }
      // Residents stroll into the Commons too; anyone left in it walks home.
      const relocated=relocateResidents({fromData:sourceData,toData:worldData,checkpoint:envelope,inside:east=>east>worldData.bounds_m[2]});
      if(!relocated)return rejected();
      envelope=relocated.checkpoint;movedResidents.push(...relocated.moved);
    }
    envelope.worldFingerprint=digest(worldData);
    const result={...envelope,checksum:digest(envelope)};
    if(!createSharedWorld(worldData,{worldId,...options}).restore(result).ok)return rejected();
    return {ok:true,checkpoint:result,from:forward?'gardens':'commons',to:forward?'commons':'gardens',moved,movedResidents};
  } catch {return rejected();}
}

/**
 * Residents standing on land a rollback drops walk home from the nearest clear
 * ground the target revision's resident planner reaches. `inside(east, north)`
 * names the dropped land; seam corridors of the source that the target cannot
 * reach count too. When nothing within 40 m of where a resident stood (clamped
 * into the target's bounds) is clear, the search starts again at `toward`.
 * Residents land at least 0.9 m from any player and 0.7 m from each other.
 * Returns the repaired checkpoint envelope and who moved, or null when someone
 * has nowhere to go.
 */
export function relocateResidents({fromData,toData,checkpoint,inside,toward=null}) {
  const envelope=structuredClone(checkpoint),payload=envelope.payload,moved=[];
  const colliders=payload.builds.map(objectCollider).filter(Boolean);
  const navigation=createResidentNavigation(toData,{placedObjects:colliders,locations:true});
  if(!navigation)return {checkpoint:envelope,moved};
  const corridors=createResidentNavigation(fromData,{placedObjects:colliders,locations:true})?.locations?.portals.map(portal=>portal.rect)??[];
  const removed=([east,north])=>inside(east,north)
    || corridors.some(r=>east>=r[0]&&east<=r[2]&&north>=r[1]&&north<=r[3]);
  const locals=payload.state?.locals??[],placed=payload.players.map(player=>player.position);
  const clear=(east,north)=>navigation.free([east,north]) && navigation.pedestrian.classify([east,north])!=='road'
    && !placed.some(p=>Math.hypot(p[0]-east,p[1]-north)<.9)
    && !locals.some(other=>!other.indoor&&Math.hypot(other.position[0]-east,other.position[1]-north)<.7);
  const search=(east,north)=>{
    for(let radius=0;radius<=40;radius+=.5)for(let i=0;i<(radius?48:1);i++){
      const angle=i/48*Math.PI*2,x=east+Math.cos(angle)*radius,y=north+Math.sin(angle)*radius;
      if(clear(x,y))return [x,y,navigation.ground([x,y])];
    }
    return null;
  };
  const [west,south,east,north]=toData.bounds_m,clamp=(value,low,high)=>Math.max(low+1,Math.min(high-1,value));
  for(const local of locals){
    if(local.indoor || local.stationary || !removed(local.position) || navigation.free(local.position))continue;
    const destination=search(clamp(local.position[0],west,east),clamp(local.position[1],south,north)) ?? (toward && search(toward[0],toward[1]));
    if(!destination)return null;
    local.position=destination;
    if(local.life)Object.assign(local.life,{route:[],destination:null,routeVersion:local.life.routeVersion+1,seat:null,speed:0,velocity:0,blocked:false,replanAt:0});
    moved.push(local.id);
  }
  // Their errands restart from where they now stand (as checkpoint repair does).
  for(const job of payload.state?.jobs??[])if(['routing','traveling','assisting'].includes(job.phase)
    && (moved.includes(job.localId)||moved.includes(job.helperId))){
    job.phase='queued';job.approachAttempt=0;
    const helper=locals.find(local=>local.id===job.helperId);
    if(helper?.life){helper.life.route=[];helper.life.destination=null;helper.life.routeVersion++;if(helper.life.helping)helper.life.helping.onSite=false;}
  }
  return {checkpoint:envelope,moved};
}
