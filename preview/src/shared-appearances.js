import { JEVICA_ACCOUNT_IDS, isJevicaAccount } from './jevica-accounts.js';
// IDs are stored in account checkpoints and sent across the shared-world
// protocol. Keep them stable even when an appearance uses another shipped rig.
//
// A playable character is a person type with one or more styles (variants).
// Each human character and wardrobe style has one stable appearance ID.
export const FORMS = ['human'];
export const MOVEMENTS = ['upright'];
// The shared town accepts one appearance change per account in this interval.
export const APPEARANCE_COOLDOWN_MS = 2000;

export const CHARACTERS = [
  {id:'jevica',name:'Jevica',title:'Rose enchantress',species:'Human',accent:'#d784a6',variants:[{id:'signature',label:'Rose silk'}]},
  {id:'sable',name:'Sable',title:'City storyteller',species:'Human',accent:'#bd825b',variants:[{id:'signature',label:'Ivory city dress'}]},
  {id:'rowan',name:'Rowan',title:'City wanderer',species:'Human',accent:'#807a78',variants:[{id:'signature',label:'Field jacket'}]},
  {id:'vesper',name:'Vesper',title:'Velvet confidante',species:'Human',accent:'#693042',variants:[{id:'signature',label:'Wine velvet'}]},
  {id:'aurel',name:'Aurel',title:'Midnight host',species:'Human',accent:'#5d4b4a',variants:[{id:'signature',label:'Black brocade'}]},
  {id:'lyra',name:'Lyra',title:'Velvet muse',species:'Human',accent:'#986879',variants:[{id:'signature',label:'Mauve velvet'}]},
  {id:'kai',name:'Kai',title:'Starlight maker',species:'Human',accent:'#c2aa80',variants:[{id:'formal',label:'Celestial formal',short:'Formal'},{id:'explorer',label:'Explorer casual',short:'Explorer'},{id:'noir',label:'Starlit noir',short:'Noir'}]},
  {id:'silvan',name:'Silvan',title:'Forest aristocrat',species:'Human',accent:'#6f7748',variants:[{id:'masculine',label:'Masculine',short:'Masculine'},{id:'feminine',label:'Feminine',short:'Feminine'}]},
];
const characterById=new Map(CHARACTERS.map(character=>[character.id,character]));

// Label and role are derived so the picker, the panel and the catalog agree.
function entry(fields){
  const character=characterById.get(fields.character),variant=character.variants.find(item=>item.id===fields.variant);
  const style=character.variants.length>1?` · ${variant.label.toLowerCase()}`:'';
  const form='human';
  return {
    name:character.name,accent:character.accent,
    label:`${character.name} · ${character.title.toLowerCase()}${style} · ${form}`,
    role:`${character.title}${style} · human`,
    ...fields,
  };
}

export const SHARED_APPEARANCES = [
  entry({id:'jevica',character:'jevica',variant:'signature',form:'human',kind:'human',costume:'jevica',portrait:'/assets/characters/jevica-portrait.png',description:'A playful romantic with rose silk, a quick laugh, and a gift for making a stranger feel welcome.'}),
  entry({id:'sable-human',character:'sable',variant:'signature',form:'human',rig:'jevica',kind:'human',description:'Sable wears long ash-blonde waves, an ivory city dress with a gold collar chain, sandals, and a shoulder bag full of better stories than the one she tells first.'}),
  entry({id:'rowan-human',character:'rowan',variant:'signature',form:'human',rig:'man-tailored',kind:'human',description:'Rowan wears silver-grey hair, a dark jacket and collar, weathered boots, and a leather satchel. Gentle, loyal, and happiest under city lights.'}),
  entry({id:'woman-tailored',character:'vesper',variant:'signature',form:'human',rig:'jevica',kind:'human',reference:'/assets/characters/references/vesper-velvet-turnaround.png',portraitLeft:'-190px',description:'An elegant night owl with dark waves, wine velvet, gold jewelry, and a dry sense of humor. She remembers your favorite song and makes every rooftop feel like a secret.'}),
  entry({id:'man-tailored',character:'aurel',variant:'signature',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/aurel-human.png',portraitStyle:'tall',portraitLeft:'-58px',description:'The human midnight host: tousled dark hair, a charcoal brocade waistcoat, long black coat, layered silver jewelry, and an easy, mysterious smile. He knows every gallery opening and always saves the last dance.'}),
  entry({id:'lyra-human',character:'lyra',variant:'signature',form:'human',rig:'jevica',kind:'human',portrait:'/assets/characters/references/lyra-human.png',reference:'/assets/characters/references/lyra-human.png',description:'Lyra wears long chestnut waves, a draped mauve velvet dress with a sheer spotted train, a gold pendant, a chain-strap bag and rose ankle boots.'}),
  entry({id:'man-workwear',character:'kai',variant:'formal',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/kai-three-celestial-styles.png',portraitStyle:'collage',portraitLeft:'-26px',description:'Celestial formal Kai wears an ivory long coat and trousers over a midnight waistcoat, with fine gold star embroidery, a star pendant, and tousled light brown hair.'}),
  entry({id:'kai-explorer',character:'kai',variant:'explorer',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/kai-three-celestial-styles.png',portraitStyle:'collage',portraitLeft:'-132px',description:'Explorer Kai wears a rolled-sleeve navy shirt with tiny gold constellations, sand cargo trousers, rugged black boots, and a worn leather crossbody satchel.'}),
  entry({id:'kai-noir',character:'kai',variant:'noir',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/kai-three-celestial-styles.png',portraitStyle:'collage',portraitLeft:'-234px',description:'Starlit noir Kai wears a long black coat, layered dark tailoring, glinting gold constellations and crescent motifs, a star pendant, and sleek black boots.'}),
  entry({id:'forest-aristocrat',character:'silvan',variant:'masculine',form:'human',rig:'man-casual',kind:'human',reference:'/assets/characters/references/forest-aristocrat-masculine.png',portraitLeft:'-200px',description:'A woodland noble come to town: an antler-twig crown woven with leaves and white blossoms, long vine-laced hair, an open ivory tunic over an olive panel, a gold-leaf sash with hanging leaf chains, vine-wrapped bracers, and tall vine-bound boots.'}),
  entry({id:'forest-aristocrat-feminine',character:'silvan',variant:'feminine',form:'human',rig:'jevica',kind:'human',reference:'/assets/characters/references/forest-aristocrat-feminine.png',portraitLeft:'-200px',description:'The feminine forest aristocrat: an antler-twig crown with leaves and white blossoms, long waves threaded with vines, a draped ivory wrap over an olive panel, a gold-leaf sash and chains, vines climbing bare arms, and tall vine-bound block-heel boots.'}),
];

// Read compatibility only: retired saved identities retain their human character/style.
export const LEGACY_APPEARANCES = {'jevica-beast': 'jevica', 'woman-casual': 'sable-human', 'man-casual': 'rowan-human', 'vesper-beast': 'woman-tailored', 'midnight-host-wolf': 'man-tailored', 'woman-daywear': 'lyra-human', 'kai-formal-beast': 'man-workwear', 'kai-explorer-beast': 'kai-explorer', 'kai-noir-beast': 'kai-noir', 'forest-aristocrat-beast': 'forest-aristocrat', 'forest-aristocrat-feminine-beast': 'forest-aristocrat-feminine', 'midnight-host-hybrid': 'man-tailored'};

export const DEFAULT_SHARED_APPEARANCE='jevica';
export const DEFAULT_GUEST_APPEARANCE='sable-human';
export const JEVICA_OWNER_USER_IDS=JEVICA_ACCOUNT_IDS;
export const isJevicaOwner=isJevicaAccount;
const appearanceById=new Map(SHARED_APPEARANCES.map(appearance=>[appearance.id,appearance]));
export const sharedAppearance=id=>appearanceById.get(id)??(Object.hasOwn(LEGACY_APPEARANCES,id)?appearanceById.get(LEGACY_APPEARANCES[id]):null)??null;
export const sharedCharacter=id=>characterById.get(id)??null;
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
