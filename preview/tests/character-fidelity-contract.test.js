import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/character-fidelity-contract.js';
import {characterDefinitionFor,validateCharacterDefinition} from '../src/character-definition.js';

test('realistic fixtures expose pinned capabilities without accepting arbitrary edits',()=>{
 for(const [id,rig] of [['morgan-human','man-realistic-casual'],['imani-human','woman-realistic-tailored']]){
  const definition=characterDefinitionFor('fixture-owner',id),capability=contract.characterFidelityContract(rig);
  assert.equal(capability.asset.sha256,definition.assets[0].sha256);
  assert.deepEqual(capability.expressions,['neutral','smile','browRaise']);
  assert.deepEqual(capability.qualityTiers,['low','standard','high']);
  assert.equal(capability.speechRuntime,false);assert.equal(capability.visemes.length,15);
  assert.equal(capability.clothing,'authored-bundle');assert.equal(capability.bodyEditing,false);
  assert.ok(Object.isFrozen(capability));
  assert.equal(validateCharacterDefinition({...definition,parameters:{height:1.8}},{ownerId:'fixture-owner'}).ok,false);
 }
 assert.equal(contract.characterFidelityContract('unknown'),null);
 assert.equal(contract.isRealisticHumanRig('jevica'),false);
});
