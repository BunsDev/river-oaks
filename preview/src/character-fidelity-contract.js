import {CHARACTER_ASSETS} from './character-assets.js';

const freeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); };
const rigs = ['man-realistic-casual','woman-realistic-tailored'];
const contracts = freeze(Object.fromEntries(rigs.map(rig => [rig, {
  version:1, rig, asset:{...CHARACTER_ASSETS[rig]}, family:'makehuman-game-v1', joints:53, targetHeightM:rig.startsWith('woman')?1.66:1.78,
  skin:'base-color + regional roughness + procedural pore normal + diffuse wrap',
  eyes:'separate skinned iris and specular cornea', hair:'alpha cards',
  brows:true, lashes:true, blinks:['eyeBlinkLeft','eyeBlinkRight'],
  expressions:['neutral','smile','browRaise'], expressionTargets:{neutral:[],smile:['mouthSmileLeft','mouthSmileRight'],browRaise:['browInnerUp']},
  visemes:'sil PP FF TH DD kk CH SS nn RR aa E I O U'.split(' ').map(name => `viseme_${name}`),
  speechRuntime:false, // Exported visemes require a native binding; donor-based speech is not integrated.
  qualityTiers:['low','standard','high'], diagnosticTiers:['off'], geometricLod:false,
  clothing:'authored-bundle', hairEditing:false, bodyEditing:false, clothSimulation:false,
  faceBones:false, arbitraryAttachments:false,
}])));
export const isRealisticHumanRig = rig => Object.hasOwn(contracts, rig);
export const characterFidelityContract = rig => isRealisticHumanRig(rig) ? contracts[rig] : null;
