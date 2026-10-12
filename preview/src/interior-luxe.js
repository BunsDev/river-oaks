import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RETRO } from './retro-palette.js';

// Luxe finish pass for every walk-in boutique: a palette suite per store,
// polished stone, fine terrazzo and chevron parquet, fluted back walls, and
// architectural light (crown reveals, ceiling slots, halo rings). All of it is
// original procedural art; there are no brand marks or surveyed interiors.
// Decoration stays flush with floors, walls and ceilings, so room plans,
// fixtures, movement and staff stations are unchanged.

// ---- palette suites ----------------------------------------------------------
export const LUXE_SUITES = Object.freeze({
  champagne: { label: 'Champagne atelier', wall: '#eadfcb', flute: '#e2d3ba', floor: 'marble', ceiling: '#f6f0e6' },
  blush: { label: 'Blush salon', wall: '#e8d0cb', flute: '#dfc1bb', floor: 'rosaMarble', ceiling: '#f7ede9' },
  sage: { label: 'Sage conservatory', wall: '#cbd9cf', flute: '#bccdc1', floor: 'terrazzo', ceiling: '#f1f3ee' },
  pearl: { label: 'Pearl limestone', wall: '#ebe4d9', flute: '#ddd4c6', floor: 'limestone', ceiling: '#f6f2ec' },
  noir: { label: 'Midnight lacquer', wall: '#26393c', flute: '#1f3134', floor: 'darkMarble', ceiling: '#2c3c3f' },
  walnut: { label: 'Walnut library', wall: '#d9c8b3', flute: '#ccb79e', floor: 'chevronOak', ceiling: '#f4ede3' },
});
const THEME_SUITES = {
  fashion: ['champagne', 'blush', 'sage', 'pearl', 'noir', 'walnut'], leather: ['noir', 'walnut', 'champagne'],
  jewelry: ['pearl', 'noir', 'blush', 'champagne'], perfumery: ['blush', 'pearl'], optician: ['sage', 'pearl'],
  gallery: ['pearl'], dining: ['noir', 'walnut'], gelato: ['blush'], salon: ['sage'], wellness: ['sage'],
  cinema: ['noir'], home: ['walnut'],
};
// Themes whose floor is not the suite's: a cinema keeps carpet, a dining room
// in walnut gets walnut chevron.
const FLOOR_OVERRIDES = { cinema: () => 'carpet', gallery: () => 'pearlTerrazzo', dining: suite => suite === 'walnut' ? 'chevronWalnut' : null };
// Back walls that carry fluted millwork (the former slat themes).
export const FLUTED_THEMES = new Set(['fashion', 'leather', 'jewelry', 'perfumery', 'optician', 'dining']);
const HALO_THEMES = new Set(['jewelry', 'perfumery', 'gallery', 'wellness']);

function hash(text) {
  let h = 2166136261;
  for (const char of String(text)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function luxeSuiteFor(room) {
  const options = THEME_SUITES[room.theme] ?? THEME_SUITES.fashion;
  const id = options[hash(room.storeId ?? room.id ?? room.name) % options.length];
  const floor = FLOOR_OVERRIDES[room.theme]?.(id) ?? LUXE_SUITES[id].floor;
  return { id, ...LUXE_SUITES[id], floor };
}

// ---- shell plan ----------------------------------------------------------------
// Flush architectural parts in room-local metres (a across, d inward, y up).
// Every part hugs a wall face, the ceiling or the floor so circulation and
// fixtures keep their footprint.
export const WALL_FACE = 0.15, CROWN_Y = 3.3, FLOOR_TOP = 0.012;
export function luxeShellPlan(room) {
  const W = room.width, D = room.depth, H = room.height, c = room.center;
  const west = room.aMin + WALL_FACE, east = room.aMax - WALL_FACE, back = D - WALL_FACE, parts = [];
  const part = (material, a, d, y, size, extra = {}) => parts.push({ material, a, d, y, size, ...extra });
  // Shadow-gap skirting with a brass hairline, on the back and both side walls.
  part('reveal', c, back - 0.012, 0.05, [W - 0.3, 0.1, 0.024], { role: 'skirting' });
  part('brass', c, back - 0.014, 0.104, [W - 0.3, 0.008, 0.028], { role: 'skirting' });
  for (const [a, side] of [[west, -1], [east, 1]]) {
    part('reveal', a - side * 0.012, D / 2, 0.05, [0.024, 0.1, D - 0.15], { role: 'skirting' });
    part('brass', a - side * 0.014, D / 2, 0.104, [0.028, 0.008, D - 0.15], { role: 'skirting' });
  }
  // Crown light reveal: a continuous luminous line above every wall display.
  part('glow', c, back - 0.01, CROWN_Y + 0.02, [W - 0.3, 0.018, 0.02], { role: 'crown' });
  part('brass', c, back - 0.013, CROWN_Y - 0.012, [W - 0.3, 0.008, 0.026], { role: 'crown' });
  for (const [a, side] of [[west, -1], [east, 1]]) {
    part('glow', a - side * 0.01, D / 2, CROWN_Y + 0.02, [0.02, 0.018, D - 0.15], { role: 'crown' });
    part('brass', a - side * 0.013, D / 2, CROWN_Y - 0.012, [0.026, 0.008, D - 0.15], { role: 'crown' });
  }
  // Double brass floor inlay framing the central field, clear of the door mat.
  const field = { a0: room.aMin + 0.8, a1: room.aMax - 0.8, d0: 1.7, d1: D - 1.25 };
  if (field.a1 - field.a0 > 1.2 && field.d1 - field.d0 > 1.2) for (const inset of [0, 0.09]) {
    const a0 = field.a0 + inset, a1 = field.a1 - inset, d0 = field.d0 + inset, d1 = field.d1 - inset;
    for (const d of [d0, d1]) part('brass', (a0 + a1) / 2, d, FLOOR_TOP + 0.0015, [a1 - a0 + 0.018, 0.003, 0.018], { role: 'inlay' });
    for (const a of [a0, a1]) part('brass', a, (d0 + d1) / 2, FLOOR_TOP + 0.0015, [0.018, 0.003, d1 - d0 - 0.018], { role: 'inlay' });
  }
  // Ceiling light slots between the downlight columns.
  const slots = W > 9.5 ? [c - W / 6, c + W / 6] : [c];
  for (const a of slots) {
    part('reveal', a, D / 2, H - 0.003, [0.12, 0.006, D - 2.0], { role: 'slot' });
    part('lamp', a, D / 2, H - 0.008, [0.05, 0.008, D - 2.1], { role: 'slot' });
  }
  // A suspended halo over the main display aisle of salons that show small objects.
  if (HALO_THEMES.has(room.theme) && W >= 5.5) parts.push({ material: 'halo', role: 'halo', a: c, d: Math.min(D * 0.45, D - 2.2), y: H - 0.42, radius: Math.min(1.15, W * 0.11), drop: 0.42 });
  return parts;
}

// Fluted panels on the back wall, leaving the feature frame and its brass surround clear.
export function flutedPanels(room) {
  if (!FLUTED_THEMES.has(room.theme)) return [];
  const feature = room.fixtures.find(fixture => fixture.kind === 'feature');
  const west = room.aMin + WALL_FACE, east = room.aMax - WALL_FACE;
  const gaps = feature ? [[feature.a - feature.w / 2 - 0.12, feature.a + feature.w / 2 + 0.12]] : [];
  const spans = [];
  let start = west;
  for (const [g0, g1] of gaps) { if (g0 - start > 0.3) spans.push([start, g0]); start = Math.max(start, g1); }
  if (east - start > 0.3) spans.push([start, east]);
  return spans.map(([a0, a1]) => ({ a0, a1, d: room.depth - WALL_FACE - 0.004, y0: 0.13, y1: CROWN_Y - 0.03 }));
}

// ---- procedural surfaces (browser canvas) -----------------------------------------
function noiseField(seed) {
  let s = seed >>> 0; const random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  // Lattice noise that wraps every `period` cells, so canvases tile without seams.
  // Written without closures: it runs a few million times per texture.
  const noise = (x, y, period = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period & 255, y1 = (y0 + 1) % period & 255, px0 = p[x0 & 255], px1 = p[x1];
    const a = p[px0 + (y0 & 255)], b = p[px1 + (y0 & 255)], c = p[px0 + y1], d = p[px1 + y1];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) / 255;
  };
  const fbm = (x, y, octaves, period) => { let sum = 0, amp = 0.5, f = 1, norm = 0; for (let o = 0; o < octaves; o++) { sum += noise(x * f, y * f, period * f) * amp; norm += amp; amp *= 0.5; f *= 2; } return sum / norm; };
  return { random, noise, fbm };
}
// Generated canvases are kept for the page's life, so rebuilding the district
// (a world reload) reuses them; each build still owns and disposes its textures.
const canvases = new Map();
// Floor surfaces are drawn after the district appears: a texture starts as a
// 1 x 1 swatch of its base colour and receives the full canvas in a later idle
// slot, one surface per slot. The material keeps its map throughout, so the swap
// recompiles nothing. On CPU renderers this keeps the load free of the surface work.
const pending = new Map();
let pumping = false;
const idle = typeof requestIdleCallback === 'function' ? callback => requestIdleCallback(callback, { timeout: 500 }) : callback => setTimeout(callback, 16);
function pump() {
  const [key, job] = pending.entries().next().value ?? [];
  if (!job) { pumping = false; return; }
  pending.delete(key);
  const live = job.textures.filter(texture => !texture.userData.disposed);
  if (live.length) {
    const canvas = document.createElement('canvas'); canvas.width = job.size[0]; canvas.height = job.size[1];
    job.draw(canvas.getContext('2d'), canvas.width, canvas.height); canvases.set(key, canvas);
    for (const texture of live) { texture.image = canvas; texture.needsUpdate = true; }
  }
  idle(pump);
}
function canvasTexture([w, h], draw, { color = true, key = null, defer = null } = {}) {
  let canvas = key && canvases.get(key);
  const later = !canvas && defer && key;
  if (later) {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const swatch = canvas.getContext('2d'); swatch.fillStyle = defer; swatch.fillRect(0, 0, 1, 1);
  } else if (!canvas) {
    canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    if (key) canvases.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  if (later) {
    texture.addEventListener('dispose', () => { texture.userData.disposed = true; });
    if (!pending.has(key)) pending.set(key, { size: [w, h], draw, textures: [] });
    pending.get(key).textures.push(texture);
    if (!pumping) { pumping = true; idle(pump); }
  }
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  return texture;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Book-matched slabs: cloudy ground, thin branching veins, hairline joints on
// the tile edges and the mid-line (two 1.2 x 2.4 m slabs per 2.4 m tile).
function marble(seed, base, vein, accent = null) {
  return canvasTexture([512, 512], (ctx, w, h) => {
    const f = noiseField(seed), image = ctx.createImageData(w, h), data = image.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w * 4, v = y / h * 4;
      const qx = f.fbm(u + 1.7, v + 9.2, 3, 4), qy = f.fbm(u + 8.3, v + 2.8, 3, 4);
      const flow = f.fbm(u + 2.4 * qx, v + 2.4 * qy, 4, 4);
      const main = 1 - smooth(0, 0.016, Math.abs(flow - 0.5)), fine = 1 - smooth(0, 0.007, Math.abs(f.fbm(u * 2 + 3.1 * qy, v * 2 + 3.1 * qx, 3, 8) - 0.47));
      const cloud = (f.fbm(u * 0.75, v * 0.75, 2, 3) - 0.5) * 0.09;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        let value = base[k] * (1 + cloud);
        value += (vein[k] - value) * Math.min(1, main * 0.85 + fine * 0.35);
        if (accent) value += (accent[k] - value) * main * 0.45 * smooth(0.45, 0.7, qx);
        data[i + k] = Math.max(0, Math.min(255, Math.round(value)));
      }
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 0, 1, h); ctx.fillRect(w / 2, 0, 1, h);
  }, { key: `marble:${seed}`, defer: `rgb(${base.join(',')})` });
}
// Fine Venetian terrazzo: dense small chips in a muted palette with brass
// divider strips on a 1.2 m grid (which also hides the tile seams).
function terrazzo(seed, ground, chips, accents) {
  return canvasTexture([1024, 1024], (ctx, w, h) => {
    const f = noiseField(seed);
    ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
    const chip = (palette, count, r0, r1) => {
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = palette[Math.floor(f.random() * palette.length)];
        const x = f.random() * w, y = f.random() * h, r = r0 + f.random() * (r1 - r0), sides = 4 + Math.floor(f.random() * 3), turn = f.random() * Math.PI;
        ctx.beginPath();
        for (let k = 0; k < sides; k++) { const angle = turn + k / sides * Math.PI * 2, rr = r * (0.65 + f.random() * 0.45); ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * rr, y + Math.sin(angle) * rr); }
        ctx.fill();
      }
    };
    // 3-12 mm chips with a sprinkle of 1-2 cm accents: still speckled at shopping distance.
    chip(chips, 30000, 1.4, 5); chip(accents, 1600, 3, 8);
    ctx.fillStyle = '#b9965c';
    for (const t of [0, 0.5]) { ctx.fillRect(t * w - 2, 0, 5, h); ctx.fillRect(0, t * h - 2, w, 5); }
  }, { key: `terrazzo:${seed}`, defer: ground });
}
// Large-format honed limestone: 1.2 x 0.6 m stones in a half-bond, faint
// fossil speckle and cloud, slightly varied per stone, hairline joints.
function limestone(seed, base) {
  return canvasTexture([512, 512], (ctx, w, h) => {
    const f = noiseField(seed), image = ctx.createImageData(w, h), data = image.data, px = w / 2.4;
    const stoneTone = (col, row) => 1 + (Math.abs(Math.sin(col * 12.9898 + row * 78.233) * 43758.5453) % 1 - 0.5) * 0.06;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / (0.6 * px)), col = (((Math.floor((x / px - (row % 2) * 0.6) / 1.2)) % 2) + 2) % 2;
      const cloud = (f.fbm(x / w * 6, y / h * 6, 3, 6) - 0.5) * 0.07, speck = f.noise(x / w * 220, y / h * 220, 220) > 0.86 ? -0.06 : 0;
      const tone = stoneTone(col, row % 4) + cloud + speck, i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round(base[k] * tone)));
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = 'rgba(70,60,48,0.30)';
    for (let row = 0; row < 4; row++) {
      const y = row * 0.6 * px; ctx.fillRect(0, y, w, 1);
      for (let k = 0; k <= 2; k++) ctx.fillRect((k * 1.2 + (row % 2) * 0.6) * px - 0.5, y, 1, 0.6 * px);
    }
  }, { key: `limestone:${seed}`, defer: `rgb(${base.join(',')})` });
}
// Light grazing down from the crown reveal: bright under the line, falling
// off towards the skirting. Shared by plaster walls (as an emissive map along
// each face's height) and fluted panels (as vertex tone).
export function wallWash(v) { return v > 0.86 ? 0.6 : 0.3 + 0.7 * Math.pow(smooth(0.05, 0.85, v), 1.5); }
function washTexture() {
  return canvasTexture([4, 256], (ctx, w, h) => {
    for (let y = 0; y < h; y++) { const tone = Math.round(255 * wallWash(1 - (y + 0.5) / h)); ctx.fillStyle = `rgb(${tone},${tone},${tone})`; ctx.fillRect(0, y, w, 1); }
  }, { key: 'wash' });
}
// Chevron parquet: boards at 45 degrees meeting on straight centre lines, 0.3 m
// columns, 85 mm boards. The 1.2 m pattern repeats twice per 2.4 m tile.
function chevron(seed, tones) {
  return canvasTexture([1024, 1024], (ctx, w, h) => {
    const f = noiseField(seed), px = w / 2.4, column = 0.3 * px, step = 0.12 * px;
    for (let col = 0; col < 8; col++) {
      const x0 = col * column, dir = col % 2 ? -1 : 1;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, column, h); ctx.clip();
      for (let k = -4; k * step < h + column; k++) {
        const y = k * step, tone = tones[Math.floor(f.random() * tones.length)];
        const left = dir > 0 ? y : y + column, right = dir > 0 ? y + column : y;
        ctx.fillStyle = tone; ctx.beginPath(); ctx.moveTo(x0, left); ctx.lineTo(x0 + column, right); ctx.lineTo(x0 + column, right + step); ctx.lineTo(x0, left + step); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,24,12,0.10)'; ctx.lineWidth = 0.8;
        for (let g = 0; g < 6; g++) { const o = 2 + f.random() * (step - 4); ctx.beginPath(); ctx.moveTo(x0, left + o); ctx.lineTo(x0 + column, right + o + (f.random() - 0.5) * 3); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(30,18,10,0.30)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, left); ctx.lineTo(x0 + column, right); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(30,18,10,0.28)'; ctx.fillRect(x0, 0, 1, h);
    }
  }, { key: `chevron:${seed}`, defer: tones[0] });
}
// Cinema carpet: deep plum pile with a fine champagne art-deco lattice.
function decoCarpet(seed) {
  return canvasTexture([512, 512], (ctx, w, h) => {
    const f = noiseField(seed), image = ctx.createImageData(w, h), data = image.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = f.fbm(x / w * 32, y / h * 32, 3, 32), i = (y * w + x) * 4;
      data[i] = 58 + n * 20; data[i + 1] = 28 + n * 12; data[i + 2] = 50 + n * 16; data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = 'rgba(201,168,102,0.55)'; ctx.lineWidth = 2;
    const cell = w / 4;
    for (let gx = 0; gx <= 4; gx++) for (let gy = 0; gy <= 4; gy++) {
      const cx = gx * cell, cy = gy * cell;
      ctx.beginPath(); ctx.moveTo(cx, cy - cell / 2); ctx.lineTo(cx + cell / 2, cy); ctx.lineTo(cx, cy + cell / 2); ctx.lineTo(cx - cell / 2, cy); ctx.closePath(); ctx.stroke();
      for (const r of [cell * 0.12, cell * 0.2]) { ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.stroke(); }
    }
  }, { key: `carpet:${seed}`, defer: '#3a1c30' });
}
// Concave flutes (60 mm, eight per 0.48 m tile): a normal map plus a soft
// cavity tone so the grooves read under flat interior light too.
function flutes() {
  const width = 256, flute = width / 8, land = 0.12;
  const profile = x => { const t = (x % flute) / flute; if (t < land) return [0, 1]; const s = (t - land) / (1 - land) * 2 - 1; return [s, Math.sqrt(Math.max(0, 1 - s * s))]; };
  const normal = canvasTexture([width, 4], (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) { const [slope] = profile(x + 0.5), nx = slope * 0.85, nz = Math.sqrt(1 - nx * nx); for (let y = 0; y < h; y++) image.data.set([(nx * 0.5 + 0.5) * 255, 128, (nz * 0.5 + 0.5) * 255, 255], (y * w + x) * 4); }
    ctx.putImageData(image, 0, 0);
  }, { color: false, key: 'flute-normal' });
  const cavity = canvasTexture([width, 4], (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) { const [, depth] = profile(x + 0.5), tone = 255 * (1 - 0.16 * depth); for (let y = 0; y < h; y++) image.data.set([tone, tone, tone, 255], (y * w + x) * 4); }
    ctx.putImageData(image, 0, 0);
  });
  return { normal, cavity, tile: 0.48 };
}

// Emissive fill follows the instance or vertex tint, so a midnight wall glows
// midnight rather than grey.
export function tintEmissiveByColor(material) {
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
        totalEmissiveRadiance *= vColor.rgb;
      #endif`);
  };
  material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|ro-tinted-emissive`;
  return material;
}

// Materials for the pass. `standard` and `track` are the interior builder's
// own factories, so everything is disposed with the interiors.
export function createLuxeFinishes({ standard, physical, track }) {
  const floor = (map, options) => standard({ map: track.t(map), emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.075, ...options });
  const floors = {
    marble: floor(marble(11, [238, 234, 228], [150, 145, 146], [196, 170, 120]), { roughness: 0.12, envMapIntensity: 0.65 }),
    rosaMarble: floor(marble(29, [236, 218, 212], [176, 128, 128], [204, 170, 120]), { roughness: 0.13, envMapIntensity: 0.6 }),
    darkMarble: floor(marble(23, [44, 52, 54], [196, 170, 118], [226, 214, 190]), { roughness: 0.1, envMapIntensity: 0.75 }),
    terrazzo: floor(terrazzo(3, '#dcd5c4', ['#f4efe6', '#c7bea9', '#9d988e', '#d6c8ab', '#7f7a70', '#a9b8ac', '#5f6a63'], [RETRO.teal, RETRO.mint, RETRO.rose, RETRO.brass]), { roughness: 0.22, envMapIntensity: 0.5 }),
    limestone: floor(limestone(17, [226, 216, 199]), { roughness: 0.4, envMapIntensity: 0.45 }),
    pearlTerrazzo: floor(terrazzo(5, '#ebe5db', ['#fbf8f3', '#d6cfc3', '#b5aea3', '#e4dacb', '#9c978f'], ['#cdb88d', '#aab4b8', '#6f706e']), { roughness: 0.2, envMapIntensity: 0.5 }),
    chevronOak: floor(chevron(7, ['#c49f74', '#bb966b', '#caa77d', '#b48e63', '#c19a6e']), { roughness: 0.34, envMapIntensity: 0.45 }),
    chevronWalnut: floor(chevron(13, ['#5d412f', '#654736', '#553b2b', '#6b4d39', '#5a3f2e']), { roughness: 0.3, envMapIntensity: 0.5 }),
    carpet: floor(decoCarpet(4), { roughness: 1, emissiveIntensity: 0.06 }),
  };
  for (const [name, material] of Object.entries(floors)) material.name = `floor-${name}`;
  const fluting = flutes();
  const fluted = tintEmissiveByColor(standard({ color: '#ffffff', vertexColors: true, map: track.t(fluting.cavity), normalMap: track.t(fluting.normal), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.62, emissive: '#ffffff', emissiveIntensity: 0.2, envMapIntensity: 0.55 }));
  fluted.name = 'interior-fluted';
  const reveal = standard({ color: '#151a1b', roughness: 0.6 }); reveal.name = 'interior-reveal';
  const wash = washTexture(); wash.wrapS = wash.wrapT = THREE.ClampToEdgeWrapping; track.t(wash);
  const halo = standard({ color: '#fff5e4', emissive: '#ffe2b8', emissiveIntensity: 2.6, roughness: 0.3 }); halo.name = 'interior-halo';
  return { floors, fluted, flutedTile: fluting.tile, reveal, halo, wash };
}

// Panels with metric UVs and the suite's flute tint, merged into one mesh per
// material for every room.
export function createSurfaceCollector() {
  const parts = new Map(), T = new THREE.Matrix4();
  return {
    // A plane on the back wall of `room`, facing into the room (towards -d).
    panel(material, room, roomMatrix, { a0, a1, d, y0, y1 }, color, tile) {
      const geometry = new THREE.PlaneGeometry(a1 - a0, y1 - y0, 1, 12);
      const uv = geometry.attributes.uv, colors = [], tint = new THREE.Color(color);
      for (let i = 0; i < uv.count; i++) {
        const v = uv.getY(i), tone = 0.62 + 0.38 * wallWash((y0 + v * (y1 - y0)) / room.height);
        uv.setXY(i, (a0 + uv.getX(i) * (a1 - a0)) / tile, v * (y1 - y0) / tile); colors.push(tint.r * tone, tint.g * tone, tint.b * tone);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      // PlaneGeometry faces +z; room-local -z is inward (d), so it already faces the door.
      geometry.applyMatrix4(T.makeTranslation((a0 + a1) / 2, (y0 + y1) / 2, -d).premultiply(roomMatrix));
      if (!parts.has(material)) parts.set(material, []);
      parts.get(material).push(geometry);
    },
    build(group, track) {
      for (const [material, geometries] of parts) {
        const merged = track.g(mergeGeometries(geometries));
        for (const geometry of geometries) geometry.dispose();
        const mesh = new THREE.Mesh(merged, material); mesh.name = `luxe:${material.name}`; mesh.receiveShadow = true; group.add(mesh);
      }
      parts.clear();
    },
  };
}
