import { JEVICA_ACCOUNT_IDS, isJevicaAccount } from './jevica-accounts.js';
// IDs are stored in account checkpoints and sent across the shared-world
// protocol. Keep them stable even when an appearance uses another shipped rig.
//
// A playable character is a person type with one or more styles (variants).
// Every style comes in a humanoid form and a beast form, so a choice is the
// triple character × variant × form, and each triple has exactly one ID.
export const FORMS = ['human','beast'];
export const MOVEMENTS = ['upright','beast'];
// The shared town accepts one appearance change per account in this interval.
export const APPEARANCE_COOLDOWN_MS = 2000;

export const CHARACTERS = [
  {id:'jevica',name:'Jevica',title:'Rose enchantress',species:'White fox',accent:'#d784a6',variants:[{id:'signature',label:'Rose silk'}]},
  {id:'sable',name:'Sable',title:'Fox charmer',species:'Fox',accent:'#bd825b',variants:[{id:'signature',label:'Ivory city dress'}]},
  {id:'rowan',name:'Rowan',title:'Wolf wanderer',species:'Wolf',accent:'#807a78',variants:[{id:'signature',label:'Field jacket'}]},
  {id:'vesper',name:'Vesper',title:'Velvet confidante',species:'Panther',accent:'#693042',variants:[{id:'signature',label:'Wine velvet'}]},
  {id:'aurel',name:'Aurel',title:'Midnight host',species:'Wolf',accent:'#5d4b4a',variants:[{id:'signature',label:'Black brocade'}]},
  {id:'lyra',name:'Lyra',title:'Lynx muse',species:'Lynx',accent:'#986879',variants:[{id:'signature',label:'Mauve velvet'}]},
  {id:'kai',name:'Kai',title:'Starlight maker',species:'Snow leopard',accent:'#c2aa80',variants:[{id:'formal',label:'Celestial formal',short:'Formal'},{id:'explorer',label:'Explorer casual',short:'Explorer'},{id:'noir',label:'Starlit noir',short:'Noir'}]},
  {id:'silvan',name:'Silvan',title:'Forest aristocrat',species:'Deer',accent:'#6f7748',variants:[{id:'masculine',label:'Masculine',short:'Masculine'},{id:'feminine',label:'Feminine',short:'Feminine'}]},
];
const characterById=new Map(CHARACTERS.map(character=>[character.id,character]));

// Label and role are derived so the picker, the panel and the catalog agree.
function entry(fields){
  const character=characterById.get(fields.character),variant=character.variants.find(item=>item.id===fields.variant);
  const style=character.variants.length>1?` · ${variant.label.toLowerCase()}`:'';
  const form=fields.form==='beast'?character.species.toLowerCase():'humanoid';
  return {
    name:character.name,accent:character.accent,
    label:`${character.name} · ${character.title.toLowerCase()}${style} · ${form}`,
    role:`${character.title}${style} · ${fields.form==='beast'?'beast':'humanoid'}`,
    ...fields,
  };
}

export const SHARED_APPEARANCES = [
  entry({id:'jevica',character:'jevica',variant:'signature',form:'human',kind:'human',costume:'jevica',portrait:'/assets/characters/jevica-portrait.png',description:'A playful romantic with rose silk, a quick laugh, and a gift for making a stranger feel welcome.'}),
  entry({id:'jevica-beast',character:'jevica',variant:'signature',form:'beast',rig:'jevica',kind:'fox',palette:'rose-fox',costume:'jevica',description:'The enchantress as a snow-white fox: rose-blushed ears, a jewel-bright gaze, her gold crown and embroidered rose silk, and a full white tail tipped in pink.'}),
  entry({id:'sable-human',character:'sable',variant:'signature',form:'human',rig:'jevica',kind:'human',description:'Sable without the fur: long ash-blonde waves, an ivory city dress with a gold collar chain, sandals, and a shoulder bag full of better stories than the one she tells first.'}),
  entry({id:'woman-casual',character:'sable',variant:'signature',form:'beast',rig:'jevica',kind:'fox',portrait:'/assets/characters/sable-portrait.png',reference:'/assets/characters/references/sable-fox-turnaround.png',portraitLeft:'-180px',description:'A warm amber fox with long ash-blonde waves, an ivory city dress, and an enormous cream-tipped tail. Curious, playful, and always carrying a better story than the one she tells first.'}),
  entry({id:'rowan-human',character:'rowan',variant:'signature',form:'human',rig:'man-tailored',kind:'human',description:'Rowan as a man: silver-grey hair, the same dark jacket and collar he wears as a wolf, weathered boots, and a leather satchel. Gentle, loyal, and happiest under city lights.'}),
  entry({id:'man-casual',character:'rowan',variant:'signature',form:'beast',rig:'man-tailored',kind:'wolf',reference:'/assets/characters/references/rowan-wolf-turnaround.png',portraitLeft:'-181px',description:'A silver-gray wolf in a charcoal field jacket, cream henley, weathered boots, and a leather satchel. Gentle, loyal, and happiest under city lights with someone worth walking home.'}),
  entry({id:'woman-tailored',character:'vesper',variant:'signature',form:'human',rig:'jevica',kind:'human',reference:'/assets/characters/references/vesper-velvet-turnaround.png',portraitLeft:'-190px',description:'An elegant night owl with dark waves, wine velvet, gold jewelry, and a dry sense of humor. She remembers your favorite song and makes every rooftop feel like a secret.'}),
  entry({id:'vesper-beast',character:'vesper',variant:'signature',form:'beast',rig:'jevica',kind:'panther',description:'A black panther in wine velvet: a glossy midnight coat, molten gold eyes, gold hoops, and a long tail that curls when she is amused. She still remembers your favorite song.'}),
  entry({id:'man-tailored',character:'aurel',variant:'signature',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/aurel-human.png',portraitStyle:'tall',portraitLeft:'-58px',description:'The human midnight host: tousled dark hair, a charcoal brocade waistcoat, long black coat, layered silver jewelry, and an easy, mysterious smile. He knows every gallery opening and always saves the last dance.'}),
  entry({id:'midnight-host-wolf',character:'aurel',variant:'signature',form:'beast',rig:'man-casual',kind:'wolf',palette:'host-wolf',reference:'/assets/characters/references/aurel-wolf.png',portraitStyle:'tall',portraitLeft:'-58px',description:'The fully anthropomorphic midnight host has charcoal and cream wolf fur, amber eyes, tousled dark hair, a sweeping cream-tipped tail, and the same ornate black coat and silver chains.'}),
  entry({id:'lyra-human',character:'lyra',variant:'signature',form:'human',rig:'jevica',kind:'human',portrait:'/assets/characters/references/lyra-human.png',reference:'/assets/characters/references/lyra-human.png',description:'Lyra as a woman: long chestnut waves, a draped mauve velvet dress with a sheer spotted train, a gold pendant, a chain-strap bag and rose ankle boots.'}),
  entry({id:'woman-daywear',character:'lyra',variant:'signature',form:'beast',rig:'jevica',kind:'lynx',portrait:'/assets/characters/references/lyra-lynx.png',reference:'/assets/characters/references/lyra-lynx.png',movementReference:'/assets/characters/references/lyra-beast.png',description:'Lyra as an upright lynx: tufted ears, amber eyes and a spotted golden coat, wearing the same mauve velvet, pendant, bag and boots. Prowl to take her lynx form.'}),
  entry({id:'man-workwear',character:'kai',variant:'formal',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/kai-three-celestial-styles.png',portraitStyle:'collage',portraitLeft:'-26px',description:'Celestial formal Kai wears an ivory long coat and trousers over a midnight waistcoat, with fine gold star embroidery, a star pendant, and tousled light brown hair.'}),
  entry({id:'kai-formal-beast',character:'kai',variant:'formal',form:'beast',rig:'man-casual',kind:'snow-leopard',description:'Kai as a snow leopard in celestial formal: smoke-pale fur scattered with rosettes like constellations, sea-glass eyes, an ivory long coat with gold stars, and a thick ringed tail.'}),
  entry({id:'kai-explorer',character:'kai',variant:'explorer',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/kai-three-celestial-styles.png',portraitStyle:'collage',portraitLeft:'-132px',description:'Explorer Kai wears a rolled-sleeve navy shirt with tiny gold constellations, sand cargo trousers, rugged black boots, and a worn leather crossbody satchel.'}),
  entry({id:'kai-explorer-beast',character:'kai',variant:'explorer',form:'beast',rig:'man-casual',kind:'snow-leopard',description:'Kai as a snow leopard in explorer casual: rosetted fur, a navy shirt with tiny gold constellations, a worn satchel, rugged boots, and a thick tail for balance on rooftops.'}),
  entry({id:'kai-noir',character:'kai',variant:'noir',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/kai-three-celestial-styles.png',portraitStyle:'collage',portraitLeft:'-234px',description:'Starlit noir Kai wears a long black coat, layered dark tailoring, glinting gold constellations and crescent motifs, a star pendant, and sleek black boots.'}),
  entry({id:'kai-noir-beast',character:'kai',variant:'noir',form:'beast',rig:'man-casual',kind:'snow-leopard',description:'Kai as a snow leopard in starlit noir: pale rosetted fur against a long black coat, gold crescents and constellations, a star pendant, and a slow, sweeping ringed tail.'}),
  entry({id:'forest-aristocrat',character:'silvan',variant:'masculine',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/forest-aristocrat-masculine.png',portraitLeft:'-200px',description:'A woodland noble come to town: an antler-twig crown woven with leaves and white blossoms, long vine-laced hair, an open ivory tunic over an olive panel, a gold-leaf sash with hanging leaf chains, vine-wrapped bracers, and tall vine-bound boots.'}),
  entry({id:'forest-aristocrat-beast',character:'silvan',variant:'masculine',form:'beast',rig:'man-casual',kind:'deer',description:'Silvan as a stag of the old wood: russet fur with a pale muzzle, wide velvet ears, dark gentle eyes, the antler-twig crown with blossoms, and the ivory tunic, gold-leaf sash and vine-bound boots.'}),
  entry({id:'forest-aristocrat-feminine',character:'silvan',variant:'feminine',form:'human',rig:'jevica',kind:'human',reference:'/assets/characters/references/forest-aristocrat-feminine.png',portraitLeft:'-200px',description:'The feminine forest aristocrat: an antler-twig crown with leaves and white blossoms, long waves threaded with vines, a draped ivory wrap over an olive panel, a gold-leaf sash and chains, vines climbing bare arms, and tall vine-bound block-heel boots.'}),
  entry({id:'forest-aristocrat-feminine-beast',character:'silvan',variant:'feminine',form:'beast',rig:'jevica',kind:'deer',description:'Silvan as a doe of the old wood: russet fur with a pale muzzle, wide velvet ears, dark gentle eyes, the antler-twig crown with blossoms, a draped ivory wrap, and vines climbing her arms.'}),
];

// Retired choices still resolve, so a saved device, account or town checkpoint
// keeps its character instead of failing validation. The wolf-eared midnight
// host became his full wolf form.
export const LEGACY_APPEARANCES = {'midnight-host-hybrid':'midnight-host-wolf'};

export const DEFAULT_SHARED_APPEARANCE='jevica';
export const DEFAULT_GUEST_APPEARANCE='sable-human';
export const JEVICA_OWNER_USER_IDS=JEVICA_ACCOUNT_IDS;
export const isJevicaOwner=isJevicaAccount;
const appearanceById=new Map(SHARED_APPEARANCES.map(appearance=>[appearance.id,appearance]));
export const sharedAppearance=id=>appearanceById.get(id)??(Object.hasOwn(LEGACY_APPEARANCES,id)?appearanceById.get(LEGACY_APPEARANCES[id]):null)??null;
export const sharedCharacter=id=>characterById.get(id)??null;
export const isBeastAppearance=id=>sharedAppearance(id)?.form==='beast';
export const canFlyAs=(userId,id)=>isJevicaOwner(userId)&&sharedAppearance(id)?.character==='jevica';
export const canUseAppearance=(userId,id)=>{
  const appearance=sharedAppearance(id);
  return Boolean(appearance) && (appearance.character!=='jevica' || isJevicaOwner(userId));
};
export const defaultAppearanceFor=userId=>isJevicaOwner(userId)?DEFAULT_SHARED_APPEARANCE:DEFAULT_GUEST_APPEARANCE;
export const permittedAppearance=(userId,id)=>canUseAppearance(userId,id)?sharedAppearance(id).id:defaultAppearanceFor(userId);

// The one appearance for a character in a style and form. A missing or unknown
// style falls back to the character's first, so switching person keeps form.
export function appearanceFor(characterId,{variant,form='human'}={}){
  const character=characterById.get(characterId);
  if(!character)return null;
  const style=character.variants.some(item=>item.id===variant)?variant:character.variants[0].id;
  const wanted=FORMS.includes(form)?form:'human';
  return SHARED_APPEARANCES.find(appearance=>appearance.character===character.id&&appearance.variant===style&&appearance.form===wanted)??null;
}
