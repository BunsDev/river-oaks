// Mixed street planting for the district's lane planters and curb beds.
// The species follow the River Oaks District streetscape in Street View
// (Kettering Drive curb beds, cream lane planters): foxtail fern plumes, a
// lower mounded fern, purple-and-green broadleaf colour, small pink flowers,
// clipped boxwood, ornamental grass and succulents. The forms are authored
// geometry (procedural-plants.js) or the existing CC0 planter models, not
// identified plants at surveyed positions. No rendering imports: tests and
// the builders share one deterministic composition.

export const PLANT_SPECIES = Object.freeze({
  'foxtail-fern': { layer: 'accent', name: "Foxtail fern (Asparagus densiflorus 'Myersii')", height: [0.42, 0.6], hsl: [0.27, 0.66, 0.28] },
  'fountain-grass': { layer: 'accent', name: 'Fountain grass (existing CC0 grass_medium_02)', height: [0.72, 0.9], hsl: [0.2, 0.08, 0.86] },
  agave: { layer: 'accent', name: 'Soft-leaf agave / succulent', height: [0.34, 0.48], hsl: [0.4, 0.2, 0.5] },
  boxwood: { layer: 'mid', name: 'Clipped boxwood (existing CC0 shrub_02)', height: [0.46, 0.52], hsl: [0.25, 0.1, 0.9] },
  'mound-fern': { layer: 'mid', name: "Mounded fern (Asparagus densiflorus 'Sprengeri')", height: [0.26, 0.36], hsl: [0.25, 0.55, 0.37] },
  // Variegated leaves carry their two-tone pattern in vertex colours; the
  // instance colour only shifts it slightly from plant to plant.
  coleus: { layer: 'low', name: 'Coleus', height: [0.3, 0.42], hsl: [0.95, 0.12, 0.9] },
  'persian-shield': { layer: 'low', name: 'Persian shield', height: [0.32, 0.44], hsl: [0.75, 0.12, 0.92] },
  pentas: { layer: 'low', name: 'Pentas (pink flowering accent)', height: [0.26, 0.36], hsl: [0.3, 0.45, 0.3] },
});
export const MODEL_SPECIES = new Set(['boxwood', 'fountain-grass']);
const BY_LAYER = layer => Object.keys(PLANT_SPECIES).filter(id => PLANT_SPECIES[id].layer === layer);
export const ACCENTS = BY_LAYER('accent'), MIDS = BY_LAYER('mid'), LOWS = BY_LAYER('low');

// mulberry32: a small, well-mixed 32-bit generator; identical in node and browsers.
export function plantingRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Decimetre-rounded so the same planter keeps its planting across reloads.
export function seedFromPosition(x, z) {
  let h = Math.imul(Math.round(x * 10), 0x9e3779b1) ^ Math.imul(Math.round(z * 10), 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return (h ^ (h >>> 15)) >>> 0;
}

const jitter = (rand, [h, s, l]) => [h + (rand() - 0.5) * 0.03, Math.max(0, Math.min(1, s + (rand() - 0.5) * 0.12)), Math.max(0, Math.min(1, l + (rand() - 0.5) * 0.08))];

// One plant: species, local position, height, yaw, per-axis spread and colour.
// `reach` caps the plant's horizontal extent from its stem (metres).
export function plantRecord(species, at, rand, reach = Infinity) {
  const { height: [low, high], hsl } = PLANT_SPECIES[species];
  const size = low + rand() * (high - low);
  return { species, layer: PLANT_SPECIES[species].layer, at, size, reach, yaw: rand() * Math.PI * 2,
    spread: 0.88 + rand() * 0.24, color: jitter(rand, hsl), seed: Math.floor(rand() * 4294967296) };
}

// Lane planter shell half-extent (1.5 x 0.62 m). Stems stay inside it and
// foliage may spill at most PLANTER_OVERHANG past the rim, above the pavement.
export const PLANTER_HALF = [0.75, 0.31], PLANTER_OVERHANG = 0.1;
const planterReach = ([a, d]) => Math.min(PLANTER_HALF[0] - Math.abs(a), PLANTER_HALF[1] - Math.abs(d)) + PLANTER_OVERHANG;

// Layered composition: tall accent, mid mound, low colour. Two low species
// alternate on the diagonals so every planter mixes at least four species.
export function composePlanter(seed) {
  const rand = plantingRandom(seed);
  const pick = list => list[Math.floor(rand() * list.length)];
  const accent = pick(ACCENTS), mid = pick(MIDS);
  const lowA = pick(LOWS), lowB = pick(LOWS.filter(id => id !== lowA));
  const recipe = rand() < 0.5 ? 'centre-accent' : 'paired-accents';
  const slots = recipe === 'centre-accent'
    ? [[accent, 0, 0], [mid, -0.36, 0], [mid, 0.36, 0], [lowA, -0.62, -0.12], [lowB, -0.62, 0.12], [lowB, 0.62, -0.12], [lowA, 0.62, 0.12]]
    : [[accent, -0.48, 0], [accent, 0.48, 0], [mid, 0, 0], [lowA, -0.18, -0.15], [lowB, -0.18, 0.15], [lowB, 0.18, -0.15], [lowA, 0.18, 0.15]];
  const plants = slots.map(([species, a, d]) => {
    const at = [a + (rand() - 0.5) * 0.04, d + (rand() - 0.5) * 0.04];
    return plantRecord(species, at, rand, planterReach(at));
  });
  return { seed, recipe, plants };
}

// Each procedural plant becomes instances of a few authored parts. Offsets are
// local to the plant (metres, y up) before the plant's own yaw.
// part: plume | frond | leaf | leaf-shield | leaf-plain | bloom | succulent-leaf
export function expandPlant(plant) {
  const rand = plantingRandom(plant.seed), { size, spread, color } = plant, parts = [];
  const tone = (dl, hsl = color) => [hsl[0], hsl[1], Math.max(0.05, Math.min(0.95, hsl[2] + dl))];
  const push = (part, offset, yaw, pitch, scale, hsl) => parts.push({ part, offset, yaw, pitch, scale, color: hsl });
  if (plant.species === 'foxtail-fern') {
    // Upright bottlebrush plumes from one crown, outer ones leaning out.
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.399963 + rand() * 0.4, r = i === 0 ? 0 : size * spread * (0.06 + rand() * 0.14);
      push('plume', [Math.cos(angle) * r, 0, Math.sin(angle) * r], -angle, i === 0 ? 0.04 : 0.12 + rand() * 0.28,
        [size * (0.85 + rand() * 0.2), size * (0.62 + rand() * 0.38), size * (0.85 + rand() * 0.2)], tone((rand() - 0.5) * 0.08));
    }
  } else if (plant.species === 'mound-fern') {
    // Arching fronds that read as a low rounded mound.
    for (let i = 0; i < 20; i++) {
      const angle = i * 2.399963 + rand() * 0.3, reach = size * spread * (1.0 + rand() * 0.45);
      push('frond', [0, 0, 0], -angle, -0.15 + rand() * 0.45, [reach, size * (0.85 + rand() * 0.3), reach], tone((rand() - 0.5) * 0.09));
    }
  } else if (plant.species === 'agave') {
    // Rosette of thick blue-green leaves, inner ones upright.
    for (let i = 0; i < 14; i++) {
      const inner = i < 5, angle = i * 2.399963;
      push('succulent-leaf', [0, 0, 0], -angle, inner ? 0.2 + rand() * 0.2 : 0.65 + rand() * 0.4,
        [size * 0.9, size * (inner ? 1 : 0.8 + rand() * 0.15), size * 0.9], tone((rand() - 0.5) * 0.06 + (inner ? 0.04 : 0)));
    }
  } else {
    // Broadleaf colour: three tiers of leaves; coleus and pentas carry blooms.
    const leafPart = { coleus: 'leaf', 'persian-shield': 'leaf-shield', pentas: 'leaf-plain' }[plant.species];
    const leaves = plant.species === 'persian-shield' ? 14 : 16;
    for (let i = 0; i < leaves; i++) {
      const tier = i % 4, angle = i * 2.399963 + rand() * 0.3, r = size * 0.06 * tier;
      push(leafPart, [Math.cos(angle) * r, size * (0.06 + tier * 0.2), Math.sin(angle) * r], -angle,
        1.05 - tier * 0.22 + rand() * 0.2, Array(3).fill(size * spread * (0.5 - tier * 0.06)), tone((rand() - 0.5) * 0.08));
    }
    const blooms = plant.species === 'pentas' ? 5 : plant.species === 'coleus' ? (rand() < 0.6 ? 2 : 0) : 0;
    for (let i = 0; i < blooms; i++) {
      const angle = i * 2.399963 + rand(), r = size * (i ? 0.2 + rand() * 0.15 : 0.04);
      push('bloom', [Math.cos(angle) * r, size * (0.88 + rand() * 0.2), Math.sin(angle) * r], rand() * 6.28, 0,
        [0.034, 0.03, 0.034], [0.93 + rand() * 0.05, 0.62 + rand() * 0.2, 0.62 + rand() * 0.14]);
    }
  }
  return parts;
}

// The photographed Kettering Drive curb bed: foxtail ferns dominate the
// middle row, a lower mounded fern and coleus colour edge the curb side.
export function referenceBedKind(index, row, rand) {
  const roll = rand();
  if (row === 0) return roll < 0.72 ? 'foxtail-fern' : 'coleus';
  return index % 2 ? (roll < 0.75 ? 'mound-fern' : 'foxtail-fern') : (roll < 0.8 ? 'coleus' : 'persian-shield');
}
