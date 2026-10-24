import test from 'node:test';
import assert from 'node:assert/strict';
import {SHARED_APPEARANCES,FORMS,MOVEMENTS,sharedAppearance} from '../src/shared-appearances.js';
import {migrateCharacterAppearance,validateCharacterDefinition} from '../src/character-definition.js';
test('every supported appearance and movement is human',()=>{
 assert.deepEqual(FORMS,['human']);assert.deepEqual(MOVEMENTS,['upright']);
 assert.equal(SHARED_APPEARANCES.length,13);
 for(const look of SHARED_APPEARANCES){assert.equal(look.form,'human');assert.equal(look.kind,'human');}
});
test('retired saved forms resolve to the same human character and style',()=>{
 for(const [old,id] of Object.entries({'woman-casual':'sable-human','man-casual':'rowan-human','midnight-host-wolf':'man-tailored','woman-daywear':'lyra-human','kai-explorer-beast':'kai-explorer','forest-aristocrat-feminine-beast':'forest-aristocrat-feminine'})){
  assert.equal(sharedAppearance(old).id,id);
  const result=migrateCharacterAppearance('visitor',old);assert.equal(result.appearanceId,id);assert.equal(result.form,'human');
  assert.equal(validateCharacterDefinition({...result,appearanceId:old,form:'beast'},{ownerId:'visitor'}).ok,false);
 }
});
