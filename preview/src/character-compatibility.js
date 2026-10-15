import { SHARED_APPEARANCES } from './shared-appearances.js';

const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};
// Integrity limits for the shipped MakeHuman game rigs, not device performance
// budgets. Independent morphs, hair meshes and attachments are not editable yet.
const requirements={family:'makehuman-game-v1',jointCount:53,requiredBones:['Root','pelvis','spine_01','spine_02','spine_03','neck_01','head',...['l','r'].flatMap(side=>[...['clavicle','upperarm','lowerarm','hand','thigh','calf','foot','ball'].map(name=>`${name}_${side}`),...['index','middle','pinky','ring','thumb'].flatMap(finger=>['01','02','03'].map(segment=>`${finger}_${segment}_${side}`))])],maxCoordinate:5,height:[1,2.5],maxTextureSize:4096};
export const CHARACTER_RIG_REQUIREMENTS=freeze(Object.fromEntries(['jevica','man-casual','man-tailored'].map(id=>[id,structuredClone(requirements)])));
const looks=freeze(Object.fromEntries(SHARED_APPEARANCES.map(look=>[look.id,{
  appearanceId:look.id,rig:look.rig??look.id,form:look.form,outfit:look.id,
  colors:['sable-human','woman-casual'].includes(look.id),
  hair:'authored-bundle',attachments:'authored-bundle',editableMorphs:[],editableAttachments:[],
}])));
export const characterCompatibility=id=>Object.hasOwn(looks,id)?looks[id]:null;
