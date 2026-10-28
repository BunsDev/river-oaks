import { CHARACTER_HAIR, CHARACTER_PALETTES, supportsCharacterColors } from './character-customization.js';
import { CHARACTERS, SHARED_APPEARANCES, appearanceFor, canUseAppearance, sharedAppearance, sharedCharacter } from './shared-appearances.js';
import { EYE_COLORS, HAIR_SHADES, HAIRSTYLE_OPTIONS, OUTFIT_COLORS, RECIPE_BODIES, RECIPE_FRAMES, SHOE_COLORS, SKIN_TONES } from './character-recipe.js';

// Guided-start copy is derived from the validated catalog, so the Studio never
// suggests a form, wardrobe or color that the definition contract would reject.
const list=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;
export const studioRoster=ownerId=>CHARACTERS.filter(person=>canUseAppearance(ownerId,appearanceFor(person.id).id))
  .map(({id,name,title,species,accent})=>({id,name,title,species,accent}));
export function studioChoices(ownerId,appearanceId){
  const look=sharedAppearance(appearanceId);
  if(!look||!canUseAppearance(ownerId,look.id))throw new TypeError('That character is not available');
  const person=sharedCharacter(look.character);
  if(look.recipe)return {character:person.id,name:person.name,title:person.title,species:person.species,description:look.description,form:look.form,variant:look.variant,forms:[look.form],variants:[],colors:false,
    summary:'Choose the body, height, face, skin, eyes, hair, outfit and shoes below. Roll anything, and keep what you love.'};
  const usable=SHARED_APPEARANCES.filter(item=>item.character===person.id&&canUseAppearance(ownerId,item.id));
  const forms=['human'].filter(form=>usable.some(item=>item.form===form)),variants=person.variants.filter(variant=>usable.some(item=>item.variant===variant.id));
  const colors=supportsCharacterColors(look.id),changes=[forms.length>1&&'form',variants.length>1&&'wardrobe',...(colors?['dress color','hair color']:[])].filter(Boolean);
  const summary=changes.length?`You can change the ${list(changes)}.${colors?'':' Colors stay as designed.'}`:'This look is set as designed.';
  return {character:person.id,name:person.name,title:person.title,species:person.species,description:look.description,form:look.form,variant:look.variant,forms,variants,colors,summary};
}
// A recipe reads as the choices that differ from a plain start.
function describeRecipe(recipe){
  const body=RECIPE_BODIES[recipe.body],parts=['Your own',RECIPE_FRAMES[body.frame].label,body.outfit,`${recipe.height} cm`,`${SKIN_TONES[recipe.skin].label} skin`,`${EYE_COLORS[recipe.eyes].label} eyes`,
    `${HAIR_SHADES[recipe.hairColor].label} hair, ${HAIRSTYLE_OPTIONS[recipe.hairStyle].label.toLowerCase()}`];
  if(OUTFIT_COLORS[recipe.outfitColor].color)parts.push(`${OUTFIT_COLORS[recipe.outfitColor].label} outfit`);
  if(SHOE_COLORS[recipe.shoeColor].color)parts.push(`${SHOE_COLORS[recipe.shoeColor].label} shoes`);
  return parts.join(', ');
}
export function describeLook(definition){
  if(definition.schemaVersion===3)return describeRecipe(definition.parameters);
  const look=sharedAppearance(definition.appearanceId),person=sharedCharacter(look.character);
  const parts=[person.name,'Human'];
  if(person.variants.length>1)parts.push(person.variants.find(variant=>variant.id===look.variant).label);
  if(supportsCharacterColors(look.id))parts.push(`${CHARACTER_PALETTES[definition.palette??'authored'].label} dress`,`${CHARACTER_HAIR[definition.hair??'authored'].label} hair`);
  return parts.join(', ');
}
