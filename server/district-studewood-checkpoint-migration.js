import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictHeightsCheckpoint } from './district-heights-checkpoint-migration.js';
import { relocateResidents } from './district-commons-checkpoint-migration.js';
import { attachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { attachBayouHeights } from '../preview/src/bayou-heights-world.js';
import { attachStudewood, detachStudewood } from '../preview/src/studewood-world.js';
import { COMMONS_REVISION } from '../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION, STUDEWOOD_TABLE } from '../shared/studewood-layout.js';
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
// Heights ground ends at Heights Boulevard's east sidewalk (x 406 of the frame); only
// Studewood's cross-street seams are walkable east of it.
const HEIGHTS_EAST = 406;

/**
 * Studewood (heights-studewood-1) composes on Bayou Heights. Forward, a Heights
 * checkpoint, or anything the Heights migration recovers, restores unchanged into
 * Studewood. Back to Heights, players at the Studewood Park table stand up (ordinary
 * departure semantics) and everyone east of Heights Boulevard, or airborne where
 * Heights cannot fly them, moves to free boulevard ground by Twentieth Street. Back to
 * the Commons or Gardens chains through Heights. The Redis district epoch still fences writers.
 */
export function recoverDistrictStudewoodCheckpoint({worldData,checkpoint,worldId=DEFAULT_WORLD_ID,...options}={}) {
  try {
    if(worldId!==DEFAULT_WORLD_ID || !worldData?.gardenCampus || !checkpoint)return rejected();
    const settings={worldId,...options}, revision=worldData.eastGardenCommons?.revision;
    if(revision===STUDEWOOD_REVISION){
      const sourceData=detachStudewood(worldData),source=createSharedWorld(sourceData,settings);
      let from='heights';
      if(!source.restore(checkpoint).ok){
        const prior=recoverDistrictHeightsCheckpoint({worldData:sourceData,checkpoint,...settings});
        if(!prior.ok || !source.restore(prior.checkpoint).ok)return rejected();
        from=prior.from;
      }
      const {checksum:_checksum,...envelope}=source.checkpoint();
      const result=seal(worldData,envelope,settings);
      return result?{ok:true,checkpoint:result,from,to:'studewood',moved:[],movedResidents:[],reroutedResidents:[]}:rejected();
    }
    if(revision!==HEIGHTS_REVISION){
      // Studewood to the Commons or Gardens: back to Heights first, then the Heights rollback.
      if(revision!==undefined && revision!==COMMONS_REVISION)return rejected();
      const heightsData=attachBayouHeights(revision===COMMONS_REVISION?worldData:attachEastGardenCommons(worldData));
      const heights=recoverDistrictStudewoodCheckpoint({worldData:heightsData,checkpoint,...settings});
      if(!heights.ok)return rejected();
      const earlier=recoverDistrictHeightsCheckpoint({worldData,checkpoint:heights.checkpoint,...settings});
      return earlier.ok?{...earlier,from:'studewood',moved:[...new Set([...heights.moved,...earlier.moved])],
        movedResidents:[...new Set([...heights.movedResidents??[],...earlier.movedResidents??[]])],reroutedResidents:[...new Set([...heights.reroutedResidents??[],...earlier.reroutedResidents??[]])]}:rejected();
    }
    const sourceData=attachStudewood(worldData),source=createSharedWorld(sourceData,settings);
    if(!source.restore(checkpoint).ok)return rejected();
    for(const player of source.snapshot().players){
      if(player.sitting?.buildId?.startsWith(`bench:plaza-salon-${STUDEWOOD_TABLE}-`)
        && !source.command(player.id,{type:'stand'}).ok)return rejected();
    }
    const {checksum:_checksum,...envelope}=source.checkpoint();
    const environment=createWalkingEnvironment(worldData,envelope.payload.builds.map(objectCollider).filter(Boolean));
    const {edge}=sourceData.eastGardenCommons,east=edge+HEIGHTS_EAST,north0=sourceData.eastGardenCommons.studewood.entry[1];
    const outside=player=>player.position[0]>east-.35
      || player.altitude>.1 && !environment.canFly(player.position[0],
        environment.groundAt(player.position[0],-player.position[1])+player.altitude,-player.position[1]);
    const placed=envelope.payload.players.filter(p=>!outside(p)).map(p=>p.position),moved=[];
    for(const player of envelope.payload.players.filter(outside)){
      let destination=null;
      for(let row=0;row<20&&!destination;row++)for(let column=0;column<20&&!destination;column++){
        const x=east-1-column*.9,north=north0+(row%2?1:-1)*Math.ceil(row/2)*.9;
        if(!environment.isFree(x,-north)||environment.roomAt(x,-north)||placed.some(p=>Math.hypot(p[0]-x,p[1]-north)<.9))continue;
        destination=[x,north,environment.groundAt(x,-north)];
      }
      if(!destination)return rejected();
      Object.assign(player,{position:destination,altitude:0,buildingId:null,levelId:null,vehicle:null,sitting:null,cycling:null,gesture:null,gestureUntil:0});
      placed.push(destination);moved.push(player.id);
    }
    // Residents on Studewood's ground (the cross streets inside the Heights strips) walk home too,
    // rather than standing on removed ground or waiting for space at its edge.
    const residents=relocateResidents({fromData:sourceData,toData:worldData,checkpoint:envelope,
      inside:x=>x>east-.35,toward:[east-1,north0]});
    if(!residents)return rejected();
    const result=seal(worldData,residents.checkpoint,settings);
    return result?{ok:true,checkpoint:result,from:'studewood',to:'heights',moved,movedResidents:residents.moved,reroutedResidents:residents.rerouted}:rejected();
  } catch {return rejected();}
}
