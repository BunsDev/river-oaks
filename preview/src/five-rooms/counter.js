// The Counter (#839): a gelato-counter bay. Roof form: an upswept pink boomerang canopy across
// the whole frontage. Entrance: square pink-lit jambs. Glazing: a low horizontal serving band
// over an ivory plinth, wide panes, with a pink bullnose ledge along it.
import { boomerangGeometry } from '../jet-age-forms.js';
import { FRONT, doorJambs, frontageFrame, glazingRuns, interiorEnvelope, panes, rodX, signAndPorch, slab } from './shells.js';

export const COUNTER_FORM = Object.freeze({ roof: 'boomerang canopy', entrance: 'square lit jambs', glazing: 'low serving band' });

export function buildCounter(kit, frame) {
  kit.begin(frame.venue, frame, COUNTER_FORM);
  interiorEnvelope(kit, frame);
  frontageFrame(kit, frame);
  const { clear } = frame, sill = 0.9, head = 2.7;
  for (const run of glazingRuns(frame)) {
    kit.add('ivory', slab(run[0], run[1], 0, sill, FRONT.glass, FRONT.glass + 0.2));
    kit.add('ivory', slab(run[0], run[1], head, clear, FRONT.glass, FRONT.glass + 0.12));
    const glass = panes(run, 2.4);
    for (const [a, b] of glass) kit.add('glass', slab(a, b, sill, head, FRONT.glass, FRONT.glass + 0.02));
    for (const [, b] of glass.slice(0, -1)) kit.add('chrome', slab(b - 0.03, b + 0.03, sill, head, FRONT.glass, FRONT.glass + 0.08));
    kit.add('pink', rodX(run[0], run[1], sill + 0.04, FRONT.glass + 0.26, 0.07));
  }
  doorJambs(kit, frame);
  // The canopy springs from the fascia's foot and lifts toward the street.
  const width = frame.x1 - frame.x0 - 1.2, canopy = boomerangGeometry({ depth: FRONT.reach - FRONT.frame - 0.06, rise: 0.32, root: 0.16, tip: 0.05 }, width);
  // boomerang: x out from the wall, y up, extruded along z; turn it so x runs along +z.
  canopy.rotateY(-Math.PI / 2);
  canopy.translate((frame.x0 + frame.x1) / 2, clear - 0.18, FRONT.frame);
  kit.add('pink', canopy);
  signAndPorch(kit, frame, { sign: 'ivory' });
}
