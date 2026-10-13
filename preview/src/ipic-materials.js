import * as THREE from 'three';

// Authored procedural finishes approximate photographed materials; artwork uses
// untouched source photos sampled by mesh UVs, not AI-redrawn replacements.
export function createIpicMaterials({ textures = typeof document !== 'undefined' } = {}) {
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
      const u = x / w, v = y / h;
      const dx = Math.sin(Math.PI * (u - .4)), dy = Math.sin(Math.PI * (v - .55));
      const grain = Math.sin(100 * Math.sqrt(dx * dx * .52 + dy * dy) + 4 * Math.sin(u * 6.28));
      const stripe = Math.max(0, Math.min(1, (grain + .1) * 3));
      const noise = .97 + .03 * Math.sin(x * 53 + y * 71), i = (y * w + x) * 4;
      pixels.data.set([(54 + stripe * 99) * noise, (34 + stripe * 15) * noise, (27 + stripe * 6) * noise, 255], i);
    }
    c.putImageData(pixels, 0, 0);
  });
  const marble = canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#d8d4c8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      c.strokeStyle = '#77787133'; c.lineWidth = i % 3 ? .7 : 2;
      c.beginPath(); for (let y = 0; y <= h; y += 8) { const x = i * 39 - 180 + y * .4 + Math.sin(y / 50 + i) * 12; y ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    }
  });
  const m = {
    timber: material('weathered-timber', '#ffffff', { map: grain, bumpMap: grain, bumpScale: .012, roughness: .84 }),
    carpet: material('red-swirl-carpet', '#ffffff', { map: carpet, bumpMap: carpet, bumpScale: .007, roughness: 1 }),
    marble: material('veined-marble', '#ffffff', { map: marble, roughness: .27 }),
    stone: material('taupe-stacked-stone', '#685747'), plaster: material('warm-plaster', '#b6ab98'),
    tile: material('limestone-tile', '#bdb5a4', { roughness: .43 }), grout: material('grout', '#696356'),
    bronze: material('bronze', '#a38758', { metalness: .83, roughness: .29 }),
    steel: material('escalator-steel', '#848984', { metalness: .8, roughness: .34 }),
    black: material('black-rubber', '#171714', { roughness: .9 }), yellow: material('step-safety-edge', '#c1a549'),
    glass: material('smoked-glass', '#869a96', { transparent: true, opacity: .22, metalness: .1, roughness: .13, depthWrite: false, side: THREE.DoubleSide }),
    leather: material('cognac-leather', '#805032', { roughness: .46 }),
    sofa: material('olive-brown-sofa', '#504638', { roughness: .95 }), pillow: material('oatmeal-pillows', '#b1a086'),
    leaf: material('hanging-greenery', '#354931'), red: material('burgundy-booths', '#692b2f'),
    glow: material('warm-lamp', '#ffe7ac', { emissive: '#ffd494', emissiveIntensity: 2.2 }),
    screen: material('cinema-screen', '#acb3d6', { emissive: '#747fad', emissiveIntensity: .6, roughness: 1 }),
  };
  if (!textures) { m.timber.color.set('#5d4939'); m.carpet.color.set('#9e3425'); m.marble.color.set('#d8d4c8'); }
  const label = (name, lines, { background = '#211d18', color = '#e4d9bd', width = 1024, height = 256, font = 'sans-serif' } = {}) => {
    const map = canvas(width, height, (c, w, h) => {
      c.fillStyle = background; c.fillRect(0, 0, w, h); c.fillStyle = color;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `500 ${Math.floor(h / (lines.length * 1.8))}px ${font}`;
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
