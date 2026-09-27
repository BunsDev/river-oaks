import * as THREE from 'three';
import { RETRO } from './retro-palette.js';
import { ROOM_HEIGHT } from './store-rooms.js';

// Walk-in boutique interiors: shell, finishes, fixtures and merchandise per
// room plan. Everything is original procedural geometry and generated surface
// art; there are no product replicas, brand marks or photographed interiors.

// ---- procedural surfaces ---------------------------------------------------
function noiseField(seed) {
  let s = seed >>> 0; const random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, i = xi & 255, j = yi & 255;
    const h = (a, b) => perm[perm[a & 255] + (b & 255)] / 255;
    const u = fade(xf), v = fade(yf);
    return (h(i, j) + (h(i + 1, j) - h(i, j)) * u) * (1 - v) + (h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u) * v;
  };
  return { random, noise, fbm(x, y, octaves = 4) { let sum = 0, amp = 0.5, f = 1, norm = 0; for (let o = 0; o < octaves; o++) { sum += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; } return sum / norm; } };
}
function canvasTexture(size, draw, { repeat = true } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = size[0]; canvas.height = size[1];
  draw(canvas.getContext('2d'), canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
function pixelTexture(size, seed, shade) {
  return canvasTexture([size, size], (ctx, w, h) => {
    const field = noiseField(seed), image = ctx.createImageData(w, h), data = image.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b] = shade(x / w, y / h, field), i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  });
}
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function marbleTexture(seed, base, vein) {
  return pixelTexture(512, seed, (u, v, f) => {
    const warp = f.fbm(u * 3 + 7, v * 3 + 3, 5), veins = Math.abs(Math.sin((u * 1.4 + v * 0.6 + warp * 2.2) * Math.PI * 2));
    const mask = 1 - smooth(0.02, 0.16, veins) * 0.85, mottle = f.fbm(u * 9, v * 9, 3) * 0.08 - 0.04;
    return base.map((c, i) => Math.round(mix(vein[i], c, mask) * (1 + mottle)));
  });
}
function plankTexture(seed, tones, { width = 0.16, length = 2.4, tile = 2.4 } = {}) {
  // Long boards with hairline seams and soft grain; heavy seams read as brick.
  return canvasTexture([1024, 1024], (ctx, w, h) => {
    const field = noiseField(seed), px = w / tile;
    ctx.fillStyle = tones[0]; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row * width < tile; row++) {
      const offset = ((row * 7) % 5) * length / 5;
      for (let col = -1; col * length - offset < tile; col++) {
        const x = (col * length - offset) * px, y = row * width * px, plank = tones[Math.floor(field.random() * tones.length)];
        ctx.fillStyle = plank; ctx.fillRect(x, y, length * px, width * px);
        ctx.strokeStyle = '#0000000e'; ctx.lineWidth = 1;
        for (let grain = 0; grain < 5; grain++) { const gy = y + 3 + field.random() * (width * px - 6); ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + length * px, gy + (field.random() - 0.5) * 4); ctx.stroke(); }
        ctx.fillStyle = '#00000022'; ctx.fillRect(x, y, length * px, 1); ctx.fillRect(x, y, 1, width * px);
      }
    }
  });
}
function terrazzoTexture(seed, base, chips) {
  return canvasTexture([512, 512], (ctx, w, h) => {
    const field = noiseField(seed);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = chips[Math.floor(field.random() * chips.length)];
      const x = field.random() * w, y = field.random() * h, r = 1.5 + field.random() * 6;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + field.random() * 0.6), field.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  });
}
function carpetTexture(seed) {
  return pixelTexture(256, seed, (u, v, f) => { const n = f.fbm(u * 24, v * 24, 3); return [Math.round(56 + n * 22), Math.round(30 + n * 14), Math.round(48 + n * 18)]; });
}
function plasterTexture(seed) {
  return pixelTexture(256, seed, (u, v, f) => { const n = 236 + (f.fbm(u * 6, v * 6, 4) - 0.5) * 14; return [Math.round(n), Math.round(n - 3), Math.round(n - 8)]; });
}
function artTexture(seed) {
  const palettes = [['#e8e2d6', '#2a2a2e', '#b47a5c', '#8d9b8c'], ['#f1ede4', '#d99a8c', '#5b6a7a', '#2c2c30'], ['#efe9dd', '#c9b58c', '#6c5a4a', '#a3aeb3'], ['#f4f1ea', '#3a3f4a', '#c76b57', '#d9c3a3'], ['#ebe6dd', '#7f8c7a', '#d3a56a', '#33363a'], ['#f0ece6', '#a55b4e', '#2f3d48', '#c8c2b4']];
  const palette = palettes[seed % palettes.length];
  return canvasTexture([256, 256], (ctx, w, h) => {
    const field = noiseField(seed * 31 + 5);
    ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = palette[1 + Math.floor(field.random() * 3)]; ctx.globalAlpha = 0.75 + field.random() * 0.25;
      if (field.random() > 0.5) ctx.fillRect(field.random() * w * 0.7, field.random() * h * 0.7, 20 + field.random() * w * 0.5, 20 + field.random() * h * 0.5);
      else { ctx.beginPath(); ctx.arc(field.random() * w, field.random() * h, 12 + field.random() * 60, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }, { repeat: false });
}
function posterTexture(seed, style) {
  const palettes = [['#1d1f2b', '#e2a1c9', '#f4efe7'], ['#2a1c1c', '#d9a066', '#f1e6d2'], ['#12242b', '#8fc1c9', '#f3f7f7'], ['#2c2530', '#ad267e', '#f7e8f1']];
  const palette = palettes[seed % palettes.length];
  return canvasTexture([256, style === 'menu' ? 96 : 384], (ctx, w, h) => {
    const field = noiseField(seed * 17 + 9), gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, palette[0]); gradient.addColorStop(1, palette[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = palette[2]; ctx.globalAlpha = 0.85;
    if (style === 'menu') { for (let row = 0; row < 3; row++) { ctx.fillRect(12, 14 + row * 26, 90 + field.random() * 60, 8); ctx.fillRect(w - 40, 14 + row * 26, 24, 8); } }
    else { for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(field.random() * w, h * 0.3 + field.random() * h * 0.4, 20 + field.random() * 70, 0, Math.PI * 2); ctx.fill(); } ctx.fillRect(24, h - 70, w - 48, 10); ctx.fillRect(24, h - 50, (w - 48) * 0.6, 6); }
    ctx.globalAlpha = 1;
  }, { repeat: false });
}

// ---- geometry catalogue ----------------------------------------------------
function lathe(points, segments = 12) { return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), segments); }
function garmentGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.2, 0); shape.lineTo(0.2, 0); shape.lineTo(0.25, -0.5); shape.lineTo(0.23, -0.95); shape.lineTo(-0.23, -0.95); shape.lineTo(-0.25, -0.5); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }); geometry.translate(0, 0, -0.025); return geometry;
}

export function buildStoreInteriors(rooms, { atlas, reflectionMaterials = [] } = {}) {
  const group = new THREE.Group(); group.name = 'Boutique interiors';
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const track = { g: g => { geometries.add(g); return g; }, m: m => { materials.add(m); return m; }, t: t => { textures.add(t); return t; } };
  const standard = options => track.m(new THREE.MeshStandardMaterial({ envMapIntensity: 0.35, ...options }));
  const physical = options => track.m(new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.4, ...options }));
  // finishes
  const floors = {
    marble: standard({ map: track.t(marbleTexture(11, [236, 233, 228], [150, 146, 148])), roughness: 0.18, metalness: 0 }),
    darkMarble: standard({ map: track.t(marbleTexture(23, [72, 70, 72], [150, 140, 128])), roughness: 0.16 }),
    oak: standard({ map: track.t(plankTexture(5, ['#c9ad88', '#c4a682', '#cfb391', '#bea07c'])), roughness: 0.42 }),
    walnut: standard({ map: track.t(plankTexture(9, ['#5e4534', '#634937', '#584030', '#67503f'])), roughness: 0.38 }),
    terrazzo: standard({ map: track.t(terrazzoTexture(3, RETRO.ivory, [RETRO.teal, RETRO.rose, RETRO.brass, RETRO.mint, '#f7f1e3'])), roughness: 0.3 }),
    carpet: standard({ map: track.t(carpetTexture(4)), roughness: 1 }),
  };
  const themeFloor = { fashion: floors.terrazzo, leather: floors.marble, jewelry: floors.marble, perfumery: floors.marble, optician: floors.marble, gallery: floors.terrazzo, dining: floors.terrazzo, gelato: floors.terrazzo, salon: floors.terrazzo, wellness: floors.terrazzo, cinema: floors.carpet };
  for (const material of Object.values(floors)) { material.map.repeat.set(1, 1); material.emissiveMap = material.map; material.emissive.set('#ffffff'); material.emissiveIntensity = 0.18; }
  const plaster = track.t(plasterTexture(7));
  const wallTint = { fashion:RETRO.ivory, leather:RETRO.mint, jewelry:RETRO.porcelain, perfumery:'#dbc2c1', optician:RETRO.mint, gallery:RETRO.porcelain, dining:RETRO.deepTeal, gelato:'#e4c7b4', salon:'#c4d5ce', wellness:RETRO.mint, cinema:RETRO.night };
  const walls = Object.fromEntries(Object.entries(wallTint).map(([theme, color]) => [theme, standard({ map: plaster, color, roughness: 0.92, emissive: color, emissiveIntensity: 0.3, envMapIntensity: 0.5 })]));
  const ceiling = standard({ color: '#f3efe8', roughness: 0.95, emissive: '#f3efe8', emissiveIntensity: 0.22 });
  const slat = standard({ color: '#f1ebe1', roughness: 0.8, emissive: '#f1ebe1', emissiveIntensity: 0.12 });
  const darkSlat = standard({ color: '#4a3a30', roughness: 0.7, emissive: '#4a3a30', emissiveIntensity: 0.12 });
  // fixture materials (white so instance colours drive the tint)
  const textile = standard({ color: '#ffffff', roughness: 0.94 });
  const leather = physical({ color: '#ffffff', roughness: 0.4, clearcoat: 0.25 });
  const velvet = standard({ color: '#ffffff', roughness: 1 });
  const brass = standard({ color: '#c9a866', roughness: 0.28, metalness: 0.85 });
  const chrome = standard({ color: '#d8dadf', roughness: 0.12, metalness: 1 });
  const black = standard({ color: RETRO.deepTeal, roughness: 0.55, metalness: 0.3 });
  const oak = standard({ color: '#b28d66', roughness: 0.6 });
  const walnut = standard({ color: RETRO.deepTeal, roughness: 0.55 });
  const white = standard({ color: RETRO.ivory, roughness: 0.5 });
  const ceramic = standard({ color: '#ffffff', roughness: 0.3 });
  const marbleTop = standard({ map: floors.marble.map, roughness: 0.2 });
  const stone = standard({ color: RETRO.porcelain, roughness: 0.7 });
  const glassCase = physical({ color: '#dfe8ea', transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const bottleGlass = physical({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.05, depthWrite: false });
  const glow = standard({ color: '#fff1d6', emissive: '#ffd9a6', emissiveIntensity: 1.9, roughness: 0.4 });
  const lamp = standard({ color: '#fff6e6', emissive: '#ffe1b8', emissiveIntensity: 2.4, roughness: 0.4 });
  const warmPanel = standard({ color: '#f1dfc4', emissive: '#f4c98d', emissiveIntensity: 0.9, roughness: 0.9 });
  const mirror = standard({ color: '#ffffff', roughness: 0.03, metalness: 1, envMapIntensity: 1 });
  reflectionMaterials.push(mirror);
  const foliage = standard({ color: '#3f6a45', roughness: 0.95 });
  const bronze = standard({ color: '#5a4a3a', roughness: 0.4, metalness: 0.7 });
  const steel = standard({ color: '#bfc3c7', roughness: 0.3, metalness: 0.9 });
  const cream = standard({ color: '#ffffff', roughness: 0.6 });
  for (const [name, material] of Object.entries({ textile, leather, velvet, brass, chrome, black, oak, walnut, white, ceramic, marbleTop, stone, glassCase, bottleGlass, glow, lamp, warmPanel, mirror, foliage, bronze, steel, cream, ceiling, slat, darkSlat })) material.name = `interior-${name}`;
  for (const [theme, material] of Object.entries(walls)) material.name = `wall-${theme}`;
  for (const [kind, material] of Object.entries(floors)) material.name = `floor-${kind}`;
  // geometries
  const box = track.g(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = track.g(new THREE.CylinderGeometry(1, 1, 1, 12));
  const disc = track.g(new THREE.CylinderGeometry(1, 1, 1, 18));
  const sphere = track.g(new THREE.SphereGeometry(1, 10, 7));
  const ico = track.g(new THREE.IcosahedronGeometry(1, 0));
  const ring = track.g(new THREE.TorusGeometry(1, 0.08, 5, 14));
  const ringFine = track.g(new THREE.TorusGeometry(1, 0.16, 5, 12));
  const handle = track.g(new THREE.TorusGeometry(0.09, 0.008, 5, 12, Math.PI));
  const hanger = track.g(new THREE.TorusGeometry(0.2, 0.006, 4, 10, Math.PI));
  const knot = track.g(new THREE.TorusKnotGeometry(0.13, 0.04, 48, 8));
  const cone = track.g(new THREE.ConeGeometry(0.03, 0.12, 7));
  const garment = track.g(garmentGeometry());
  const bottle = track.g(lathe([[0, 0], [0.04, 0], [0.045, 0.1], [0.03, 0.125], [0.02, 0.13], [0.02, 0.16], [0, 0.16]]));
  const flask = track.g(lathe([[0, 0], [0.032, 0], [0.036, 0.16], [0.02, 0.19], [0.014, 0.21], [0.014, 0.26], [0, 0.26]], 10));
  const glassware = track.g(lathe([[0, 0], [0.03, 0], [0.006, 0.01], [0.006, 0.08], [0.028, 0.1], [0.036, 0.17], [0.03, 0.2], [0, 0.2]], 9));
  const bust = track.g(lathe([[0.15, 0], [0.19, 0.08], [0.23, 0.18], [0.11, 0.31], [0.065, 0.40], [0.065, 0.46], [0, 0.46]]));
  const vase = track.g(lathe([[0.09, 0], [0.12, 0.03], [0.15, 0.2], [0.09, 0.33], [0.06, 0.38], [0.065, 0.42], [0, 0.42]]));
  const carafe = track.g(lathe([[0, 0], [0.06, 0], [0.07, 0.15], [0.03, 0.22], [0.03, 0.28], [0, 0.28]]));
  const bowl = track.g(lathe([[0, 0], [0.12, 0.02], [0.22, 0.09], [0.24, 0.13], [0, 0.13]]));
  const shade = track.g(lathe([[0, 0], [0.05, 0], [0.17, -0.15], [0.18, -0.16], [0, -0.16]]));
  const pot = track.g(lathe([[0.12, 0], [0.16, 0.02], [0.19, 0.34], [0.17, 0.36], [0, 0.36]]));
  const tub = track.g(new THREE.CylinderGeometry(0.15, 0.13, 0.1, 12));
  const pane = track.g(new THREE.PlaneGeometry(1, 1));

  // ---- instancing kit ------------------------------------------------------
  const batches = new Map();
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
  let room = null, roomMatrix = new THREE.Matrix4();
  const add = (geometry, material, a, d, y, scale, yaw = 0, color = '#ffffff', tilt = [0, 0]) => {
    const key = `${room?.buildingId ?? 'x'}:${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [], colors: [] });
    E.set(tilt[0], yaw, tilt[1]); Q.setFromEuler(E); P.set(a, y, -d); S.set(scale[0], scale[1], scale[2]);
    M.compose(P, Q, S).premultiply(roomMatrix);
    const batch = batches.get(key); batch.matrices.push(M.clone()); batch.colors.push(color);
  };
  const placeMesh = (mesh, a, d, y, yaw = 0, scale = [1, 1, 1]) => {
    E.set(0, yaw, 0); Q.setFromEuler(E); P.set(a, y, -d); S.set(...scale);
    mesh.matrix.compose(P, Q, S).premultiply(roomMatrix); mesh.matrixAutoUpdate = false; mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    group.add(mesh); return mesh;
  };
  const palettes = {
    garments: ['#efe8dc', '#1e1e21', '#c9b8a3', '#8c8f95', '#e2c8bc', '#5b6470', '#f4efe6', '#3a3a40', '#b9a48b'],
    bags: ['#2a2a2e', '#8f5a3c', '#e6dccb', '#b8875e', '#6d3e3b', '#d8c7b0'],
    shoes: ['#1f1f22', '#7a4a2e', '#e8e1d5', '#a8a19a'],
    perfume: ['#f5e9c8', '#f0c8c8', '#d6e6ea', '#f7f1e1', '#e8d3a5', '#f4dde8'],
    gelato: ['#f2e8c9', '#e9a1b0', '#6b4a2f', '#bfe0a3', '#f6c877', '#f7d6bf', '#d9cbe8', '#c85a4a'],
    towels: ['#f5f2ec', '#c9cfc6', '#a5aca6'],
  };
  const pick = (list, i) => list[Math.abs(i) % list.length];
  const wallYaw = side => side > 0 ? -Math.PI / 2 : Math.PI / 2;

  // ---- fixture builders (room-local: x = across, z = -depth, y = height) ---
  const builders = {
    rail({ a, d0, d1, side, shelf }) {
      const length = d1 - d0, mid = (d0 + d1) / 2, inner = a - side * 0.02;
      add(box, chrome, inner, mid, 1.62, [0.022, 0.022, length]);
      for (const d of [d0 + 0.1, d1 - 0.1]) add(box, chrome, a + side * 0.12, d, 1.62, [0.26, 0.018, 0.018]);
      for (let d = d0 + 0.14; d < d1 - 0.1; d += 0.14) {
        const i = Math.round(d * 37 + room.index);
        add(hanger, chrome, inner, d, 1.66, [1, 0.45, 1], Math.PI / 2, '#ffffff', [0, 0]);
        add(garment, textile, inner, d, 1.62, [0.9 + (i % 3) * 0.06, 0.92 + (i % 4) * 0.03, 1], Math.PI / 2, pick(palettes.garments, i));
      }
      if (shelf) {
        add(box, oak, a + side * 0.04, mid, 2.08, [0.36, 0.03, length], 0, '#ffffff');
        add(box, glow, a + side * 0.12, mid, 2.06, [0.02, 0.012, length - 0.2]);
        for (let d = d0 + 0.35; d < d1 - 0.3; d += 0.75) { add(box, leather, a + side * 0.02, d, 2.22, [0.3, 0.24, 0.13], Math.PI / 2, pick(palettes.bags, Math.round(d * 3))); add(handle, leather, a + side * 0.02, d, 2.35, [1, 1, 1], Math.PI / 2, pick(palettes.bags, Math.round(d * 3))); }
      }
    },
    shelves({ a, d0, d1, side, contents, lit }) {
      const length = d1 - d0, mid = (d0 + d1) / 2, face = a + side * 0.2;
      add(box, side ? walls[room.theme] : oak, face, mid, 1.3, [0.05, 2.5, length], 0, '#ffffff');
      const levels = contents === 'towels' ? [0.5, 1.0, 1.5, 2.0] : [0.55, 1.05, 1.55, 2.05];
      for (const y of levels) {
        add(box, contents === 'bottles' ? white : oak, a, mid, y, [0.34, 0.03, length]);
        if (lit || contents === 'bottles') add(box, glow, a + side * 0.13, mid, y - 0.02, [0.02, 0.01, length - 0.2]);
        for (let d = d0 + 0.18; d < d1 - 0.15; d += contents === 'bags' ? 0.42 : contents === 'shoes' ? 0.32 : contents === 'cones' ? 0.2 : contents === 'towels' ? 0.17 : 0.21) {
          const i = Math.round(d * 41 + y * 13 + room.index);
          if (contents === 'bags') { add(box, leather, a, d, y + 0.135, [0.32, 0.24, 0.12], Math.PI / 2, pick(palettes.bags, i)); add(handle, leather, a, d, y + 0.26, [1, 1, 1], Math.PI / 2, pick(palettes.bags, i)); }
          else if (contents === 'shoes') { add(box, leather, a, d, y + 0.05, [0.1, 0.07, 0.26], 0, pick(palettes.shoes, i)); add(box, leather, a - side * 0.02, d + 0.1, y + 0.02, [0.09, 0.03, 0.06], 0, pick(palettes.shoes, i)); }
          else if (contents === 'bottles') { add(bottle, bottleGlass, a, d, y + 0.015, [1 + (i % 3) * 0.15, 1 + (i % 2) * 0.35, 1 + (i % 3) * 0.15], 0, pick(palettes.perfume, i)); add(box, i % 2 ? brass : black, a, d, y + 0.185 + (i % 2) * 0.05, [0.04, 0.04, 0.04]); }
          else if (contents === 'cones') { add(cone, cream, a, d, y + 0.08, [1, 1, 1], 0, '#d9a866', [Math.PI, 0]); }
          else if (contents === 'towels') { add(cylinder, textile, a, d, y + 0.085, [0.07, 0.28, 0.07], 0, pick(palettes.towels, i), [0, Math.PI / 2]); }
        }
      }
    },
    niche({ a, d0, d1, side }) {
      const face = a + side * 0.22;
      add(box, stone, face, (d0 + d1) / 2, 0.45, [0.5, 0.9, d1 - d0]);
      for (let d = d0 + 0.45; d < d1 - 0.4; d += 0.9) {
        add(box, stone, face, d, 1.95, [0.42, 2.1, 0.08]); add(box, stone, face, d, 2.95, [0.42, 0.14, 0.9]);
        add(box, warmPanel, face + side * 0.05, d, 1.42, [0.06, 1.0, 0.7]);
        add(box, stone, face - side * 0.02, d, 1.0, [0.42, 0.06, 0.8]);
        add(box, glow, face - side * 0.1, d, 1.9, [0.02, 0.012, 0.6]);
        const i = Math.round(d * 7 + room.index);
        if (i % 2) { add(bust, velvet, a - side * 0.05, d, 1.03, [0.85, 0.85, 0.85], wallYaw(side), '#2a2530'); add(ringFine, brass, a - side * 0.05, d, 1.28, [0.09, 0.09, 0.03], 0, '#ffffff', [0.3, 0]); }
        else { add(box, velvet, a - side * 0.05, d, 1.06, [0.24, 0.05, 0.24], 0, '#2a2530'); for (let k = 0; k < 3; k++) add(ringFine, brass, a - side * 0.05 + (k - 1) * 0.06, d, 1.11, [0.018, 0.018, 0.012], 0, '#ffffff', [Math.PI / 2, 0]); }
      }
    },
    table({ a, d, w, l, contents }) {
      add(box, room.theme === 'perfumery' ? white : oak, a, d, 0.82, [w, 0.05, l]);
      add(box, room.theme === 'perfumery' ? marbleTop : oak, a, d, 0.4, [w * 0.55, 0.78, l * 0.5]);
      const i0 = room.index * 3;
      if (contents === 'folded') for (let s = 0; s < 3; s++) for (let k = 0; k < 4; k++) add(box, textile, a - w / 2 + 0.35 + s * (w - 0.7) / 2, d + (k % 2 ? 0.04 : -0.04), 0.87 + k * 0.045, [0.34, 0.04, 0.26], 0, pick(palettes.garments, i0 + s * 4 + k));
      if (contents === 'smallgoods') for (let s = 0; s < 6; s++) add(box, leather, a - w / 2 + 0.3 + s * (w - 0.6) / 5, d + (s % 2 ? 0.18 : -0.18), 0.87, [0.18, 0.03, 0.11], 0.3 * (s % 3 - 1), pick(palettes.bags, i0 + s));
      if (contents === 'bottles') for (let s = 0; s < 8; s++) add(bottle, bottleGlass, a - w / 2 + 0.25 + (s % 4) * (w - 0.5) / 3, d + (s < 4 ? -0.2 : 0.2), 0.85, [1.1, 1.2, 1.1], 0, pick(palettes.perfume, i0 + s));
      add(vase, ceramic, a + w / 2 - 0.25, d - l / 2 + 0.2, 0.85, [0.6, 0.6, 0.6], 0, '#efe6da');
    },
    counter({ a, d, w }) {
      add(box, walnut, a, d, 0.5, [w, 0.98, 0.62]); add(box, marbleTop, a, d, 1.005, [w + 0.06, 0.04, 0.68]);
      add(box, brass, a, d, 0.04, [w - 0.1, 0.08, 0.56]); add(box, black, a + w / 2 - 0.4, d, 1.13, [0.3, 0.2, 0.28], 0, '#ffffff', [0, 0]);
      add(vase, ceramic, a - w / 2 + 0.35, d, 1.03, [0.8, 0.8, 0.8], 0, '#e8dfd2');
      add(box, glow, a, d - 0.32, 0.12, [w - 0.2, 0.02, 0.02]);
    },
    vitrine({ a, d, w, l }) {
      add(box, black, a, d, 0.45, [w, 0.9, l]); add(box, brass, a, d, 0.91, [w + 0.02, 0.02, l + 0.02]);
      add(box, velvet, a, d, 0.93, [w - 0.16, 0.03, l - 0.16], 0, '#2a2530');
      add(box, glassCase, a, d, 1.08, [w, 0.3, l]);
      add(box, glow, a, d, 1.22, [w - 0.2, 0.01, 0.02]);
      for (let k = 0; k < 5; k++) add(ringFine, brass, a - w / 2 + 0.22 + k * (w - 0.44) / 4, d - 0.1, 0.97, [0.018, 0.018, 0.012], 0, '#ffffff', [Math.PI / 2, 0]);
      for (let k = 0; k < 3; k++) add(ringFine, k % 2 ? brass : chrome, a - w / 2 + 0.3 + k * (w - 0.6) / 2, d + 0.14, 0.955, [0.035, 0.035, 0.008], 0, '#ffffff', [Math.PI / 2, 0]);
    },
    desk({ a, d, w, l, style }) {
      add(box, style === 'gallery' ? white : walnut, a, d, 0.74, [w, 0.04, l]);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box, brass, a + sx * (w / 2 - 0.06), d + sz * (l / 2 - 0.06), 0.36, [0.04, 0.72, 0.04]);
      if (style === 'consultation') { add(box, velvet, a, d, 0.775, [0.4, 0.03, 0.3], 0, '#2a2530'); add(pane, mirror, a + w / 2 - 0.25, d, 0.95, [0.24, 0.3, 1], Math.PI, ); }
      if (style === 'fitting') { add(pane, mirror, a, d + l / 2 - 0.03, 1.2, [0.7, 0.8, 1]); add(box, brass, a, d + l / 2 - 0.03, 1.2, [0.76, 0.86, 0.02]); }
      if (style === 'gallery') { add(box, black, a + 0.3, d, 0.79, [0.32, 0.03, 0.22]); add(vase, ceramic, a - 0.4, d, 0.76, [0.5, 0.5, 0.5], 0, '#f0ebe4'); }
    },
    chair({ a, d, style, yaw = 0 }) {
      const col = room.theme === 'dining' ? '#3d3238' : room.theme === 'jewelry' ? '#2f2b33' : '#6b6c68';
      if (style === 'armchair') { add(box, velvet, a, d, 0.24, [0.62, 0.42, 0.62], yaw, col); add(box, velvet, a - Math.sin(yaw) * 0.25, d + Math.cos(yaw) * 0.25, 0.66, [0.62, 0.5, 0.12], yaw, col); for (const s of [-1, 1]) add(box, velvet, a + Math.cos(yaw) * s * 0.26, d + Math.sin(yaw) * s * 0.26, 0.5, [0.1, 0.24, 0.5], yaw, col); }
      else if (style === 'salon') { add(box, leather, a, d, 0.5, [0.52, 0.09, 0.52], yaw, '#2a2a2c'); add(box, leather, a - Math.sin(yaw) * 0.22, d + Math.cos(yaw) * 0.22, 0.8, [0.52, 0.5, 0.08], yaw, '#2a2a2c'); add(cylinder, chrome, a, d, 0.25, [0.03, 0.44, 0.03]); add(disc, chrome, a, d, 0.015, [0.3, 0.03, 0.3]); }
      else if (style === 'cafe') { add(disc, white, a, d, 0.45, [0.19, 0.03, 0.19]); add(box, white, a - Math.sin(yaw) * 0.17, d + Math.cos(yaw) * 0.17, 0.68, [0.36, 0.3, 0.03], yaw); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(cylinder, black, a + sx * 0.15, d + sz * 0.15, 0.22, [0.012, 0.44, 0.012]); }
      else { add(box, velvet, a, d, 0.47, [0.46, 0.05, 0.46], yaw, col); add(box, velvet, a - Math.sin(yaw) * 0.21, d + Math.cos(yaw) * 0.21, 0.73, [0.46, 0.46, 0.05], yaw, col); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box, walnut, a + Math.cos(yaw) * sx * 0.2 - Math.sin(yaw) * sz * 0.2, d + Math.sin(yaw) * sx * 0.2 + Math.cos(yaw) * sz * 0.2, 0.22, [0.035, 0.45, 0.035]); }
    },
    stool({ a, d }) { add(disc, velvet, a, d, 0.73, [0.17, 0.06, 0.17], 0, '#3d3238'); add(cylinder, brass, a, d, 0.36, [0.022, 0.7, 0.022]); add(disc, brass, a, d, 0.015, [0.2, 0.03, 0.2]); },
    bench({ a, d, w, l, style }) { add(box, velvet, a, d, 0.42, [w, 0.13, l], 0, style === 'gallery' ? '#d8d2c8' : '#5b5560'); add(box, oak, a, d, 0.34, [w - 0.1, 0.04, l - 0.1]); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box, brass, a + sx * (w / 2 - 0.08), d + sz * (l / 2 - 0.08), 0.16, [0.03, 0.32, 0.03]); },
    plinth({ a, d, w, l, style, seed = 0 }) {
      if (style === 'low') { add(box, marbleTop, a, d, 0.075, [w, 0.15, l]); return; }
      add(box, white, a, d, 0.5, [w, 1.0, l]);
      if (style === 'sculpture') add(knot, bronze, a, d, 1.22, [1, 1, 1], seed, '#ffffff', [seed * 0.4, 0]);
      else { add(carafe, bottleGlass, a - 0.1, d, 1.0, [1, 1, 1], 0, '#e8f0f2'); for (let k = 0; k < 3; k++) add(glassware, bottleGlass, a + 0.08 + k * 0.08, d + (k - 1) * 0.06, 1.0, [1, 1, 1], 0, '#f0f5f6'); }
    },
    mirror({ a, d, side, w = 0.9, h = 2.2 }) { add(pane, mirror, a - side * 0.03, d, 1.2, [w, h, 1], wallYaw(side)); add(box, brass, a - side * 0.02, d, 1.2, [0.02, h + 0.06, w + 0.06]); },
    feature({ a, d, w, h, quadrant }) {
      const material = atlas?.materials?.[quadrant];
      if (material) add(pane, material, a, d, 1.55, [w, h, 1]);
      add(box, brass, a, d + 0.02, 1.55, [w + 0.08, h + 0.08, 0.03]);
      add(box, glow, a, d - 0.12, 1.55 - h / 2 - 0.02, [w, 0.02, 0.02]);
      add(box, marbleTop, a, d - 0.2, 1.55 - h / 2 - 0.06, [w + 0.1, 0.05, 0.42]);
    },
    bar({ a, d0, d1, side }) {
      const length = d1 - d0, mid = (d0 + d1) / 2, front = a - side * 0.5;
      add(box, walnut, front, mid, 0.55, [0.6, 1.1, length]); add(box, marbleTop, front, mid, 1.12, [0.72, 0.04, length + 0.04]);
      add(box, brass, front - side * 0.4, mid, 0.2, [0.03, 0.03, length]);
      add(box, walnut, a + side * 0.2, mid, 1.3, [0.05, 2.6, length]);
      for (const y of [1.25, 1.65, 2.05]) {
        add(box, walnut, a, mid, y, [0.3, 0.03, length]); add(box, glow, a + side * 0.12, mid, y - 0.02, [0.02, 0.01, length - 0.2]);
        for (let d = d0 + 0.15; d < d1 - 0.1; d += 0.16) { const i = Math.round(d * 29 + y * 7); if (y === 2.05 && i % 2) add(glassware, bottleGlass, a, d, y + 0.015, [1, 1, 1], 0, '#eef4f5'); else add(flask, bottleGlass, a, d, y + 0.015, [1, 0.8 + (i % 3) * 0.12, 1], 0, ['#5a3a1c', '#c9a24a', '#2f5a3a', '#d8d8d0', '#8a2a2a'][i % 5]); }
      }
      for (let d = d0 + 0.8; d < d1 - 0.4; d += 1.6) builders.pendant({ a: front, d, y: ROOM_HEIGHT - 1.4 });
    },
    dining({ a, d, w, style }) {
      const r = w / 2;
      add(disc, style === 'cafe' ? marbleTop : walnut, a, d, 0.74, [r, 0.04, r]);
      add(cylinder, style === 'cafe' ? black : walnut, a, d, 0.37, [0.05, 0.7, 0.05]); add(disc, style === 'cafe' ? black : walnut, a, d, 0.015, [r * 0.55, 0.03, r * 0.55]);
      if (style === 'cafe') return;
      for (const s of [-1, 1]) { add(disc, ceramic, a + s * 0.28, d, 0.765, [0.13, 0.01, 0.13], 0, '#f4f1ec'); add(glassware, bottleGlass, a + s * 0.28, d + 0.2, 0.76, [1, 1, 1], 0, '#eef4f5'); }
      add(cylinder, white, a, d, 0.8, [0.018, 0.08, 0.018], 0, '#f5f0e8'); add(sphere, lamp, a, d, 0.855, [0.012, 0.018, 0.012]);
    },
    pendant({ a, d, y }) { add(box, black, a, d, (ROOM_HEIGHT + y) / 2, [0.01, ROOM_HEIGHT - y, 0.01]); add(shade, brass, a, d, y, [1, 1, 1]); add(sphere, lamp, a, d, y - 0.11, [0.035, 0.035, 0.035]); },
    station({ a, d0, d1, side }) {
      const d = (d0 + d1) / 2, face = a + side * 0.19;
      add(pane, mirror, face - side * 0.01, d, 1.55, [0.7, 1.15, 1], wallYaw(side));
      for (const [dy, dz, sy, sz] of [[0.6, 0, 0.03, 0.78], [-0.6, 0, 0.03, 0.78], [0, 0.375, 1.2, 0.03], [0, -0.375, 1.2, 0.03]]) add(box, glow, face - side * 0.02, d + dz, 1.55 + dy, [0.02, sy, sz]);
      add(box, white, a + side * 0.02, d, 0.9, [0.36, 0.05, 1.0]); add(box, white, a + side * 0.1, d, 0.45, [0.2, 0.9, 0.9]);
      for (let k = 0; k < 3; k++) add(bottle, bottleGlass, a - side * 0.05, d - 0.3 + k * 0.14, 0.925, [1, 1.3, 1], 0, ['#f6f2e6', '#e2e8ee', '#f2dcd6'][k]);
    },
    basin({ a, d, w, l }) { add(box, black, a, d, 0.42, [w, 0.84, l]); add(bowl, ceramic, a, d - 0.05, 0.84, [1, 1, 1], 0, '#f2eee8'); add(cylinder, chrome, a, d + 0.3, 1.1, [0.014, 0.5, 0.014]); add(box, chrome, a, d + 0.2, 1.33, [0.03, 0.03, 0.22]); },
    reception({ a, d, w, l, style }) {
      if (style === 'host') { add(box, walnut, a, d, 0.55, [w, 1.1, l]); add(box, oak, a, d, 1.12, [w + 0.1, 0.04, l + 0.1], 0, '#ffffff', [-0.25, 0]); add(sphere, lamp, a, d, 1.2, [0.02, 0.02, 0.02]); return; }
      add(box, oak, a, d, 0.52, [w, 1.04, l]); add(box, marbleTop, a, d, 1.06, [w + 0.06, 0.04, l + 0.06]);
      add(box, glow, a, d - l / 2 - 0.01, 0.1, [w - 0.2, 0.02, 0.02]); add(box, black, a + w / 4, d + 0.1, 1.2, [0.3, 0.22, 0.24]); add(vase, ceramic, a - w / 3, d, 1.08, [0.7, 0.7, 0.7], 0, '#e9e2d6');
    },
    towels(spec) { builders.shelves({ ...spec, contents: 'towels' }); },
    gelato({ a, d, w, l }) {
      add(box, white, a, d, 0.5, [w, 1.0, l]); add(box, marbleTop, a, d, 1.02, [w + 0.06, 0.04, l + 0.06]); add(box, brass, a, d - l / 2 + 0.05, 0.06, [w - 0.2, 0.12, 0.05]);
      add(box, glassCase, a, d - 0.12, 1.22, [w - 0.2, 0.36, 0.72]); add(box, glow, a, d - 0.4, 1.36, [w - 0.4, 0.01, 0.02]);
      const columns = Math.floor((w - 0.3) / 0.36);
      for (let c = 0; c < columns; c++) for (let row = 0; row < 2; row++) { const i = c * 2 + row + room.index; add(tub, steel, a - w / 2 + 0.3 + c * 0.36, d - 0.3 + row * 0.36, 1.09, [1, 1, 1]); add(disc, cream, a - w / 2 + 0.3 + c * 0.36, d - 0.3 + row * 0.36, 1.15, [0.135, 0.03, 0.135], 0, pick(palettes.gelato, i)); }
      for (let k = 0; k < 3; k++) add(cone, cream, a + w / 2 - 0.35 + k * 0.08, d + 0.45, 1.13, [1, 1, 1], 0, '#d9a866', [Math.PI, 0]);
    },
    lightbox({ a, d, w, h, y, side, wall, style, seed }) {
      const texture = track.t(posterTexture((seed ?? Math.round(d * 3 + a)) >>> 0, style));
      const material = standard({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 1.15, roughness: 0.6 });
      const yaw = wall === 'back' ? 0 : wallYaw(side), mesh = new THREE.Mesh(pane, material);
      placeMesh(mesh, a - (side ?? 0) * 0.04, d, y, yaw, [w, h, 1]);
      add(box, black, a - (side ?? 0) * 0.03, d + (wall === 'back' ? 0.03 : 0), y, wall === 'back' ? [w + 0.08, h + 0.08, 0.04] : [0.04, h + 0.08, w + 0.08]);
    },
    concession({ a, d, w, l }) {
      add(box, black, a, d, 0.5, [w, 1.0, l]); add(box, marbleTop, a, d, 1.02, [w + 0.06, 0.04, l + 0.06]); add(box, glow, a, d - l / 2 - 0.01, 0.1, [w - 0.2, 0.02, 0.02]);
      for (let k = 0; k < 6; k++) add(cylinder, cream, a - w / 2 + 0.4 + k * 0.28, d + 0.15, 1.12, [0.045, 0.16, 0.045], 0, ['#f2eee6', '#ad267e', '#e2a1c9'][k % 3]);
      add(box, black, a - w / 2 + 0.6, d - 0.1, 1.16, [0.32, 0.24, 0.28]);
    },
    popcorn({ a, d }) { add(box, black, a, d, 1.1, [0.6, 0.16, 0.6], 0, '#8a2a2a'); add(box, glassCase, a, d, 1.5, [0.56, 0.64, 0.56]); add(box, lamp, a, d, 1.3, [0.46, 0.22, 0.46], 0, '#f6d27a'); add(box, black, a, d, 1.86, [0.62, 0.08, 0.62], 0, '#8a2a2a'); },
    rope({ a, d, l }) { for (const dd of [d - l / 2, d, d + l / 2]) { add(cylinder, brass, a, dd, 0.48, [0.025, 0.95, 0.025]); add(disc, brass, a, dd, 0.015, [0.16, 0.03, 0.16]); add(sphere, brass, a, dd, 0.98, [0.04, 0.04, 0.04]); } add(cylinder, velvet, a, d - l / 4, 0.82, [0.02, l / 2 - 0.1, 0.02], 0, '#7a1f2c', [Math.PI / 2, 0]); add(cylinder, velvet, a, d + l / 4, 0.82, [0.02, l / 2 - 0.1, 0.02], 0, '#7a1f2c', [Math.PI / 2, 0]); },
    artwork({ a, d, w, h, y, side, wall, seed }) {
      const material = standard({ map: track.t(artTexture((seed ?? 0) >>> 0)), roughness: 0.85 }), mesh = new THREE.Mesh(pane, material);
      const yaw = wall === 'back' ? 0 : wallYaw(side);
      placeMesh(mesh, a - (side ?? 0) * 0.05, d, y, yaw, [w, h, 1]);
      add(box, seed % 2 ? black : oak, a - (side ?? 0) * 0.03, d + (wall === 'back' ? 0.03 : 0), y, wall === 'back' ? [w + 0.1, h + 0.1, 0.05] : [0.05, h + 0.1, w + 0.1]);
    },
    eyewear({ a, d0, d1, side }) {
      const length = d1 - d0, mid = (d0 + d1) / 2, face = a + side * 0.2;
      add(box, white, face, mid, 1.5, [0.06, 1.5, length]);
      for (const y of [0.95, 1.25, 1.55, 1.85]) {
        add(box, glow, face - side * 0.05, mid, y - 0.04, [0.02, 0.01, length - 0.2]);
        for (let d = d0 + 0.2; d < d1 - 0.15; d += 0.22) {
          const i = Math.round(d * 23 + y * 11), color = ['#1f1f22', '#7a4a2e', '#c9a866', '#3b4a5a'][i % 4];
          for (const s of [-1, 1]) add(ringFine, black, face - side * 0.08, d + s * 0.028, y, [0.024, 0.024, 0.006], Math.PI / 2, color, [0, 0]);
          add(box, black, face - side * 0.08, d, y, [0.006, 0.006, 0.016], 0, color);
        }
      }
    },
    plant({ a, d }) { add(pot, ceramic, a, d, 0, [1, 1, 1], 0, '#d9cfc0'); for (let k = 0; k < 6; k++) add(ico, foliage, a + Math.sin(k * 2.1) * 0.16, d + Math.cos(k * 2.1) * 0.16, 0.62 + (k % 3) * 0.12, [0.2, 0.22, 0.2], k, ['#3f6a45', '#4e7d4d', '#33583a'][k % 3]); },
  };

  // ---- rooms ----------------------------------------------------------------
  const Y = new THREE.Vector3(0, 1, 0);
  const lightPositions = [];
  for (room of rooms) {
    const [fx, fn] = room.facade, [ox, oy] = room.outward, W = room.width, D = room.depth, H = room.height, c = room.center;
    roomMatrix = new THREE.Matrix4().compose(new THREE.Vector3(fx, room.floor, -fn), new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(ox, -oy)), new THREE.Vector3(1, 1, 1));
    // shell
    const floorGeometry = track.g(new THREE.PlaneGeometry(W, D)); floorGeometry.rotateX(-Math.PI / 2);
    const uv = floorGeometry.attributes.uv; const tile = room.theme === 'cinema' ? 1.2 : 2.4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / tile, uv.getY(i) * D / tile);
    const floor = new THREE.Mesh(floorGeometry, themeFloor[room.theme] ?? floors.oak); floor.receiveShadow = true;
    placeMesh(floor, c, D / 2, 0.012);
    add(box, black, c, D / 2, -0.3, [W, 0.6, D], 0, '#5a5148');
    // Walls sit inside the room's own footprint so neighbours never show through.
    add(box, ceiling, c, D / 2, H + 0.125, [W, 0.25, D]);
    add(box, walls[room.theme], c, D - 0.075, H / 2, [W, H, 0.15]);
    for (const a of [room.aMin + 0.075, room.aMax - 0.075]) add(box, walls[room.theme], a, D / 2, H / 2, [0.15, H, D]);
    add(box, walls[room.theme], c, D / 2, H - 0.1, [W, 0.2, D]);
    // cove light and downlights
    add(box, glow, c, D - 0.12, H - 0.06, [W - 0.3, 0.03, 0.03]); add(box, glow, c, 0.14, H - 0.06, [W - 0.3, 0.03, 0.03]);
    for (const a of [room.aMin + 0.12, room.aMax - 0.12]) add(box, glow, a, D / 2, H - 0.06, [0.03, 0.03, D - 0.3]);
    for (const light of room.lights) {
      add(disc, lamp, light.a, light.d, H - 0.012, [0.065, 0.02, 0.065]); add(ring, black, light.a, light.d, H - 0.01, [0.075, 0.075, 0.02], 0, '#ffffff', [Math.PI / 2, 0]);
      lightPositions.push({ room, position: new THREE.Vector3(light.a, light.y - 1.5, -light.d).applyMatrix4(roomMatrix) });
    }
    // millwork on the back wall
    const feature = room.fixtures.find(f => f.kind === 'feature');
    if (['fashion', 'leather', 'jewelry', 'perfumery', 'optician', 'dining'].includes(room.theme)) {
      for (let a = room.aMin + 0.12; a < room.aMax - 0.06; a += 0.11) {
        if (feature && Math.abs(a - feature.a) < feature.w / 2 + 0.15) continue;
        add(box, room.theme === 'dining' ? darkSlat : slat, a, D - 0.18, H / 2, [0.05, H - 0.02, 0.05]);
      }
    }
    // door surround inside: a threshold mat and two brass reveals
    add(box, textile, 0, 0.9, 0.01, [1.7, 0.012, 1.2], 0, room.theme === 'dining' ? '#3d3238' : '#5f5a56');
    for (const fixture of room.fixtures) builders[fixture.kind]?.(fixture);
  }
  for (const { geometry, material, matrices, colors } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    const color = new THREE.Color();
    matrices.forEach((matrix, index) => { mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, color.set(colors[index])); });
    mesh.castShadow = material !== glow && material !== lamp && material !== glassCase && material !== bottleGlass && material !== warmPanel;
    mesh.receiveShadow = true;
    // One batch per building and material: the renderer culls by instance bounds without a draw-call explosion.
    mesh.computeBoundingSphere();
    if (material === glassCase || material === bottleGlass) mesh.renderOrder = 2;
    group.add(mesh);
  }
  group.userData.lightPositions = lightPositions;
  group.userData.dispose = () => {
    group.traverse(item => { if (item.isInstancedMesh) item.dispose(); if (item.material) materials.add(item.material); });
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    group.clear();
  };
  return group;
}
