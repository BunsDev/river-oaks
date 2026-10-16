import {SHARED_APPEARANCES} from '../src/shared-appearances.js';
import {traversalForAppearance} from '../src/beast-traversal.js';

// Exercise the shipped bundles, including restricted Jevica rendering in the
// isolated model fixture. This grants no account permission or editable slot.
export function characterWardrobeMatrix() {
  return SHARED_APPEARANCES.flatMap(look => {
    const traversal = traversalForAppearance(look.id);
    if (look.form === 'beast' && !traversal) throw new Error(`Missing beast traversal: ${look.id}`);
    return ['idle', 'walk', 'run', 'sit', 'wave', ...(look.form === 'beast' ? ['prowl', 'lope'] : [])].map(pose => {
      const beast = pose === 'prowl' || pose === 'lope';
      const speed = beast ? (pose === 'lope' ? traversal.sprint : traversal.walk) : pose === 'walk' ? 1.4 : pose === 'run' ? 3.4 : 0;
      return {appearanceId: look.id, rig: look.rig ?? look.id, character: look.character, variant: look.variant,
        form: look.form, costume: look.costume ?? null, pose, beast, speed,
        // Uneven intervals avoid repeatedly sampling a gait at the same phase.
        // Four phases across 0.62 s after 2.4 s warmup. This is sampled motion,
        // not a continuous collision proof or an assumption about gait period.
        frames: speed ? [144, 151, 163, 181] : [144]};
    });
  });
}
export const CHARACTER_WARDROBE_EXCLUSIONS = Object.freeze([
  {id: 'independent-wings', reason: 'No editable wing attachment is supported by the Character Studio catalog.'},
  {id: 'independent-armor', reason: 'No editable armor combination is supported by the Character Studio catalog.'},
  {id: 'arbitrary-morph-or-hair-mesh', reason: 'Only the existing authored bundles and validated color controls are exposed.'},
]);
