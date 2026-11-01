// Coworking studio (fixture), finished: a futuristic executive office on the
// measured #218 plan. Obsidian floor with light-lane inlays, a backlit honey
// onyx wall, a night skyline behind a gilded curtain wall, fluted ivory
// millwork with light blades, floating onyx desks with curved holographic
// screens, a monolithic review table with an orbital hologram, and a stadium
// halo in a graphite ceiling. Original procedural art only.
//
// The plan is unchanged: every mesh is tagged with the plan zone it occupies
// (floor, wall, ceiling, an obstacle footprint or a seat), and tests hold the
// art to those zones, so routes, sockets and the doorway stay as measured.
// Units are metres in the room frame: x across, d inward from the door, y up.
// Three.js frame: x east, y up, z = -d.
//
// `finish` (workplace-kit-finish.js) recolours this room render-only: the Pink Jet-Age
// finish (#738/#744) paints the same meshes ivory, pink and chrome. Classic is the default
// and is this file's original art, unchanged.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { workplaceKitFinish, workplaceKitFinishName } from './workplace-kit-finish.js';

// Showcase views for the finished room, beside the plan's CAM-01..04 (which
// stay the measured review cameras). Same shape as room.cameras.
export const OFFICE_VIEWS = Object.freeze({
  'CAM-05': {label: 'Skyline', position: [-1.2, 1.6, 1.4], target: [4.5, 1.45, 4.3]},
  'CAM-06': {label: 'Executive suite', position: [3.7, 2.35, 0.7], target: [-1.6, 0.9, 4.6]},
});

// ---- procedural surfaces (DataTexture, so the build also runs under Node) ------
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, seed, period) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = v => ((v % period) + period) % period;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed), c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function fbm(x, y, seed, octaves, period) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += valueNoise(x * f, y * f, seed + o, period * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
const clamp255 = value => Math.max(0, Math.min(255, Math.round(value)));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mixRgb = (a, b, t) => a.map((value, k) => value + (b[k] - value) * t);

function surface(THREE, width, height, shade, { srgb = true, repeat = true } = {}) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a = 255] = shade(x, y), i = (y * width + x) * 4;
    data[i] = clamp255(r); data[i + 1] = clamp255(g); data[i + 2] = clamp255(b); data[i + 3] = clamp255(a);
  }
  const texture = new THREE.DataTexture(data, width, height);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}
// Polished obsidian stone, 1.8 m tiles: deep cloud, faint silver veins and mica.
function obsidian(THREE) {
  const size = 256;
  return surface(THREE, size, size, (x, y) => {
    const u = x / size * 4, v = y / size * 4;
    const cloud = fbm(u, v, 3, 4, 4), vein = 1 - smooth(0, 0.006, Math.abs(fbm(u * 0.8 + cloud * 1.6, v * 0.8, 9, 4, 4) - 0.5));
    const mica = hash(x, y, 41) > 0.994 ? 26 : 0, joint = x === 0 || y === 0 ? 14 : 0;
    const base = 9 + cloud * 14 + vein * 20 + joint;
    return [base + mica, base + 2 + mica * 0.9, base + 4 + mica * 0.6];
  });
}
// Ivory terrazzo (the Pink Jet-Age floor), 1.8 m tiles: a warm ground, a grout line at the
// tile edge and rounded chips of the finish's own colours, scattered once per cell so the
// tile repeats seamlessly.
function terrazzo(THREE, palette) {
  const size = 256, cells = 24, cell = size / cells, ground = rgb(palette.ground), grout = rgb(palette.grout), chips = palette.chips.map(rgb);
  const grid = [];
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++)
    grid.push(hash(cx, cy, 51) < 0.55 ? null : { x: (cx + hash(cx, cy, 52)) * cell, y: (cy + hash(cx, cy, 53)) * cell, rx: 1.2 + hash(cx, cy, 54) * 2.6, ry: 1.2 + hash(cx, cy, 55) * 2, tone: chips[Math.floor(hash(cx, cy, 56) * chips.length) % chips.length] });
  const wrap = (a, b) => Math.min(Math.abs(a - b), size - Math.abs(a - b));
  return surface(THREE, size, size, (x, y) => {
    let color = mixRgb(ground, grout, 0.25 * fbm(x / size * 4, y / size * 4, 3, 3, 4));
    if (x === 0 || y === 0) color = grout;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const flake = grid[((cy + dy + cells) % cells) * cells + (cx + dx + cells) % cells];
      if (!flake) continue;
      const fx = wrap(x, flake.x) / flake.rx, fy = wrap(y, flake.y) / flake.ry, d = fx * fx + fy * fy;
      if (d < 1) return mixRgb(flake.tone, color, smooth(0.7, 1, d));
    }
    return color;
  });
}
// Book-matched honey onyx: fine translucent bands flowing on a diagonal,
// broader honey layers and thin amber veins; mirrored about the centre seam.
// A finish may repaint the three tones (rose quartz under Pink Jet-Age).
function onyx(THREE, palette = { ivory: '#f6eedf', band: '#dcb47a', vein: '#9c6a3a' }) {
  const w = 256, h = 512, ivory = rgb(palette.ivory), honey = rgb(palette.band), amber = rgb(palette.vein);
  return surface(THREE, w, h, (x, y) => {
    const mx = Math.min(x, w - 1 - x) / w * 2, v = y / h;
    const warp = fbm(mx * 2, v * 3, 5, 5, 64), b = v * 6 + mx * 1.4 + warp * 1.9;
    const fine = 0.5 + 0.5 * Math.sin(b * Math.PI * 2 * 3.2), broad = 0.5 + 0.5 * Math.sin(b * Math.PI * 2 * 0.55 + warp * 3);
    const vein = 1 - smooth(0, 0.018, Math.abs((b * 1.3) % 1 - 0.5));
    let color = mixRgb(ivory, honey, broad * broad * 0.62 + fine * 0.1);
    color = mixRgb(color, amber, vein * 0.28 * broad);
    return color;
  }, { repeat: false });
}
// A night skyline of the garden city seen from high up: dusk gradient, stars,
// three layers of rounded towers with lit windows and two orbital ring halos.
// Drawn top-down; DataTexture rows start at the bottom, so writes flip y.
// A finish may repaint it (a dusk sky with ivory towers under Pink Jet-Age); the
// composition, the towers' seeds and every window position are the same.
const SKYLINE_NIGHT = Object.freeze({ top: '#070d22', mid: '#1b1d3f', horizon: '#7a3f5e', glow: '#e09a7c', stars: 160,
  towers: [{ tone: '#3a2f55', windows: false }, { tone: '#211d38', windows: true }, { tone: '#120f20', windows: true }],
  window: { cool: '#a9f3ff', warm: '#ffd59a', alpha: 0.85 }, spire: '#c9a86a', halo: '#b9fbff' });
function skyline(THREE, palette = SKYLINE_NIGHT) {
  const w = 1024, h = 512, data = new Uint8Array(w * h * 4);
  const top = rgb(palette.top), mid = rgb(palette.mid), horizon = rgb(palette.horizon), glow = rgb(palette.glow);
  const cool = rgb(palette.window.cool), warm = rgb(palette.window.warm), spire = rgb(palette.spire), halo = rgb(palette.halo);
  for (let y = 0; y < h; y++) {
    const t = y / h; // 0 top
    let color = t < 0.55 ? mixRgb(top, mid, t / 0.55) : t < 0.8 ? mixRgb(mid, horizon, (t - 0.55) / 0.25) : mixRgb(horizon, glow, Math.min(1, (t - 0.8) / 0.12));
    for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4, star = t < 0.5 && hash(x, y, 7) > 0.9985 ? palette.stars * (1 - t) : 0;
      data[i] = clamp255(color[0] + star); data[i + 1] = clamp255(color[1] + star); data[i + 2] = clamp255(color[2] + star); data[i + 3] = 255;
    }
  }
  const put = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = ((h - 1 - y) * w + x) * 4;
    for (let k = 0; k < 3; k++) data[i + k] = clamp255(data[i + k] + (color[k] - data[i + k]) * alpha);
  };
  const towers = (seed, base, tone, windows, minH, maxH, minW, maxW) => {
    for (let x = -20, n = 0; x < w; n++) {
      const tw = minW + hash(n, 1, seed) * (maxW - minW), th = minH + hash(n, 2, seed) ** 1.6 * (maxH - minH);
      const dome = hash(n, 3, seed) > 0.6, top = base - th;
      for (let px = Math.floor(x); px < x + tw; px++) {
        const edge = (px - x) / tw, cap = dome ? Math.sqrt(Math.max(0, 1 - (2 * edge - 1) ** 2)) * tw * 0.5 : 0;
        for (let py = Math.floor(top - cap); py < base; py++) put(px, py, tone);
        if (windows) for (let py = Math.floor(top + 4); py < base - 2; py += 5) if ((px - Math.floor(x)) % 4 === 1 && hash(px, py, seed + 9) > 0.45) put(px, py, hash(px, py, seed + 3) > 0.8 ? cool : warm, palette.window.alpha);
      }
      if (dome && hash(n, 4, seed) > 0.4) for (let py = Math.floor(top - tw * 0.5 - 18); py < top - tw * 0.5; py++) put(Math.floor(x + tw / 2), py, spire);
      x += tw + 2 + hash(n, 5, seed) * 10;
    }
  };
  towers(11, h * 0.9, rgb(palette.towers[0].tone), palette.towers[0].windows, 60, 190, 18, 46);
  towers(23, h * 0.95, rgb(palette.towers[1].tone), palette.towers[1].windows, 50, 260, 22, 60);
  towers(37, h * 1.0, rgb(palette.towers[2].tone), palette.towers[2].windows, 30, 170, 30, 80);
  for (const [cx, cy, rx, ry] of [[w * 0.3, h * 0.42, 70, 12], [w * 0.74, h * 0.36, 54, 9]])
    for (let a = 0; a < Math.PI * 2; a += 0.002) put(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), halo, 0.75);
  const texture = new THREE.DataTexture(data, w, h);
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
// Holographic interface: cyan rules, a gauge, bars and text-like rows on black
// (additive blending makes black transparent). A placeholder painted from `ink`
// alone: no text, no data, never an owner's work.
function interfaceTexture(THREE, ink = [120, 240, 255]) {
  const w = 256, h = 128;
  return surface(THREE, w, h, (x, y) => {
    const cyan = ink;
    let alpha = 0.04 + 0.05 * (1 - Math.abs(y / h - 0.5) * 2);
    if (x < 2 || x > w - 3 || y < 2 || y > h - 3) alpha = 0.9;
    if (y % 22 === 11 && x > 12 && x < 150) alpha = Math.max(alpha, 0.35);
    if (x > 14 && x < 140 && (y % 22) > 13 && (y % 22) < 17 && hash(Math.floor(x / 9), Math.floor(y / 22), 3) > 0.3) alpha = Math.max(alpha, 0.6);
    const gx = x - 205, gy = y - 52, r = Math.hypot(gx, gy);
    if (Math.abs(r - 30) < 2 && Math.atan2(gy, gx) < 1.9) alpha = 0.95;
    if (Math.abs(r - 22) < 1) alpha = Math.max(alpha, 0.4);
    if (y > 96 && y < 120 && x > 170 && x < 244 && (x - 170) % 10 < 6 && 120 - y < 6 + hash(Math.floor((x - 170) / 10), 0, 5) * 20) alpha = 0.85;
    return cyan.map(value => value * alpha);
  }, { repeat: false });
}
// Concave 60 mm flutes, eight per 0.48 m tile, as a tangent-space normal map.
function fluteNormals(THREE) {
  const w = 64, flute = w / 8, land = 0.12;
  return surface(THREE, w, 4, x => {
    const t = (x + 0.5) % flute / flute, s = t < land ? 0 : ((t - land) / (1 - land)) * 2 - 1, nx = s * 0.85;
    return [(nx * 0.5 + 0.5) * 255, 128, (Math.sqrt(1 - nx * nx) * 0.5 + 0.5) * 255];
  }, { srgb: false });
}

// ---- the office -----------------------------------------------------------------
export function buildWorkplaceOffice(THREE, room, { finish = 'classic' } = {}) {
  // The finish is a palette, never an input of data: an unknown name is classic.
  const kit = workplaceKitFinish(finish), paint = kit.surfaces;
  const object = new THREE.Group(); object.name = `${room.site.label} office`;
  object.userData.finish = workplaceKitFinishName(finish);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const g = geometry => { geometries.add(geometry); return geometry; };
  const t = texture => { textures.add(texture); return texture; };
  const std = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const phys = options => { const m = new THREE.MeshPhysicalMaterial(options); materials.add(m); return m; };
  const W = room.width, D = room.depth, H = room.height, half = W / 2, door = room.door;
  const obstacle = id => room.obstacles.find(item => item.id === id);
  const unit = g(new THREE.BoxGeometry(1, 1, 1)), wall = 0.15;
  // Rounded solids for furniture, one geometry per size.
  const roundedCache = new Map();
  const rounded = (w, h, l, radius) => { const key = [w, h, l, radius].join(); if (!roundedCache.has(key)) roundedCache.set(key, g(new RoundedBoxGeometry(w, h, l, 4, radius))); return roundedCache.get(key); };

  // materials
  const floorMap = t(paint.floor ? terrazzo(THREE, paint.floor) : obsidian(THREE)); floorMap.repeat.set(W / 1.8, D / 1.8);
  const floor = phys({ map: floorMap, roughness: 0.14, clearcoat: 0.85, clearcoatRoughness: 0.05, envMapIntensity: 1.1 });
  const graphite = std({ color: '#1b2022', roughness: 0.82 });
  const lacquer = phys({ color: '#101516', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0 });
  // Walls take a satin lacquer, so the point lights bloom softly instead of leaving hot spots.
  const satin = std({ color: '#121718', roughness: 0.62, envMapIntensity: 0.5 });
  const frontFlutes = t(fluteNormals(THREE)); frontFlutes.repeat.set((half + wall - door.halfWidth) / 0.48, 1);
  const graphiteFlute = std({ color: '#1d2325', roughness: 0.55, normalMap: frontFlutes, normalScale: new THREE.Vector2(1.2, 1.2), envMapIntensity: 0.6 });
  const gold = std({ color: '#d1b075', roughness: 0.24, metalness: 1, envMapIntensity: 1.2 });
  const flutes = t(fluteNormals(THREE)); flutes.repeat.set(D / 0.48, 1);
  const ivory = std({ color: '#e7dccb', roughness: 0.58, normalMap: flutes, normalScale: new THREE.Vector2(1.2, 1.2), emissive: '#ffffff', emissiveIntensity: 0.04, envMapIntensity: 0.6 });
  const onyxMap = t(onyx(THREE, paint.feature));
  const onyxWall = std({ map: onyxMap, emissiveMap: onyxMap, emissive: '#ffffff', emissiveIntensity: 0.36, roughness: 0.32, envMapIntensity: 0.6 });
  const pearl = phys({ color: '#f2ede5', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 });
  const blackGlass = phys({ color: '#07090a', roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 });
  const warmLight = std({ color: '#fff4e2', emissive: '#ffe1b4', emissiveIntensity: 3.2, roughness: 0.4 });
  const coolLight = std({ color: '#effdff', emissive: '#bdf6ff', emissiveIntensity: 2.6, roughness: 0.4 });
  const skyMap = t(skyline(THREE, paint.skyline));
  const sky = std({ color: '#000000', emissive: '#ffffff', emissiveMap: skyMap, emissiveIntensity: 1.25, roughness: 1 });
  const glass = phys({ color: '#a7cfd2', transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0.1, envMapIntensity: 1.4, depthWrite: false });
  const smoked = phys({ color: '#3b3029', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const uiMap = t(interfaceTexture(THREE, paint.interface?.ink));
  const holo = new THREE.MeshBasicMaterial({ map: uiMap, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); materials.add(holo);
  const holoLine = new THREE.MeshBasicMaterial({ color: '#7fefff', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }); materials.add(holoLine);
  const holoBeam = new THREE.MeshBasicMaterial({ color: '#56dcff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); materials.add(holoBeam);
  const leather = phys({ color: '#8b5434', roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.35, sheenColor: '#ffd9b8' });
  const chrome = std({ color: '#e4e7ea', roughness: 0.08, metalness: 1, envMapIntensity: 1.3 });
  const velvet = std({ color: '#1f454a', roughness: 1 });
  const ceramic = phys({ color: '#0d1112', roughness: 0.2, clearcoat: 1 });
  const foliage = std({ color: '#2d5a3f', roughness: 0.9 });
  const cabinetGlow = std({ color: '#17120f', emissive: '#ffcf96', emissiveIntensity: 0.05, roughness: 0.22, metalness: 0.75, envMapIntensity: 0.8 });
  const named = { floor, graphite, lacquer, satin, graphiteFlute, gold, ivory, onyxWall, pearl, blackGlass, warmLight, coolLight, sky, glass, smoked, holo, holoLine, holoBeam, leather, chrome, velvet, ceramic, foliage, cabinetGlow };
  for (const [name, material] of Object.entries(named)) material.name = `office-${name}`;
  // The finish's field overrides (workplace-kit-finish.js): colours are set on the existing
  // THREE.Color, numbers replace the field. Classic has none.
  for (const [name, fields] of Object.entries(kit.materials)) for (const [field, value] of Object.entries(fields)) {
    if (named[name][field]?.isColor) named[name][field].set(value); else named[name][field] = value;
  }

  const add = (geometry, material, [x, y, d], zone, { s = [1, 1, 1], r = [0, 0, 0], shadow = true, name } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, -d); mesh.rotation.set(...r); mesh.scale.set(...s);
    mesh.castShadow = shadow && !material.transparent && material !== warmLight && material !== coolLight && material !== sky;
    mesh.receiveShadow = !material.transparent; mesh.userData.zone = zone; if (name) mesh.name = name;
    object.add(mesh); return mesh;
  };
  // An axis-aligned block from its extents.
  const block = (material, [x0, x1], [y0, y1], [d0, d1], zone, options) => add(unit, material, [(x0 + x1) / 2, (y0 + y1) / 2, (d0 + d1) / 2], zone, { s: [x1 - x0, y1 - y0, d1 - d0], ...options });
  const facing = { west: [0, Math.PI / 2, 0], east: [0, -Math.PI / 2, 0], door: [0, 0, 0], down: [Math.PI / 2, 0, 0], up: [-Math.PI / 2, 0, 0] };
  const pane = (material, width, height, at, zone, r, options) => add(g(new THREE.PlaneGeometry(width, height)), material, at, zone, { r, shadow: false, ...options });
  const stadium = (path, w, l) => {
    const radius = l / 2, a = w / 2 - radius;
    path.moveTo(-a, -radius); path.lineTo(a, -radius); path.absarc(a, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    path.lineTo(-a, radius); path.absarc(-a, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
    return path;
  };
  const stadiumShape = (w, l, ring = 0) => {
    const shape = stadium(new THREE.Shape(), w, l);
    if (ring) shape.holes.push(stadium(new THREE.Path(), w - 2 * ring, l - 2 * ring));
    return g(new THREE.ShapeGeometry(shape, 32));
  };

  // ---- shell -------------------------------------------------------------------
  block(floor, [-half, half], [-0.05, 0], [0, D], 'floor', { name: 'Obsidian floor' });
  block(ivory, [-half - wall, -half], [0, H], [0, D], 'wall', { name: 'Fluted west wall' });
  block(satin, [half, half + wall], [0, H], [0, D], 'wall');
  block(satin, [-half - wall, half + wall], [0, H], [D, D + wall], 'wall');
  for (const sign of [-1, 1]) block(graphiteFlute, sign < 0 ? [-half - wall, -door.halfWidth] : [door.halfWidth, half + wall], [0, H], [-wall, 0], 'wall', { name: 'Fluted entrance wall' });
  block(satin, [-door.halfWidth, door.halfWidth], [door.height, H], [-wall, 0], 'wall', { name: 'Door header' });
  block(graphite, [-half, half], [H - 0.04, H], [0, D], 'ceiling', { name: 'Graphite ceiling' });

  // Floor: gilded border, a door threshold and two light lanes marking the 1.8 m aisle.
  for (const [x0, x1, d0, d1] of [[-half + 0.38, half - 0.38, 0.38, 0.4], [-half + 0.38, half - 0.38, D - 0.4, D - 0.38], [-half + 0.38, -half + 0.4, 0.38, D - 0.38], [half - 0.4, half - 0.38, 0.38, D - 0.38]])
    block(gold, [x0, x1], [0, 0.003], [d0, d1], 'floor', { shadow: false });
  block(gold, [-door.halfWidth, door.halfWidth], [0, 0.004], [-0.02, 0.06], 'floor', { shadow: false, name: 'Threshold' });
  for (const x of [-0.95, 0.95]) block(coolLight, [x - 0.012, x + 0.012], [0, 0.004], [0.45, obstacle('storage-wall').d0 - 0.35], 'floor', { name: 'Light lane' });
  // A teal velvet stadium rug for the review corner, edged in gold.
  const review = obstacle('review-table');
  const rugCenter = [(review.x0 + review.x1) / 2 - 0.45, (review.d0 + review.d1) / 2];
  add(stadiumShape(2.5, 1.9), velvet, [rugCenter[0], 0.004, rugCenter[1]], 'floor', { r: facing.up, shadow: false, name: 'Review rug' });
  add(stadiumShape(2.5, 1.9, 0.035), gold, [rugCenter[0], 0.006, rugCenter[1]], 'floor', { r: facing.up, shadow: false });

  // Ceiling: a double stadium halo, a perimeter cove and gold-bezelled downlights.
  add(stadiumShape(5.6, 3.4, 0.07), warmLight, [0, H - 0.042, D / 2], 'ceiling', { r: facing.down, name: 'Stadium halo' });
  add(stadiumShape(4.5, 2.3, 0.025), coolLight, [0, H - 0.042, D / 2], 'ceiling', { r: facing.down });
  for (const [x0, x1, d0, d1] of [[-half + 0.1, half - 0.1, 0.1, 0.13], [-half + 0.1, half - 0.1, D - 0.13, D - 0.1], [-half + 0.1, -half + 0.13, 0.1, D - 0.1], [half - 0.13, half - 0.1, 0.1, D - 0.1]])
    block(warmLight, [x0, x1], [H - 0.06, H - 0.04], [d0, d1], 'ceiling');
  const disc = g(new THREE.CylinderGeometry(1, 1, 1, 32)), bezel = g(new THREE.TorusGeometry(1, 0.12, 8, 32));
  const downlights = [...room.stations.map(station => [-half + 0.9, station.seat[1]]), [review.x0 + 0.45, review.d0 + 0.4], [review.x0 + 0.45, review.d1 - 0.4], [-2.6, D - 0.9], [2.6, D - 0.9]];
  for (const [x, d] of downlights) {
    add(disc, warmLight, [x, H - 0.045, d], 'ceiling', { s: [0.05, 0.01, 0.05] });
    add(bezel, gold, [x, H - 0.045, d], 'ceiling', { s: [0.065, 0.065, 0.065], r: facing.down });
  }

  // West wall: fluted ivory with vertical light blades between the desks.
  const deskRows = room.stations.map(station => obstacle(station.desk));
  const blades = [deskRows[0].d0 - 0.6, (deskRows[0].d1 + deskRows[1].d0) / 2, deskRows[1].d1 + 0.6].filter(d => d > 0.3 && d < D - 0.3);
  for (const d of blades) block(warmLight, [-half, -half + 0.012], [0.12, H - 0.4], [d - 0.012, d + 0.012], 'wall', { name: 'Light blade' });
  block(lacquer, [-half, -half + 0.02], [0, 0.12], [0, D], 'wall');
  block(gold, [-half, -half + 0.024], [0.12, 0.13], [0, D], 'wall');

  // Back wall: backlit book-matched onyx framed in gold, above a lacquer skirting.
  pane(onyxWall, W - 0.3, H - 0.55, [0, 0.12 + (H - 0.55) / 2, D - 0.012], 'wall', facing.door, { name: 'Backlit onyx wall' });
  block(lacquer, [-half, half], [0, 0.12], [D - 0.03, D], 'wall');
  for (const [x0, x1, y0, y1] of [[-half + 0.13, half - 0.13, 0.11, 0.13], [-half + 0.13, half - 0.13, H - 0.44, H - 0.42], [-half + 0.13, -half + 0.15, 0.11, H - 0.42], [half - 0.15, half - 0.13, 0.11, H - 0.42]])
    block(gold, [x0, x1], [y0, y1], [D - 0.03, D], 'wall');

  // East wall: a gilded curtain wall onto a night skyline.
  const glazing = { d0: 1.15, d1: D - 0.45, y0: 0.12, y1: H - 0.35 };
  pane(sky, glazing.d1 - glazing.d0, glazing.y1 - glazing.y0, [half - 0.012, (glazing.y0 + glazing.y1) / 2, (glazing.d0 + glazing.d1) / 2], 'wall', facing.east, { name: 'Skyline' });
  pane(glass, glazing.d1 - glazing.d0, glazing.y1 - glazing.y0, [half - 0.06, (glazing.y0 + glazing.y1) / 2, (glazing.d0 + glazing.d1) / 2], 'wall', facing.east);
  const bays = 4;
  for (let k = 0; k <= bays; k++) { const d = glazing.d0 + k * (glazing.d1 - glazing.d0) / bays; block(gold, [half - 0.09, half - 0.02], [glazing.y0, glazing.y1], [d - 0.018, d + 0.018], 'wall'); }
  for (const y of [glazing.y0, H - 1.1, glazing.y1]) block(gold, [half - 0.09, half - 0.02], [y - 0.018, y + 0.018], [glazing.d0, glazing.d1], 'wall');
  block(satin, [half - 0.12, half], [0, glazing.y0], [glazing.d0 - 0.05, glazing.d1 + 0.05], 'wall');
  block(satin, [half - 0.12, half], [glazing.y1, H], [glazing.d0 - 0.05, glazing.d1 + 0.05], 'wall');

  // Entrance wall: a gold portal around the door and two light blades.
  for (const sign of [-1, 1]) block(gold, sign < 0 ? [-door.halfWidth - 0.07, -door.halfWidth - 0.01] : [door.halfWidth + 0.01, door.halfWidth + 0.07], [0, door.height + 0.07], [0, 0.05], 'wall', { name: 'Portal' });
  block(gold, [-door.halfWidth - 0.07, door.halfWidth + 0.07], [door.height + 0.01, door.height + 0.07], [0, 0.05], 'wall');
  for (const x of [-1.6, 1.6]) block(warmLight, [x - 0.012, x + 0.012], [0.12, H - 0.4], [0, 0.012], 'wall');

  // ---- desks: floating onyx slabs with curved holographic screens ---------------
  const screen = g(new THREE.CylinderGeometry(0.9, 0.9, 0.42, 24, 1, true, Math.PI * 1.5 - 0.45, 0.9));
  const orb = g(new THREE.SphereGeometry(1, 24, 16));
  for (const [index, station] of room.stations.entries()) {
    const desk = deskRows[index], zone = `fixture:${desk.id}`, top = desk.height, [sx, sd] = station.seat;
    add(rounded(desk.x1 - desk.x0, 0.05, desk.d1 - desk.d0, 0.02), pearl, [(desk.x0 + desk.x1) / 2, top - 0.025, (desk.d0 + desk.d1) / 2], zone, { name: 'Pearl desk' });
    block(gold, [desk.x1 - 0.012, desk.x1], [top - 0.05, top], [desk.d0, desk.d1], zone);
    block(lacquer, [-half, desk.x0 + 0.12], [0, top - 0.05], [desk.d0 + 0.12, desk.d1 - 0.12], zone, { name: 'Cantilever pedestal' });
    block(coolLight, [desk.x1 - 0.05, desk.x1 - 0.03], [top - 0.056, top - 0.05], [desk.d0 + 0.05, desk.d1 - 0.05], zone);
    // The screen wraps the seat at 0.9 m, so its arc stays over the desk top.
    add(screen, holo, [sx, top + 0.33, sd], zone, { shadow: false, name: 'Holographic screen' });
    block(gold, [sx - 0.91, sx - 0.89], [top, top + 0.12], [sd - 0.01, sd + 0.01], zone);
    block(coolLight, [desk.x1 - 0.26, desk.x1 - 0.1], [top, top + 0.006], [sd - 0.22, sd + 0.22], zone, { name: 'Glass keyboard' });
    add(orb, gold, [desk.x0 + 0.16, top + 0.05, desk.d1 - 0.18], zone, { s: [0.05, 0.05, 0.05] });

    // Executive chair at the seat socket, facing the desk (west).
    const seatZone = `seat:${station.id}`;
    add(disc, chrome, [sx, 0.03, sd], seatZone, { s: [0.06, 0.06, 0.06] });
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; add(unit, chrome, [sx + Math.cos(a) * 0.15, 0.035, sd + Math.sin(a) * 0.15], seatZone, { s: [0.3, 0.025, 0.04], r: [0, -a, 0] }); }
    add(disc, chrome, [sx, 0.25, sd], seatZone, { s: [0.028, 0.42, 0.028] });
    add(rounded(0.54, 0.11, 0.54, 0.05), leather, [sx, 0.47, sd], seatZone, { name: 'Executive chair' });
    add(rounded(0.1, 0.8, 0.52, 0.045), leather, [sx + 0.27, 0.93, sd], seatZone, { r: [0, 0, -0.14] });
    add(rounded(0.06, 0.14, 0.36, 0.03), leather, [sx + 0.31, 1.42, sd], seatZone, { r: [0, 0, -0.14] });
    for (const side of [-1, 1]) block(gold, [sx - 0.2, sx + 0.22], [0.65, 0.67], [sd + side * 0.27 - 0.012, sd + side * 0.27 + 0.012], seatZone);
  }

  // ---- review table: a monolith with an orbital hologram ---------------------------
  const rz = `fixture:${review.id}`, rc = [(review.x0 + review.x1) / 2, (review.d0 + review.d1) / 2], rTop = review.height;
  add(rounded(review.x1 - review.x0 - 0.3, rTop - 0.06, review.d1 - review.d0 - 0.4, 0.03), onyxWall, [rc[0], (rTop - 0.06) / 2, rc[1]], rz, { name: 'Backlit onyx monolith' });
  block(warmLight, [review.x0 + 0.1, review.x1 - 0.1], [0, 0.004], [review.d0 + 0.15, review.d1 - 0.15], rz);
  add(rounded(review.x1 - review.x0, 0.06, review.d1 - review.d0, 0.025), blackGlass, [rc[0], rTop - 0.03, rc[1]], rz, { name: 'Black glass review table' });
  block(gold, [review.x0 + 0.02, review.x1 - 0.02], [rTop - 0.068, rTop - 0.06], [review.d0 + 0.02, review.d1 - 0.02], rz);
  add(disc, coolLight, [rc[0], rTop + 0.004, rc[1]], rz, { s: [0.11, 0.008, 0.11] });
  add(disc, gold, [rc[0], rTop + 0.002, rc[1]], rz, { s: [0.14, 0.004, 0.14] });
  add(g(new THREE.CylinderGeometry(0.2, 0.1, 0.36, 32, 1, true)), holoBeam, [rc[0], rTop + 0.19, rc[1]], rz, { shadow: false });
  const globe = add(g(new THREE.IcosahedronGeometry(0.16, 2)), holoLine, [rc[0], rTop + 0.44, rc[1]], rz, { shadow: false, name: 'Orbital hologram' });
  const orbitGeometry = g(new THREE.TorusGeometry(0.25, 0.004, 6, 96));
  const orbits = [0.5, -0.9].map((tilt, k) => add(orbitGeometry, holoLine, [rc[0], rTop + 0.44, rc[1]], rz, { r: [Math.PI / 2 + tilt, k * 0.8, 0], shadow: false }));

  // ---- storage wall: lacquer and gold cabinetry with backlit niches ----------------
  const store = obstacle('storage-wall'), sz = `fixture:${store.id}`, sTop = store.height;
  block(lacquer, [store.x0, store.x1], [0, 0.1], [store.d0 + 0.04, store.d1], sz);
  block(cabinetGlow, [store.x0 + 0.04, store.x1 - 0.04], [0.1, sTop - 0.06], [store.d1 - 0.03, store.d1], sz, { name: 'Bronze niches' });
  for (const x of [store.x0, store.x1 - 0.04]) block(lacquer, [x, x + 0.04], [0, sTop], [store.d0, store.d1], sz);
  block(lacquer, [store.x0, store.x1], [sTop - 0.06, sTop], [store.d0, store.d1], sz);
  block(gold, [store.x0, store.x1], [sTop - 0.06, sTop], [store.d0, store.d0 + 0.012], sz);
  const span = store.x1 - store.x0, bayWidth = (span - 0.08) / 3;
  for (const k of [1, 2]) block(gold, [store.x0 + 0.04 + k * bayWidth - 0.01, store.x0 + 0.04 + k * bayWidth + 0.01], [0.1, sTop - 0.06], [store.d0 + 0.02, store.d1 - 0.03], sz);
  const shelves = [0.1, 0.78, 1.42];
  for (const y of shelves.slice(1)) {
    block(smoked, [store.x0 + 0.04, store.x1 - 0.04], [y, y + 0.015], [store.d0 + 0.02, store.d1 - 0.03], sz);
    block(warmLight, [store.x0 + 0.06, store.x1 - 0.06], [y - 0.008, y], [store.d0 + 0.03, store.d0 + 0.045], sz);
  }
  const vase = g(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.1, 0.12], [0.06, 0.26], [0.04, 0.3], [0.045, 0.32], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y)), 32));
  const ringObject = g(new THREE.TorusGeometry(0.12, 0.018, 12, 48));
  for (let bay = 0; bay < 3; bay++) for (const [level, y] of shelves.entries()) {
    const x = store.x0 + 0.04 + (bay + 0.5) * bayWidth, d = (store.d0 + store.d1) / 2, pick = (bay + level) % 3;
    if (pick === 0) add(orb, gold, [x, y + 0.115, d], sz, { s: [0.1, 0.1, 0.1] });
    else if (pick === 1) add(vase, ceramic, [x, y + 0.015, d], sz);
    else add(ringObject, gold, [x, y + 0.155, d], sz, { r: [0, 0.4, 0] });
  }

  // ---- planter: black ceramic with a cloud-pruned tree ------------------------------
  const planter = obstacle('planter-east'), pz = `fixture:${planter.id}`, pc = [(planter.x0 + planter.x1) / 2, (planter.d0 + planter.d1) / 2];
  add(g(new THREE.CylinderGeometry(0.22, 0.17, 0.55, 40)), ceramic, [pc[0], 0.275, pc[1]], pz, { name: 'Planter' });
  add(g(new THREE.TorusGeometry(0.22, 0.008, 8, 48)), gold, [pc[0], 0.55, pc[1]], pz, { r: facing.down });
  add(disc, graphite, [pc[0], 0.535, pc[1]], pz, { s: [0.21, 0.01, 0.21] });
  add(disc, std({ color: '#3d2c22', roughness: 0.8 }), [pc[0], 0.85, pc[1]], pz, { s: [0.022, 0.62, 0.022] });
  const crown = g(new THREE.IcosahedronGeometry(1, 2));
  for (const [dx, y, dd, radius] of [[0, 1.28, 0, 0.14], [0.08, 1.12, 0.05, 0.11], [-0.08, 1.06, -0.04, 0.1], [0.03, 1.42, -0.06, 0.1], [-0.05, 0.96, 0.07, 0.08]])
    add(crown, foliage, [pc[0] + dx, y, pc[1] + dd], pz, { s: [radius, radius * 0.85, radius] });

  // ---- light: warm pools at the desks and table, a cool spill from the window -------
  for (const [x, y, d, color, intensity] of [[-half + 1.1, 2.7, (deskRows[0].d1 + deskRows[1].d0) / 2, '#ffe2bd', 7], [rc[0] - 0.2, 2.6, rc[1], '#ffe2bd', 6], [0, 3.1, D * 0.55, '#ffeacc', 5], [half - 0.7, 2.2, D - 1.6, '#a9d9ff', 3]]) {
    const light = new THREE.PointLight(color, intensity, 7, 2); light.position.set(x, y, -d); light.castShadow = false; object.add(light);
  }

  return {
    object,
    // Slow orbits for the hologram; the fixture calls this with frame time.
    update(time = 0) {
      globe.rotation.y = time * 0.35;
      orbits[0].rotation.z = time * 0.8; orbits[1].rotation.z = -time * 0.55;
    },
    dispose() {
      object.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      object.clear();
    },
  };
}
