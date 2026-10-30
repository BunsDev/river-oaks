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

test('your own look is guided by its recipe and described by what was chosen', async () => {
  const { recipeCharacterDefinition } = await import('../src/character-definition.js');
  const { DEFAULT_RECIPE } = await import('../src/character-recipe.js');
  const choices=studioChoices(ownerId,'custom-human');
  assert.equal(choices.character,'custom');assert.equal(choices.colors,false);assert.deepEqual(choices.variants,[]);
  assert.match(choices.summary,/body and build, height, face, skin, eyes, hair, outfit and shoes/);
  const plain=describeLook(recipeCharacterDefinition(ownerId,DEFAULT_RECIPE));
  assert.equal(plain,'Your own, Feminine, Daywear, 166 cm, Warm beige skin, Brown eyes, Dark brown hair, ponytail');
  assert.equal(describeLook(recipeCharacterDefinition(ownerId,{...DEFAULT_RECIPE,build:-35})),'Your own, Feminine, Daywear, 166 cm, slim build, Warm beige skin, Brown eyes, Dark brown hair, ponytail');
  assert.equal(describeLook(recipeCharacterDefinition(ownerId,{...DEFAULT_RECIPE,build:60})).split(', ')[4],'broad build');
  const dressed=describeLook(recipeCharacterDefinition(ownerId,{...DEFAULT_RECIPE,body:'man-tailored',height:187,outfitColor:'navy',shoeColor:'tan'}));
  assert.equal(dressed,'Your own, Masculine, Tailored suit, 187 cm, Warm beige skin, Brown eyes, Dark brown hair, ponytail, Navy outfit, Tan shoes');
  assert.equal(studioRoster(ownerId).some(person=>person.id==='custom'),false,'the roster lists authored people; the Studio adds Your own itself');
});

test('realistic people and their tiers come only from the fidelity contract', async () => {
  const { STUDIO_TIER_LABELS, studioRealism, studioRealisticBundles } = await import('../src/character-studio-guide.js');
  const { characterFidelityContract, isRealisticHumanRig } = await import('../src/character-fidelity-contract.js');
  const bundles=studioRealisticBundles(ownerId);
  // Exactly the looks whose rig the contract covers: Morgan and Imani, nobody else.
  assert.deepEqual(bundles.map(bundle=>bundle.appearanceId),SHARED_APPEARANCES.filter(look=>isRealisticHumanRig(look.rig)).map(look=>look.id));
  assert.deepEqual(bundles.map(bundle=>bundle.name),['Morgan','Imani']);
  assert.deepEqual(studioRealisticBundles(jevicaOwner).map(bundle=>bundle.appearanceId),bundles.map(bundle=>bundle.appearanceId),'a realistic bundle grants no Jevica access and Jevica is not one');
  for(const {appearanceId,rig} of bundles){
    const contract=characterFidelityContract(rig),realism=studioRealism(rig),choices=studioChoices(ownerId,appearanceId),definition=characterDefinitionFor(ownerId,appearanceId);
    assert.equal(realism.sha256,definition.assets[0].sha256);assert.equal(realism.heightM,contract.targetHeightM);
    assert.deepEqual(realism.tiers,['auto',...contract.qualityTiers]);assert.equal(realism.tiers.includes('off'),false,'the diagnostic tier is never offered');
    for(const tier of realism.tiers)assert.ok(STUDIO_TIER_LABELS[tier]);
    // Each capability the contract leaves out is a locked control with a reason.
    assert.deepEqual(realism.locked.map(item=>item.control),['fit','body','hair']);
    for(const item of realism.locked)assert.ok(item.label&&item.reason.length>20);
    assert.match(realism.locked.find(item=>item.control==='body').reason,new RegExp(contract.targetHeightM.toFixed(2)));
    assert.ok(Object.isFrozen(realism)&&Object.isFrozen(realism.locked[0]));
    // Nothing else becomes editable: no wardrobe, color or form choices.
    assert.deepEqual(choices.realism,realism);assert.equal(choices.colors,false);assert.equal(choices.variants.length,1);assert.deepEqual(choices.forms,['human']);
    assert.match(choices.summary,/realistic look is set as designed/);assert.match(choices.summary,/only how this device draws it/);
  }
  // Stylized looks and your own recipe carry no realism and no tiers.
  for(const id of ['sable-human','man-casual','kai-noir','custom-human'])assert.equal(studioChoices(ownerId,id).realism,null,id);
  assert.equal(studioChoices(jevicaOwner,'jevica').realism,null);
  for(const rig of ['jevica','man-casual','woman-casual','unknown'])assert.equal(studioRealism(rig),null,rig);
});

test('a realistic look is described with the tier it is previewed at, and only then', () => {
  const morgan=characterDefinitionFor(ownerId,'morgan-human'),imani=characterDefinitionFor(ownerId,'imani-human');
  assert.equal(describeLook(morgan),'Morgan, Realistic human');
  assert.equal(describeLook(morgan,{tier:'standard'}),'Morgan, Realistic human, Standard detail');
  assert.equal(describeLook(imani,{tier:'auto'}),'Imani, Realistic human, Match graphics');
  assert.equal(describeLook(imani,{tier:'off'}),'Imani, Realistic human','the diagnostic tier is not a choice');
  assert.equal(describeLook(characterDefinitionFor(ownerId,'rowan-human'),{tier:'high'}),'Rowan, Human','stylized looks have no tiers');
});
