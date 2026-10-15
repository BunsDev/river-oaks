import { Color } from 'three';
import { CHARACTER_PALETTES, CHARACTER_HAIR } from './character-customization.js';
import { validateCharacterDefinition } from './character-definition.js';

// Slots are authored on independently owned avatar materials by the look
// builders. Never select surfaces by approximate colors or mutate cached rigs.
export function createCharacterMaterials(root){
  const materials=new Map();
  root.traverse(object=>{if(object.isMesh)for(const material of [object.material].flat()){
    const slot=material.userData.characterSlot;
    if(slot&&!materials.has(material))materials.set(material,{slot,color:material.color.clone(),sheen:material.sheenColor?.clone()});
  }});
  const restore=()=>{for(const [material,saved] of materials){material.color.copy(saved.color);if(saved.sheen)material.sheenColor.copy(saved.sheen);}};
  return {
    slots:{outfit:[...materials.values()].filter(x=>x.slot==='outfit').length,hair:[...materials.values()].filter(x=>x.slot==='hair').length},
    apply(definition){
      if(!validateCharacterDefinition(definition,{ownerId:definition?.ownerId}).ok)throw new TypeError('Invalid character definition');
      restore();
      for(const [material,saved] of materials){
        const choice=saved.slot==='outfit'?definition.palette:definition.hair;
        if(choice==='authored')continue;
        const target=new Color((saved.slot==='outfit'?CHARACTER_PALETTES:CHARACTER_HAIR)[choice].color);
        if(saved.slot==='hair'&&material.map){
          // Authored human hair map has mean sRGB #c2a085; preserve its strands.
          const mean=new Color('#c2a085');target.setRGB(Math.min(8,target.r/mean.r),Math.min(8,target.g/mean.g),Math.min(8,target.b/mean.b));
        }
        material.color.copy(target);
        if(saved.sheen)material.sheenColor.set((saved.slot==='outfit'?CHARACTER_PALETTES:CHARACTER_HAIR)[choice].color);
      }
    },dispose:restore,
  };
}
