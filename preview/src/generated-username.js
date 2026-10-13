// A friendly username for someone without a GitHub login (adjective-noun-NN), the
// same for the same seed. Kept free of imports: the access gate offers these before
// sign-in, and the asset gate serves only the access entry's own chunk then, so this
// must stay inlined there rather than land in a chunk shared with game code.
const ADJECTIVES = ['rosy', 'amber', 'velvet', 'misty', 'golden', 'sunlit', 'quiet', 'silver', 'gentle', 'bright', 'dusky', 'merry', 'swift', 'calm', 'coral', 'ivory', 'plum', 'mossy', 'starry', 'breezy'];
const NOUNS = ['heron', 'fox', 'finch', 'otter', 'lark', 'willow', 'magnolia', 'oak', 'robin', 'wren', 'hare', 'sparrow', 'iris', 'lily', 'moth', 'dove', 'birch', 'maple', 'clover', 'fern'];
export function generatedUsername(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  const pick = (list, salt) => list[(hash >>> salt) % list.length];
  return `${pick(ADJECTIVES, 0)}-${pick(NOUNS, 8)}-${10 + ((hash >>> 16) % 90)}`;
}
