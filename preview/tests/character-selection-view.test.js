import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedCharacterFor } from '../src/character-selection-view.js';
import { characterDefinitionFor } from '../src/character-definition.js';
import { customizedCharacterDefinition } from '../src/character-customization.js';
import { JEVICA_OWNER_USER_IDS } from '../src/shared-appearances.js';

const owner='alice';
const custom=()=>customizedCharacterDefinition(owner,'sable-human',{palette:'rose',hair:'espresso',revision:3});
const snapshot=character=>({id:owner,appearance:'sable-human',character});
const authored=()=>characterDefinitionFor(owner,'sable-human');

test('selected owned revisions retain customization without sharing snapshot data',()=>{
 const input=custom(),selected=selectedCharacterFor(snapshot(input));
 assert.deepEqual(selected,input);
 selected.assets[0].sha256='changed';selected.parameters.extra=true;
 assert.notEqual(input.assets[0].sha256,'changed');assert.deepEqual(input.parameters,{});
});

test('missing, unpublished, corrupt and unavailable catalog revisions render authored art',()=>{
 const input=custom();
 const cases=[undefined,null,{},[],{...input,revision:0},{...input,revision:-1},
  {...input,schemaVersion:99},{...input,palette:'removed-color'},
  {...input,assets:[{...input.assets[0],sha256:'0'.repeat(64)}]},
  {...input,provenance:{...input.provenance,catalog:'retired-catalog'}},
  {...input,attachments:['unavailable-wings']},{...input,canFly:true}];
 for(const character of cases)assert.deepEqual(selectedCharacterFor(snapshot(character)),authored());
});

test('foreign or mismatched revisions cannot replace the authorized selected appearance',()=>{
 assert.deepEqual(selectedCharacterFor(snapshot({...custom(),ownerId:'bob'})),authored());
 const wolf=characterDefinitionFor(owner,'man-tailored',{revision:2});
 assert.deepEqual(selectedCharacterFor(snapshot(wolf)),authored());
 // The local renderer supplies the authenticated identity independently of the
 // player record; neither a forged player id nor definition can change it.
 const foreign={id:'bob',appearance:'sable-human',character:{...custom(),ownerId:'bob'}};
 assert.deepEqual(selectedCharacterFor(foreign,owner),authored());
});

test('legacy identities migrate while protected or unknown looks use permitted defaults',()=>{
 assert.equal(selectedCharacterFor({id:owner,appearance:'midnight-host-hybrid'}).appearanceId,'man-tailored');
 for(const appearance of ['jevica','missing-look','__proto__',undefined]){
  const protectedDefinition=characterDefinitionFor(JEVICA_OWNER_USER_IDS[0],'jevica',{revision:1});
  assert.deepEqual(selectedCharacterFor({id:owner,appearance,character:protectedDefinition}),authored());
 }
 const ownerId=JEVICA_OWNER_USER_IDS[0],definition=characterDefinitionFor(ownerId,'jevica',{revision:1});
 assert.deepEqual(selectedCharacterFor({id:ownerId,appearance:'jevica',character:definition}),definition);
});
