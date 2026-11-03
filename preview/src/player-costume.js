import { createJevicaCostume } from './jevica-costume.js';

// Jevica retains her authored costume; other playable looks use romance-look.
export function createPlayerCostume(avatar, form) {
  if (form !== 'jevica') throw new Error(`Unknown playable form: ${form}`);
  // Its material edits go beneath any realism tier the avatar already wears.
  return avatar.beneathRealism ? avatar.beneathRealism(() => createJevicaCostume(avatar)) : createJevicaCostume(avatar);
}
