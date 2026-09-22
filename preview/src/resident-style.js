import { Color } from 'three';

// Human residents share the heroes' fashion language, not their anatomy.
// The source rigs retain their own faces, skin detail, eyes and hairstyles.
export const RESIDENT_STYLES = [
  { name:'Rose atelier', colors:['#b66e89','#d3a8b2','#956174'], roughness:0.43, metalness:0.03 },
  { name:'Midnight velvet', colors:['#3a2948','#252f3e','#4d354c'], roughness:0.86, metalness:0 },
  { name:'Stellar tailoring', colors:['#516b70','#768287','#3c5266'], roughness:0.42, metalness:0.12 },
  { name:'Botanical linen', colors:['#587361','#8c936b','#49726b'], roughness:0.9, metalness:0 },
  { name:'Gallery color', colors:['#af6552','#b28c50','#76619a'], roughness:0.7, metalness:0 },
  { name:'Pearl classic', colors:['#d8c9b5','#a7b6bb','#ae9fbb'], roughness:0.53, metalness:0.02 },
];
const hashFor = id => [...String(id)].reduce((hash, character) => (Math.imul(hash,31)+character.charCodeAt(0))>>>0,0);
export const residentStyleFor = id => RESIDENT_STYLES[hashFor(id)%RESIDENT_STYLES.length];

export function applyResidentStyle(avatar, id, { staff = false } = {}) {
  const style=residentStyleFor(id), seed=hashFor(id);
  let garment=0;
  for(const [original,material] of avatar.materials) {
    const name=original.name ?? '';
    if(!/suit|dress|shirt|jacket|jeans|trouser|pants|skirt|vest|blouse/i.test(name))continue;
    const tint=new Color(style.colors[(Math.floor(seed/RESIDENT_STYLES.length)+garment++)%style.colors.length]);
    // Staff keep their role-specific uniform; guests show the fuller palette.
    material.color.lerp(tint,staff?0.3:0.82);
    material.roughness=staff?Math.max(0.65,style.roughness):style.roughness;
    material.metalness=style.metalness;
    material.needsUpdate=true;
  }
  avatar.model.userData.residentStyle=style.name;
  return style;
}
