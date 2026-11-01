// The Shade Garden (#839): an open court inside its mapped building (decision 6 pending). Roof
// form: no ceiling; pink parabolic ribs span the court like a pergola. Entrance: a lit jet-bridge
// hoop. Glazing: none; a low ivory garden wall with a chrome trellis of upright bars above it.
import { archGeometry, hoopGeometry } from '../jet-age-forms.js';
import { FRONT, frontageFrame, glazingRuns, interiorEnvelope, rodX, rodY, signAndPorch, slab, placeLocal } from './shells.js';

export const SHADE_GARDEN_FORM = Object.freeze({ roof: 'open pergola ribs', entrance: 'lit hoop gateway', glazing: 'garden wall and trellis' });

export function buildShadeGarden(kit, frame) {
  kit.begin(frame.venue, frame, SHADE_GARDEN_FORM);
  interiorEnvelope(kit, frame, { ceiling: false });
  frontageFrame(kit, frame, { fascia: 'pink' });
  const { clear, interior } = frame, wall = 0.9;
  for (const run of glazingRuns(frame, 0.4)) {
    kit.add('ivory', slab(run[0], run[1], 0, wall, FRONT.glass, FRONT.glass + 0.24));
    kit.add('ink', rodX(run[0], run[1], clear - 0.15, FRONT.glass + 0.12, 0.035));
    const count = Math.max(1, Math.round((run[1] - run[0]) / 0.5));
    for (let i = 1; i < count; i++) kit.add('chrome', rodY(run[0] + (run[1] - run[0]) * i / count, FRONT.glass + 0.12, wall, clear - 0.15, 0.025, 6));
  }
  // The gateway hoop: legs just outside the door width, standing on the threshold.
  kit.add('glow-usable', placeLocal(hoopGeometry({ width: frame.door + 0.5, legHeight: 2.75, crownRise: 0.6, segments: 14 }, 0.07, 8), 0, 0, FRONT.frame + 0.12));
  // Pergola ribs across the court, from wall to wall at even stations through its depth.
  if (interior) {
    const xs = interior.map(p => p[0]), zs = interior.map(p => p[2]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const ribs = Math.max(2, Math.round((z1 - z0) / 2.2));
    for (let i = 0; i < ribs; i++) {
      const z = z0 + (z1 - z0) * (i + 0.5) / ribs;
      kit.add('pink', placeLocal(archGeometry({ span: x1 - x0 - 0.2, spring: 0, crown: clear - 0.1, segments: 18 }, 0.07, 8), (x0 + x1) / 2, 0, z));
    }
  }
  signAndPorch(kit, frame, { sign: 'ivory' });
}
