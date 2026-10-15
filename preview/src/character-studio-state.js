import { validateCharacterDefinition } from './character-definition.js';
import { customizedCharacterDefinition, supportsCharacterColors, CHARACTER_PALETTES, CHARACTER_HAIR } from './character-customization.js';
import { SHARED_APPEARANCES, canUseAppearance } from './shared-appearances.js';

export function createCharacterDraft({ownerId,definition}){
  const validated=value=>{const result=validateCharacterDefinition(value,{ownerId});if(!result.ok)throw new TypeError(result.error);return result.definition;};
  const original=validated(definition);let history=[original],cursor=0;
  const push=value=>{
    const next=validated(value);if(JSON.stringify(next)===JSON.stringify(history[cursor]))return false;
    history=history.slice(0,cursor+1);history.push(next);if(history.length>51)history.shift();cursor=history.length-1;return true;
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
    randomize(random=Math.random){
      const pick=values=>values[Math.min(values.length-1,Math.max(0,Math.floor(random()*values.length)))];
      const id=pick(SHARED_APPEARANCES.filter(look=>canUseAppearance(ownerId,look.id))).id;
      return push(customizedCharacterDefinition(ownerId,id,{revision:history[cursor].revision,
        palette:supportsCharacterColors(id)?pick(Object.keys(CHARACTER_PALETTES)):'authored',
        hair:supportsCharacterColors(id)?pick(Object.keys(CHARACTER_HAIR)):'authored'}));
    },
  };
}
