import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLook, studioChoices, studioRoster } from '../src/character-studio-guide.js';
import { customizedCharacterDefinition } from '../src/character-customization.js';
import { characterDefinitionFor } from '../src/character-definition.js';
import { CHARACTERS, JEVICA_OWNER_USER_IDS, SHARED_APPEARANCES, canUseAppearance } from '../src/shared-appearances.js';

const ownerId='studio-fixture',jevicaOwner=[...JEVICA_OWNER_USER_IDS][0];

test('the guided roster offers only characters the account may wear',()=>{
  const roster=studioRoster(ownerId);
  assert.deepEqual(roster.map(person=>person.id),CHARACTERS.map(person=>person.id).filter(id=>id!=='jevica'));
  assert.ok(studioRoster(jevicaOwner).some(person=>person.id==='jevica'));
  for(const person of roster){assert.ok(person.name&&person.title&&person.species&&person.accent);}
});

test('each starting character lists only changes the validated catalog supports',()=>{
  const sable=studioChoices(ownerId,'sable-human');
  assert.deepEqual(sable.forms,['human']);assert.equal(sable.variants.length,1);assert.equal(sable.colors,true);
  assert.equal(sable.summary,'You can change the dress color and hair color.');
  const kai=studioChoices(ownerId,'kai-noir');
  assert.deepEqual(kai.variants.map(variant=>variant.id),['formal','explorer','noir']);assert.equal(kai.colors,false);
  assert.equal(kai.summary,'You can change the wardrobe. Colors stay as designed.');
  const rowan=studioChoices(ownerId,'man-casual');
  assert.equal(rowan.species,'Human');assert.equal(rowan.summary,'This look is set as designed.');
  assert.match(rowan.description,/silver-grey/i);
  // Every exposed form and wardrobe resolves to a look the account may use.
  for(const person of studioRoster(ownerId)){
    const choices=studioChoices(ownerId,SHARED_APPEARANCES.find(look=>look.character===person.id).id);
    for(const form of choices.forms)for(const variant of choices.variants)
      assert.ok(SHARED_APPEARANCES.some(look=>look.character===person.id&&look.form===form&&look.variant===variant.id&&canUseAppearance(ownerId,look.id)),`${person.id} ${form} ${variant.id}`);
  }
  assert.throws(()=>studioChoices(ownerId,'jevica'),/not available/);
  assert.deepEqual(studioChoices(jevicaOwner,'jevica').forms,['human']);
});

test('look descriptions name what changed for announcements',()=>{
  assert.equal(describeLook(customizedCharacterDefinition(ownerId,'woman-casual',{palette:'rose',hair:'espresso'})),'Sable, Human, Rose silk dress, Espresso hair');
  assert.equal(describeLook(characterDefinitionFor(ownerId,'sable-human')),'Sable, Human, Ivory dress, Ash blonde hair');
  assert.equal(describeLook(characterDefinitionFor(ownerId,'kai-explorer-beast')),'Kai, Human, Explorer casual');
  assert.equal(describeLook(characterDefinitionFor(ownerId,'rowan-human')),'Rowan, Human');
});
