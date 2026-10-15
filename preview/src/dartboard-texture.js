// The dartboard's face, painted from the rules' own geometry (darts-rules.js scoreAt):
// one RGBA pixel of a `w` × `h` image of a board `radius` mm across from its centre.
// Shared by the plaza board and the IPIC Tuck Room cabinet.
import { scoreAt } from './darts-rules.js';

const DARK = [20, 18, 13, 10, 2, 3, 7, 8, 14, 12];
export function dartboardPixel(px, py, w, h, radius = 225.5) {
  const mx = ((px + 0.5) / w * 2 - 1) * radius, my = ((py + 0.5) / h * 2 - 1) * radius, hit = scoreAt([mx, my]), dist = Math.hypot(mx, my);
  if (dist > 170) return dist > radius ? [0, 0, 0, 0] : [24, 22, 21, 255];
  if (hit.number === 25) return hit.value === 50 ? [176, 32, 38, 255] : [32, 120, 64, 255];
  const dark = DARK.includes(hit.number);
  if (hit.multiplier === 1) return dark ? [28, 26, 24, 255] : [236, 222, 190, 255];
  return dark ? [176, 32, 38, 255] : [32, 120, 64, 255];
}
