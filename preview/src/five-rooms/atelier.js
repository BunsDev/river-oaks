// The Atelier (#839): a narrow-paned studio-gallery bay. Roof form: a flat pink cantilever with
// rounded corners over the door only. Entrance: a pink-lit stadium (capsule) portal. Glazing:
// full-height slender panes between deep chrome fins, a vertical rhythm. The display frame at
// its contract anchor lights pink at night (a usable thing).
import { FRONT, framePlate, frontageFrame, glazingRuns, interiorEnvelope, panes, plate, roundedPrism, signAndPorch, slab, placeLocal } from './shells.js';

export const ATELIER_FORM = Object.freeze({ roof: 'flat rounded cantilever', entrance: 'lit capsule portal', glazing: 'full-height fins' });

export function buildAtelier(kit, frame) {
  kit.begin(frame.venue, frame, ATELIER_FORM);
  interiorEnvelope(kit, frame);
  frontageFrame(kit, frame);
  const { clear } = frame;
  for (const run of glazingRuns(frame, 0.48)) {
    const glass = panes(run, 0.9);
    for (const [a, b] of glass) kit.add('glass', slab(a, b, 0.05, clear, FRONT.glass, FRONT.glass + 0.02));
    for (const [, b] of glass.slice(0, -1)) kit.add('chrome', slab(b - 0.03, b + 0.03, 0, clear, FRONT.glass, FRONT.frame + 0.12));
  }
  // The capsule portal: a round-headed frame standing on the threshold, its opening the door's
  // width plus a reveal, drawn as one U-shaped outline so the opening stays clear to the floor.
  kit.add('glow-usable', plate(portalOutline(frame.door + 0.2, 3.35, 0.2), FRONT.glass, FRONT.glass + 0.16));
  kit.add('pink', roundedPrism(0, (FRONT.frame + FRONT.reach) / 2 - 0.03, frame.door + 1.8, FRONT.reach - FRONT.frame + 0.06, clear + 0.05, clear + 0.17, 0.3));
  // The display frame stands inside the room: left out with the envelope (index.js `interiors`).
  const display = frame.envelope === false ? null : frame.attachments.get('display-frame');
  if (display) {
    const [x, , z] = frame.toLocal(display.position), geometry = framePlate(0, 1.55, 1.6, 1.1, 0.07, -0.03, 0.03);
    kit.add('glow-usable', placeLocal(geometry, x, 0, z, frame.yawOf(display.yaw)));
  }
  signAndPorch(kit, frame);
}

// A round-headed portal: an opening `w` wide and `h` high (to the crown of its half-round head)
// inside a band `band` wide, as one closed outline from the left foot round to the right foot.
function portalOutline(w, h, band, segments = 12) {
  const head = (r, spring) => Array.from({ length: segments + 1 }, (_, i) => { const a = Math.PI - Math.PI * i / segments; return [r * Math.cos(a), spring + r * Math.sin(a)]; });
  const ri = w / 2, ro = ri + band, spring = h - ri;
  return [[-ro, 0], ...head(ro, spring), [ro, 0], [ri, 0], ...head(ri, spring).reverse(), [-ri, 0]];
}
