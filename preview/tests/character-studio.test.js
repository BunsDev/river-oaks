import test from 'node:test';
import assert from 'node:assert/strict';
import { characterDefinitionFor, validateCharacterDefinition } from '../src/character-definition.js';
import { createCharacterDraft } from '../src/character-studio-state.js';
import { customizedCharacterDefinition, CHARACTER_PALETTES, CHARACTER_HAIR } from '../src/character-customization.js';

const ownerId='studio-fixture',base=()=>characterDefinitionFor(ownerId,'sable-human');
test('customization uses allowlisted combinations and keeps v1 readable',()=>{
  assert.equal(validateCharacterDefinition(base(),{ownerId}).ok,true);
  for(const appearanceId of ['sable-human','woman-casual'])for(const palette of Object.keys(CHARACTER_PALETTES))for(const hair of Object.keys(CHARACTER_HAIR)){
    const value=customizedCharacterDefinition(ownerId,appearanceId,{palette,hair});
    assert.equal(value.schemaVersion,2);assert.equal(validateCharacterDefinition(value,{ownerId}).ok,true);
  }
  for(const input of [{palette:'url(x)'},{hair:'foreign'},{palette:'rose',appearanceId:'rowan-human'},{appearanceId:'jevica'}])assert.throws(()=>customizedCharacterDefinition(ownerId,input.appearanceId??'sable-human',input));
  assert.equal(validateCharacterDefinition(customizedCharacterDefinition(ownerId,'sable-human'),{ownerId:'other'}).ok,false);
});
test('draft history, cancel, branching and snapshots cannot mutate confirmed appearance',()=>{
  const confirmed=base(),draft=createCharacterDraft({ownerId,definition:confirmed});
  draft.change({palette:'rose'});draft.change({hair:'espresso'});
  assert.equal(draft.value.palette,'rose');assert.equal(draft.value.hair,'espresso');
  draft.undo();assert.equal(draft.value.hair,'authored');draft.redo();assert.equal(draft.value.hair,'espresso');
  draft.undo();draft.change({palette:'lagoon'});assert.equal(draft.canRedo,false);
  const copy=draft.value;copy.palette='bad';assert.equal(draft.value.palette,'lagoon');
  assert.equal(confirmed.palette,'authored');draft.reset();assert.deepEqual(draft.value,confirmed);
});
test('changing base drops incompatible edits, rejects privileges, and bounds history',()=>{
  const draft=createCharacterDraft({ownerId,definition:base()});draft.change({palette:'rose'});
  draft.change({appearanceId:'rowan-human'});assert.equal(draft.value.palette,'authored');
  assert.throws(()=>draft.change({canFly:true}));assert.throws(()=>draft.change({appearanceId:'jevica'}));
  for(let i=0;i<100;i++)draft.change({appearanceId:i%2?'sable-human':'woman-casual'});
  let undos=0;while(draft.canUndo){draft.undo();undos++;}assert.ok(undos<=50);
});
test('favorites and randomization are validated and permission scoped',()=>{
  const draft=createCharacterDraft({ownerId,definition:base()});
  const foreign=characterDefinitionFor('other','sable-human');assert.throws(()=>draft.restore(foreign));
  draft.randomize(()=>.4);assert.equal(validateCharacterDefinition(draft.value,{ownerId}).ok,true);
  assert.notEqual(draft.value.appearanceId,'jevica');
  const saved=draft.value;draft.change({appearanceId:'rowan-human'});draft.restore(saved);assert.deepEqual(draft.value,saved);
});
