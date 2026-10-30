import * as THREE from 'three';
import { ipicKitFinish } from './ipic-kit-finish.js';

// The lounge carpet's palette (photo review P12): a bold orange-red ground with fine dark swirl lines, as
// sampled from IMG_9753-9755. It was darkened on 2026-10-17 after IMG_9758 alone, which is underexposed.
export const IPIC_LOUNGE_CARPET = Object.freeze({ base: Object.freeze([204, 66, 42]), pattern: Object.freeze([84, 30, 22]) });

// The reception sign as photographed (IMG_9738, review P5): RIVER over OAKS, small and letterspaced,
// beside a large DISTRICT. Centre-aligned runs in canvas pixels for a w x h sign face.
export function districtSignLayout(w, h) {
  const small = Math.round(h * .19), large = Math.round(h * .46), left = Math.round(w * .2);
  return [
    { text: 'RIVER', x: left, y: Math.round(h * .38), size: small, spacing: .18 },
    { text: 'OAKS', x: left, y: Math.round(h * .62), size: small, spacing: .18 },
    { text: 'DISTRICT', x: Math.round(w * .6), y: Math.round(h * .52), size: large, spacing: .06 },
  ];
}

// A small deterministic generator, so painted textures (and so GLB exports) are reproducible.
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Authored procedural finishes approximate photographed materials; artwork uses
// untouched source photos sampled by mesh UVs, not AI-redrawn replacements.
// `finish` (ipic-kit-finish.js) recolours a few lounge and reception materials; classic by default.
export function createIpicMaterials({ textures = typeof document !== 'undefined', finish } = {}) {
  const kit = ipicKitFinish(finish), loungeCarpet = kit.carpet ?? IPIC_LOUNGE_CARPET;
  const materials = new Set(), maps = new Set(), pending = [];
  const material = (name, color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .7, ...options });
    m.name = `ipic-${name}`; materials.add(m); return m;
  };
  const canvas = (w, h, paint) => {
    if (!textures) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; maps.add(t); return t;
  };
  const grain = canvas(512, 256, (c, w, h) => {
    c.fillStyle = '#5d4939'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      c.strokeStyle = i % 3 ? '#46382c55' : '#af917343'; c.lineWidth = .5 + i % 3 * .5;
      c.beginPath();
      for (let x = 0; x <= w; x += 8) { const y = i * h / 160 + 2 * Math.sin(x / 90 + i * .8); x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
  });
  const carpet = canvas(512, 512, (c, w, h) => {
    const pixels = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // Fine dark lines along the contours of a smooth field that tiles; they swirl round its eddies. At
      // the lounge's 3 m tile they lie about 10 cm apart, as in IMG_9754.
      const u = 2 * Math.PI * x / w, v = 2 * Math.PI * y / h;
      const field = .9 * Math.sin(u + .7) + .8 * Math.cos(v) + .6 * Math.sin(u - v + 1.3) + .35 * Math.cos(2 * u + v);
      const stripe = Math.max(0, Math.min(1, (Math.sin(40 * field) - .6) * 4));
      const noise = .97 + .03 * Math.sin(x * 53 + y * 71), i = (y * w + x) * 4, [b, p] = [loungeCarpet.base, loungeCarpet.pattern];
      pixels.data.set([0, 1, 2].map(k => (b[k] + stripe * (p[k] - b[k])) * noise).concat(255), i);
    }
    c.putImageData(pixels, 0, 0);
  });
  // Photo review P9 (IMG_9758): the coffee table's top is book-matched timber radiating from the centre.
  const sunburst = canvas(512, 512, (c, w, h) => {
    const cx = w / 2, cy = h / 2, segments = 16;
    for (let i = 0; i < segments; i++) {
      c.fillStyle = i % 2 ? '#8a6542' : '#a57c52';
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, w, i * 2 * Math.PI / segments, (i + 1) * 2 * Math.PI / segments); c.closePath(); c.fill();
    }
    c.strokeStyle = '#4f382433'; c.lineWidth = 1;
    for (let r = 12; r < w; r += 9) { c.beginPath(); c.arc(cx, cy, r, 0, 2 * Math.PI); c.stroke(); }
  });
  // Photo review P12 (IMG_9756): the Tuck Room's floor is mid-brown boards.
  const planks = canvas(512, 512, (c, w, h) => {
    const rand = seeded(9756), board = h / 8;
    for (let row = 0; row < 8; row++) for (let x = -(row % 2) * w / 3; x < w; x += w / 1.5) {
      const tone = 92 + Math.floor(rand() * 26);
      c.fillStyle = `rgb(${tone}, ${Math.floor(tone * .74)}, ${Math.floor(tone * .55)})`; c.fillRect(x, row * board, w / 1.5 - 2, board - 2);
    }
    c.fillStyle = '#2b201833'; for (let i = 0; i < 260; i++) c.fillRect(rand() * w, rand() * h, 30 + rand() * 60, 1);
  });
  // Photo review P17 (IMG_9767): the auditorium's dark carpet scattered with orange and rust flecks.
  const confetti = canvas(512, 512, (c, w, h) => {
    const rand = seeded(9767);
    c.fillStyle = '#1e1b22'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      c.strokeStyle = ['#d46a2a', '#b8462a', '#8a3b2b', '#e08a3c'][i % 4]; c.lineWidth = 2 + rand() * 2;
      const x = rand() * w, y = rand() * h, a = rand() * Math.PI;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6 * Math.cos(a + 1), y + 6 * Math.sin(a + 1), x + 12 * Math.cos(a), y + 12 * Math.sin(a)); c.stroke();
    }
  });
  if (confetti) confetti.repeat.set(6, 4.5);
  if (carpet) carpet.repeat.set(3, 2);
  const marble = canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#d8d4c8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      c.strokeStyle = '#77787133'; c.lineWidth = i % 3 ? .7 : 2;
      c.beginPath(); for (let y = 0; y <= h; y += 8) { const x = i * 39 - 180 + y * .4 + Math.sin(y / 50 + i) * 12; y ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    }
  });
  const m = {
    timber: material('weathered-timber', '#ffffff', { map: grain, bumpMap: grain, bumpScale: .012, roughness: .84 }),
    sunburst: material('sunburst-timber', '#ffffff', { map: sunburst, roughness: .55 }),
    barFloor: material('bar-floor-timber', '#ffffff', { map: planks, roughness: .62 }),
    confetti: material('confetti-carpet', '#ffffff', { map: confetti, roughness: 1 }),
    carpet: material('red-swirl-carpet', '#ffffff', { map: carpet, bumpMap: carpet, bumpScale: .007, roughness: 1 }),
    marble: material('veined-marble', '#ffffff', { map: marble, roughness: .27 }),
    stone: material('taupe-stacked-stone', '#685747'), plaster: material('warm-plaster', '#b6ab98'),
    tile: material('limestone-tile', '#bdb5a4', { roughness: .43 }), grout: material('grout', '#696356'),
    // Reception from IMG_9738 (photo review P4, P6): warm stone with quiet joints, light-oak flutes. The
    // stone is a mid beige with a matt finish: the lobby's downlights, cove and pendant wash a lighter one
    // out to near-white in-world (the standalone export, lit more softly, does not show it).
    receptionStone: material('reception-stone', '#a8937a', { roughness: .72 }), stoneJoint: material('stone-joint', '#9c876d'),
    lightOak: material('light-oak', '#c8a577', { roughness: .62 }),
    bronze: material('bronze', '#a38758', { metalness: .83, roughness: .29 }),
    steel: material('escalator-steel', '#848984', { metalness: .8, roughness: .34 }),
    black: material('black-rubber', '#171714', { roughness: .9 }), yellow: material('step-safety-edge', '#c1a549'),
    glass: material('smoked-glass', '#869a96', { transparent: true, opacity: .22, metalness: .1, roughness: .13, depthWrite: false, side: THREE.DoubleSide }),
    leather: material('cognac-leather', '#805032', { roughness: .46 }),
    rattan: material('woven-rattan', '#8c5a2c', { emissive: '#5a2a0a', emissiveIntensity: .45, roughness: .85, side: THREE.DoubleSide }),
    sofa: material('olive-brown-sofa', '#504638', { roughness: .95 }), pillow: material('oatmeal-pillows', '#b1a086'),
    leaf: material('hanging-greenery', '#354931', { side: THREE.DoubleSide }), red: material('burgundy-booths', '#692b2f'),
    // The Tuck Room from IMG_9756 and IMG_9757 (photo review P13, P14).
    pothos: material('pothos', '#4c7337', { roughness: .8, side: THREE.DoubleSide }),
    steel: material('black-steel', '#1e1d1b', { metalness: .55, roughness: .45 }),
    stemware: material('stemware', '#e4ecec', { transparent: true, opacity: .35, metalness: .1, roughness: .05, depthWrite: false, side: THREE.DoubleSide }),
    fridge: material('wine-fridge', '#2a1d16', { emissive: '#b57a42', emissiveIntensity: .35, roughness: .2 }),
    glow: material('warm-lamp', '#ffe7ac', { emissive: '#ffd494', emissiveIntensity: 2.2 }),
    screen: material('cinema-screen', '#acb3d6', { emissive: '#747fad', emissiveIntensity: .6, roughness: 1 }),
  };
  if (!textures) {
    m.timber.color.set('#5d4939'); m.carpet.color.set('#ae3925'); m.marble.color.set('#d8d4c8');
    m.sunburst.color.set('#97704a'); m.barFloor.color.set('#6c513b'); m.confetti.color.set('#231d24');
    if (kit.carpet) m.carpet.color.set(kit.carpet.flat);
  }
  for (const [key, color] of Object.entries(kit.colors)) m[key].color.set(color);
  const label = (name, lines, { background = '#211d18', color = '#e4d9bd', width = 1024, height = 256, font = 'sans-serif', layout = null } = {}) => {
    const map = canvas(width, height, (c, w, h) => {
      c.fillStyle = background; c.fillRect(0, 0, w, h); c.fillStyle = color;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (layout) {
        for (const run of layout(w, h)) { c.font = `500 ${run.size}px ${font}`; c.letterSpacing = `${run.size * (run.spacing ?? 0)}px`; c.fillText(run.text, run.x, run.y, w * .92); }
        return;
      }
      c.font = `500 ${Math.floor(h / (lines.length * 1.8))}px ${font}`;
      lines.forEach((line, i) => c.fillText(line, w / 2, h * (i + .5) / lines.length, w * .92));
    });
    return material(name, textures ? '#ffffff' : background, { map, roughness: .85 });
  };
  const photo = (name, filename) => {
    const mat = material(name, '#ffffff', { roughness: 1 });
    if (textures) {
      const loader = new THREE.TextureLoader();
      pending.push(new Promise((resolve, reject) => loader.load(`/assets/ipic/${filename}`, t => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; maps.add(t);
        if (disposed) { t.dispose(); resolve(); return; }
        mat.map = t; mat.needsUpdate = true; resolve();
      }, undefined, reject)));
    }
    return mat;
  };
  let disposed = false;
  return { m, label, photo, ready: () => Promise.all(pending), dispose() { disposed = true; materials.forEach(x => x.dispose()); maps.forEach(x => x.dispose()); } };
}
