import { CHARACTER_HAIR, CHARACTER_PALETTES, supportsCharacterColors } from './character-customization.js';
import { characterAssetFor } from './character-assets.js';
import { characterFidelityContract } from './character-fidelity-contract.js';
import { CHARACTERS, SHARED_APPEARANCES, appearanceFor, canUseAppearance, sharedAppearance, sharedCharacter } from './shared-appearances.js';
import { EYE_COLORS, HAIR_SHADES, HAIRSTYLE_OPTIONS, OUTFIT_COLORS, RECIPE_BODIES, RECIPE_FRAMES, SHOE_COLORS, SKIN_TONES } from './character-recipe.js';

// Guided-start copy is derived from the validated catalog, so the Studio never
// suggests a form, wardrobe or color that the definition contract would reject.
const list=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;
// Realistic people and their detail tiers come only from the #517 fidelity
// contract. A capability the contract does not declare becomes a locked control
// with its reason, never an option. Tiers are viewer-local ('auto' follows the
// graphics setting); the contract's diagnostic 'off' is never offered.
export const STUDIO_TIER_LABELS=Object.freeze({auto:'Match graphics',high:'High detail',standard:'Standard detail',low:'Low detail'});
const lockedControls=contract=>[
  contract.clothing==='authored-bundle'&&{control:'fit',label:'Clothing fit',reason:'The outfit is fitted to this body as one bundle. Separate clothing fit is not supported yet.'},
  !contract.bodyEditing&&{control:'body',label:'Body and height',reason:`Body shape and height are fixed for this realistic person (${contract.targetHeightM.toFixed(2)} m).`},
  !contract.hairEditing&&{control:'hair',label:'Hair',reason:'Hairstyle and hair color come with the bundle. Hair editing is not supported yet.'},
].filter(Boolean);
export function studioRealism(rig){
  const contract=characterFidelityContract(rig);
  // A bundle is offered only while the shipped asset pin is the one the contract validated.
  if(!contract||characterAssetFor(rig)?.sha256!==contract.asset.sha256)return null;
  return Object.freeze({rig,sha256:contract.asset.sha256,heightM:contract.targetHeightM,tiers:Object.freeze(['auto',...contract.qualityTiers]),
    expressions:Object.freeze([...contract.expressions]),locked:Object.freeze(lockedControls(contract).map(Object.freeze))});
}
export const studioRealisticBundles=ownerId=>SHARED_APPEARANCES.filter(look=>!look.recipe&&canUseAppearance(ownerId,look.id)&&studioRealism(look.rig??look.id))
  .map(look=>({appearanceId:look.id,character:look.character,name:sharedCharacter(look.character).name,rig:look.rig}));
export const studioRoster=ownerId=>CHARACTERS.filter(person=>canUseAppearance(ownerId,appearanceFor(person.id).id))
  .map(({id,name,title,species,accent})=>({id,name,title,species,accent}));
export function studioChoices(ownerId,appearanceId){
  const look=sharedAppearance(appearanceId);
  if(!look||!canUseAppearance(ownerId,look.id))throw new TypeError('That character is not available');
  const person=sharedCharacter(look.character);
  if(look.recipe)return {character:person.id,name:person.name,title:person.title,species:person.species,description:look.description,form:look.form,variant:look.variant,forms:[look.form],variants:[],colors:false,realism:null,
    summary:'Choose the body and build, height, face, skin, eyes, hair, outfit and shoes below. Roll anything, and keep what you love.'};
  const usable=SHARED_APPEARANCES.filter(item=>item.character===person.id&&canUseAppearance(ownerId,item.id));
  const forms=['human'].filter(form=>usable.some(item=>item.form===form)),variants=person.variants.filter(variant=>usable.some(item=>item.variant===variant.id));
  const colors=supportsCharacterColors(look.id),changes=[forms.length>1&&'form',variants.length>1&&'wardrobe',...(colors?['dress color','hair color']:[])].filter(Boolean);
  const realism=studioRealism(look.rig??look.id);
  const summary=realism?'This realistic look is set as designed. Choose a detail tier to preview it; the tier changes only how this device draws it.'
    :changes.length?`You can change the ${list(changes)}.${colors?'':' Colors stay as designed.'}`:'This look is set as designed.';
  return {character:person.id,name:person.name,title:person.title,species:person.species,description:look.description,form:look.form,variant:look.variant,forms,variants,colors,realism,summary};
}
// A recipe reads as the choices that differ from a plain start.
function describeRecipe(recipe){
  const body=RECIPE_BODIES[recipe.body],parts=['Your own',RECIPE_FRAMES[body.frame].label,body.outfit,`${recipe.height} cm`,...(recipe.build?[`${recipe.build<0?'slim':'broad'} build`]:[]),`${SKIN_TONES[recipe.skin].label} skin`,`${EYE_COLORS[recipe.eyes].label} eyes`,
    `${HAIR_SHADES[recipe.hairColor].label} hair, ${HAIRSTYLE_OPTIONS[recipe.hairStyle].label.toLowerCase()}`];
  if(OUTFIT_COLORS[recipe.outfitColor].color)parts.push(`${OUTFIT_COLORS[recipe.outfitColor].label} outfit`);
  if(SHOE_COLORS[recipe.shoeColor].color)parts.push(`${SHOE_COLORS[recipe.shoeColor].label} shoes`);
  return parts.join(', ');
}
// A detail tier is named only for a realistic look, so announcements say what the preview draws.
export function describeLook(definition,{tier}={}){
  if(definition.schemaVersion===3)return describeRecipe(definition.parameters);
  const look=sharedAppearance(definition.appearanceId),person=sharedCharacter(look.character),realism=studioRealism(definition.rig);
  const parts=[person.name,realism?'Realistic human':'Human'];
  if(person.variants.length>1)parts.push(person.variants.find(variant=>variant.id===look.variant).label);
  if(supportsCharacterColors(look.id))parts.push(`${CHARACTER_PALETTES[definition.palette??'authored'].label} dress`,`${CHARACTER_HAIR[definition.hair??'authored'].label} hair`);
  if(realism&&realism.tiers.includes(tier))parts.push(STUDIO_TIER_LABELS[tier]);
  return parts.join(', ');
}
