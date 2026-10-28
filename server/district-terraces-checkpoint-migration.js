import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictStudewoodCheckpoint } from './district-studewood-checkpoint-migration.js';
import { relocateResidents } from './district-commons-checkpoint-migration.js';
import { attachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { attachBayouHeights } from '../preview/src/bayou-heights-world.js';
import { attachStudewood } from '../preview/src/studewood-world.js';
import { attachBayouTerraces, detachBayouTerraces } from '../preview/src/bayou-terraces-world.js';
import { COMMONS_REVISION } from '../shared/east-garden-commons-layout.js';
import { HEIGHTS_REVISION } from '../shared/bayou-heights-layout.js';
import { STUDEWOOD_REVISION } from '../shared/studewood-layout.js';
import { TERRACES_REVISION, TERRACES_TABLE } from '../shared/bayou-terraces-layout.js';
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
// The greenway trail's centre line on the east bank, where both footbridges land.
const GREENWAY = 156.5;

/**
 * The Bayou Terraces (bayou-terraces-1) compose on Studewood. Forward, a Studewood
 * checkpoint, or anything the Studewood migration recovers, restores unchanged into
 * the terraces. Back to Studewood, players at the terrace gardens table stand up
 * (ordinary departure semantics), and everyone on the terraces or their footbridges, or
 * airborne where Studewood cannot fly them, moves to free greenway ground by the nearer
 * footbridge. Further back chains through
 * Studewood. The Redis district epoch still fences writers.
 */
export function recoverDistrictTerracesCheckpoint({worldData,checkpoint,worldId=DEFAULT_WORLD_ID,...options}={}) {
  try {
    if(worldId!==DEFAULT_WORLD_ID || !worldData?.gardenCampus || !checkpoint)return rejected();
    const settings={worldId,...options}, revision=worldData.eastGardenCommons?.revision;
    if(revision===TERRACES_REVISION){
      const sourceData=detachBayouTerraces(worldData),source=createSharedWorld(sourceData,settings);
      let from='studewood';
      if(!source.restore(checkpoint).ok){
        const prior=recoverDistrictStudewoodCheckpoint({worldData:sourceData,checkpoint,...settings});
        if(!prior.ok || !source.restore(prior.checkpoint).ok)return rejected();
        from=prior.from;
      }
      const {checksum:_checksum,...envelope}=source.checkpoint();
      const result=seal(worldData,envelope,settings);
      return result?{ok:true,checkpoint:result,from,to:'terraces',moved:[],movedResidents:[],reroutedResidents:[]}:rejected();
    }
    if(revision!==STUDEWOOD_REVISION){
      // The terraces to Heights, the Commons or Gardens: back to Studewood first, then its rollback.
      if(![undefined,COMMONS_REVISION,HEIGHTS_REVISION].includes(revision))return rejected();
      const commons=revision===undefined?attachEastGardenCommons(worldData):worldData;
      const studewoodData=attachStudewood(revision===HEIGHTS_REVISION?worldData:attachBayouHeights(commons));
      const studewood=recoverDistrictTerracesCheckpoint({worldData:studewoodData,checkpoint,...settings});
      if(!studewood.ok)return rejected();
      const earlier=recoverDistrictStudewoodCheckpoint({worldData,checkpoint:studewood.checkpoint,...settings});
      return earlier.ok?{...earlier,from:'terraces',moved:[...new Set([...studewood.moved,...earlier.moved])],
        movedResidents:[...new Set([...studewood.movedResidents??[],...earlier.movedResidents??[]])],reroutedResidents:[...new Set([...studewood.reroutedResidents??[],...earlier.reroutedResidents??[]])]}:rejected();
    }
    const sourceData=attachBayouTerraces(worldData),source=createSharedWorld(sourceData,settings);
    if(!source.restore(checkpoint).ok)return rejected();
    for(const player of source.snapshot().players){
      if(player.sitting?.buildId?.startsWith(`bench:plaza-salon-${TERRACES_TABLE}-`)
        && !source.command(player.id,{type:'stand'}).ok)return rejected();
    }
    const {checksum:_checksum,...envelope}=source.checkpoint();
    const environment=createWalkingEnvironment(worldData,envelope.payload.builds.map(objectCollider).filter(Boolean));
    const {edge,terraces}=sourceData.eastGardenCommons,centre=-1335;
    // Terrace geography: the two strips and the footbridges, the only ground Studewood does not
    // have. Someone on a building level (the Gardens campus) is never on it, whatever lies below.
    const inside=([w,s,e,n],[x,y])=>x>=w-.35&&x<=e+.35&&y>=s-.35&&y<=n+.35;
    const onTerraces=player=>!player.levelId&&[...terraces.bounds,...terraces.bridges].some(rect=>inside(rect,player.position));
    const outside=player=>onTerraces(player)
      || player.altitude>.1 && !environment.canFly(player.position[0],environment.groundAt(player.position[0],-player.position[1])+player.altitude,-player.position[1]);
    const placed=envelope.payload.players.filter(p=>!outside(p)).map(p=>p.position),moved=[];
    for(const player of envelope.payload.players.filter(outside)){
      const landing=terraces.entries[player.position[1]>centre?0:1][1];
      let destination=null;
      for(let row=0;row<20&&!destination;row++)for(let column=0;column<9&&!destination;column++){
        const x=edge+GREENWAY+(column%2?1:-1)*Math.ceil(column/2)*.9,north=landing+(row%2?1:-1)*Math.ceil(row/2)*.9;
        if(!environment.isFree(x,-north)||environment.roomAt(x,-north)||placed.some(p=>Math.hypot(p[0]-x,p[1]-north)<.9))continue;
        destination=[x,north,environment.groundAt(x,-north)];
      }
      if(!destination)return rejected();
      Object.assign(player,{position:destination,altitude:0,buildingId:null,levelId:null,vehicle:null,sitting:null,cycling:null,gesture:null,gestureUntil:0});
      placed.push(destination);moved.push(player.id);
    }
    // Residents on the terraces or their footbridges walk home too: the Heights strips cover the
    // decks, so without this they stood on removed ground or waited for space at its edge.
    const residents=relocateResidents({fromData:sourceData,toData:worldData,checkpoint:envelope,
      inside:(east,north)=>[...terraces.bounds,...terraces.bridges].some(rect=>inside(rect,[east,north])),
      toward:[edge+GREENWAY,terraces.entries[0][1]]});
    if(!residents)return rejected();
    const result=seal(worldData,residents.checkpoint,settings);
    return result?{ok:true,checkpoint:result,from:'terraces',to:'studewood',moved,movedResidents:residents.moved,reroutedResidents:residents.rerouted}:rejected();
  } catch {return rejected();}
}
