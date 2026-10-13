// Mulberry32: a small, well-mixed generator, so a seed always deals the same cards
// or tiles. Table games keep their seed, so a hand replays exactly from it.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A Fisher–Yates shuffle of a copy, driven by the seed.
export function shuffled(items, seed) {
  const next = seededRandom(seed), copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
