// Math.hypot is not required to be correctly rounded, and engines disagree in the last bit:
// V8 (the authoritative Node town, Chromium) and JavaScriptCore (Safari) can return lengths one
// unit in the last place apart. Room planning compares near-equal lengths, so that bit chose a
// different bay for six shops in Safari than on the server. This is V8's algorithm (scale by the
// larger magnitude, Kahan-sum the squares, square root, rescale) in operations IEEE 754 rounds
// exactly, so every engine returns the server's value bit for bit.
export function stableHypot(x, y) {
  const a = Math.abs(x), b = Math.abs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  const max = Math.max(a, b);
  if (max === 0) return 0;
  let sum = 0, compensation = 0;
  for (const value of [a, b]) {
    const n = value / max, summand = n * n - compensation, preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return Math.sqrt(sum) * max;
}
