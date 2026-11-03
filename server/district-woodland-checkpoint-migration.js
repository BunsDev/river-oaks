import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictTerracesCheckpoint } from './district-terraces-checkpoint-migration.js';
import { attachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { attachBayouHeights } from '../preview/src/bayou-heights-world.js';
import { attachStudewood } from '../preview/src/studewood-world.js';
import { attachBayouTerraces } from '../preview/src/bayou-terraces-world.js';
import { attachWoodlandHeights, detachWoodlandHeights } from '../preview/src/woodland-heights-world.js';
import { COMMONS_REVISION } from '../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION } from '../shared/studewood-layout.js';
import { TERRACES_REVISION } from '../shared/bayou-terraces-layout.js';
import { WOODLAND_REVISION, WOODLAND_STUDEWOOD_EAST, WOODLAND_TABLE } from '../shared/woodland-heights-layout.js';
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
 * Woodland Heights (woodland-heights-1) composes on the Bayou Terraces. Forward, a
 * Terraces checkpoint, or anything the Terraces migration recovers, restores unchanged
 * into Woodland. Back to the Terraces, players at the Woodland green table stand up
 * (ordinary departure semantics), and everyone east of Studewood's ground, where its cross
 * streets end, or airborne where the Terraces cannot fly them, moves to free Studewood
 * street ground by the nearer of Twentieth and Eighteenth Streets. Further back chains
 * through the Terraces. The Redis district epoch still fences writers.
 */
export function recoverDistrictWoodlandCheckpoint({worldData,checkpoint,worldId=DEFAULT_WORLD_ID,...options}={}) {
  try {
    if(worldId!==DEFAULT_WORLD_ID || !worldData?.gardenCampus || !checkpoint)return rejected();
    const settings={worldId,...options}, revision=worldData.eastGardenCommons?.revision;
    if(revision===WOODLAND_REVISION){
      const sourceData=detachWoodlandHeights(worldData),source=createSharedWorld(sourceData,settings);
      let from='terraces';
      if(!source.restore(checkpoint).ok){
        const prior=recoverDistrictTerracesCheckpoint({worldData:sourceData,checkpoint,...settings});
        if(!prior.ok || !source.restore(prior.checkpoint).ok)return rejected();
        from=prior.from;
      }
      const {checksum:_checksum,...envelope}=source.checkpoint();
      const result=seal(worldData,envelope,settings);
      return result?{ok:true,checkpoint:result,from,to:'woodland',moved:[]}:rejected();
    }
    if(revision!==TERRACES_REVISION){
      // Woodland to Studewood, Heights, the Commons or Gardens: back to the Terraces first, then their rollback.
      if(![undefined,COMMONS_REVISION,HEIGHTS_REVISION,STUDEWOOD_REVISION].includes(revision))return rejected();
      const commons=revision===undefined?attachEastGardenCommons(worldData):worldData;
      const heights=[HEIGHTS_REVISION,STUDEWOOD_REVISION].includes(revision)?worldData:attachBayouHeights(commons);
      const terracesData=attachBayouTerraces(revision===STUDEWOOD_REVISION?worldData:attachStudewood(heights));
      const terraces=recoverDistrictWoodlandCheckpoint({worldData:terracesData,checkpoint,...settings});
      if(!terraces.ok)return rejected();
      const earlier=recoverDistrictTerracesCheckpoint({worldData,checkpoint:terraces.checkpoint,...settings});
      return earlier.ok?{...earlier,from:'woodland',moved:[...new Set([...terraces.moved,...earlier.moved])]}:rejected();
    }
    const sourceData=attachWoodlandHeights(worldData),source=createSharedWorld(sourceData,settings);
    if(!source.restore(checkpoint).ok)return rejected();
    for(const player of source.snapshot().players){
      if(player.sitting?.buildId?.startsWith(`bench:plaza-salon-${WOODLAND_TABLE}-`)
        && !source.command(player.id,{type:'stand'}).ok)return rejected();
    }
    const {checksum:_checksum,...envelope}=source.checkpoint();
    const environment=createWalkingEnvironment(worldData,envelope.payload.builds.map(objectCollider).filter(Boolean));
    // Studewood's walkable ground ends 0.35 m short of its cross streets' east ends; only
    // Woodland's seams and strip are walkable beyond that line.
    const {edge,woodland}=sourceData.eastGardenCommons,east=edge+WOODLAND_STUDEWOOD_EAST;
    const landings=woodland.seams.map(([,s,,n])=>(s+n)/2);
    // Defensive: Woodland's only ground west of the line is its seams, where nobody can fly in
    // either world, so in practice the line alone decides; the flight check stays for safety.
    const outside=player=>player.position[0]>east-.35
      || player.altitude>.1 && !environment.canFly(player.position[0],
        environment.groundAt(player.position[0],-player.position[1])+player.altitude,-player.position[1]);
    const placed=envelope.payload.players.filter(p=>!outside(p)).map(p=>p.position),moved=[];
    for(const player of envelope.payload.players.filter(outside)){
      const landing=landings.reduce((best,north)=>Math.abs(north-player.position[1])<Math.abs(best-player.position[1])?north:best);
      let destination=null;
      for(let row=0;row<20&&!destination;row++)for(let column=0;column<20&&!destination;column++){
        const x=east-1-column*.9,north=landing+(row%2?1:-1)*Math.ceil(row/2)*.9;
        if(!environment.isFree(x,-north)||environment.roomAt(x,-north)||placed.some(p=>Math.hypot(p[0]-x,p[1]-north)<.9))continue;
        destination=[x,north,environment.groundAt(x,-north)];
      }
      if(!destination)return rejected();
      Object.assign(player,{position:destination,altitude:0,buildingId:null,levelId:null,vehicle:null,sitting:null,cycling:null,gesture:null,gestureUntil:0});
      placed.push(destination);moved.push(player.id);
    }
    const result=seal(worldData,envelope,settings);
    return result?{ok:true,checkpoint:result,from:'woodland',to:'terraces',moved}:rejected();
  } catch {return rejected();}
}
