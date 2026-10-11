import * as THREE from 'three';

// Authored from the Kettering Dr Street View reference (Jun 2024), not sampled
// imagery. Rectangular granite pavers run in continuous courses parallel to the
// curb (texture x = u along the street, y = v across it). Each course is
// 0.125 m wide; paver lengths are 0.375-0.5625 m in 1/16 m steps and every
// course sums to exactly 4 m, so the tile wraps. End joints are staggered at
// irregular per-course offsets. These are design dimensions, not a survey.
export const PAVER_TILE = 4;
const SIZE = 1024; // 3.9 mm per texel
const PX_PER_M = SIZE / PAVER_TILE;
const UNIT = 16; // texels per 1/16 m length step
const COURSE = 32; // texels per 0.125 m course
const COURSES = SIZE / COURSE;
const UNITS = SIZE / UNIT; // 64 length steps per course
const LENGTHS = [6, 7, 8, 8, 9, 9]; // in 1/16 m: 0.375-0.5625 m, weighted toward 0.5 m+
const MIN_STAGGER = 2; // end joints in neighbouring courses stay >= 12.5 cm apart

// Area shares from the reference. Terracotta is placed as runs, the rest by quota.
export const PAVER_PALETTE = {
  granite: { share: .38, base: [198, 196, 191], fleck: [[44, 44, 46], [128, 127, 125]], fleckRate: [.06, .13] },
  gray: { share: .23, base: [148, 147, 144], fleck: [[52, 52, 54], [196, 195, 192]], fleckRate: [.07, .07] },
  charcoal: { share: .18, base: [84, 87, 93], fleck: [[40, 42, 46], [150, 152, 156]], fleckRate: [.08, .05] },
  beige: { share: .14, base: [178, 166, 148], fleck: [[108, 94, 78], [210, 202, 188]], fleckRate: [.07, .06] },
  terracotta: { share: .07, base: [146, 80, 68], fleck: [[100, 52, 46], [176, 118, 102]], fleckRate: [.05, .04] },
};
export const PAVER_JOINT_COLOR = [176, 170, 156];
const JOINT = PAVER_JOINT_COLOR;

const hash = (x, y, seed = 0) => {
  let n = Math.imul(x + 17 + Math.imul(seed, 1013), 374761393) ^ Math.imul(y + 31 + Math.imul(seed, 7919), 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// Periodic value noise on a precomputed lattice that wraps with the tile.
function noiseField(cell, seed) {
  const period = SIZE / cell, lattice = new Float32Array(period * period);
  for (let j = 0; j < period; j++) for (let k = 0; k < period; k++) lattice[j * period + k] = hash(k, j, seed) - .5;
  const ease = new Float32Array(cell);
  for (let t = 0; t < cell; t++) { const f = t / cell; ease[t] = f * f * (3 - 2 * f); }
  return (x, y) => {
    const ix = (x / cell) | 0, iy = (y / cell) | 0, tx = ease[x - ix * cell], ty = ease[y - iy * cell];
    const x1 = (ix + 1) % period, r0 = iy * period, r1 = ((iy + 1) % period) * period;
    const top = lattice[r0 + ix] + (lattice[r0 + x1] - lattice[r0 + ix]) * tx;
    const bottom = lattice[r1 + ix] + (lattice[r1 + x1] - lattice[r1 + ix]) * tx;
    return top + (bottom - top) * ty;
  };
}

function courseEnds(course) {
  return new Set(course.pavers.map(p => (p.start + course.offset) % UNITS));
}

// Deterministic course/paver layout in 1/16 m units. Exported for tests and tooling.
export function createPaverLayout() {
  const courses = [];
  for (let c = 0; c < COURSES; c++) {
    let course;
    for (let salt = 0; salt < 64; salt++) {
      const lengths = [];
      let left = UNITS, k = 0;
      while (left > 0) {
        if (left <= 9) { lengths.push(left); break; }
        if (left <= 18) { const a = left >> 1; lengths.push(a, left - a); break; }
        // Near the end, leave 12-18 units so the last two pavers stay 6-9 long.
        let len = LENGTHS[Math.floor(hash(c, k++, 11 + salt) * LENGTHS.length)];
        if (left <= 27) len = Math.max(6, left - 18, Math.min(9, left - 12, len));
        lengths.push(len); left -= len;
      }
      let start = 0;
      const pavers = lengths.map(length => { const p = { start, length }; start += length; return p; });
      const offset = Math.floor(hash(c, 3, 97 + salt) * UNITS);
      course = { index: c, offset, pavers };
      const ends = courseEnds(course);
      const neighbours = [courses[c - 1], c === COURSES - 1 ? courses[0] : null].filter(Boolean);
      const clash = neighbours.some(n => [...courseEnds(n)].some(e => [...ends].some(f => {
        const d = Math.abs(e - f); return Math.min(d, UNITS - d) < MIN_STAGGER;
      })));
      if (!clash) break;
    }
    courses.push(course);
  }
  // Terracotta: sparse runs of 2-4 consecutive pavers in one course, never in
  // neighbouring courses (including across the tile wrap).
  const target = PAVER_PALETTE.terracotta.share * UNITS * COURSES;
  let red = 0;
  const used = new Set();
  for (let attempt = 0; red < target * .92 && attempt < 400; attempt++) {
    const c = Math.floor(hash(attempt, 5, 211) * COURSES);
    // Keep at least two plain courses between red runs (wrap-aware).
    if ([...used].some(u => { const d = Math.abs(u - c); return Math.min(d, COURSES - d) < 3; })) continue;
    const course = courses[c];
    const run = Math.min(2 + Math.floor(hash(attempt, 6, 211) * 3), course.pavers.length - 1);
    const first = Math.floor(hash(attempt, 7, 211) * course.pavers.length);
    for (let k = 0; k < run; k++) {
      const p = course.pavers[(first + k) % course.pavers.length];
      p.kind = 'terracotta'; red += p.length;
    }
    used.add(c);
  }
  // Remaining kinds by area quota, visiting pavers in hashed order and
  // avoiding a repeat of the kind already laid next to it in the course.
  const rest = courses.flatMap(course => course.pavers.map((p, i) => ({ p, course, i, key: hash(course.index, p.start, 401) })).filter(e => !e.p.kind));
  rest.sort((a, b) => a.key - b.key);
  const kinds = ['granite', 'gray', 'charcoal', 'beige'];
  const restShare = kinds.reduce((sum, k) => sum + PAVER_PALETTE[k].share, 0);
  const restArea = UNITS * COURSES - red;
  const quota = kinds.map(k => PAVER_PALETTE[k].share / restShare * restArea);
  const filled = kinds.map(() => 0);
  for (const { p, course, i, key } of rest) {
    const n = course.pavers.length, beside = [course.pavers[(i + 1) % n].kind, course.pavers[(i + n - 1) % n].kind];
    const weight = kinds.map((k, j) => Math.max(0, quota[j] - filled[j]) * (beside.includes(k) ? .15 : 1));
    let pick = (key * 7919 % 1) * weight.reduce((a, w) => a + w, 0), best = 0;
    while (best < kinds.length - 1 && pick >= weight[best]) pick -= weight[best++];
    p.kind = kinds[best]; filled[best] += p.length;
  }
  for (const course of courses) course.pavers.forEach((p, i) => {
    p.tone = (hash(course.index, i, 503) - .5) * .14; // per-paver brightness
    p.wear = hash(course.index, i, 601);
  });
  return { size: SIZE, tile: PAVER_TILE, unit: UNIT, course: COURSE, courses };
}

export function createPaverTextures(anisotropy = 4) {
  const layout = createPaverLayout();
  const color = new Uint8Array(SIZE * SIZE * 4), arm = new Uint8Array(color.length);
  const normal = new Uint8Array(color.length), heights = new Float32Array(SIZE * SIZE);
  // Per-course lookup: texel x -> paver and its local start texel.
  const owner = layout.courses.map(course => {
    const map = new Int16Array(SIZE), start = new Int16Array(SIZE);
    course.pavers.forEach((p, i) => {
      for (let t = 0; t < p.length * UNIT; t++) {
        const x = ((p.start + course.offset) * UNIT + t) % SIZE;
        map[x] = i; start[x] = t;
      }
    });
    return { map, start };
  });
  const mottleNoise = noiseField(32, 13), fineNoise = noiseField(4, 29), scuffNoise = noiseField(8, 71);
  for (let y = 0; y < SIZE; y++) {
    const c = Math.floor(y / COURSE), v = y % COURSE, course = layout.courses[c], lookup = owner[c];
    for (let x = 0; x < SIZE; x++) {
      const pi = lookup.map[x], p = course.pavers[pi], u = lookup.start[x], len = p.length * UNIT;
      const i = (y * SIZE + x) * 4, h = y * SIZE + x;
      // 1-texel (~4 mm) joint on the trailing edge of each paver and course.
      const edge = Math.min(u, len - 1 - u, v, COURSE - 1 - v);
      const joint = u === len - 1 || v === COURSE - 1;
      const fleck = hash(x, y, 7), grain = fleck * 4093 % 1; // one hash per texel
      if (joint) {
        const sand = (grain - .5) * 14;
        color[i] = JOINT[0] + sand; color[i + 1] = JOINT[1] + sand; color[i + 2] = JOINT[2] + sand; color[i + 3] = 255;
        arm[i] = 165; arm[i + 1] = 250; arm[i + 2] = 0; arm[i + 3] = 255;
        heights[h] = 0;
        continue;
      }
      const spec = PAVER_PALETTE[p.kind];
      const bevel = Math.min(1, edge / 2.2); // ~8 mm eased edge
      const mottle = mottleNoise(x, y);
      const fine = fineNoise(x, y);
      let r = spec.base[0], g = spec.base[1], b = spec.base[2];
      const shade = 1 + p.tone + mottle * .08 + fine * .06;
      r *= shade; g *= shade; b *= shade;
      // Salt-and-pepper flecks: dark crystals and lighter mica/quartz.
      let relief = 0;
      if (fleck < spec.fleckRate[0]) { const f = spec.fleck[0], m = .55 + grain * .35; r += (f[0] - r) * m; g += (f[1] - g) * m; b += (f[2] - b) * m; relief = -1; }
      else if (fleck > 1 - spec.fleckRate[1]) { const f = spec.fleck[1], m = .4 + grain * .4; r += (f[0] - r) * m; g += (f[1] - g) * m; b += (f[2] - b) * m; relief = 1; }
      // Weathering: scuffed lighter patches on dark stone, grime toward the edges.
      const scuff = scuffNoise(x, y) + .5;
      if ((p.kind === 'charcoal' || p.kind === 'gray') && p.wear > .35 && scuff > .62) {
        const s = (scuff - .62) * 1.4 * p.wear; r += 40 * s; g += 40 * s; b += 38 * s;
      }
      const grime = (1 - bevel) * 12;
      r -= grime; g -= grime; b -= grime * .9;
      color[i] = Math.max(0, Math.min(255, r)); color[i + 1] = Math.max(0, Math.min(255, g));
      color[i + 2] = Math.max(0, Math.min(255, b)); color[i + 3] = 255;
      arm[i] = 235 + bevel * 20; // ambient occlusion eases off the chamfer
      arm[i + 1] = 214 + p.wear * 18 + mottle * 20 - (relief > 0 ? 12 : 0); // matte, sparkle slightly smoother
      arm[i + 2] = 0; arm[i + 3] = 255;
      heights[h] = .002 * (1 - (1 - bevel) * (1 - bevel)) + relief * .00012 + fine * .0002;
    }
  }
  const inv = 1 / (2 / PX_PER_M), mask = SIZE - 1;
  for (let y = 0; y < SIZE; y++) {
    const up = ((y + 1) & mask) * SIZE, down = ((y - 1) & mask) * SIZE, row = y * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const dx = (heights[row + ((x + 1) & mask)] - heights[row + ((x - 1) & mask)]) * inv;
      const dy = (heights[up + x] - heights[down + x]) * inv;
      const scale = 127 / Math.sqrt(dx * dx + dy * dy + 1), i = (row + x) * 4;
      normal[i] = 128 - dx * scale; normal[i + 1] = 128 - dy * scale; normal[i + 2] = 128 + scale; normal[i + 3] = 255;
    }
  }
  const make = (data, srgb = false) => {
    const map = new THREE.DataTexture(data, SIZE, SIZE);
    map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = anisotropy; map.needsUpdate = true;
    return map;
  };
  return { color: make(color, true), normal: make(normal), arm: make(arm) };
}
