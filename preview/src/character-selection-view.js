import {validateCharacterDefinition,migrateCharacterAppearance} from './character-definition.js';

// Snapshots may contain an older or malformed definition. Render only a canonical
// owned revision matching the authorized appearance; otherwise use authored art.
export function selectedCharacterFor(player,ownerId=player.id){
 const fallback=migrateCharacterAppearance(ownerId,player.appearance);
 const result=validateCharacterDefinition(player.character,{ownerId});
 return result.ok&&result.definition.revision>0&&result.definition.appearanceId===fallback.appearanceId?result.definition:fallback;
}
