import { characterDefinitionFor, recipeCharacterDefinition, validateCharacterDefinition } from './character-definition.js';
import { customizedCharacterDefinition, supportsCharacterColors, CHARACTER_PALETTES, CHARACTER_HAIR } from './character-customization.js';
import { DEFAULT_RECIPE, RECIPE_BODIES, bodyClothes, rollCharacterRecipe } from './character-recipe.js';
import { SHARED_APPEARANCES, canUseAppearance, defaultAppearanceFor, sharedAppearance } from './shared-appearances.js';

// The editor is a release control in builds (only VITE_CHARACTER_STUDIO=true shows it).
// Development always shows it unless a journey turns it off explicitly with 'false'.
export const characterStudioShown = ({ DEV = false, VITE_CHARACTER_STUDIO: flag } = {}) => flag === 'true' || (Boolean(DEV) && flag !== 'false');

export function createCharacterDraft({ownerId,definition}){
  const validated=value=>{const result=validateCharacterDefinition(value,{ownerId});if(!result.ok)throw new TypeError(result.error);return result.definition;};
  const original=validated(definition);let history=[original],cursor=0;
  const push=value=>{
    const next=validated(value);if(JSON.stringify(next)===JSON.stringify(history[cursor]))return false;
    history=history.slice(0,cursor+1);history.push(next);if(history.length>51)history.shift();cursor=history.length-1;return true;
  };
  const variants=id=>supportsCharacterColors(id)?Object.keys(CHARACTER_PALETTES).flatMap(palette=>Object.keys(CHARACTER_HAIR).map(hair=>({id,palette,hair}))):[{id,palette:'authored',hair:'authored'}];
  // A surprise must change something: pick a look first, so Sable's color variants
  // do not crowd out every other look, then one of its variants other than the current one.
  const surprise=(looks,random)=>{
    const current=history[cursor],same=choice=>choice.id===current.appearanceId&&choice.palette===(current.palette??'authored')&&choice.hair===(current.hair??'authored');
    const pick=values=>values[Math.min(values.length-1,Math.max(0,Math.floor(random()*values.length)))];
    const options=looks.filter(id=>variants(id).some(choice=>!same(choice)));if(!options.length)return false;
    const choice=pick(variants(pick(options)).filter(choice=>!same(choice)));
    return push(customizedCharacterDefinition(ownerId,choice.id,{revision:current.revision,palette:choice.palette,hair:choice.hair}));
  };
  // The latest look of each kind at or before the cursor, so moving between
  // creating and the authored characters returns to where each was left.
  const latest=custom=>{for(let i=cursor;i>=0;i--)if((history[i].schemaVersion===3)===custom)return history[i];return null;};
  const recipe=()=>latest(true)?.parameters??DEFAULT_RECIPE;
  const pushRecipe=value=>push(recipeCharacterDefinition(ownerId,value,{revision:history[cursor].revision}));
  return {
    get value(){return validated(history[cursor]);},
    get original(){return validated(original);},
    get canUndo(){return cursor>0;},get canRedo(){return cursor<history.length-1;},
    get custom(){return history[cursor].schemaVersion===3;},
    change(patch){
      if(!patch||Object.keys(patch).some(key=>!['appearanceId','palette','hair','recipe'].includes(key)))throw new TypeError('Unsupported character edit');
      // A recipe edit names only the fields it changes (face sliders included).
      if(Object.hasOwn(patch,'recipe')){
        const edit=patch.recipe,base=recipe(),plain=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
        if(Object.keys(patch).length!==1||!plain(edit)||edit.face!==undefined&&!plain(edit.face))throw new TypeError('Unsupported character edit');
        // Another body comes in its own clothes unless the edit names them.
        const clothes=edit.body!==undefined&&edit.body!==base.body&&Object.hasOwn(RECIPE_BODIES,edit.body)?bodyClothes(edit.body):{};
        return pushRecipe({...base,...clothes,...edit,face:{...base.face,...edit.face}});
      }
      const current=history[cursor],appearanceId=patch.appearanceId??current.appearanceId;
      // From your own look, choosing the character last shown returns to that look, colors included.
      const kept=current.schemaVersion===3&&Object.keys(patch).length===1&&latest(false);
      if(kept&&sharedAppearance(kept.appearanceId)?.character===sharedAppearance(appearanceId)?.character)return push(kept);
      const colors=supportsCharacterColors(appearanceId);
      return push(customizedCharacterDefinition(ownerId,appearanceId,{revision:current.revision,
        palette:patch.palette??(colors?current.palette:'authored'),hair:patch.hair??(colors?current.hair:'authored')}));
    },
    // Make your own: the draft's latest recipe, or a new random person.
    create(random=Math.random){return pushRecipe(latest(true)?.parameters??rollCharacterRecipe({random}));},
    // Rolls the named recipe categories (character-recipe.js); the others are kept.
    roll(categories,random=Math.random){return pushRecipe(rollCharacterRecipe({from:recipe(),categories,random}));},
    // Back to the authored characters: the draft's latest authored look.
    authored(){return push(latest(false)??characterDefinitionFor(ownerId,defaultAppearanceFor(ownerId)));},
    undo(){if(cursor>0)cursor--;},redo(){if(cursor<history.length-1)cursor++;},
    reset(){history=[validated(original)];cursor=0;},restore:push,
    randomize(random=Math.random){return surprise(SHARED_APPEARANCES.filter(look=>canUseAppearance(ownerId,look.id)).map(look=>look.id),random);},
    // Remix stays with the current character: its forms, wardrobes and fitted colors.
    remix(random=Math.random){
      const character=sharedAppearance(history[cursor].appearanceId).character;
      return surprise(SHARED_APPEARANCES.filter(look=>look.character===character&&canUseAppearance(ownerId,look.id)).map(look=>look.id),random);
    },
  };
}
