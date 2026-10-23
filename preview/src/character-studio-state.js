import { validateCharacterDefinition } from './character-definition.js';
import { customizedCharacterDefinition, supportsCharacterColors, CHARACTER_PALETTES, CHARACTER_HAIR } from './character-customization.js';
import { SHARED_APPEARANCES, canUseAppearance, sharedAppearance } from './shared-appearances.js';

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
  return {
    get value(){return validated(history[cursor]);},
    get original(){return validated(original);},
    get canUndo(){return cursor>0;},get canRedo(){return cursor<history.length-1;},
    change(patch){
      if(!patch||Object.keys(patch).some(key=>!['appearanceId','palette','hair'].includes(key)))throw new TypeError('Unsupported character edit');
      const current=history[cursor],appearanceId=patch.appearanceId??current.appearanceId;
      const colors=supportsCharacterColors(appearanceId);
      return push(customizedCharacterDefinition(ownerId,appearanceId,{revision:current.revision,
        palette:patch.palette??(colors?current.palette:'authored'),hair:patch.hair??(colors?current.hair:'authored')}));
    },
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
