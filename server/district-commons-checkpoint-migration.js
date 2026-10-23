import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictGardensCheckpoint } from './district-gardens-checkpoint-migration.js';
import { attachEastGardenCommons, detachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { objectCollider } from '../preview/src/creator-object.js';
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
    const moved=[];
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
    }
    envelope.worldFingerprint=digest(worldData);
    const result={...envelope,checksum:digest(envelope)};
    if(!createSharedWorld(worldData,{worldId,...options}).restore(result).ok)return rejected();
    return {ok:true,checkpoint:result,from:forward?'gardens':'commons',to:forward?'commons':'gardens',moved};
  } catch {return rejected();}
}
