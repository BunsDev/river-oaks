import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictCommonsCheckpoint } from './district-commons-checkpoint-migration.js';
import { attachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { attachBayouHeights, detachBayouHeights } from '../preview/src/bayou-heights-world.js';
import { COMMONS_REVISION } from '../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION, HEIGHTS_TABLE } from '../shared/bayou-heights-layout.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { objectCollider } from '../preview/src/creator-object.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rejected = () => ({ok:false,error:'invalid_checkpoint'});
const seal = (worldData,envelope,options) => {
  envelope.worldFingerprint=digest(worldData);
  const result={...envelope,checksum:digest(envelope)};
  return createSharedWorld(worldData,options).restore(result).ok?result:null;
};

/**
 * Bayou Heights (bayou-heights-1) composes on the Commons. Forward, a Commons
 * checkpoint, or anything the Commons migration recovers, restores unchanged into
 * Heights. Back to the Commons, players at the icehouse table stand up (ordinary
 * departure semantics) and everyone east of the footbridge, or airborne where the
 * Commons cannot fly them, moves to free Commons plaza ground by the bridge. Back to
 * Gardens chains through the Commons. The Redis district epoch still fences writers.
 */
export function recoverDistrictHeightsCheckpoint({worldData,checkpoint,worldId=DEFAULT_WORLD_ID,...options}={}) {
  try {
    if(worldId!==DEFAULT_WORLD_ID || !worldData?.gardenCampus || !checkpoint)return rejected();
    const settings={worldId,...options}, revision=worldData.eastGardenCommons?.revision;
    if(revision===HEIGHTS_REVISION){
      const sourceData=detachBayouHeights(worldData),source=createSharedWorld(sourceData,settings);
      let from='commons';
      if(!source.restore(checkpoint).ok){
        const prior=recoverDistrictCommonsCheckpoint({worldData:sourceData,checkpoint,...settings});
        if(!prior.ok || !source.restore(prior.checkpoint).ok)return rejected();
        from=prior.from;
      }
      const {checksum:_checksum,...envelope}=source.checkpoint();
      const result=seal(worldData,envelope,settings);
      return result?{ok:true,checkpoint:result,from,to:'heights',moved:[]}:rejected();
    }
    if(!worldData.eastGardenCommons){
      // Heights to Gardens: back to the Commons first, then the Commons rollback.
      const commons=recoverDistrictHeightsCheckpoint({worldData:attachEastGardenCommons(worldData),checkpoint,...settings});
      if(!commons.ok)return rejected();
      const gardens=recoverDistrictCommonsCheckpoint({worldData,checkpoint:commons.checkpoint,...settings});
      return gardens.ok?{...gardens,from:'heights',moved:[...new Set([...commons.moved,...gardens.moved])]}:rejected();
    }
    if(revision!==COMMONS_REVISION)return rejected();
    const sourceData=attachBayouHeights(worldData),source=createSharedWorld(sourceData,settings);
    if(!source.restore(checkpoint).ok)return rejected();
    for(const player of source.snapshot().players){
      if(player.sitting?.buildId?.startsWith(`bench:plaza-salon-${HEIGHTS_TABLE}-`)
        && !source.command(player.id,{type:'stand'}).ok)return rejected();
    }
    const {checksum:_checksum,...envelope}=source.checkpoint();
    const environment=createWalkingEnvironment(worldData,envelope.payload.builds.map(objectCollider).filter(Boolean));
    const west=sourceData.eastGardenCommons.heights.bounds[0];
    const outside=player=>player.position[0]>west-.35
      || player.altitude>.1 && !environment.canFly(player.position[0],
        environment.groundAt(player.position[0],-player.position[1])+player.altitude,-player.position[1]);
    const placed=envelope.payload.players.filter(p=>!outside(p)).map(p=>p.position),moved=[];
    for(const player of envelope.payload.players.filter(outside)){
      let destination=null;
      for(let row=0;row<20&&!destination;row++)for(let column=0;column<20&&!destination;column++){
        const east=west-1-column*.9,north=-1335+(row%2?1:-1)*Math.ceil(row/2)*.9;
        if(!environment.isFree(east,-north)||environment.roomAt(east,-north)||placed.some(p=>Math.hypot(p[0]-east,p[1]-north)<.9))continue;
        destination=[east,north,environment.groundAt(east,-north)];
      }
      if(!destination)return rejected();
      Object.assign(player,{position:destination,altitude:0,buildingId:null,levelId:null,vehicle:null,sitting:null,cycling:null,gesture:null,gestureUntil:0});
      placed.push(destination);moved.push(player.id);
    }
    const result=seal(worldData,envelope,settings);
    return result?{ok:true,checkpoint:result,from:'heights',to:'commons',moved}:rejected();
  } catch {return rejected();}
}
