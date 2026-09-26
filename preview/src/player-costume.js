import { createJevicaCostume } from './jevica-costume.js';

// The player has one identity; resident and invasion assets remain independent.
export function createPlayerCostume(avatar, form) {
  if (form !== 'jevica') throw new Error(`Unknown playable form: ${form}`);
  return createJevicaCostume(avatar);
}
