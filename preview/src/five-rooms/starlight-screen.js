// The Starlight Screen (#839): the cinema bay, the only deep one. Roof form: a capsule marquee
// over the door with a chrome starburst finial; its middle band is the landmark pink light at
// night. Entrance: a pink parabolic arch with lit jambs. Glazing: none; a closed ivory frontage
// carrying two ink poster frames.
import * as THREE from 'three';
import { stadiumOutline } from '../../../shared/city-kit/jet-age-forms.js';
import { archGeometry, starburstGeometry } from '../jet-age-forms.js';
import { FRONT, doorJambs, framePlate, frontageFrame, glazingRuns, interiorEnvelope, planPrism, signAndPorch, slab, placeLocal } from './shells.js';

export const STARLIGHT_FORM = Object.freeze({ roof: 'capsule marquee and starburst', entrance: 'parabolic arch', glazing: 'closed with poster frames' });

export function buildStarlightScreen(kit, frame) {
  kit.begin(frame.venue, frame, STARLIGHT_FORM);
  interiorEnvelope(kit, frame);
  frontageFrame(kit, frame, { fascia: 'pink' });
  const { clear } = frame;
  for (const run of glazingRuns(frame, 0.75)) {
    // 4 cm proud of the glazing line: the IPIC block's grey-stone facade stands ~5 cm behind it,
    // too close for the depth buffer (#841 depth journey under pink).
    kit.add('ivory', slab(run[0], run[1], 0, clear, FRONT.glass + 0.04, FRONT.glass + 0.14));
    const mid = (run[0] + run[1]) / 2;
    if (run[1] - run[0] < 1.4) continue;
    kit.add('ink', slab(mid - 0.48, mid + 0.48, 0.82, 2.38, FRONT.glass + 0.14, FRONT.glass + 0.21));
    kit.add('chrome', framePlate(mid, 1.6, 1.16, 1.76, 0.08, FRONT.glass + 0.14, FRONT.glass + 0.3));
  }
  doorJambs(kit, frame);
  // The arch stands just in front of the jambs; spanning twice the door, it clears the door zone to 2.6 m.
  kit.add('pink', placeLocal(archGeometry({ span: frame.door * 2, spring: 0, crown: clear - 0.1, segments: 24 }, 0.08, 8), 0, 0, FRONT.frame + 0.1));
  // The marquee: three stacked capsule slabs (ivory, lit pink, ivory), so no face doubles another.
  const plan = stadiumOutline(6, FRONT.reach - FRONT.frame, 8).map(([x, z]) => [x, z + (FRONT.reach + FRONT.frame) / 2]);
  const base = clear + SHELL_GAP;
  kit.add('ivory', planPrism(plan, base, base + 0.3));
  kit.add('glow-landmark', planPrism(plan, base + 0.3, base + 0.75));
  kit.add('ivory', planPrism(plan, base + 0.75, base + 1.05));
  const burst = starburstGeometry({ length: 0.3 });
  kit.add('chrome', placeLocal(burst, 0, base + 1.05 + 0.5, (FRONT.reach + FRONT.frame) / 2));
  kit.add('chrome', placeLocal(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 8), 0, base + 1.05 + 0.25, (FRONT.reach + FRONT.frame) / 2));
  signAndPorch(kit, frame, { sign: 'ivory' });
}

const SHELL_GAP = 0.65;
