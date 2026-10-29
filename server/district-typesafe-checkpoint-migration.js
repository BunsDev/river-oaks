import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictWoodlandCheckpoint } from './district-woodland-checkpoint-migration.js';
import { attachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { attachBayouHeights } from '../preview/src/bayou-heights-world.js';
import { attachStudewood } from '../preview/src/studewood-world.js';
import { attachBayouTerraces } from '../preview/src/bayou-terraces-world.js';
import { attachWoodlandHeights } from '../preview/src/woodland-heights-world.js';
import { attachTypeSafePlace, detachTypeSafePlace } from '../preview/src/typesafe-place-world.js';
import { COMMONS_REVISION } from '../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION } from '../shared/studewood-layout.js';
import { TERRACES_REVISION } from '../shared/bayou-terraces-layout.js';
import { WOODLAND_REVISION } from '../shared/woodland-heights-layout.js';
import { TYPESAFE_REVISION, TYPESAFE_WOODLAND_EAST } from '../shared/typesafe-place-layout.js';
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
 * TypeSafe Place (typesafe-place-1) composes on Woodland Heights. Forward, a Woodland
 * checkpoint, or anything the Woodland migration recovers, restores unchanged into
 * TypeSafe Place. Back to Woodland, everyone east of Woodland's ground, where its cross
 * streets end, or airborne where Woodland cannot fly them (its towers' 80 m ceiling is
 * TypeSafe's alone), moves to free Woodland street ground by the nearer of Twentieth and
 * Eighteenth Streets. Further back chains through Woodland. The Redis district epoch still
 * fences writers.
 */
export function recoverDistrictTypeSafeCheckpoint({worldData,checkpoint,worldId=DEFAULT_WORLD_ID,...options}={}) {
  try {
    if(worldId!==DEFAULT_WORLD_ID || !worldData?.gardenCampus || !checkpoint)return rejected();
    const settings={worldId,...options}, revision=worldData.eastGardenCommons?.revision;
    if(revision===TYPESAFE_REVISION){
      const sourceData=detachTypeSafePlace(worldData),source=createSharedWorld(sourceData,settings);
      let from='woodland';
      if(!source.restore(checkpoint).ok){
        const prior=recoverDistrictWoodlandCheckpoint({worldData:sourceData,checkpoint,...settings});
        if(!prior.ok || !source.restore(prior.checkpoint).ok)return rejected();
        from=prior.from;
      }
      const {checksum:_checksum,...envelope}=source.checkpoint();
      const result=seal(worldData,envelope,settings);
      return result?{ok:true,checkpoint:result,from,to:'typesafe',moved:[]}:rejected();
    }
    if(revision!==WOODLAND_REVISION){
      // TypeSafe to the Terraces, Studewood, Heights, the Commons or Gardens: back to Woodland first, then its rollback.
      if(![undefined,COMMONS_REVISION,HEIGHTS_REVISION,STUDEWOOD_REVISION,TERRACES_REVISION].includes(revision))return rejected();
      const commons=revision===undefined?attachEastGardenCommons(worldData):worldData;
      const heights=[HEIGHTS_REVISION,STUDEWOOD_REVISION,TERRACES_REVISION].includes(revision)?worldData:attachBayouHeights(commons);
      const studewood=[STUDEWOOD_REVISION,TERRACES_REVISION].includes(revision)?worldData:attachStudewood(heights);
      const woodlandData=attachWoodlandHeights(revision===TERRACES_REVISION?worldData:attachBayouTerraces(studewood));
      const woodland=recoverDistrictTypeSafeCheckpoint({worldData:woodlandData,checkpoint,...settings});
      if(!woodland.ok)return rejected();
      const earlier=recoverDistrictWoodlandCheckpoint({worldData,checkpoint:woodland.checkpoint,...settings});
      return earlier.ok?{...earlier,from:'typesafe',moved:[...new Set([...woodland.moved,...earlier.moved])]}:rejected();
    }
    const sourceData=attachTypeSafePlace(worldData),source=createSharedWorld(sourceData,settings);
    if(!source.restore(checkpoint).ok)return rejected();
    const {checksum:_checksum,...envelope}=source.checkpoint();
    const environment=createWalkingEnvironment(worldData,envelope.payload.builds.map(objectCollider).filter(Boolean));
    // Woodland's walkable ground ends 0.35 m short of its cross streets' east ends; only
    // TypeSafe's seams and strip are walkable beyond that line.
    const {edge,typesafe}=sourceData.eastGardenCommons,east=edge+TYPESAFE_WOODLAND_EAST;
    const landings=typesafe.seams.filter(([w])=>w<typesafe.bounds[0]).map(([,s,,n])=>(s+n)/2);
    // Above Woodland's ceiling nobody can stay airborne there, wherever they are.
    const outside=player=>player.position[0]>east-.35
      || player.altitude>.1 && (player.altitude>environment.flightCeiling || !environment.canFly(player.position[0],
        environment.groundAt(player.position[0],-player.position[1])+player.altitude,-player.position[1]));
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
    return result?{ok:true,checkpoint:result,from:'typesafe',to:'woodland',moved}:rejected();
  } catch {return rejected();}
}
