import { createJevicaCostume } from './jevica-costume.js';

// Jevica retains her authored costume; other playable looks use romance-look.
export function createPlayerCostume(avatar, form) {
  if (form !== 'jevica') throw new Error(`Unknown playable form: ${form}`);
  return createJevicaCostume(avatar);
}
