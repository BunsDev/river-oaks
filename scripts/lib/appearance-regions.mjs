// Region measures for matched character captures (#517 default-appearance
// trial). A region is the set of 8x8 cells a part of the figure covers, with the
// mean sRGB colour of its pixels; see regionStats in the fidelity fixture.

// sRGB 8-bit -> CIELAB (D65), so a palette shift is judged roughly as seen.
export function srgbToLab([r, g, b]) {
  const linear = value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const [lr, lg, lb] = [r, g, b].map(linear);
  const xyz = [(lr * .4124564 + lg * .3575761 + lb * .1804375) / .95047, lr * .2126729 + lg * .7151522 + lb * .072175,
    (lr * .0193339 + lg * .119192 + lb * .9503041) / 1.08883];
  const f = t => t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hue = ([, a, b]) => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

// Intersection over union of two bit-packed cell masks of the same size.
export function maskOverlap(a, b) {
  if (a.columns !== b.columns || a.rows !== b.rows) throw new Error('Mask sizes differ');
  const x = Buffer.from(a.bits, 'base64'), y = Buffer.from(b.bits, 'base64');
  let both = 0, either = 0;
  for (let i = 0; i < x.length; i++) {
    const and = x[i] & y[i], or = x[i] | y[i];
    for (let bit = 0; bit < 8; bit++) { both += (and >> bit) & 1; either += (or >> bit) & 1; }
  }
  return either ? both / either : 1;
}

// How a region changed from a baseline capture: colour (ΔE, lightness, hue in
// degrees), covered area and silhouette overlap. Null when either is absent.
export function regionChange(base, current) {
  if (!base?.meanSRGB || !current?.meanSRGB) return null;
  const a = srgbToLab(base.meanSRGB), b = srgbToLab(current.meanSRGB);
  return {deltaE: +deltaE(a, b).toFixed(3), lightness: +(b[0] - a[0]).toFixed(3), hueShift: +(((hue(b) - hue(a) + 540) % 360) - 180).toFixed(3),
    areaRatio: +(current.pixels / base.pixels).toFixed(4), overlap: +maskOverlap(base.mask, current.mask).toFixed(4)};
}
