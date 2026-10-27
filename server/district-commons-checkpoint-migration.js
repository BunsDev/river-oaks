import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictGardensCheckpoint } from './district-gardens-checkpoint-migration.js';
import { attachEastGardenCommons, detachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { objectCollider } from '../preview/src/creator-object.js';
import { createResidentNavigation } from '../preview/src/navigation.js';
import { createCommunity } from '../preview/src/community.js';
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
    const {checksum:_checksum,...envelope}=source.checkpoint();
    // The Lantern Walk exists only in the Commons; rolling back leaves it behind.
    if(!forward)delete envelope.payload.lanternWalk;
    const moved=[],movedResidents=[],reroutedResidents=[];
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
      // Residents stroll into the Commons too. Anyone standing where the Gardens
      // resident planner cannot reach (the Commons, or the seam corridor east of
      // the District's site ring) walks home from the nearest clear District ground.
      const colliders=envelope.payload.builds.map(objectCollider).filter(Boolean);
      const navigation=createResidentNavigation(worldData,{placedObjects:colliders});
      // The live planner finds its corridors before anything is built; so does this.
      const corridors=createResidentNavigation(sourceData,{locations:true})?.locations?.portals.map(portal=>portal.rect)??[];
      const removed=([east,north])=>east>worldData.bounds_m[2]
        || corridors.some(r=>east>=r[0]&&east<=r[2]&&north>=r[1]&&north<=r[3]);
      const locals=envelope.payload.state?.locals??[];
      const clear=(east,north)=>navigation.free([east,north]) && navigation.pedestrian.classify([east,north])!=='road'
        && !placed.some(p=>Math.hypot(p[0]-east,p[1]-north)<.9)
        && !locals.some(other=>!other.indoor&&Math.hypot(other.position[0]-east,other.position[1]-north)<.7);
      for(const local of locals){
        if(!navigation || local.indoor || local.stationary || !removed(local.position) || navigation.free(local.position))continue;
        const east=Math.min(local.position[0],worldData.bounds_m[2]-1),north=local.position[1];
        let destination=null;
        for(let radius=0;radius<=40&&!destination;radius+=.5)for(let i=0;i<(radius?48:1)&&!destination;i++){
          const angle=i/48*Math.PI*2,x=east+Math.cos(angle)*radius,y=north+Math.sin(angle)*radius;
          if(clear(x,y))destination=[x,y,navigation.ground([x,y])];
        }
        if(!destination)return rejected();
        local.position=destination;
        if(local.life)Object.assign(local.life,{route:[],destination:null,routeVersion:local.life.routeVersion+1,seat:null,speed:0,velocity:0,blocked:false,replanAt:0});
        movedResidents.push(local.id);
      }
      // Residents still on District ground may be walking into removed land or
      // to a Commons stop. Gardens would stop them at the old corridor entrance,
      // and a failed re-plan keeps the old route, so they re-plan where they stand.
      // A Commons stop someone last rested at gives way to their home stop.
      const lanterns=new Set((sourceData.eastGardenCommons?.destination?.lanterns??[]).map(lantern=>lantern.id));
      const homes=new Map(createCommunity(worldData,[],{carriage:false}).locals.map(local=>[local.id,local]));
      for(const local of locals){
        if(local.indoor || local.stationary)continue;
        if(local.life && !movedResidents.includes(local.id) && (local.life.route.some(removed) || lanterns.has(local.life.destination?.id))){
          Object.assign(local.life,{route:[],destination:null,routeVersion:local.life.routeVersion+1,blocked:false,replanAt:0});
          reroutedResidents.push(local.id);
        }
        const home=lanterns.has(local.anchorId) && homes.get(local.id);
        if(home){local.anchorId=home.anchorId;local.anchorName=home.anchorName;if(local.persona)local.persona.anchorName=home.anchorName;}
      }
      // Their errands restart from where they now stand (as checkpoint repair does).
      const restarted=[...movedResidents,...reroutedResidents];
      for(const job of envelope.payload.state?.jobs??[])if(['routing','traveling','assisting'].includes(job.phase)
        && (restarted.includes(job.localId)||restarted.includes(job.helperId))){
        job.phase='queued';job.approachAttempt=0;
        const helper=locals.find(local=>local.id===job.helperId);
        if(helper?.life){helper.life.route=[];helper.life.destination=null;helper.life.routeVersion++;if(helper.life.helping)helper.life.helping.onSite=false;}
      }
    }
    envelope.worldFingerprint=digest(worldData);
    const result={...envelope,checksum:digest(envelope)};
    if(!createSharedWorld(worldData,{worldId,...options}).restore(result).ok)return rejected();
    return {ok:true,checkpoint:result,from:forward?'gardens':'commons',to:forward?'commons':'gardens',moved,movedResidents,reroutedResidents};
  } catch {return rejected();}
}
