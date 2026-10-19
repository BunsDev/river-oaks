// Jevica's penthouse furnishings (#362): the JS master for the office's art and for the asset
// package in assets/office-penthouse/ (scripts/export-office-penthouse.mjs). Every piece is
// original procedural art. No kit art or kit bytes are used: R19 imported only the kit's measured
// desk footprints, as numbers. No imagery is generated or bought.
//
// An asset is modelled in its own frame, in metres: x across, y up, d forward (Three.js z = -d).
// Its pivot is the centre of its floor footprint, and its front (where a sitter looks, or where a
// screen faces from) is +d for seating and -d for displays. A placement stands an asset on a plan
// footprint from office-layouts.js and tags it with that zone, so the graybox tests hold the art
// to the server's collision: nothing solid stands where a body may walk. The botanical canopy and
// the pendants spread above head height, in their own zones.
//
// Surfaces carry metric box-projected UVs. The stone and wood maps are three shared 512 px
// canvases drawn from a seeded noise field, so exports are reproducible and no prop has a
// unique map. TypeSafe pink (#F486A1) is an accent only: a cushion, a few book spines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AVATAR_ENVELOPE } from './workplace-room.js';

export const PENTHOUSE_FURNISHINGS_VERSION = 1;
export const SCREEN_DYNAMIC = 'SCREEN_DYNAMIC';
export const TYPESAFE_PINK = '#f486a1';
// Above this height over its floor, art may overhang walkable floor (the tallest body plus 0.3 m).
export const OVERHEAD_CLEARANCE = AVATAR_ENVELOPE.height + 0.3;
// The graybox's arrival core (office-penthouse-graybox.js): its half-width either side of the
// doorway, and the doorway's half-width and height, which the cladding frames and keeps open.
const ARRIVAL = { core: 3, door: 0.85, height: 2.6 };

// ---- finishes ----------------------------------------------------------------------------------
// One material per finish for the whole office. Finishes marked `tint` take a per-vertex colour
// (walnut or teak, velvet or boucle), so differently coloured parts still share one draw.
const FINISHES = {
  travertine: { color: '#ffffff', surface: 'travertine', tile: 1.2, roughness: 0.55 },
  'rose-stone': { color: '#ffffff', surface: 'rose-stone', tile: 1.6, roughness: 0.2 },
  wood: { color: '#ffffff', surface: 'wood', tile: 0.9, roughness: 0.42, tint: true },
  bronze: { color: '#c7a676', roughness: 0.3, metalness: 1 },
  upholstery: { color: '#ffffff', roughness: 0.86, tint: true },
  graphite: { color: '#2c2a28', roughness: 0.42, metalness: 0.2 },
  // Inactive displays: dark glass with a faint neutral glow, never content (#362).
  [SCREEN_DYNAMIC]: { color: '#101417', roughness: 0.18, emissive: '#26343d', emissiveIntensity: 0.3 },
  foliage: { color: '#ffffff', roughness: 0.62, tint: true, double: true },
  organic: { color: '#ffffff', roughness: 0.92, tint: true },
  // Small objects (books, vessels, desk pads) share one finish by tint, so decor costs no draws.
  objects: { color: '#ffffff', roughness: 0.5, tint: true },
  wool: { color: '#ffffff', roughness: 1, tint: true },
  shade: { color: '#f4eadc', roughness: 0.9, emissive: '#ffd6a0', emissiveIntensity: 0.55, double: true },
};
export const PENTHOUSE_FINISHES = Object.freeze(Object.fromEntries(Object.entries(FINISHES).map(([name, spec]) => [name, Object.freeze({ ...spec })])));
const TINTS = {
  walnut: '#7a5640', darkWalnut: '#5b3f2e', teak: '#a8835c', ivory: '#eee6da', boucle: '#e9e0d2', blush: '#e2ada6',
  deepBlush: '#c98d86', sage: '#8d9a80', bark: '#6b5d50', soil: '#3a2f27', moss: '#55603f', sand: '#d8c8b2', taupe: '#a89886',
};

// ---- surfaces: seeded, tileable noise drawn into shared canvases ----------------------------------
// Value noise on an integer lattice that wraps every `px` by `py` cells, so maps tile.
function lattice(seed) {
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, y, px, py) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, px, py, octaves) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0, f = 1; o < octaves; o++, f *= 2, amp *= 0.5) { sum += noise(x * f, y * f, px * f, py * f) * amp; norm += amp; }
    return sum / norm;
  };
  return { noise, fbm };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SURFACE_SIZE = 512;
// Each returns [r, g, b] (0-255) for texture coordinates u, v in [0, 1).
const SURFACES = {
  // Vein-cut travertine: horizontal strata, elongated pores, one 1.2 m stone per tile.
  travertine() {
    const f = lattice(17);
    return (u, v) => {
      const warp = f.fbm(u * 3, v * 3, 3, 3, 2);
      const strata = f.fbm(u * 2 + warp, v * 24 + warp * 5, 2, 24, 3);
      const cloud = f.fbm(u * 5, v * 5, 5, 5, 2);
      const pore = f.noise(u * 48, v * 300, 48, 300) > 0.83 ? 0.8 : 1;
      const tone = (1 + (strata - 0.5) * 0.1 + (cloud - 0.5) * 0.05) * pore;
      return [233 * tone, 221 * tone, 203 * tone];
    };
  },
  // Rosa stone: a warm pink ground with clouded white veins and fine grey threads.
  'rose-stone'() {
    const f = lattice(29);
    return (u, v) => {
      const qx = f.fbm(u * 3, v * 3, 3, 3, 3), qy = f.fbm(u * 3 + 5, v * 3 + 1, 3, 3, 3);
      const vein = 1 - smooth(0, 0.03, Math.abs(f.fbm(u * 2 + qx * 1.6, v * 2 + qy * 1.6, 2, 2, 4) - 0.5));
      const thread = 1 - smooth(0, 0.008, Math.abs(f.fbm(u * 4 + qy * 2, v * 4 + qx * 2, 4, 4, 3) - 0.47));
      const cloud = (f.fbm(u * 2, v * 2, 2, 2, 2) - 0.5) * 0.14;
      return [0, 1, 2].map(k => {
        let c = [226, 184, 174][k] * (1 + cloud);
        c += ([246, 233, 228][k] - c) * vein * 0.55;
        return c + ([170, 132, 128][k] - c) * thread * 0.35;
      });
    };
  },
  // Light straight grain, tinted per vertex to walnut or teak; grain runs along v.
  wood() {
    const f = lattice(7);
    return (u, v) => {
      const warp = f.fbm(u * 2, v, 2, 1, 2);
      const ring = (u * 18 + warp * 2.5 + f.fbm(u * 4, v * 2, 4, 2, 2) * 0.6) % 1;
      const pore = f.noise(u * 160, v * 8, 160, 8) < 0.12 ? 0.9 : 1;
      const tone = (1 - 0.2 * smooth(0.55, 0.95, ring) - (f.noise(u * 64, v * 4, 64, 4) - 0.5) * 0.08) * pore;
      return [222 * tone, 199 * tone, 174 * tone];
    };
  },
};
const canvases = new Map();
// A real 2D canvas: tests run without one, or with a stub document.
const canDraw = () => typeof document !== 'undefined' && typeof document.createElement?.('canvas')?.getContext === 'function';
// A surface is drawn row by row into its own canvas: `rows` draws until the deadline says stop (at
// least a few rows a call), and returns the finished canvas once the last row is in.
const drafts = new Map(), MIN_ROWS = 8;
function rows(name, deadline) {
  if (canvases.has(name)) return canvases.get(name);
  if (!drafts.has(name)) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SURFACE_SIZE;
    const ctx = canvas.getContext('2d');
    drafts.set(name, { canvas, ctx, image: ctx.createImageData(SURFACE_SIZE, SURFACE_SIZE), sample: SURFACES[name](), row: 0 });
  }
  const draft = drafts.get(name), data = draft.image.data;
  for (let drawn = 0; draft.row < SURFACE_SIZE && (drawn < MIN_ROWS || deadline.timeRemaining() > 1); drawn++, draft.row++) {
    for (let x = 0, y = draft.row; x < SURFACE_SIZE; x++) {
      const rgb = draft.sample(x / SURFACE_SIZE, y / SURFACE_SIZE), i = (y * SURFACE_SIZE + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round(rgb[k])));
      data[i + 3] = 255;
    }
  }
  if (draft.row < SURFACE_SIZE) return null;
  const { canvas, ctx } = draft;
  ctx.putImageData(draft.image, 0, 0);
  if (name === 'travertine') { ctx.fillStyle = 'rgba(80,66,48,0.22)'; ctx.fillRect(0, 0, SURFACE_SIZE, 1); ctx.fillRect(0, 0, 1, SURFACE_SIZE); }
  drafts.delete(name); canvases.set(name, canvas);
  return canvas;
}
const drawSurface = name => rows(name, { timeRemaining: () => Infinity });
// Surfaces are drawn after the office appears, in idle time: a texture starts as a 1 x 1 swatch
// and takes the full canvas once its last row is drawn, so the arrival never waits on the noise.
const waiting = new Map();
const idle = typeof requestIdleCallback === 'function' ? callback => requestIdleCallback(callback, { timeout: 400 })
  : callback => setTimeout(() => { const start = performance.now(); callback({ timeRemaining: () => Math.max(0, 6 - (performance.now() - start)) }); }, 16);
let pumping = false;
function pump(deadline) {
  const [name, textures] = waiting.entries().next().value ?? [];
  if (!name) { pumping = false; return; }
  const live = textures.filter(texture => !texture.userData.disposed);
  // Nobody is waiting any more (the visit ended): keep the rows drawn so far for the next visit.
  if (!live.length) { waiting.delete(name); idle(pump); return; }
  const canvas = rows(name, deadline);
  if (canvas) { waiting.delete(name); fill(canvas, live); }
  idle(pump);
}
function fill(canvas, textures) {
  // A larger image needs fresh GPU storage: release the swatch's copy, not the texture.
  for (const texture of textures) { texture.userData.resizing = true; texture.dispose(); texture.userData.resizing = false; texture.image = canvas; texture.needsUpdate = true; }
}
function surfaceTexture(name, { defer }) {
  const ready = canvases.get(name), swatch = !ready && document.createElement('canvas');
  if (swatch) { swatch.width = swatch.height = 1; const ctx = swatch.getContext('2d'); ctx.fillStyle = `rgb(${SURFACES[name]()(0.5, 0.5).map(Math.round).join(',')})`; ctx.fillRect(0, 0, 1, 1); }
  const texture = new THREE.CanvasTexture(ready ?? swatch);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  texture.name = `penthouse-${name}`; texture.userData.mimeType = 'image/jpeg';
  texture.addEventListener('dispose', () => { if (!texture.userData.resizing) texture.userData.disposed = true; });
  if (swatch) {
    if (defer) { if (!waiting.has(name)) waiting.set(name, []); waiting.get(name).push(texture); if (!pumping) { pumping = true; idle(pump); } }
    else fill(drawSurface(name), [texture]);
  }
  return texture;
}

/**
 * The office's finishes, one material each. `textures` draws the stone and wood maps (a browser
 * canvas; tests run without). `defer` draws them in idle slots after the first frame. `like` makes
 * a second set sharing another set's maps (the terrace's, lit as outdoors); it owns no maps.
 */
export function createPenthouseFinishes({ textures = canDraw(), defer = true, like = null } = {}) {
  const made = new Map(), maps = [];
  if (like) for (const material of like.materials) made.set(material.name, material.clone());
  else for (const [name, spec] of Object.entries(FINISHES)) {
    const material = new THREE.MeshStandardMaterial({
      color: spec.color, roughness: spec.roughness, metalness: spec.metalness ?? 0, vertexColors: Boolean(spec.tint),
      ...(spec.emissive ? { emissive: spec.emissive, emissiveIntensity: spec.emissiveIntensity } : {}),
      ...(spec.double ? { side: THREE.DoubleSide } : {}),
    });
    material.name = name;
    if (textures && spec.surface) { material.map = surfaceTexture(spec.surface, { defer }); maps.push(material.map); }
    made.set(name, material);
  }
  return {
    get: name => made.get(name),
    get materials() { return [...made.values()]; },
    dispose() { for (const material of made.values()) material.dispose(); for (const map of maps) map.dispose(); },
  };
}
/** The shared surfaces by name, and one drawn as a canvas (the export writes them as texture files). */
export const PENTHOUSE_SURFACES = Object.freeze(Object.keys(SURFACES));
export const PENTHOUSE_SURFACE_SIZE = SURFACE_SIZE;
export const penthouseSurfaceCanvas = name => drawSurface(name);
/** Draws every pending surface now (the export fixture waits for real maps, not swatches). */
export function drawPenthouseSurfaces() {
  for (const [name, textures] of waiting) fill(drawSurface(name), textures.filter(texture => !texture.userData.disposed));
  waiting.clear();
}

// ---- geometry kit --------------------------------------------------------------------------------
const turnTo = new THREE.Euler(), place = new THREE.Matrix4(), spin = new THREE.Quaternion(), shift = new THREE.Vector3(), stretch = new THREE.Vector3();
const rbox = (w, h, l, r, seg = 2) => new RoundedBoxGeometry(w, h, l, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, l / 2 - 1e-4)));
const box = (w, h, l) => new THREE.BoxGeometry(w, h, l);
const cyl = (top, bottom, h, n = 24) => new THREE.CylinderGeometry(top, bottom, h, n);
const lathe = (points, n = 32) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), n);
// A plan shape (x across, y = d) extruded up from y 0 to h, with a softened edge of `bevel`.
function slab(shape, h, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, bevel, 0);
  return geometry;
}
// A rounded rectangle w x l (corner radius r) centred on the origin, inset by `inset` for a bevel.
function roundedRect(w, l, r, inset = 0) {
  const x = w / 2 - inset, y = l / 2 - inset, c = Math.max(0.001, Math.min(r - inset, x, y)), shape = new THREE.Shape();
  shape.moveTo(-x + c, -y); shape.lineTo(x - c, -y); shape.absarc(x - c, -y + c, c, -Math.PI / 2, 0);
  shape.lineTo(x, y - c); shape.absarc(x - c, y - c, c, 0, Math.PI / 2);
  shape.lineTo(-x + c, y); shape.absarc(-x + c, y - c, c, Math.PI / 2, Math.PI);
  shape.lineTo(-x, -y + c); shape.absarc(-x + c, -y + c, c, Math.PI, Math.PI * 1.5);
  return shape;
}
// An arc band (a tub chair's back): radii r0..r1, centred on `mid` (plan angle), spanning `span`.
function arcBand(r0, r1, mid, span) {
  const shape = new THREE.Shape(), a0 = mid - span / 2, a1 = mid + span / 2;
  shape.absarc(0, 0, r1, a0, a1, false); shape.absarc(0, 0, r0, a1, a0, true);
  return shape;
}
// A leaf (or grass blade) as a folded quad, base at the origin, pointing +y, opening +z.
function leaf(length, width, fold = 0.25) {
  const v = [[0, 0, 0], [-width / 2, length * 0.45, width * fold], [0, length * 0.5, 0], [width / 2, length * 0.45, width * fold], [0, length, 0]];
  const tris = [[0, 2, 1], [0, 3, 2], [1, 2, 4], [2, 3, 4]], position = [], uv = [];
  for (const tri of tris) for (const i of tri) { position.push(...v[i]); uv.push(v[i][0] / width + 0.5, v[i][1] / length); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
function random(seed) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

// A part list for one asset. `put` moves a primitive into the asset frame ([x, y, d], Euler turn,
// scale) and gives it a vertex tint; `zone` sets a part apart (the canopy rises over walkable floor).
function kit(detail) {
  const parts = [], q = (high, low) => detail ? low : high;
  const put = (finish, geometry, { at = [0, 0, 0], turn = [0, 0, 0], scale = [1, 1, 1], tint = '#ffffff', zone = null } = {}) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    turnTo.set(turn[0], turn[1], turn[2]);
    g.applyMatrix4(place.compose(shift.set(at[0], at[1], -at[2]), spin.setFromEuler(turnTo), stretch.set(scale[0], scale[1], scale[2])));
    const colour = new THREE.Color(tint), count = g.attributes.position.count, colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    parts.push({ finish, zone, geometry: g });
  };
  return { parts, put, q, detail };
}
// Metric UVs, projected per triangle along its dominant axis. For wood, v runs along the part's
// own longest side, so grain runs up a leg, along a desk top and along its thin edges alike.
function projectUVs(geometry, tile, grained) {
  const position = geometry.attributes.position, uv = new Float32Array(position.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3()), grain = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)); const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const facing = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2, [first, second] = [0, 1, 2].filter(axis => axis !== facing);
    // [u axis, v axis]: the grain axis is v when it lies in this face's plane.
    const [ua, va] = grained && first === grain ? [second, first] : grained && second === grain ? [first, second] : facing === 1 ? [0, 2] : facing === 0 ? [2, 1] : [0, 1];
    for (let k = 0; k < 3; k++) {
      const p = [position.getX(i + k), position.getY(i + k), position.getZ(i + k)];
      uv[(i + k) * 2] = p[ua] / tile; uv[(i + k) * 2 + 1] = p[va] / tile;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
/** Metric UVs for an axis-aligned box (the graybox's floors and treads), `tile` metres per repeat. */
export function metricBoxUVs(geometry, tile) {
  const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i)), x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const [u, v] = ax > 0.5 ? [z, y] : ay > 0.5 ? [x, z] : [x, y];
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}
// Merges an asset's parts into one geometry per finish (and zone).
function merge(parts) {
  const groups = new Map();
  for (const part of parts) {
    const key = `${part.finish}|${part.zone ?? ''}`;
    if (!groups.has(key)) groups.set(key, { finish: part.finish, zone: part.zone, list: [] });
    groups.get(key).list.push(part.geometry);
  }
  return [...groups.values()].map(({ finish, zone, list }) => {
    const spec = FINISHES[finish];
    for (const g of list) projectUVs(g, spec.tile ?? 1, finish === 'wood');
    const geometry = mergeGeometries(list);
    for (const g of list) g.dispose();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { finish, zone, geometry };
  });
}

// ---- assets --------------------------------------------------------------------------------------
// Each asset: label, programme zone, footprint [w across, l along d, h], and a builder. Sizes are
// the plan footprints the pieces stand on; builders keep every part inside them.
const ASSETS = {
  'executive-desk': {
    label: 'Executive desk', programme: 'work', size: [4, 1.6, 0.76], casts: 'wood',
    // A walnut slab on two rose-stone pedestals over bronze reveals; the sitter is on the -d side.
    build({ put, q }) {
      put('wood', slab(roundedRect(4, 1.6, 0.12, 0.006), 0.05, 0.006), { at: [0, 0.71, 0], tint: TINTS.walnut });
      put('bronze', slab(roundedRect(3.94, 1.54, 0.1), 0.012), { at: [0, 0.698, 0] });
      for (const x of [-1.5, 1.5]) {
        put('rose-stone', rbox(0.55, 0.678, 1.3, 0.025, q(3, 1)), { at: [x, 0.359, 0.05] });
        put('bronze', box(0.5, 0.02, 1.24), { at: [x, 0.01, 0.05] });
      }
      put('wood', rbox(2.42, 0.42, 0.03, 0.01, 1), { at: [0, 0.47, 0.68], tint: TINTS.darkWalnut });
      put('objects', rbox(0.9, 0.006, 0.44, 0.002, 1), { at: [0, 0.763, -0.42], tint: '#2c2a28' });
      // A bronze task lamp and a few closed books: generic objects, no personal details.
      put('bronze', cyl(0.07, 0.08, 0.015, q(24, 10)), { at: [1.55, 0.7675, 0.5] });
      put('bronze', cyl(0.008, 0.008, 0.42, 8), { at: [1.55, 0.98, 0.5] });
      put('shade', lathe([[0.03, 0], [0.09, -0.11]], q(24, 10)), { at: [1.55, 1.2, 0.46] });
      [['#d9cfc0', 0.045], ['#8d9a80', 0.035], [TYPESAFE_PINK, 0.03]].reduce((y, [tint, h], i) => {
        put('objects', rbox(0.24 - i * 0.02, h, 0.17 - i * 0.01, 0.004, 1), { at: [-1.45, y + h / 2, 0.45], turn: [0, 0.12 * (i - 1), 0], tint });
        return y + h;
      }, 0.76);
    },
  },
  workbench: {
    label: 'Workbench (two stations)', programme: 'work', size: [5.2, 1.2, 0.76], casts: 'wood',
    build({ put }) {
      put('wood', slab(roundedRect(5.2, 1.2, 0.06, 0.004), 0.04, 0.004), { at: [0, 0.72, 0], tint: TINTS.walnut });
      for (const x of [-2.45, 0, 2.45]) {
        for (const d of [-0.48, 0.48]) put('bronze', box(0.05, 0.72, 0.05), { at: [x, 0.36, d] });
        put('bronze', box(0.04, 0.04, 0.96), { at: [x, 0.68, 0] });
      }
      put('bronze', box(4.9, 0.04, 0.04), { at: [0, 0.1, 0.48] });
      put('bronze', box(4.6, 0.06, 0.18), { at: [0, 0.63, 0.32] });
      for (const x of [-1.35, 1.35]) put('objects', rbox(0.8, 0.005, 0.4, 0.002, 1), { at: [x, 0.7625, -0.25], tint: '#2c2a28' });
      put('objects', lathe([[0, 0], [0.04, 0], [0.042, 0.09], [0.036, 0.09], [0.034, 0.008], [0, 0.008]], 16), { at: [-0.75, 0.76, -0.1], tint: '#efe9df' });
      put('objects', rbox(0.22, 0.04, 0.16, 0.004, 1), { at: [1.95, 0.78, 0.05], turn: [0, 0.2, 0], tint: '#c8bba8' });
    },
  },
  display: {
    label: 'Display (SCREEN_DYNAMIC)', programme: 'work', size: [0.62, 0.2, 0.47],
    // The screen faces -d, toward the sitter; its surface is the reserved SCREEN_DYNAMIC material.
    build({ put }) {
      put('bronze', rbox(0.24, 0.012, 0.16, 0.004, 1), { at: [0, 0.006, 0.02] });
      put('graphite', box(0.04, 0.26, 0.025), { at: [0, 0.142, 0.06] });
      put('graphite', rbox(0.62, 0.37, 0.024, 0.006, 1), { at: [0, 0.3, 0.035] });
      put(SCREEN_DYNAMIC, box(0.596, 0.346, 0.002), { at: [0, 0.3, 0.022] });
    },
    anchors: [{ name: 'SCREEN', at: [0, 0.3, 0.021] }],
  },
  'task-chair': {
    label: 'Task chair', programme: 'work', size: [0.9, 0.9, 1.05], seatHeight: 0.5, collision: 'chair',
    build: chair({ seat: [0.5, 0.48], back: [0.46, 0.5], base: 'graphite', tint: TINTS.blush }),
  },
  'executive-chair': {
    label: 'Executive chair', programme: 'work', size: [0.9, 0.9, 1.26], seatHeight: 0.5, collision: 'chair',
    build: chair({ seat: [0.54, 0.52], back: [0.52, 0.72], base: 'bronze', tint: TINTS.deepBlush }),
  },
  'lounge-sofa': {
    label: 'Lounge sofa', programme: 'hosting', size: [2.8, 1, 0.83], seatHeight: 0.46,
    build({ put, q }) {
      const seg = q(3, 1);
      put('wood', rbox(2.6, 0.1, 0.8, 0.02, 1), { at: [0, 0.05, 0.03], tint: TINTS.darkWalnut });
      put('upholstery', rbox(2.8, 0.22, 1, 0.06, seg), { at: [0, 0.21, 0], tint: TINTS.boucle });
      put('upholstery', rbox(2.8, 0.5, 0.18, 0.07, seg), { at: [0, 0.47, -0.41], tint: TINTS.boucle });
      for (const x of [-1.3, 1.3]) put('upholstery', rbox(0.2, 0.52, 1, 0.08, seg), { at: [x, 0.36, 0], tint: TINTS.boucle });
      for (const x of [-0.6, 0.6]) {
        put('upholstery', rbox(1.18, 0.14, 0.72, 0.06, seg), { at: [x, 0.39, 0.1], tint: TINTS.ivory });
        put('upholstery', rbox(1.18, 0.4, 0.2, 0.08, seg), { at: [x, 0.62, -0.26], turn: [0.14, 0, 0], tint: TINTS.ivory });
      }
      put('upholstery', rbox(0.42, 0.4, 0.12, 0.06, seg), { at: [-0.92, 0.66, -0.12], turn: [0.2, 0.25, 0.05], tint: TYPESAFE_PINK });
      put('upholstery', rbox(0.42, 0.4, 0.12, 0.06, seg), { at: [0.95, 0.66, -0.12], turn: [0.2, -0.2, -0.04], tint: TINTS.blush });
    },
    anchors: [{ name: 'SEAT_1', at: [-0.6, 0.46, 0.1] }, { name: 'SEAT_2', at: [0.6, 0.46, 0.1] }],
  },
  'lounge-chair': {
    label: 'Lounge chair', programme: 'hosting', size: [0.85, 0.85, 0.66], seatHeight: 0.44,
    // A swivel tub chair in blush velvet: a round seat inside a curved back.
    build({ put, q }) {
      put('bronze', lathe([[0, 0], [0.3, 0], [0.3, 0.02], [0.06, 0.04], [0.05, 0.16], [0, 0.16]], q(32, 12)), {});
      put('upholstery', lathe([[0, 0], [0.33, 0], [0.37, 0.03], [0.38, 0.08], [0.37, 0.13], [0.33, 0.16], [0, 0.16]], q(40, 14)), { at: [0, 0.28, 0], tint: TINTS.blush });
      put('upholstery', slab(arcBand(0.33, 0.39, -Math.PI / 2, Math.PI * 1.3), 0.38, 0.03), { at: [0, 0.28, 0], tint: TINTS.blush });
    },
    anchors: [{ name: 'SEAT', at: [0, 0.44, 0.05] }],
  },
  'lounge-table': {
    label: 'Lounge table (rose stone)', programme: 'hosting', size: [1.4, 0.8, 0.38],
    build({ put, q }) {
      put('rose-stone', slab(roundedRect(1.4, 0.8, 0.4, 0.008), 0.05, 0.008), { at: [0, 0.33, 0] });
      put('bronze', slab(roundedRect(1, 0.42, 0.21), 0.33), {});
      put('objects', lathe([[0, 0], [0.06, 0], [0.15, 0.06], [0.16, 0.075], [0.14, 0.07], [0.05, 0.012], [0, 0.012]], q(32, 12)), { at: [-0.3, 0.38, 0], tint: '#f2ece3' });
      put('objects', rbox(0.3, 0.035, 0.22, 0.004, 1), { at: [0.36, 0.3975, 0.04], turn: [0, 0.18, 0], tint: '#d7cbbb' });
      put('objects', rbox(0.26, 0.03, 0.2, 0.004, 1), { at: [0.36, 0.43, 0.04], turn: [0, -0.1, 0], tint: TINTS.sage });
    },
  },
  'botanical-tree': {
    label: 'Botanical focal point (tree in a travertine planter)', programme: 'botanical', size: [1.2, 1.2, 0.7],
    // The planter, trunk and underplanting stand inside the footprint; branches and canopy start
    // above head height and lean into the room, clear of the terrace glazing behind.
    build({ put, q, detail }) {
      put('travertine', lathe([[0, 0], [0.46, 0], [0.5, 0.04], [0.56, 0.6], [0.6, 0.66], [0.6, 0.7], [0.54, 0.7], [0.53, 0.64], [0, 0.64]], q(40, 16)), {});
      put('organic', cyl(0.53, 0.53, 0.02, q(32, 12)), { at: [0, 0.65, 0], tint: TINTS.soil });
      put('organic', cyl(0.05, 0.085, 2.3, q(12, 6)), { at: [0.03, 1.8, 0], turn: [0, 0, -0.02], tint: TINTS.bark });
      const rand = random(362), crown = [0.35, 4.15, 0];
      const clusters = Array.from({ length: q(9, 6) }, (_, i) => {
        const a = i / q(9, 6) * Math.PI * 2 + rand() * 0.4, r = 0.45 + rand() * 0.35, up = 3.55 + rand() * 1.1;
        return [crown[0] + Math.cos(a) * r, up, Math.sin(a) * r];
      });
      for (const [x, y, d] of clusters) {
        const from = [0.06, 2.9 + rand() * 0.3, 0], length = Math.hypot(x - from[0], y - from[1], d - from[2]);
        const branch = cyl(0.014, 0.035, length, 6);
        branch.translate(0, length / 2, 0);
        const direction = new THREE.Vector3(x - from[0], y - from[1], -(d - from[2])).normalize();
        branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
        put('organic', branch, { at: from, tint: TINTS.bark, zone: 'canopy' });
      }
      const greens = ['#4f6b45', '#5d7a4e', '#46603d', '#6a8656', '#3f5536'], leaves = q(1100, 360);
      for (let i = 0; i < leaves; i++) {
        const [cx, cy, cd] = clusters[i % clusters.length], u = rand() * Math.PI * 2, w = Math.acos(2 * rand() - 1), r = 0.15 + rand() * 0.4;
        // Leaves stay in the room: the terrace glazing is 1.1 m behind the trunk.
        const at = [Math.max(-0.75, cx + Math.sin(w) * Math.cos(u) * r), cy + Math.cos(w) * r * 0.75, cd + Math.sin(w) * Math.sin(u) * r];
        put('foliage', leaf(0.17, 0.075), { at, turn: [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2], tint: greens[Math.floor(rand() * greens.length)], zone: 'canopy' });
      }
      // Underplanting: a low ring of leaves fanning out over the soil, inside the planter's rim.
      for (let i = 0; i < q(90, 30); i++) {
        const a = rand() * Math.PI * 2, r = 0.1 + rand() * 0.26, blade = leaf(0.2, 0.08, 0.35);
        blade.rotateX(0.6 + rand() * 0.4); blade.rotateY(a + Math.PI / 2);
        put('foliage', blade, { at: [Math.cos(a) * r, 0.655, Math.sin(a) * r], tint: greens[Math.floor(rand() * greens.length)] });
      }
    },
  },
  'back-console': {
    label: 'Back console', programme: 'hosting', size: [7, 0.5, 0.8],
    build({ put, q }) {
      put('bronze', box(6.9, 0.09, 0.4), { at: [0, 0.045, 0] });
      put('wood', rbox(7, 0.66, 0.46, 0.015, 1), { at: [0, 0.42, 0], tint: TINTS.walnut });
      put('travertine', rbox(7, 0.05, 0.5, 0.008, 1), { at: [0, 0.775, 0] });
      for (const x of [-2.625, -0.875, 0.875, 2.625]) put('bronze', box(0.012, 0.6, 0.006), { at: [x, 0.42, 0.232] });
      for (const [x, h, r, tint] of [[-2.7, 0.42, 0.11, '#f0ebe3'], [-2.35, 0.26, 0.09, TINTS.sand], [2.2, 0.32, 0.1, '#e9e2d6']]) {
        put('objects', lathe([[0, 0], [r * 0.7, 0], [r, h * 0.35], [r * 0.6, h * 0.85], [r * 0.45, h], [0, h]], q(28, 10)), { at: [x, 0.8, 0], tint });
      }
      [['#cfc3b2', 0.04], [TINTS.sage, 0.035], ['#e6dccd', 0.03], [TYPESAFE_PINK, 0.025]].reduce((y, [tint, h], i) => {
        put('objects', rbox(0.3 - i * 0.02, h, 0.22 - i * 0.01, 0.004, 1), { at: [0.4, y + h / 2, 0], turn: [0, 0.1 * (i % 2 ? 1 : -1), 0], tint });
        return y + h;
      }, 0.8);
      put('bronze', lathe([[0, 0], [0.05, 0], [0.16, 0.07], [0.17, 0.08], [0.155, 0.075], [0.04, 0.012], [0, 0.012]], q(32, 12)), { at: [1.3, 0.8, 0] });
    },
  },
  'meeting-table': {
    label: 'Meeting table', programme: 'work', size: [3.2, 1.2, 0.75], casts: 'travertine',
    build({ put, q }) {
      put('travertine', slab(roundedRect(3.2, 1.2, 0.5, 0.008), 0.05, 0.008), { at: [0, 0.7, 0] });
      for (const x of [-1.05, 1.05]) {
        put('wood', rbox(0.12, 0.68, 0.8, 0.02, 1), { at: [x, 0.36, 0], tint: TINTS.walnut });
        put('bronze', rbox(0.2, 0.02, 0.9, 0.006, 1), { at: [x, 0.01, 0] });
      }
      put('bronze', box(2.1, 0.04, 0.04), { at: [0, 0.3, 0] });
      put('objects', lathe([[0, 0], [0.08, 0], [0.2, 0.05], [0.21, 0.06], [0.19, 0.055], [0.07, 0.01], [0, 0.01]], q(32, 12)), { at: [0, 0.75, 0], tint: '#efe8dd' });
    },
  },
  'meeting-chair': {
    label: 'Meeting chair', programme: 'work', size: [0.56, 0.56, 0.85], seatHeight: 0.5,
    build({ put, q }) {
      for (const [x, d] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) put('wood', cyl(0.014, 0.02, 0.44, q(10, 6)), { at: [x, 0.22, d], tint: TINTS.walnut });
      put('upholstery', rbox(0.5, 0.07, 0.48, 0.03, q(3, 1)), { at: [0, 0.465, 0], tint: TINTS.ivory });
      for (const x of [-0.21, 0.21]) put('wood', box(0.03, 0.3, 0.03), { at: [x, 0.62, -0.235], tint: TINTS.walnut });
      put('upholstery', rbox(0.48, 0.3, 0.05, 0.025, q(3, 1)), { at: [0, 0.72, -0.235], turn: [0.1, 0, 0], tint: TINTS.blush });
    },
  },
  'terrace-planter': {
    label: 'Terrace planter (grasses and box)', programme: 'terrace', size: [0.6, 5.4, 0.6],
    build({ put, q }) {
      put('travertine', rbox(0.6, 0.6, 5.4, 0.03, 1), { at: [0, 0.3, 0] });
      put('organic', box(0.5, 0.02, 5.3), { at: [0, 0.6, 0], tint: TINTS.soil });
      const rand = random(7362), grasses = ['#9aa57d', '#b3ad84', '#8c9a70', '#c2b98e'];
      // Blades lean mostly along the trough and only a little across it, so they stay over it.
      for (let d = -2.3; d <= 2.31; d += q(0.3, 0.6)) {
        if ([-1.8, 0, 1.8].some(b => Math.abs(d - b) < 0.35)) continue;
        for (let i = 0; i < q(14, 6); i++) {
          const a = rand() * Math.PI * 2, h = 0.45 + rand() * 0.3;
          put('foliage', leaf(h, 0.02, 0.1), { at: [Math.cos(a) * 0.04, 0.61, d + Math.sin(a) * 0.04], turn: [(rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.5], tint: grasses[Math.floor(rand() * grasses.length)] });
        }
      }
      for (const d of [-1.8, 0, 1.8]) {
        const ball = new THREE.SphereGeometry(0.22, q(18, 10), q(12, 7)), position = ball.attributes.position;
        for (let i = 0; i < position.count; i++) { const n = 1 + Math.sin(position.getX(i) * 31 + position.getY(i) * 17 + position.getZ(i) * 23) * 0.06; position.setXYZ(i, position.getX(i) * n, position.getY(i) * n, position.getZ(i) * n); }
        ball.computeVertexNormals();
        put('foliage', ball, { at: [0, 0.8, d], tint: '#4e6a43' });
      }
    },
  },
  'terrace-lounger': {
    label: 'Terrace lounger', programme: 'terrace', size: [0.75, 2, 0.75],
    // Teak frame and an ivory cushion; the backrest is at -d, so a lounger faces +d at yaw 0.
    build({ put }) {
      for (const x of [-0.34, 0.34]) {
        put('wood', box(0.05, 0.08, 2), { at: [x, 0.28, 0], tint: TINTS.teak });
        for (const d of [-0.9, 0.9]) put('wood', box(0.06, 0.26, 0.06), { at: [x, 0.13, d], tint: TINTS.teak });
      }
      for (let i = 0; i < 12; i++) put('wood', box(0.63, 0.025, 0.1), { at: [0, 0.3, 0.92 - i * 0.12], tint: TINTS.teak });
      put('upholstery', rbox(0.68, 0.08, 1.3, 0.03, 2), { at: [0, 0.35, 0.33], tint: TINTS.ivory });
      put('wood', box(0.62, 0.04, 0.66), { at: [0, 0.48, -0.62], turn: [0.62, 0, 0], tint: TINTS.teak });
      put('upholstery', rbox(0.66, 0.07, 0.64, 0.03, 2), { at: [0, 0.52, -0.6], turn: [0.62, 0, 0], tint: TINTS.ivory });
      put('upholstery', rbox(0.5, 0.12, 0.14, 0.05, 2), { at: [0, 0.62, -0.4], turn: [0.3, 0, 0], tint: TINTS.blush });
    },
  },
  'terrace-side-table': {
    label: 'Terrace side table', programme: 'terrace', size: [0.4, 0.4, 0.45],
    build({ put, q }) { put('travertine', lathe([[0, 0], [0.17, 0], [0.15, 0.22], [0.19, 0.43], [0.19, 0.45], [0, 0.45]], q(32, 12)), {}); },
  },
  'bistro-table': {
    label: 'Terrace bistro table', programme: 'terrace', size: [0.8, 0.8, 0.74],
    build({ put, q }) {
      put('bronze', lathe([[0, 0], [0.26, 0], [0.26, 0.015], [0.05, 0.05], [0.035, 0.7], [0, 0.7]], q(32, 12)), {});
      put('travertine', cyl(0.39, 0.39, 0.035, q(48, 16)), { at: [0, 0.7225, 0] });
    },
  },
  'bistro-chair': {
    label: 'Terrace bistro chair', programme: 'terrace', size: [0.5, 0.5, 0.85], seatHeight: 0.47,
    build({ put, q }) {
      for (const [x, d] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) put('bronze', cyl(0.012, 0.012, 0.45, q(10, 6)), { at: [x, 0.225, d] });
      for (const x of [-0.2, 0.2]) put('bronze', cyl(0.012, 0.012, 0.4, q(10, 6)), { at: [x, 0.65, -0.21] });
      for (let i = 0; i < 4; i++) put('wood', box(0.44, 0.022, 0.095), { at: [0, 0.459, -0.15 + i * 0.1], tint: TINTS.teak });
      for (const y of [0.6, 0.7, 0.8]) put('wood', box(0.42, 0.06, 0.02), { at: [0, y, -0.21], tint: TINTS.teak });
    },
  },
  'reading-chair': {
    label: 'Library reading chair', programme: 'library', size: [1, 1, 0.95], seatHeight: 0.5,
    // A deep club chair in blush velvet; the plan seat height is the cushion top.
    build({ put, q }) {
      const seg = q(3, 1);
      for (const [x, d] of [[-0.38, -0.36], [0.38, -0.36], [-0.38, 0.36], [0.38, 0.36]]) put('wood', cyl(0.02, 0.026, 0.12, q(10, 6)), { at: [x, 0.06, d], tint: TINTS.darkWalnut });
      put('upholstery', rbox(0.96, 0.3, 0.94, 0.08, seg), { at: [0, 0.27, 0], tint: TINTS.blush });
      put('upholstery', rbox(0.62, 0.1, 0.66, 0.05, seg), { at: [0, 0.45, 0.1], tint: TINTS.blush });
      for (const x of [-0.395, 0.395]) put('upholstery', rbox(0.17, 0.3, 0.9, 0.08, seg), { at: [x, 0.55, 0.02], tint: TINTS.blush });
      put('upholstery', rbox(0.96, 0.55, 0.2, 0.09, seg), { at: [0, 0.67, -0.38], turn: [0.1, 0, 0], tint: TINTS.blush });
      put('upholstery', rbox(0.6, 0.4, 0.14, 0.06, seg), { at: [0, 0.68, -0.22], turn: [0.2, 0, 0], tint: TINTS.deepBlush });
    },
  },
  'reading-side-table': {
    label: 'Library side table and lamp', programme: 'library', size: [0.5, 0.5, 1.02],
    build({ put, q }) {
      put('bronze', lathe([[0, 0], [0.2, 0], [0.22, 0.02], [0.18, 0.26], [0.22, 0.52], [0, 0.52]], q(32, 12)), {});
      put('rose-stone', cyl(0.24, 0.24, 0.03, q(40, 14)), { at: [0, 0.535, 0] });
      put('objects', lathe([[0, 0], [0.05, 0], [0.08, 0.08], [0.075, 0.18], [0.02, 0.25], [0.02, 0.27], [0, 0.27]], q(24, 10)), { at: [0, 0.55, 0], tint: '#efe8dc' });
      put('shade', lathe([[0.14, 0], [0.1, 0.19]], q(32, 12)), { at: [0, 0.82, 0] });
    },
  },
  bookcase: {
    label: 'Library bookcase', programme: 'library', size: [5.4, 0.6, 2.6], casts: 'wood',
    // Walnut carcass, four bays of four shelves with bronze lips, books and a few objects.
    // LOD1 draws each run of books as one block.
    build({ put, q, detail }) {
      for (const x of [-2.68, 2.68]) put('wood', box(0.04, 2.6, 0.6), { at: [x, 1.3, 0], tint: TINTS.walnut });
      put('wood', box(5.4, 0.04, 0.6), { at: [0, 2.58, 0], tint: TINTS.walnut });
      put('bronze', box(5.32, 0.1, 0.54), { at: [0, 0.05, 0.01] });
      put('wood', box(5.32, 2.5, 0.02), { at: [0, 1.32, -0.29], tint: TINTS.darkWalnut });
      for (const x of [-1.34, 0, 1.34]) put('wood', box(0.03, 2.48, 0.56), { at: [x, 1.34, 0.01], tint: TINTS.walnut });
      const bays = [-2.005, -0.67, 0.67, 2.005], levels = [0.1, 0.6, 1.1, 1.6, 2.1], rand = random(1362);
      const spines = ['#e6dccd', '#cdbfa9', '#8d9a80', '#6f7f8a', '#b9826b', '#d8b7a8', '#3f4a52', '#a99272', '#efe7da', TYPESAFE_PINK];
      for (const x of bays) for (const [i, y] of levels.entries()) {
        if (i) {
          put('wood', box(1.28, 0.03, 0.55), { at: [x, y - 0.015, 0.01], tint: TINTS.walnut });
          put('bronze', box(1.28, 0.012, 0.008), { at: [x, y - 0.006, 0.285] });
        }
        let cursor = x - 0.6;
        const end = x + 0.6 - rand() * 0.35;
        while (cursor < end) {
          if (rand() < 0.12) { // an object: a bronze bookend or a ceramic vessel
            const tall = rand() < 0.5, h = tall ? 0.24 : 0.14;
            put(tall ? 'objects' : 'bronze', tall ? lathe([[0, 0], [0.05, 0], [0.06, h * 0.4], [0.03, h], [0, h]], q(18, 8)) : box(0.03, h, 0.14), { at: [cursor + 0.07, y, 0.02], tint: '#ede6da' });
            cursor += 0.16; continue;
          }
          const run = Math.min(end - cursor, 0.18 + rand() * 0.35), h = 0.24 + rand() * 0.1;
          if (detail) { put('objects', box(run, h, 0.21), { at: [cursor + run / 2, y + h / 2, 0.02], tint: spines[Math.floor(rand() * 9)] }); cursor += run + 0.04; continue; }
          for (let b = cursor; b < cursor + run - 0.02;) {
            const t = 0.022 + rand() * 0.03, bh = h * (0.82 + rand() * 0.18), tint = spines[Math.floor(rand() * (rand() < 0.04 ? 10 : 9))];
            put('objects', box(t, bh, 0.2 + rand() * 0.03), { at: [b + t / 2, y + bh / 2, 0.02], tint });
            b += t + 0.002;
          }
          cursor += run + 0.05;
        }
      }
    },
  },
  // Architecture, on the perimeter (zone `shell`): the arrival core's inner face clad in rose stone
  // with a bronze door surround, and the library's fluted walnut backdrop where bookcase-0 stood.
  'arrival-cladding': {
    label: 'Arrival wall: rose-stone cladding and bronze door surround', programme: 'arrival', size: [6, 0.07, 7.6], mount: 'wall',
    // Its frame is the doorway's centre on the core's inner face; the opening stays clear.
    build({ put }) {
      const side = ARRIVAL.core - ARRIVAL.door, mid = (ARRIVAL.core + ARRIVAL.door) / 2, head = ARRIVAL.height + 0.08;
      for (const x of [-mid, mid]) {
        put('rose-stone', box(side, 7.6, 0.03), { at: [x, 3.8, 0.015] });
        put('bronze', box(side, 0.08, 0.035), { at: [x, 0.04, 0.0175] });
        for (const y of [1.9, 3.8, 5.7]) put('bronze', box(side, 0.012, 0.034), { at: [x, y, 0.017] });
      }
      put('rose-stone', box(2 * ARRIVAL.door, 7.6 - head, 0.03), { at: [0, (7.6 + head) / 2, 0.015] });
      for (const y of [3.8, 5.7]) put('bronze', box(2 * ARRIVAL.door, 0.012, 0.034), { at: [0, y, 0.017] });
      for (const x of [-ARRIVAL.door - 0.04, ARRIVAL.door + 0.04]) put('bronze', box(0.08, head, 0.06), { at: [x, head / 2, 0.03] });
      put('bronze', box(2 * ARRIVAL.door + 0.16, 0.08, 0.06), { at: [0, head - 0.04 + 1e-4, 0.03] });
    },
  },
  'back-panelling': {
    label: 'Back wall under the mezzanine: walnut panelling with bronze reveals', programme: 'hosting', size: [30, 0.04, 3.3], mount: 'wall',
    // Wall-hung boards from the floor to just under the mezzanine's underside, a bronze reveal
    // between each 1.2 m board, a bronze base and a shadow gap at the top.
    build({ put }) {
      for (let i = 0; i < 25; i++) put('wood', box(1.188, 3.2, 0.024), { at: [-14.4 + i * 1.2, 1.68, 0.012], tint: i % 2 ? TINTS.walnut : '#83604a' });
      for (let i = 0; i <= 25; i++) put('bronze', box(0.012, 3.2, 0.03), { at: [-15 + i * 1.2 + (i === 0 ? 0.006 : i === 25 ? -0.006 : 0), 1.68, 0.015] });
      put('bronze', box(30, 0.08, 0.034), { at: [0, 0.04, 0.017] });
    },
  },
  'library-panel': {
    label: 'Library backdrop: fluted walnut panel', programme: 'library', size: [6.5, 0.06, 3.3], mount: 'wall',
    build({ put, q, detail }) {
      put('wood', box(6.5, 3, 0.02), { at: [0, 1.8, 0.01], tint: TINTS.darkWalnut });
      if (!detail) for (let x = -3.2; x <= 3.201; x += 0.06) put('wood', cyl(0.022, 0.022, 2.94, q(6, 4)), { at: [x, 1.8, 0.022], tint: TINTS.walnut });
      for (const y of [0.3, 3.3]) put('bronze', box(6.5, 0.03, 0.05), { at: [0, y, 0.025] });
      for (const x of [-3.235, 3.235]) put('bronze', box(0.03, 3, 0.05), { at: [x, 1.8, 0.025] });
    },
  },
  rug: {
    label: 'Rug', programme: 'shared', size: [1, 1, 0.01],
    // Unit rug; placements scale it to their own size. Border and field are vertex tints.
    build({ put }) {
      put('wool', box(1, 0.006, 1), { at: [0, 0.003, 0], tint: '#d6c3b0' });
      put('wool', box(0.92, 0.004, 0.92), { at: [0, 0.008, 0], tint: '#eee5d8' });
    },
  },
  pendant: {
    label: 'Pendant drum light', programme: 'shared', size: [0.9, 0.9, 0.42], mount: 'ceiling',
    // The drum only; the rod to the ceiling is per placement.
    build({ put, q }) {
      put('shade', lathe([[0.45, -0.2], [0.45, 0.2]], q(40, 16)), {});
      for (const y of [-0.2, 0.2]) put('bronze', new THREE.TorusGeometry(0.452, 0.008, 6, q(48, 16)), { at: [0, y, 0], turn: [Math.PI / 2, 0, 0] });
      put('bronze', cyl(0.06, 0.06, 0.02, 16), { at: [0, 0.2, 0] });
    },
  },
};

// A swivel desk chair facing +d, its seat top at 0.5 m, its back on the -d side.
function chair({ seat: [sw, sl], back: [bw, bh], base, tint }) {
  return ({ put, q }) => {
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + Math.PI / 2;
      put(base, box(0.3, 0.03, 0.045), { at: [Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15], turn: [0, a, 0] });
      put('graphite', new THREE.SphereGeometry(0.026, q(10, 6), q(8, 4)), { at: [Math.cos(a) * 0.29, 0.026, Math.sin(a) * 0.29] });
    }
    put(base, cyl(0.025, 0.03, 0.34, q(16, 8)), { at: [0, 0.24, 0] });
    put('graphite', rbox(sw - 0.02, 0.03, sl - 0.02, 0.01, 1), { at: [0, 0.405, 0] });
    put('upholstery', rbox(sw, 0.08, sl, 0.035, q(3, 1)), { at: [0, 0.46, 0.01], tint });
    put('graphite', box(0.04, 0.32, 0.03), { at: [0, 0.57, -sl / 2 + 0.02] });
    put('upholstery', rbox(bw, bh, 0.07, 0.035, q(3, 1)), { at: [0, 0.54 + bh / 2, -sl / 2 + 0.01], turn: [0.12, 0, 0], tint });
    for (const x of [-sw / 2 - 0.02, sw / 2 + 0.02]) {
      put('graphite', box(0.03, 0.2, 0.03), { at: [x, 0.58, -0.02] });
      put(base, rbox(0.06, 0.025, 0.24, 0.01, 1), { at: [x, 0.69, -0.02] });
    }
  };
}

/** The asset catalog: ids, labels, programme zones and footprints (for the manifest and tests). */
export const PENTHOUSE_ASSETS = Object.freeze(Object.entries(ASSETS).map(([id, asset]) => Object.freeze({
  id, version: PENTHOUSE_FURNISHINGS_VERSION, label: asset.label, programme: asset.programme, size: [...asset.size], mount: asset.mount ?? 'floor',
  seatHeight: asset.seatHeight ?? null, anchors: (asset.anchors ?? []).map(a => a.name),
})));

// The furnished office reuses each asset's parts for the page's life: the art is deterministic, so a
// second visit only rebatches. Disposing a build releases the GPU copies; the arrays stay for reuse.
const partsCache = new Map();
/** One asset's merged parts at a level of detail (0 full, 1 reduced), in its own frame. */
export function penthouseAssetParts(id, detail = 0, { cached = false } = {}) {
  const asset = ASSETS[id], key = `${id}|${detail}`;
  if (!asset) throw new Error(`Unknown penthouse asset ${id}`);
  if (cached && partsCache.has(key)) return partsCache.get(key);
  const k = kit(detail);
  asset.build(k);
  const parts = merge(k.parts);
  if (cached) partsCache.set(key, parts);
  return parts;
}

// ---- placements ----------------------------------------------------------------------------------
// Which asset stands on which plan footprint (office-layouts.js), and its yaw (0 faces +d).
const ON_FOOTPRINT = [
  ['executive-desk', 'executive-desk'], ['workbench', 'bench-a'], ['workbench', 'bench-b'],
  ['lounge-sofa', 'lounge-sofa', Math.PI], ['lounge-chair', 'lounge-chair-a'], ['lounge-chair', 'lounge-chair-b'], ['lounge-table', 'lounge-table'],
  ['botanical-tree', 'botanical-planter'], ['back-console', 'back-console', Math.PI], ['meeting-table', 'meeting-table'],
  ['meeting-chair', 'meeting-chair-1'], ['meeting-chair', 'meeting-chair-2'], ['meeting-chair', 'meeting-chair-3'],
  ['meeting-chair', 'meeting-chair-4', Math.PI], ['meeting-chair', 'meeting-chair-5', Math.PI], ['meeting-chair', 'meeting-chair-6', Math.PI],
  ['terrace-planter', 'terrace-planter-south'], ['terrace-planter', 'terrace-planter-north'],
  ['terrace-lounger', 'terrace-lounger-a', Math.PI], ['terrace-lounger', 'terrace-lounger-b', Math.PI], ['terrace-side-table', 'terrace-side-table'],
  ['bistro-table', 'terrace-bistro-table'], ['bistro-chair', 'terrace-bistro-chair-a'], ['bistro-chair', 'terrace-bistro-chair-b', Math.PI],
  ['reading-chair', 'reading-chair-a', Math.PI], ['reading-chair', 'reading-chair-b', Math.PI], ['reading-side-table', 'reading-side-table'],
  ['bookcase', 'bookcase-1', Math.PI], ['bookcase', 'bookcase-2', Math.PI],
];
// Architecture on the perimeter: [asset, id, level index, [x, d], yaw].
const PERIMETER = [['arrival-cladding', 'arrival-cladding', 0, [0, 0], 0], ['back-panelling', 'back-panelling', 0, [0, 20], Math.PI], ['library-panel', 'library-panel', 1, [-6.25, 20], Math.PI]];
// Rugs: [id, level index, x0, x1, d0, d1]. Flat, so not collision.
const RUGS = [
  ['rug-lounge', 0, -12.2, -7.6, 7.85, 12.85],
  ['rug-meeting', 0, 5, 9.4, 15.8, 19.6],
  ['rug-library', 1, -8.6, -3.9, 17.2, 19.5],
];
const DISPLAY_SPACING = 0.66, DISPLAY_SETBACK = 0.65, CHAIR_RADIUS = 0.4; // the plan's desk chair collision radius (office-layouts.js)
const groupOf = (layout, levelId, x) => levelId === layout.levels[1]?.id ? 'mezzanine' : x < layout.levels[0].rooms.find(room => room.kind === 'primary').x0 ? 'terrace' : 'main-floor';

/**
 * Every placement for a layout: { id, asset, zone, levelId, group, position [x, y, d], yaw,
 * scale, rod }. `lights` (Three.js point lights in office space) place a pendant drum at each lamp
 * hung at least head height plus clearance above its floor.
 */
export function penthousePlacements(layout, { lights = [] } = {}) {
  const out = [], levels = layout.levels;
  const obstacle = id => { for (const level of levels) { const o = level.obstacles.find(item => item.id === id); if (o) return { o, level }; } return null; };
  for (const [asset, id, yaw = 0] of ON_FOOTPRINT) {
    const found = obstacle(id);
    if (!found) continue;
    const { o, level } = found, x = (o.x0 + o.x1) / 2, d = (o.d0 + o.d1) / 2;
    out.push({ id, asset, zone: `obstacle:${id}`, levelId: level.id, group: groupOf(layout, level.id, x), position: [x, level.floorElevation, d], yaw });
  }
  const ground = levels[0];
  for (const chair of ground.chairs ?? []) {
    const seat = layout.seats?.find(item => item.id === chair.id);
    out.push({ id: chair.id, asset: chair.id === 'desk-executive-chair' ? 'executive-chair' : 'task-chair', zone: `chair:${chair.id}`, levelId: ground.id, group: 'main-floor', position: [chair.position[0], ground.floorElevation, chair.position[1]], yaw: seat?.facing ?? 0 });
  }
  // Displays on the desk each station faces, spaced across the station, the outer ones turned in.
  for (const station of layout.anchors.filter(item => item.kind === 'approach' && item.monitors)) {
    const [sx, sd] = station.seat, desk = ground.obstacles.find(o => o.kind === 'desk' && sx >= o.x0 && sx <= o.x1 && o.d0 > sd);
    if (!desk) continue;
    for (let i = 0; i < station.monitors; i++) {
      const offset = (i - (station.monitors - 1) / 2) * DISPLAY_SPACING;
      // At arm's length from the sitter's edge (0.65 m in), not at the far edge of a deep desk.
      const d = desk.d0 + Math.min(DISPLAY_SETBACK, desk.d1 - desk.d0 - 0.3);
      out.push({ id: `${station.id}-display-${i + 1}`, asset: 'display', zone: `obstacle:${desk.id}`, levelId: ground.id, group: 'main-floor', position: [sx + offset, ground.floorElevation + desk.height, d], yaw: station.monitors > 2 ? -Math.sign(offset) * 0.22 : 0, station: station.id });
    }
  }
  for (const [asset, id, index, [x, d], yaw] of PERIMETER) {
    const level = levels[index];
    if (level) out.push({ id, asset, zone: 'shell', levelId: level.id, group: groupOf(layout, level.id, x), position: [x, level.floorElevation, d], yaw });
  }
  for (const [id, index, x0, x1, d0, d1] of RUGS) {
    const level = levels[index];
    if (!level) continue;
    out.push({ id, asset: 'rug', zone: `rug:${id}`, levelId: level.id, group: groupOf(layout, level.id, (x0 + x1) / 2), position: [(x0 + x1) / 2, level.floorElevation, (d0 + d1) / 2], yaw: 0, scale: [x1 - x0, 1, d1 - d0] });
  }
  // A drum is hung at its lamp, which must sit high enough for the drum to clear the tallest body;
  // a lower lamp (a reading light) gets no drum. Under the mezzanine the ceiling is its underside.
  const mezzanine = levels[1]?.bounds, under = (x, d) => mezzanine && x >= mezzanine.x0 && x <= mezzanine.x1 && d >= mezzanine.d0 && d <= mezzanine.d1;
  lights.forEach((light, i) => {
    const x = light.position.x, y = light.position.y, d = -light.position.z;
    const level = levels[1] && under(x, d) && y > levels[1].floorElevation ? levels[1] : levels[0];
    const main = levels[0].rooms.find(room => room.kind === 'primary');
    const ceiling = level === levels[0] && under(x, d) ? levels[0].floorElevation + (main.clearUnderMezzanine ?? levels[0].clearHeight) : level.floorElevation + level.clearHeight;
    if (y - level.floorElevation < OVERHEAD_CLEARANCE + 0.2 || ceiling - y < 0.5) return;
    out.push({ id: `pendant-${i + 1}`, asset: 'pendant', zone: `fixture:pendant-${i + 1}`, levelId: level.id, group: groupOf(layout, level.id, x), position: [x, y, d], yaw: 0, rod: ceiling - y - 0.2 });
  });
  return out;
}

// ---- the office's furnishings ----------------------------------------------------------------------
const matrixOf = (placement, target = new THREE.Matrix4()) => target.compose(
  new THREE.Vector3(placement.position[0], placement.position[1], -placement.position[2]),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw ?? 0),
  new THREE.Vector3(...(placement.scale ?? [1, 1, 1])));

/**
 * Builds the furnishings for a layout. At runtime a repeated piece is one instanced draw per finish,
 * every instance keeping its own plan zone; one-off pieces are baked together into one static draw
 * per finish and visibility group, each keeping its zone as a vertex range (`userData.zoneRanges`).
 * `instancing: false` (the export) gives each placement its own named group and nodes instead.
 * Groups are visibility groups: `furnishings:main-floor`, `furnishings:terrace`, `furnishings:mezzanine`.
 */
export function buildPenthouseFurnishings(layout, { finishes: given = null, outdoor = null, lights = [], instancing = true } = {}) {
  const finishes = given ?? createPenthouseFinishes(), object = new THREE.Group(), geometries = new Set(), proxies = [], placements = penthousePlacements(layout, { lights });
  // The terrace is outdoors: given its own finishes, it keeps the whole sky while the interior relights.
  const finish = (group, name) => (group === 'terrace' && outdoor ? outdoor : finishes).get(name);
  object.name = 'office-furnishings';
  const groups = Object.fromEntries(['main-floor', 'terrace', 'mezzanine'].map(name => {
    const group = new THREE.Group(); group.name = `furnishings:${name}`; group.userData.visibilityGroup = name; object.add(group); return [name, group];
  }));
  const parts = new Map();
  const partsOf = asset => {
    if (!parts.has(asset)) { const list = penthouseAssetParts(asset, 0, { cached: true }); list.forEach(part => geometries.add(part.geometry)); parts.set(asset, list); }
    return parts.get(asset);
  };
  const zoneOf = (placement, part) => part.zone === 'canopy' ? `canopy:${placement.id}` : placement.zone;
  const finishMesh = (mesh, asset, finish) => {
    // Only the big pieces' main finish throws the sun's shadow (desk and table tops, bookcase
    // carcasses), which keeps the office's share of the shadow pass small.
    mesh.receiveShadow = true; mesh.castShadow = ASSETS[asset].casts === finish;
    mesh.userData.asset = asset; mesh.userData.castsShadow = mesh.castShadow;
  };
  // Rods to the ceiling are per pendant: one shared unit cylinder, scaled per instance.
  const rod = new THREE.CylinderGeometry(0.008, 0.008, 1, 8); geometries.add(rod);
  const rods = placements.filter(item => item.rod > 0);
  if (instancing) {
    const batches = new Map();
    for (const placement of placements) {
      const key = `${placement.asset}|${placement.group}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(placement);
    }
    const statics = new Map();
    for (const [key, list] of batches) {
      const [asset, group] = key.split('|');
      for (const part of partsOf(asset)) {
        if (list.length === 1) {
          // Baked into office space for its group's static draw of this finish (casters apart).
          const casts = ASSETS[asset].casts === part.finish, batch = `${group}|${part.finish}|${casts}`;
          if (!statics.has(batch)) statics.set(batch, { group, finish: part.finish, casts, list: [] });
          statics.get(batch).list.push({ geometry: part.geometry.clone().applyMatrix4(matrixOf(list[0])), zone: zoneOf(list[0], part), id: list[0].id, asset });
          continue;
        }
        const mesh = new THREE.InstancedMesh(part.geometry, finish(group, part.finish), list.length);
        list.forEach((placement, i) => mesh.setMatrixAt(i, matrixOf(placement)));
        mesh.name = `${asset}:${part.finish}`; mesh.userData.zone = zoneOf(list[0], part); mesh.userData.zones = list.map(placement => zoneOf(placement, part));
        mesh.userData.ids = list.map(placement => placement.id);
        mesh.computeBoundingBox(); mesh.computeBoundingSphere();
        finishMesh(mesh, asset, part.finish);
        groups[group].add(mesh);
      }
    }
    const finishOf = finish;
    for (const { group, finish, casts, list } of statics.values()) {
      const geometry = mergeGeometries(list.map(item => item.geometry)), zoneRanges = [];
      let start = 0;
      for (const item of list) { const count = item.geometry.attributes.position.count; zoneRanges.push({ zone: item.zone, id: item.id, start, count }); start += count; item.geometry.dispose(); }
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, finishOf(group, finish));
      mesh.name = `${group}:${finish}${casts ? ':casts' : ''}`; mesh.userData.zone = zoneRanges[0].zone; mesh.userData.zoneRanges = zoneRanges;
      mesh.receiveShadow = true; mesh.castShadow = casts; mesh.userData.castsShadow = casts; mesh.userData.assets = [...new Set(list.map(item => item.asset))];
      groups[group].add(mesh);
    }
    // The one-off pieces' own geometries were baked into their static draws.
    for (const [asset, list] of parts) if (!placements.some(item => item.asset === asset && placements.filter(other => other.asset === asset && other.group === item.group).length > 1))
      for (const part of list) { part.geometry.dispose(); geometries.delete(part.geometry); }
    for (const group of new Set(rods.map(item => item.group))) {
      const list = rods.filter(item => item.group === group), mesh = new THREE.InstancedMesh(rod, finish(group, 'bronze'), list.length);
      list.forEach((item, i) => mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(item.position[0], item.position[1] + 0.2 + item.rod / 2, -item.position[2]), new THREE.Quaternion(), new THREE.Vector3(1, item.rod, 1))));
      mesh.name = 'pendant rods'; mesh.userData.zones = list.map(item => item.zone); mesh.userData.zone = list[0].zone;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); finishMesh(mesh, 'pendant', 'bronze');
      groups[group].add(mesh);
    }
  } else {
    for (const placement of placements) {
      const node = new THREE.Group(); node.name = placement.id; matrixOf(placement).decompose(node.position, node.quaternion, node.scale);
      node.userData = { asset: placement.asset, zone: placement.zone, levelId: placement.levelId };
      for (const part of partsOf(placement.asset)) {
        const mesh = new THREE.Mesh(part.geometry, finish(placement.group, part.finish));
        mesh.name = `${placement.id}:${part.finish}`; mesh.userData.zone = zoneOf(placement, part); finishMesh(mesh, placement.asset, part.finish);
        node.add(mesh);
      }
      for (const anchor of ASSETS[placement.asset].anchors ?? []) {
        const empty = new THREE.Object3D(); empty.name = `${anchor.name}:${placement.id}`;
        empty.position.set(anchor.at[0], anchor.at[1], -anchor.at[2]); node.add(empty);
      }
      if (placement.rod > 0) {
        const mesh = new THREE.Mesh(rod, finish(placement.group, 'bronze')); mesh.name = `${placement.id}:rod`;
        mesh.position.set(0, 0.2 + placement.rod / 2, 0); mesh.scale.set(1, placement.rod, 1); mesh.userData.zone = placement.zone; node.add(mesh);
      }
      groups[placement.group].add(node);
    }
    // Collision proxies: each plan footprint as a COL_<id> box, and each desk chair as its plan
    // cylinder, in office space, invisible. They are the server's numbers, not the art's bounds.
    const proxy = new THREE.MeshBasicMaterial({ name: 'COLLISION', color: '#ff4fa0', wireframe: true }), collision = new THREE.Group();
    collision.name = 'collision'; object.add(collision); proxies.push(proxy);
    for (const level of layout.levels) for (const o of level.obstacles.filter(item => item.kind === 'desk' || item.kind === 'furniture')) {
      const geometry = new THREE.BoxGeometry(o.x1 - o.x0, o.height, o.d1 - o.d0); geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, proxy); mesh.name = `COL_${o.id}`; mesh.visible = false;
      mesh.position.set((o.x0 + o.x1) / 2, level.floorElevation + o.height / 2, -(o.d0 + o.d1) / 2); collision.add(mesh);
    }
    for (const chair of layout.levels[0].chairs ?? []) {
      const height = layout.seats?.find(item => item.id === chair.id)?.height ?? 0.5, geometry = new THREE.CylinderGeometry(CHAIR_RADIUS, CHAIR_RADIUS, height, 16); geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, proxy); mesh.name = `COL_${chair.id}`; mesh.visible = false;
      mesh.position.set(chair.position[0], layout.levels[0].floorElevation + height / 2, -chair.position[1]); collision.add(mesh);
    }
  }
  const meshes = []; object.traverse(node => { if (node.isMesh && node.visible) meshes.push(node); });
  return {
    object, placements, groups,
    // The interior's finishes (relit for the time of day); the terrace's, when given, stay outdoors.
    get materials() { return finishes.materials; },
    stats() {
      let triangles = 0;
      for (const mesh of meshes) triangles += (mesh.geometry.attributes.position.count / 3) * (mesh.isInstancedMesh ? mesh.count : 1);
      return { draws: meshes.length, triangles, assets: new Set(placements.map(item => item.asset)).size, placements: placements.length };
    },
    dispose() {
      object.traverse(node => { if (node.isInstancedMesh) node.dispose(); });
      for (const geometry of geometries) geometry.dispose();
      for (const proxy of proxies) proxy.dispose();
      if (!given) finishes.dispose();
    },
  };
}

// ---- export models ---------------------------------------------------------------------------------
/**
 * One asset as an export model, in its own frame with its pivot at floor contact: `LOD0` and
 * `LOD1` groups of meshes named `<asset>_LOD<n>:<finish>`, a `COL_<asset>` box proxy on the
 * footprint, and anchor empties (`SEAT_*`, `SCREEN`). Used by the asset GLBs.
 */
export function buildPenthouseAssetModel(id, finishes) {
  const asset = ASSETS[id], root = new THREE.Group(), geometries = [];
  root.name = id;
  for (const detail of [0, 1]) {
    const lod = new THREE.Group(); lod.name = `LOD${detail}`; lod.visible = detail === 0;
    for (const part of penthouseAssetParts(id, detail)) {
      geometries.push(part.geometry);
      const mesh = new THREE.Mesh(part.geometry, finishes.get(part.finish)); mesh.name = `${id}_LOD${detail}:${part.finish}${part.zone ? `:${part.zone}` : ''}`; lod.add(mesh);
    }
    root.add(lod);
  }
  // The proxy is the piece's collision in its own frame: a desk chair is the plan's 0.4 m cylinder up
  // to the seat; a wall piece stands from the wall face into the room; a drum is centred on its pivot.
  const [w, l, h] = asset.size, proxy = asset.collision === 'chair' ? new THREE.CylinderGeometry(CHAIR_RADIUS, CHAIR_RADIUS, asset.seatHeight, 24) : new THREE.BoxGeometry(w, h, l);
  if (asset.collision === 'chair') proxy.translate(0, asset.seatHeight / 2, 0);
  else if (asset.mount === 'wall') proxy.translate(0, h / 2, -l / 2);
  else if (asset.mount !== 'ceiling') proxy.translate(0, h / 2, 0);
  geometries.push(proxy);
  const collision = new THREE.Mesh(proxy, new THREE.MeshBasicMaterial({ name: 'COLLISION', color: '#ff4fa0', wireframe: true }));
  collision.name = `COL_${id}`; collision.visible = false; root.add(collision);
  for (const anchor of asset.anchors ?? []) { const empty = new THREE.Object3D(); empty.name = anchor.name; empty.position.set(anchor.at[0], anchor.at[1], -anchor.at[2]); root.add(empty); }
  return { object: root, dispose() { for (const g of geometries) g.dispose(); collision.material.dispose(); } };
}
