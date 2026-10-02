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

// Residents share six rigs, so hair colour is what tells two people on the same
// rig apart. Most rig hair textures are near-black, which a plain tint cannot
// lighten; each texture's measured mean (sRGB) lets a colour factor above 1 scale
// it to the target instead. null keeps the rig's authored colour.
export const HAIR_COLORS = [null, '#2b1d16', '#5a3423', null, '#5e2c20', '#b5834f', '#bba78a', null, '#b9b7b3', '#7c4128', '#1c1e26'];
const HAIR_TEXTURE_MEANS = { bob01:[38,32,33], short01:[27,27,27], bob02:[159,152,136], short04:[36,36,36], ponytail01:[86,58,41], short02:[75,60,49] };
const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
// Neighbouring ids hash to neighbouring values; mix the bits before choosing.
const mixed = id => { let h = hashFor(`hair:${id}`); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; };
export const residentHairFor = id => HAIR_COLORS[mixed(id) % HAIR_COLORS.length];

export function applyResidentHair(avatar, id) {
  const target = residentHairFor(id);
  if (!target) return null;
  const color = new Color(target);
  for (const [original, material] of avatar.materials) {
    const mean = HAIR_TEXTURE_MEANS[(original.name ?? '').replace(/\.\d+$/, '')];
    if (!mean) continue;
    // Per channel, so the texture's average lands on the target whatever its own
    // cast. Colour channels are linear here; cap the gain so noise never blows out.
    material.color.setRGB(...[color.r, color.g, color.b].map((channel, index) => Math.min(8, channel / Math.max(linear(mean[index]), 1e-3))));
    material.needsUpdate = true;
  }
  avatar.model.userData.residentHair = target;
  return target;
}

export function applyResidentStyle(avatar, id, { staff = false } = {}) {
  applyResidentHair(avatar, id);
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
