import * as THREE from 'three';

// Six more District blocks rebuilt from street-level photographs (Street View,
// 2019–2025): the Equinox office building on Kettering Drive, the single-storey
// Etro and Brunello Cucinelli block with its plaza face, the Dior and Toulouse
// block, the two residential buildings around the lawn (Vince to Bari, Dolce &
// Gabbana to Ojo de Agua) and Hopdoddy's frontage.
// Dimensions are read off the photographs, not surveyed. Forms project from the
// mapped wall (piers, canopies, sign boxes, clad storeys) or recess behind it
// (glazing, loggias), so every frontage keeps real depth at street level.
export const EQUINOX_BLOCK = 'osm-way-625330785', ETRO_BLOCK = 'osm-way-625333006';
export const RESIDENCES_SOUTH = 'osm-way-878472795', RESIDENCES_NORTH = 'osm-way-878472797', DIOR_BLOCK = 'osm-way-625333008';
// The Etro and Brunello Cucinelli end stands a storey-band above the rest of its
// block; Dior's stone frame rises two storeys over Toulouse's building.
const ETRO_PODIUM = 8.2, ETRO_HEIGHT = 9.2, DIOR_PODIUM = 9.4, DIOR_HEIGHT = 13.5;
// Residential storeys over the shops, and the overhanging roof plate.
const FLOORS = [5.5, 9.0, 12.5, 16.0, 19.5], EAVES = 23.0;

// Which edges of these blocks are rebuilt; `add` registers a frontage exactly as
// the Hermès, IPIC and Bella Rinova plans do.
export function planBlocks(world, { building, store, add, plan, facadeEdges, storeEdge }) {
  const whole = (kind, item, edge, extra) => add(kind, item, edge, 0, edge.length, true, extra);
  const equinox = building(EQUINOX_BLOCK);
  if (equinox && store('Equinox', EQUINOX_BLOCK)) for (const edge of facadeEdges(equinox)) whole('equinox', equinox, edge);
  const etro = building(ETRO_BLOCK);
  if (etro && store('Brunello Cucinelli', ETRO_BLOCK)) {
    for (const edge of facadeEdges(etro)) whole(edge.facing === 'north' ? 'plaza' : 'etro', etro, edge);
    plan.roofs.set(ETRO_BLOCK, ETRO_PODIUM);
  }
  // Dior's block: the Dior frontage on the walkway, Toulouse's building on the
  // side street, the Etro row's limestone on its other two faces.
  const diorBlock = building(DIOR_BLOCK), diorStore = diorBlock && store('Dior', DIOR_BLOCK);
  if (diorStore) {
    const front = storeEdge(diorBlock, diorStore)?.edge, toulouse = store('Toulouse', DIOR_BLOCK), side = toulouse && storeEdge(diorBlock, toulouse)?.edge;
    for (const edge of facadeEdges(diorBlock)) whole(edge.index === front?.index ? 'dior' : edge.index === side?.index ? 'toulouse' : 'dior-row', diorBlock, edge);
    plan.roofs.set(DIOR_BLOCK, DIOR_PODIUM);
  }
  // The southern residences: the boutique row on the side street, the Bari corner
  // on the lawn, the louvred podium beside Vince and the Kettering Drive corner.
  const south = building(RESIDENCES_SOUTH), baccarat = south && store('Baccarat', RESIDENCES_SOUTH), steak = south && store('Steak 48', RESIDENCES_SOUTH);
  const row = baccarat && storeEdge(south, baccarat)?.edge, westheimer = steak && storeEdge(south, steak)?.edge;
  if (row) {
    const edges = facadeEdges(south), lawn = edges.find(edge => edge.a === row.b), podium = edges.find(edge => edge.b === row.a);
    const kettering = podium && edges.find(edge => edge.b === podium.a);
    for (const edge of edges) {
      const kind = edge.index === row.index ? 'boutique-row' : edge === lawn ? 'bari-lawn' : edge === podium ? 'louvre-podium' : edge === kettering ? 'kettering' : edge.index === westheimer?.index ? 'steak-row' : 'residence';
      add(kind, south, edge, 0, edge.length, kind !== 'residence', { finish: 'white' });
    }
  }
  // The northern residences: Dolce & Gabbana in stone on the lawn, white tile with
  // a long canopy on the side street around Veronica Beard and Ojo de Agua.
  const north = building(RESIDENCES_NORTH), dolce = north && store('Dolce & Gabbana', RESIDENCES_NORTH), beard = north && store('Veronica Beard', RESIDENCES_NORTH);
  const dg = dolce && storeEdge(north, dolce)?.edge, vb = beard && storeEdge(north, beard)?.edge;
  if (dg && vb) {
    const edges = facadeEdges(north), before = edges.find(edge => edge.b === vb.a), after = edges.find(edge => edge.a === vb.b);
    for (const edge of edges) {
      const kind = edge.index === dg.index ? 'dolce' : edge.index === vb.index ? 'veronica' : edge === before ? 'tile-row' : edge === after ? 'ojo' : 'residence';
      add(kind, north, edge, 0, edge.length, kind !== 'residence', { finish: 'tile' });
    }
  }
}

// One perforated terracotta panel, as on the Bari screens: a diagonal fold and a
// grid of punched holes, repeated on every panel box.
function terracottaPanel() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 192;
  const context = canvas.getContext('2d');
  const fold = context.createLinearGradient(0, 0, 256, 192);
  fold.addColorStop(0, '#a8644a'); fold.addColorStop(0.5, '#8f5039'); fold.addColorStop(0.51, '#b46e52'); fold.addColorStop(1, '#995a41');
  context.fillStyle = fold; context.fillRect(0, 0, 256, 192);
  context.fillStyle = '#3d211a';
  for (let y = 10; y < 192; y += 16) for (let x = 10 + (y / 16 % 2) * 8; x < 256; x += 16) { context.beginPath(); context.arc(x, y, 2.6, 0, Math.PI * 2); context.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
}
// Dior's dark glass field, fritted with a fine dot screen.
function frittedGlass() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#6b7075'; context.fillRect(0, 0, 128, 128);
  context.fillStyle = '#aab0b6';
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 128; x += 8) { context.beginPath(); context.arc(x, y, 1.5, 0, Math.PI * 2); context.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(12, 6);
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.22, metalness: 0.6, envMapIntensity: 1.6 });
}
// One metre of gilt lattice: nested rounded frames that interlock across tiles.
function latticeTile() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#2a241d'; context.fillRect(0, 0, 256, 256);
  context.strokeStyle = '#caa55b'; context.lineWidth = 13;
  const frame = (x, y, w, h, r) => { context.beginPath(); context.roundRect(x, y, w, h, r); context.stroke(); };
  frame(22, 22, 212, 212, 44); frame(74, 74, 108, 108, 26);
  for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256]]) { context.beginPath(); context.arc(x, y, 52, 0, Math.PI * 2); context.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.38, metalness: 0.55 });
}
function verticalStripes(count = 26) {
  const canvas = document.createElement('canvas'); canvas.width = count * 16; canvas.height = 8;
  const context = canvas.getContext('2d');
  for (let i = 0; i < count; i++) { context.fillStyle = i % 2 ? '#f4f3ee' : '#141414'; context.fillRect(i * 16, 0, 16, 8); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
}

export function blockFacades({ m, keep, surface, glazing, sign, box, sheet, storefront, lettering, cladding }) {
  const n = {
    equinoxStone: keep(cladding({ color: '#e5dfd2', panel: [1.5, 0.75], bond: true, tone: 0.04, joint: 0.82 }), 'equinox-stone'),
    royalGlass: glazing('royal-glass', { color: '#2f52b4', roughness: 0.03, metalness: 0.85, envMapIntensity: 2.6 }),
    royalFrame: surface('royal-frame', { color: '#283a66', roughness: 0.32, metalness: 0.7 }),
    etroStone: keep(cladding({ color: '#cbc3b5', panel: [1.2, 0.6], tone: 0.1, joint: 0.86, veins: 0.06, roughness: 0.5 }), 'etro-stone'),
    white: keep(cladding({ color: '#efeee9', panel: [1.5, 0.75], tone: 0.02, joint: 0.9, roughness: 0.48 }), 'residence-panel'),
    sand: keep(cladding({ color: '#d6c8b1', panel: [1.2, 0.6], bond: true, tone: 0.05, joint: 0.86 }), 'residence-stone'),
    tile: keep(cladding({ color: '#f2f1ec', panel: [0.6, 0.6], tone: 0.035, joint: 0.8, roughness: 0.34 }), 'square-tile'),
    taupe: keep(cladding({ color: '#77726b', panel: [1.2, 0.6], tone: 0.05, joint: 0.86, roughness: 0.45 }), 'taupe-stone'),
    terracotta: keep(terracottaPanel(), 'terracotta'),
    stripes: keep(verticalStripes(), 'stripes'),
    steel: surface('stainless', { color: '#c4c8c9', roughness: 0.22, metalness: 0.9 }),
    canopy: surface('canopy', { color: '#dadbd8', roughness: 0.45, metalness: 0.4 }),
    frame: surface('residence-frame', { color: '#4f4c48', roughness: 0.45, metalness: 0.45 }),
    slats: surface('railing-slats', { color: '#6d6a66', roughness: 0.5, metalness: 0.4 }),
    soffit: surface('soffit', { color: '#8b8984', roughness: 0.7 }),
    greige: surface('dg-panel', { color: '#57514a', roughness: 0.38, metalness: 0.45 }),
    mint: surface('mint-glass', { color: '#a7d5ca', roughness: 0.12, metalness: 0.25 }),
    frost: surface('frosted-glass', { color: '#cfd3d1', roughness: 0.28, metalness: 0.12 }),
    ouzo: surface('ouzo-blue', { color: '#26489a', roughness: 0.85 }),
    iron: surface('black-iron', { color: '#18191b', roughness: 0.5, metalness: 0.5 }),
    hoarding: surface('hoarding', { color: '#f2f0ea', roughness: 0.8 }),
    poppy: surface('hoarding-red', { color: '#c4473a', roughness: 0.7 }),
    camel: surface('hoarding-tan', { color: '#d8b388', roughness: 0.7 }),
    pergola: surface('pergola-canvas', { color: '#34332f', roughness: 0.9 }),
    diorStone: keep(cladding({ color: '#ddd5c6', panel: [1.5, 0.75], tone: 0.06, joint: 0.86, roughness: 0.45 }), 'dior-stone'),
    diorPanel: keep(frittedGlass(), 'dior-panel'),
    whiteMetal: surface('white-metal', { color: '#f1f1ee', roughness: 0.35, metalness: 0.3 }),
    render: keep(cladding({ color: '#f0ede6', panel: [3, 1.5], tone: 0.012, joint: 0.95, roughness: 0.7 }), 'white-render'),
    gold: surface('gilt', { color: '#b38f4c', roughness: 0.32, metalness: 0.78 }),
    lattice: keep(latticeTile(), 'lattice'),
    cream: keep(cladding({ color: '#efe8da', panel: [0.9, 0.45], bond: true, tone: 0.03, joint: 0.86 }), 'shack-tile'),
    ivory: surface('ivory-frame', { color: '#efe7d8', roughness: 0.5, metalness: 0.1 }),
    beigeLouvre: surface('beige-louvre', { color: '#c8b69a', roughness: 0.6, metalness: 0.15 }),
    leaf: surface('vine-leaves', { color: '#4f6f37', roughness: 0.85 }),
    blossom: surface('vine-blossom', { color: '#f3e3e6', roughness: 0.8 }),
    wisteria: surface('wisteria', { color: '#8e6fc9', roughness: 0.8 }),
    walnut: surface('walnut-soffit', { color: '#7a4e2f', roughness: 0.6 }),
    hedge: surface('box-hedge', { color: '#3d5a2f', roughness: 0.9 }),
    timber: surface('timber-louvre', { color: '#6b5240', roughness: 0.65, metalness: 0.1 }),
    copper: surface('copper-panel', { color: '#a8743d', roughness: 0.42, metalness: 0.65 }),
  };
  const fills = new Map();
  const fill = color => { if (!fills.has(color)) fills.set(color, surface(`sign-${color.slice(1)}`, { color, roughness: 0.45, metalness: 0.15 })); return fills.get(color); };
  // Repeated names (ETRO, EQUINOX) share one canvas.
  const letters = new Map();
  const word = (text, options) => { const key = `${text}|${JSON.stringify(options)}`; if (!letters.has(key)) letters.set(key, lettering(text, options)); return letters.get(key); };
  const letter = (text, style, f, s, h, d, width, height, yaw) => sign(word(text, { ...style, width, height }), f, s, h, d, width, height, yaw);

  // A clad layer between d0 and d1 with rectangular openings [s0, s1, h0, h1],
  // which may stack in one column (shop glass under an upper window).
  function wall(f, material, s0, s1, h0, h1, d0, d1, holes = []) {
    const cuts = [...new Set([s0, s1, ...holes.flatMap(([a, b]) => [a, b])])].filter(s => s >= s0 && s <= s1).sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1], b = cuts[i], middle = (a + b) / 2;
      let h = h0;
      for (const [, , lo, hi] of holes.filter(([x, y]) => x < middle && y > middle).sort((p, q) => p[2] - q[2])) { box(f, material, a, b, h, Math.max(h, lo), d0, d1); h = Math.max(h, hi); }
      box(f, material, a, b, h, h1, d0, d1);
    }
  }
  function framedWindow(f, a, b, lo, hi, { d, face, columns = 1, frame = n.frame, transom = columns > 1 }) {
    sheet(f, m.shopGlass, a, b, lo, hi, d);
    for (let i = 0; i <= columns; i++) { const s = a + (b - a) * i / columns; box(f, frame, Math.max(a, s - 0.045), Math.min(b, s + 0.045), lo, hi, d, d + 0.08); }
    for (const h of transom ? [lo, lo + (hi - lo) * 0.7, hi] : [lo, hi]) box(f, frame, a, b, Math.max(lo, h - 0.045), Math.min(hi, h + 0.045), d, d + 0.08);
    box(f, frame, a - 0.04, b + 0.04, lo - 0.06, lo, d, face + 0.05);
  }
  // A recessed balcony: sliding doors at the back, a louvred railing at the face.
  function loggia(f, a, b, lo, hi, face, frame = n.frame) {
    sheet(f, m.shopGlass, a, b, lo, hi, 0.04);
    for (const s of [a + 0.04, (a + b) / 2, b - 0.04]) box(f, frame, s - 0.04, s + 0.04, lo, hi, 0.04, 0.12);
    box(f, frame, a, b, hi - 0.06, hi, 0.04, 0.12);
    for (let j = 0; j < 4; j++) box(f, n.slats, a, b, lo + 0.14 + j * 0.25, lo + 0.25 + j * 0.25, face - 0.14, face - 0.05);
    for (const s of [a + 0.05, b - 0.05]) box(f, n.slats, s - 0.03, s + 0.03, lo, lo + 1.1, face - 0.16, face - 0.04);
  }
  // Residential storeys from `from` to the eaves: a clad layer `depth` proud of
  // the mass, punched with windows and loggias whose columns line up floor to floor.
  function storeys(f, W, { from = FLOORS[0], material, depth = 0.9, bay = 7.2, patterns = ['pair', 'loggia', 'wide', 'pair', 'loggia', 'pair'], phase = 0, s0 = 0, s1 = W, ends = [depth, depth] }) {
    const floors = FLOORS.filter(h => h >= from - 0.01), span = s1 - s0, count = Math.max(1, Math.round(span / bay)), width = span / count;
    floors.forEach((h0, i) => {
      const h1 = floors[i + 1] ?? EAVES, holes = [], windows = [], balconies = [];
      for (let k = 0; k < count; k++) {
        const b0 = s0 + k * width, middle = b0 + width / 2, type = width < 4 ? 'solid' : patterns[(k + phase) % patterns.length];
        if (type === 'pair') {
          const w = Math.min(1.9, (width - 2.2) / 2);
          for (const c of [b0 + width * 0.28, b0 + width * 0.72]) windows.push([c - w / 2, c + w / 2, h0 + 0.75, h0 + 3.0, 1]);
        } else if (type === 'wide') {
          const w = Math.min(4.2, width - 2);
          windows.push([middle - w / 2, middle + w / 2, h0 + 0.75, h0 + 3.0, 3]);
        } else if (type === 'loggia') {
          const w = Math.min(4.6, width - 1.6);
          balconies.push([middle - w / 2, middle + w / 2, h0 + 0.2, h0 + 3.05]);
        }
      }
      holes.push(...windows.map(([a, b, lo, hi]) => [a, b, lo, hi]), ...balconies);
      wall(f, material, s0 - (s0 === 0 ? ends[0] : 0), s1 + (s1 === W ? ends[1] : 0), h0, h1, -0.05, depth, holes);
      // A slim projecting floor line reads each storey.
      box(f, material, s0 - (s0 === 0 ? ends[0] : 0), s1 + (s1 === W ? ends[1] : 0), h0 - 0.05, h0 + 0.07, depth, depth + 0.05);
      for (const [a, b, lo, hi, columns] of windows) framedWindow(f, a, b, lo, hi, { d: depth - 0.3, face: depth, columns });
      for (const [a, b, lo, hi] of balconies) loggia(f, a, b, lo, hi, depth);
    });
  }
  function eaves(f, W, { depth = 0.9, over = 1.3, material = n.white, ends = [depth, depth] } = {}) {
    box(f, material, -ends[0] - over, W + ends[1] + over, EAVES, EAVES + 0.55, -0.05, depth + over);
    box(f, n.soffit, -ends[0] - over + 0.02, W + ends[1] + over - 0.02, EAVES - 0.02, EAVES, depth, depth + over - 0.02);
  }
  // A store sign box standing proud of the wall, lettered on its face.
  function signBox(f, a, b, lo, hi, d0, d1, material, text, style) {
    box(f, material, a, b, lo, hi, d0, d1);
    if (!text) return;
    const { width = 5, height = (hi - lo) * 0.55, ...look } = style;
    letter(text, look, f, (a + b) / 2, (lo + hi) / 2, d1 + 0.005, Math.min(b - a - 0.5, width), height);
  }
  // Shop modules [{ s0, s1, ... }] in order; gaps wider than `least` become plain bays.
  function layout(W, wanted, { start = 0.8, end = W - 0.8, gap = 0.8, bay = 7, least = 3.2 } = {}) {
    const kept = [];
    for (const item of [...wanted].sort((a, b) => a.s0 - b.s0)) {
      const s0 = Math.max(start, item.s0), s1 = Math.min(end, item.s1);
      if (s1 - s0 > 2 && !kept.some(other => s0 < other.s1 + gap - 0.01 && s1 > other.s0 - gap + 0.01)) kept.push({ ...item, s0, s1 });
    }
    kept.sort((a, b) => a.s0 - b.s0);
    const all = [];
    let last = start - gap;
    for (const item of [...kept, { s0: end + gap }]) {
      const room = item.s0 - gap - (last + gap);
      if (room >= least) {
        const count = Math.max(1, Math.round((room + gap) / (bay + gap))), width = (room - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) all.push({ kind: 'plain', s0: last + gap + i * (width + gap), s1: last + gap + i * (width + gap) + width });
      }
      if (item.s1 !== undefined) { all.push(item); last = item.s1; }
    }
    return all;
  }
  const doorAt = (doors, name) => doors.find(item => item.store.name === name)?.s;
  // One module per door, centred on it and stopping short of its neighbours.
  function doorModules(doors, make, { half = 3.9, gap = 0.7 } = {}) {
    const sorted = [...doors].sort((a, b) => a.s - b.s);
    return sorted.map((item, i) => {
      const h = item.half ?? half, before = sorted[i - 1], after = sorted[i + 1];
      const s0 = Math.max(item.s - h, before ? (before.s + item.s) / 2 + gap / 2 : -Infinity), s1 = Math.min(item.s + h, after ? (item.s + after.s) / 2 - gap / 2 : Infinity);
      return { s0, s1, ...make(item) };
    });
  }

  // Equinox (4444 Westheimer): a two-storey limestone podium, shops under a
  // white canopy and the gym's tall windows over a timber band, carrying four
  // storeys of royal-blue curtain wall. EQUINOX is cut into the corner bays.
  function equinox(frontage, f, W, doors) {
    const face = frontage.edge.facing, doorS = doors.map(item => item.s), pier = 1.2;
    const count = Math.max(1, Math.round((W - pier) / 7.8)), centres = [];
    for (let k = 0; k <= count; k++) {
      let c = pier / 2 + k * (W - pier) / count;
      for (const s of doorS) if (k > 0 && k < count && Math.abs(c - s) < pier / 2 + 1.0) c = s + Math.sign(c - s || 1) * (pier / 2 + 1.0);
      centres.push(c);
    }
    const bays = centres.slice(1).map((c, k) => [centres[k] + pier / 2, c - pier / 2]);
    const lettered = face === 'north' || face === 'west' ? bays.length - 1 : -1;
    const terrace = face === 'west' ? [-0.45, centres[Math.min(2, count)]] : null;
    const ouzo = face === 'west' ? bays.filter(([b0]) => b0 > W * 0.45) : [];
    centres.forEach((c, k) => {
      const s0 = k === 0 ? -0.45 : c - pier / 2, s1 = k === count ? W + 0.45 : c + pier / 2;
      box(f, n.equinoxStone, s0, s1, 0.5, 11.0, -0.05, 0.45);
      box(f, m.granite, s0, s1, 0, 0.5, -0.05, 0.49);
    });
    bays.forEach(([b0, b1], k) => {
      storefront(f, b0, b1, 5.0, { doors: doorS, mullion: m.bronze, pitch: 1.9, transom: 3.6, upper: m.shopGlass, d: 0.04, depth: 0.14 });
      if (k === lettered) {
        box(f, n.equinoxStone, b0, b1, 5.0, 11.0, -0.05, 0.3);
        letter('EQUINOX', { family: '"Gill Sans", Futura, Avenir, sans-serif', weight: 400, color: '#4c4c50', spacing: 0.45, metalness: 0.5, roughness: 0.4 }, f, (b0 + b1) / 2, 8.6, 0.31, Math.min(6.2, b1 - b0 - 0.6), 0.85);
        return;
      }
      // The gym storey: a timber louvre band under tall bronze-framed glass.
      sheet(f, m.charcoal, b0, b1, 5.0, 6.5, 0.02);
      for (let i = 0; i < 4; i++) box(f, m.teak, b0, b1, 5.55 + i * 0.23, 5.69 + i * 0.23, 0.14, 0.3);
      sheet(f, m.shopGlass, b0, b1, 6.5, 11.0, 0.06);
      const columns = Math.max(2, Math.round((b1 - b0) / 2.4));
      for (let i = 0; i <= columns; i++) { const s = b0 + (b1 - b0) * i / columns; box(f, m.bronze, Math.max(b0, s - 0.045), Math.min(b1, s + 0.045), 6.5, 11.0, 0.06, 0.2); }
      for (const h of [6.5, 8.9, 11.0]) box(f, m.bronze, b0, b1, h - 0.045, h + 0.045, 0.06, 0.2);
      box(f, n.equinoxStone, b0, b1, 6.4, 6.52, 0.0, 0.5);
    });
    // Shop canopy, broken where the terrace slab or the Ouzo Bay awnings take
    // over. Its soffit clears the street lamps on the narrow pavements (5.14 m).
    const runs = [[-2.0, W + 2.0]].flatMap(([p, q]) => (terrace ? [[p, terrace[0]], [terrace[1], q]] : [[p, q]]).filter(([x, y]) => y - x > 0.2))
      .flatMap(([p, q]) => ouzo.length ? [[p, Math.min(q, ouzo[0][0] - pier / 2)], [Math.max(p, ouzo.at(-1)[1] + pier / 2), q]].filter(([x, y]) => y - x > 0.2) : [[p, q]]);
    for (const [p, q] of runs) {
      box(f, n.canopy, p, q, 5.26, 5.46, 0.45, 1.9);
      box(f, n.canopy, p, q, 5.22, 5.5, 1.82, 1.92);
    }
    for (const [b0, b1] of bays) for (const s of [b0 + (b1 - b0) * 0.3, b0 + (b1 - b0) * 0.7]) if (runs.some(([p, q]) => s > p && s < q)) box(f, m.lamp, s - 0.1, s + 0.1, 5.24, 5.26, 1.0, 1.2);
    // Gilt shop names in the transom over each door.
    for (const { store, s } of doors) letter(store.name, { family: store.name === 'Le Colonial' ? '"Big Caslon", Baskerville, Georgia, serif' : '"Gill Sans", Futura, Avenir, sans-serif', weight: 500, color: '#caa968', spacing: 0.08, metalness: 0.55, roughness: 0.35 }, f, s, 4.3, 0.19, 2.8, 0.42);
    if (ouzo.length) {
      // Ouzo Bay's blue canvas awnings and fascia toward Westheimer.
      const a = ouzo[0][0] - 0.2, b = ouzo.at(-1)[1] + 0.2;
      box(f, n.ouzo, a, b, 5.0, 5.36, 0.45, 0.62);
      letter('OUZO BAY', { family: 'Futura, Avenir, sans-serif', weight: 500, color: '#f4f2ec', spacing: 0.3 }, f, (a + b) / 2, 5.18, 0.625, Math.min(5, b - a - 1), 0.28);
      for (const [b0, b1] of ouzo) {
        const run = 1.6, pitch = 0.45, drop = Math.sin(pitch) * run / 2, middle = 0.45 + run / 2 * Math.cos(pitch), edge = 0.45 + run * Math.cos(pitch);
        box(f, n.ouzo, b0, b1, 5.0 - drop - 0.015, 5.0 - drop + 0.015, middle - run / 2, middle + run / 2, pitch);
        box(f, n.ouzo, b0, b1, 5.0 - drop * 2 - 0.25, 5.0 - drop * 2, edge - 0.015, edge + 0.015);
      }
    }
    if (terrace) {
      // The corner terrace: a stone slab at the gym floor with black ironwork,
      // a pergola and lanterns, over the Kettering Drive pavement.
      const [t0, t1] = terrace;
      box(f, n.equinoxStone, t0, t1, 5.25, 5.5, 0.45, 2.35);
      for (let s = t0 + 0.1; s <= t1 - 0.05; s += (t1 - t0 - 0.2) / Math.max(1, Math.round((t1 - t0) / 1.25))) box(f, n.iron, s - 0.03, s + 0.03, 5.5, 6.6, 2.22, 2.28);
      for (const h of [5.75, 6.55]) box(f, n.iron, t0, t1, h - 0.03, h + 0.03, 2.21, 2.29);
      const posts = Math.max(1, Math.round((t1 - t0) / 3));
      for (let i = 0; i <= posts; i++) {
        const s = t0 + 0.12 + (t1 - t0 - 0.24) * i / posts;
        box(f, n.iron, s - 0.07, s + 0.07, 5.5, 9.2, 2.18, 2.32);
        box(f, n.iron, s - 0.1, s + 0.1, 8.25, 8.65, 2.33, 2.5); box(f, m.lamp, s - 0.07, s + 0.07, 8.3, 8.6, 2.5, 2.52);
      }
      box(f, n.iron, t0, t1, 9.2, 9.36, 0.45, 2.35);
      for (let s = t0 + 0.2; s < t1; s += 0.55) box(f, n.iron, s - 0.03, s + 0.03, 9.36, 9.46, 0.45, 2.35);
    }
    box(f, n.equinoxStone, -0.45, W + 0.45, 11.0, 12.6, -0.05, 0.45);
    box(f, n.equinoxStone, -0.55, W + 0.55, 12.6, 12.78, -0.05, 0.58);
    // Four storeys of curtain wall, mullions every ~1.5 m, floor lines and a coping.
    const panes = Math.max(1, Math.round(W / 1.55));
    for (let i = 0; i <= panes; i++) { const s = W * i / panes; box(f, n.royalFrame, s - 0.035, s + 0.035, 12.78, 27.85, 0, 0.16); }
    for (const h of [16.6, 20.45, 24.3]) box(f, n.royalFrame, -0.02, W + 0.02, h - 0.07, h + 0.07, 0, 0.12);
    box(f, n.royalFrame, -0.18, W + 0.18, 27.85, 28.15, -0.05, 0.2);
    if (face === 'north' || face === 'west') letter('U.S. CAPITAL ADVISORS', { family: '"Gill Sans", Futura, Avenir, sans-serif', weight: 500, color: '#f3f5fa', spacing: 0.06, emissive: 0.08 }, f, face === 'north' ? W - 7.5 : 7.5, 26.6, 0.17, 10, 0.72);
  }

  // The Etro block: grey-beige limestone, black-framed shop glass under one long
  // cantilevered canopy with ribs and hanger rods, sign boxes above it, and the
  // ETRO and BRUNELLO CUCINELLI names in metal letters on the raised south end.
  // Its north face, on the plaza, is a different pair of shops (plaza below).
  function etro(frontage, f, W, doors) {
    const face = frontage.edge.facing, wanted = [], at = name => doorAt(doors, name);
    let raised = null, ends = [2.9, 2.9];
    if (face === 'west') {
      raised = [W - 15.8, W]; ends = [0.15, 2.9];
      wanted.push({ kind: 'etro', s0: W - 15.2, s1: W - 0.9 });
      wanted.push({ kind: 'box', s0: W - 21.9, s1: W - 16.0, text: 'NARS', fill: '#141415', ink: '#f2f2ef', family: 'Futura, Avenir, sans-serif', weight: 300, spacing: 0.12 });
      wanted.push({ kind: 'stripe', s0: W - 28.6, s1: W - 22.7, text: 'LELE SADOUGHI', fill: '#f5f4ef', ink: '#1a1a1a', family: '"Gill Sans", Futura, sans-serif', weight: 500, spacing: 0.12 });
      wanted.push({ kind: 'box', s0: W - 35.3, s1: W - 29.4, text: 'A.L.C.', fill: '#f6f5f1', ink: '#151515', family: 'Georgia, "Times New Roman", serif', weight: 700, spacing: 0.06 });
      const dip = at('Diptyque');
      if (dip !== undefined) wanted.push({ s0: dip - 4.2, s1: dip + 4.2, kind: 'box', text: 'diptyque', fill: '#56585b', ink: '#f1efe9', family: '"Bodoni 72", Didot, Georgia, serif', weight: 400, spacing: 0.04 });
    } else if (face === 'south') {
      raised = [0, W];
      wanted.push({ kind: 'etro', s0: 0.9, s1: W * 0.55 });
      wanted.push({ kind: 'brunello', s0: W * 0.55 + 0.9, s1: W - 0.9 });
    } else if (face === 'east') {
      raised = [0, 15.8]; ends = [2.9, 0.15];
      const bc = at('Brunello Cucinelli') ?? 9;
      wanted.push({ kind: 'brunello', s0: Math.min(1.0, bc - 3), s1: Math.max(15, bc + 4.2) });
      const styles = { Moreau: { fill: '#5d4331', ink: '#efe3cf', family: 'Didot, "Bodoni 72", Georgia, serif', weight: 500, spacing: 0.2 }, 'Oliver Peoples': { fill: '#f5f4f0', ink: '#1b1b1b', family: 'Futura, Avenir, sans-serif', weight: 500, spacing: 0.12 } };
      wanted.push(...doorModules(doors.filter(item => item.store.name !== 'Brunello Cucinelli'), ({ store }) => ({ kind: 'box', text: store.name.toUpperCase(), ...(styles[store.name] ?? { fill: '#f5f4f0', ink: '#1b1b1b', family: 'Futura, Avenir, sans-serif', weight: 500, spacing: 0.08 }) }), { half: 4.2 }));
    }
    stoneRow(f, W, wanted, doors, { stone: n.etroStone, podium: ETRO_PODIUM, height: ETRO_HEIGHT, raised, ends });
    if (face === 'west') raisedMass(frontage, f, n.etroStone, W - 15.8, W + 0.05, ETRO_PODIUM, ETRO_HEIGHT - 0.04);
  }
  // A single-storey limestone shop row: glazing cut through the stone, sign
  // boxes over one cantilevered canopy with ribs and hanger rods. `raised`
  // spans climb from the podium to `height`; `ends` is how far the canopy runs
  // past each corner, so neighbouring rows close the corner square.
  function stoneRow(f, W, wanted, doors, { stone, podium, height, raised = null, ends = [2.9, 2.9] }) {
    const doorS = doors.map(item => item.s), modules = layout(W, wanted, { bay: 7.2 });
    const top = s => raised && s >= raised[0] - 0.01 && s <= raised[1] + 0.01 ? height : podium;
    const holes = modules.flatMap(item => item.kind === 'etro' ? [[item.s0, (item.s0 + item.s1) / 2 - 0.5, 0, 3.95], [(item.s0 + item.s1) / 2 + 0.5, item.s1, 0, 3.95]] : [[item.s0, item.s1, 0, 3.95]]);
    wall(f, stone, -0.12, W + 0.12, 0, podium, -0.05, 0.12, holes);
    if (raised) {
      const [r0, r1] = raised, e0 = r0 <= 0 ? -0.12 : r0, e1 = r1 >= W ? W + 0.12 : r1;
      box(f, stone, e0, e1, podium, height, -0.05, 0.12);
      box(f, n.soffit, e0, e1, height - 0.04, height + 0.06, -0.05, 0.2);
    }
    const low = [[-0.12, W + 0.12]].flatMap(([p, q]) => raised ? [[p, Math.min(q, raised[0])], [Math.max(p, raised[1]), q]].filter(([x, y]) => y - x > 0.1) : [[p, q]]);
    for (const [p, q] of low) box(f, n.soffit, p, q, podium - 0.04, podium + 0.06, -0.05, 0.2);
    for (const item of modules) {
      const { s0, s1, kind } = item, middle = (s0 + s1) / 2;
      if (kind === 'etro') {
        for (const [a, b] of [[s0, middle - 0.5], [middle + 0.5, s1]]) storefront(f, a, b, 3.95, { doors: doorS, mullion: m.charcoal, pitch: 1.6, transom: 3.95, d: 0.03, depth: 0.1 });
        // Black louvred panels over the glass, with the small ETRO box between.
        const panels = [[s0 + 0.2, middle - 0.7], [middle + 0.7, middle + (s1 - middle) * 0.55], [middle + (s1 - middle) * 0.55 + 0.4, s1 - 0.2]];
        panels.forEach(([a, b], i) => {
          box(f, m.charcoal, a, b, 4.55, 6.0, 0.1, 0.18);
          if (i === 2) { letter('ETRO', { family: 'Futura, "Avenir Next", sans-serif', weight: 300, color: '#d8d6cf', spacing: 0.6 }, f, (a + b) / 2, 5.28, 0.185, Math.min(1.8, b - a - 0.4), 0.32); return; }
          for (let h = 4.66; h < 5.95; h += 0.17) box(f, m.louver, a, b, h, h + 0.06, 0.18, 0.28);
        });
        if (top(middle) > podium) letter('ETRO', { family: 'Futura, "Avenir Next", Avenir, sans-serif', weight: 300, color: '#3d3d40', spacing: 0.85, metalness: 0.6, roughness: 0.38 }, f, middle, 7.15, 0.13, Math.min(4.6, s1 - s0 - 1), 0.9);
        continue;
      }
      storefront(f, s0, s1, 3.95, { doors: doorS, mullion: m.charcoal, pitch: 1.6, transom: 3.95, d: 0.03, depth: 0.1 });
      const style = { family: item.family, weight: item.weight, color: item.ink, spacing: item.spacing, height: 0.5, width: Math.min(4.6, s1 - s0 - 1.4) };
      if (kind === 'box') signBox(f, s0 + 0.5, s1 - 0.5, 4.55, 5.85, 0.12, 0.36, fill(item.fill), item.text, style);
      else if (kind === 'stripe') {
        signBox(f, s0 + 0.5, s1 - 0.5, 4.85, 5.85, 0.12, 0.36, fill(item.fill), item.text, { ...style, height: 0.42 });
        box(f, n.stripes, s0 + 0.5, s1 - 0.5, 4.55, 4.85, 0.12, 0.36);
      } else if (kind === 'louvred') {
        // Dark louvred panels over the glass, as along the Vilebrequin frontage.
        box(f, m.charcoal, s0 + 0.2, s1 - 0.2, 4.55, 6.0, 0.1, 0.18);
        for (let h = 4.66; h < 5.95; h += 0.17) box(f, m.louver, s0 + 0.2, s1 - 0.2, h, h + 0.06, 0.18, 0.28);
      } else if (kind === 'brunello') {
        // Three frosted clerestory panels and the maison's name in the stone above.
        const third = (s1 - s0 - 0.8) / 3;
        for (let i = 0; i < 3; i++) box(f, n.frost, s0 + 0.4 + i * third + 0.2, s0 + 0.4 + (i + 1) * third - 0.2, 4.5, 6.05, 0.02, 0.06);
        letter('BRUNELLO CUCINELLI', { family: 'Optima, Candara, "Gill Sans", sans-serif', weight: 700, color: '#47433f', spacing: 0.06, metalness: 0.4, roughness: 0.45 }, f, middle, 6.95, 0.13, Math.min(8, s1 - s0 - 0.6), 0.48);
      }
    }
    // One cantilevered canopy: plate, fascia, ribs, rods to the wall, downlights.
    box(f, n.canopy, -ends[0], W + ends[1], 4.12, 4.2, 0.12, 2.9);
    box(f, n.canopy, -ends[0], W + ends[1], 4.07, 4.26, 2.84, 2.92);
    for (let s = 0.4; s < W; s += 1.6) box(f, n.canopy, s - 0.03, s + 0.03, 4.2, 4.34, 0.12, 2.86);
    for (let s = 2.4; s < W - 1; s += 4.8) {
      const rise = 6.2 - 4.3, run = 2.7, pitch = Math.atan2(rise, run), length = Math.hypot(rise, run);
      box(f, n.steel, s - 0.02, s + 0.02, 5.25 - 0.02, 5.25 + 0.02, 1.48 - length / 2, 1.48 + length / 2, pitch);
    }
    for (const item of modules) for (const s of [item.s0 + (item.s1 - item.s0) * 0.3, item.s0 + (item.s1 - item.s0) * 0.7]) box(f, m.lamp, s - 0.09, s + 0.09, 4.1, 4.12, 1.3, 1.48);
  }
  // A raised part of a block over its podium roof: a mass behind the frontage
  // between s0 and s1, `depth` metres deep (to the far side, less a margin, by default).
  function raisedMass(frontage, f, material, s0, s1, lo, hi, depth) {
    const { edge, building } = frontage;
    const reach = depth ?? Math.max(...building.ring.map(([east, north]) => -((east - edge.a[0]) * edge.o[0] + (north - edge.a[1]) * edge.o[1]))) - 0.8;
    box(f, material, s0, s1, lo, hi, -reach, -0.04);
  }

  // The plaza face of the Etro block, opposite Dior: a white two-storey house
  // with gilt frames and lattice screens, then LoveShackFancy with its beige
  // louvres and a flowering arbour over the shop windows.
  function plaza(frontage, f, W) {
    const split = Math.min(15.5, W * 0.5);
    gildedLattice(f, 0, split);
    raisedMass(frontage, f, n.render, -0.12, split, ETRO_PODIUM, ETRO_HEIGHT - 0.04, 9);
    loveShack(f, split + 0.8, W);
  }
  function gildedLattice(f, a, b) {
    const pier = 0.8, count = Math.max(1, Math.round((b - a - pier) / 6.5)), width = (b - a - pier * (count + 1)) / count;
    const bays = Array.from({ length: count }, (_, i) => [a + pier + i * (width + pier), a + pier + i * (width + pier) + width]);
    wall(f, n.render, a - 0.12, b, 0, ETRO_HEIGHT, -0.05, 0.12, bays.map(([p, q]) => [p, q, 0, 8.9]));
    box(f, n.soffit, a - 0.12, b, ETRO_HEIGHT - 0.04, ETRO_HEIGHT + 0.06, -0.05, 0.2);
    bays.forEach(([p, q], i) => {
      // A gilt frame standing proud of the render; the end bay projects further.
      const out = i === 0 ? 0.6 : 0.35;
      for (const [x, y] of [[p - 0.28, p], [q, q + 0.28]]) box(f, n.gold, x, y, 0, 9.0, -0.05, out);
      box(f, n.gold, p - 0.28, q + 0.28, 8.9, 9.15, -0.05, out);
      box(f, n.gold, p, q, 3.7, 3.92, -0.05, out - 0.1);
      storefront(f, p, q, 3.7, { mullion: n.gold, pitch: 1.6, transom: 3.7, d: 0.03, depth: 0.1 });
      // The lattice: one gilt tile per metre over a dark ground.
      sheet(f, m.charcoal, p, q, 3.92, 8.9, 0.02);
      const columns = Math.max(1, Math.round(q - p)), rows = Math.max(1, Math.round(8.9 - 3.92)), tw = (q - p) / columns, th = (8.9 - 3.92) / rows;
      for (let c = 0; c < columns; c++) for (let r = 0; r < rows; r++) box(f, n.lattice, p + c * tw, p + (c + 1) * tw, 3.92 + r * th, 3.92 + (r + 1) * th, 0.06, 0.1);
      for (const s of [p - 0.55, q + 0.55]) if (s > a && s < b) { box(f, n.hoarding, s - 0.09, s + 0.09, 3.0, 3.45, 0.12, 0.2); box(f, m.lamp, s - 0.06, s + 0.06, 3.02, 3.43, 0.2, 0.21); }
    });
  }
  function loveShack(f, a, W) {
    const panels = Math.max(2, Math.round((W - a - 1) / 3)), pw = (W - a - 0.6 * (panels + 1)) / panels;
    const louvres = Array.from({ length: panels }, (_, i) => [a + 0.6 + i * (pw + 0.6), a + 0.6 + i * (pw + 0.6) + pw]);
    wall(f, n.cream, a - 0.8, W + 0.12, 0, ETRO_PODIUM, -0.05, 0.12, [[a + 0.6, W - 0.6, 0, 4.0], ...louvres.map(([p, q]) => [p, q, 5.0, 7.5])]);
    box(f, n.soffit, a - 0.8, W + 0.12, ETRO_PODIUM - 0.04, ETRO_PODIUM + 0.06, -0.05, 0.2);
    storefront(f, a + 0.6, W - 0.6, 4.0, { mullion: n.ivory, pitch: 1.5, transom: 3.2, d: 0.03, depth: 0.1 });
    signBox(f, a + 0.4, W - 0.4, 4.0, 4.7, 0.12, 0.3, n.ivory, 'LoveShackFancy', { family: '"Big Caslon", Didot, Baskerville, Georgia, serif', weight: 500, color: '#c27783', spacing: 0.04, height: 0.48, width: Math.min(6.5, W - a - 2) });
    for (const [p, q] of louvres) {
      sheet(f, m.charcoal, p, q, 5.0, 7.5, 0.02);
      for (let h = 5.06; h < 7.45; h += 0.14) box(f, n.beigeLouvre, p, q, h, h + 0.07, 0.04, 0.2);
    }
    // The arbour: white rods out over the windows, smothered in leaves and blossom.
    for (let s = a + 0.4; s <= W - 0.3; s += 1.2) box(f, n.ivory, s - 0.025, s + 0.025, 4.72, 4.77, 0.12, 1.55);
    box(f, n.ivory, a + 0.3, W - 0.3, 4.72, 4.78, 1.5, 1.56);
    flowers(f, a + 0.4, W - 0.4, 4.78, 1.5, { leaf: n.leaf, bloom: n.blossom, count: Math.round((W - a) * 7), hang: 0.9 });
  }
  // Leaf clusters along a rail with blossom trailing below it (deterministic).
  function flowers(f, a, b, h, d, { leaf, bloom, count, hang = 0.6 }) {
    let seed = Math.round(a * 97 + h * 13);
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
      const s = a + (b - a) * random(), z = d - 0.7 * random();
      if (i % 3) { const r = 0.12 + 0.18 * random(); box(f, leaf, s - r, s + r, h - 0.05, h + r * 0.9, z - r, z + r); }
      else { const l = 0.2 + hang * random(); box(f, bloom, s - 0.06, s + 0.06, h - l, h, z - 0.06, z + 0.06); }
    }
  }

  // The Dior block. Dior's stone frame stands two storeys over the rest, a
  // fritted dark glass field carrying the name over a thin white canopy; the
  // west half of its face and the whole west side are Toulouse's building.
  function dior(frontage, f, W, doors) {
    const doorS = doors.map(item => item.s), d0 = Math.max(W * 0.4, Math.min(W - 15, (doorAt(doors, 'Dior') ?? W - 8) - 9.5));
    toulouseBody(f, 0, d0, [], doorS, { roof: [3.5, 0], slab: [1.6, 0] });
    const p0 = d0 + 1.0, p1 = W - 2.4;
    box(f, n.diorStone, d0, p0, 0, DIOR_HEIGHT, -0.05, 0.4);
    box(f, n.diorStone, p1, W + 0.12, 0, DIOR_HEIGHT, -0.05, 0.4);
    box(f, n.diorStone, p0, p1, 11.5, DIOR_HEIGHT, -0.05, 0.4);
    box(f, n.diorStone, p0, p1, 4.45, 4.6, -0.05, 0.4);
    box(f, n.soffit, d0, W + 0.12, DIOR_HEIGHT - 0.04, DIOR_HEIGHT + 0.06, -0.05, 0.46);
    box(f, n.diorPanel, p0, p1, 4.6, 11.5, 0.04, 0.08);
    letter('DIOR', { family: 'Didot, "Bodoni 72", Georgia, serif', weight: 500, color: '#0e0e0f', spacing: 0.08 }, f, (p0 + p1) / 2, 8.9, 0.085, Math.min(7.6, p1 - p0 - 2), 2.0);
    storefront(f, p0, p1, 4.1, { doors: doorS, mullion: m.charcoal, pitch: 2.2, transom: 3.4, d: 0.03, depth: 0.12 });
    box(f, n.whiteMetal, p0 - 0.2, p1 + 0.2, 4.1, 4.45, 0.4, 1.5);
    letter('DIOR', { family: 'Didot, "Bodoni 72", Georgia, serif', weight: 500, color: '#141414', spacing: 0.08 }, f, p0 + 1.3, 4.27, 1.505, 1.4, 0.26);
    for (const s of [p0 + (p1 - p0) * 0.25, p0 + (p1 - p0) * 0.75]) box(f, m.lamp, s - 0.1, s + 0.1, 4.08, 4.1, 0.8, 1.0);
    raisedMass(frontage, f, n.diorStone, d0, W + 0.12, DIOR_PODIUM, DIOR_HEIGHT - 0.04, 16);
  }
  // Toulouse's building: white tile shops under a terrace slab with a glass
  // balustrade, a glazed upper storey and a deep, thin cantilevered roof. The
  // café itself has blue-and-white awnings smothered in wisteria.
  // `roof` and `slab` say how far the roof plate and terrace run past each end.
  function toulouseBody(f, a, b, modules, doorS, { roof = [0, 0], slab = [0, 0] } = {}) {
    const shops = modules.length ? modules : layout(b - a, [], { start: 0.8, end: b - a - 0.8, gap: 0.8, bay: 5 }).map(item => ({ ...item, s0: item.s0 + a, s1: item.s1 + a }));
    wall(f, n.tile, a - 0.12, b + (slab[1] ? 0.12 : 0), 0, 4.85, -0.05, 0.25, shops.map(item => [item.s0, item.s1, 0, 4.2]));
    for (const item of shops) {
      storefront(f, item.s0, item.s1, 4.2, { doors: doorS, mullion: n.frame, pitch: 1.5, transom: 3.3, d: 0.03, depth: 0.1 });
      if (item.kind === 'cafe') cafe(f, item);
    }
    // Terrace slab and balustrade, then the glazed storey behind it.
    const t0 = a - slab[0], t1 = b + slab[1], r0 = a - roof[0], r1 = b + roof[1];
    box(f, n.white, t0, t1, 4.85, 5.25, -0.05, 1.6);
    sheet(f, m.railGlass, t0, t1, 5.25, 6.3, 1.52);
    box(f, n.canopy, t0, t1, 6.28, 6.34, 1.46, 1.58);
    sheet(f, m.shopGlass, a, b, 5.25, 9.3, 0.04);
    for (let s = a; s <= b + 0.01; s += (b - a) / Math.max(1, Math.round((b - a) / 1.6))) box(f, n.canopy, s - 0.04, s + 0.04, 5.25, 9.3, 0.04, 0.14);
    box(f, n.canopy, a, b, 7.25, 7.3, 0.04, 0.12);
    box(f, n.white, r0, r1, 9.3, DIOR_PODIUM + 0.4, -0.05, 3.6);
    box(f, n.soffit, r0, r1, 9.28, 9.3, 0.1, 3.58);
  }
  function cafe(f, item) {
    const { s0, s1 } = item, run = 1.5, pitch = 0.55, drop = Math.sin(pitch) * run / 2, middle = 0.25 + run / 2 * Math.cos(pitch), edge = 0.25 + run * Math.cos(pitch);
    box(f, m.awning, s0, s1, 4.4 - drop - 0.015, 4.4 - drop + 0.015, middle - run / 2, middle + run / 2, pitch);
    box(f, m.awning, s0, s1, 4.4 - drop * 2 - 0.24, 4.4 - drop * 2, edge - 0.015, edge + 0.015);
    // Wisteria over the awning and along the terrace edge.
    flowers(f, s0 - 0.6, s1 + 0.6, 4.55, 0.9, { leaf: n.leaf, bloom: n.wisteria, count: Math.round((s1 - s0) * 9), hang: 0.7 });
    flowers(f, s0 - 1.2, s1 + 1.2, 5.25, 1.7, { leaf: n.leaf, bloom: n.wisteria, count: Math.round((s1 - s0) * 6), hang: 0.9 });
    signBox(f, (s0 + s1) / 2 - 1.6, (s0 + s1) / 2 + 1.6, 4.88, 5.22, 1.6, 1.62, fill('#22355c'), 'TOULOUSE CAFÉ & BAR', { family: 'Futura, Avenir, sans-serif', weight: 500, color: '#f4f1ea', spacing: 0.14, height: 0.2, width: 3.0 });
  }
  function toulouse(frontage, f, W, doors) {
    const t = doorAt(doors, 'Toulouse') ?? W * 0.7;
    const modules = layout(W, [{ kind: 'cafe', s0: t - 6, s1: t + 6 }], { start: 0.8, end: W - 0.8, gap: 0.8, bay: 5 });
    toulouseBody(f, 0, W, modules, doors.map(item => item.s), { roof: [3.5, 3.5], slab: [0, 1.6] });
  }
  // The rest of the Dior block in the Etro row's limestone: Jo Malone on the
  // east side under Dior's raised end, Vilebrequin with dark louvres on the north.
  function diorRow(frontage, f, W, doors) {
    const face = frontage.edge.facing, styles = {
      'Jo Malone London': { kind: 'box', text: 'JO MALONE LONDON', fill: '#f4f1ea', ink: '#1a1a1a', family: 'Futura, Avenir, sans-serif', weight: 500, spacing: 0.14 },
      Vilebrequin: { kind: 'box', text: 'VILEBREQUIN', fill: '#1f2c46', ink: '#f2f2ee', family: 'Futura, Avenir, sans-serif', weight: 700, spacing: 0.08 },
    };
    const wanted = doorModules(doors, ({ store }) => styles[store.name] ?? { kind: 'box', text: store.name.toUpperCase(), fill: '#f4f1ea', ink: '#1a1a1a', family: 'Futura, Avenir, sans-serif', weight: 500, spacing: 0.1 }, { half: 4.2 });
    if (face === 'north') wanted.push({ kind: 'louvred', s0: 0.8, s1: Math.min(...wanted.map(item => item.s0), W) - 0.8 });
    stoneRow(f, W, wanted, doors, { stone: n.diorStone, podium: DIOR_PODIUM, height: DIOR_HEIGHT, raised: face === 'east' ? [0, 16] : null, ends: face === 'east' ? [0.15, 2.9] : [2.9, 0.15] });
  }
  // Shop modules on a residential podium: glazing cut through the cladding,
  // sign boxes over the glass and a thin continuous canopy.
  function shopRow(f, W, modules, doorS, { material, frame = m.charcoal, glassTop = 4.15, top = FLOORS[0], ends = [0.3, 0.3], canopy = [4.22, 4.34, 0.3, 1.8] }) {
    wall(f, material, -ends[0], W + ends[1], 0, top, -0.05, 0.3, modules.filter(item => item.kind !== 'solid').map(item => [item.s0, item.s1, 0, item.glassTop ?? glassTop]));
    for (const item of modules) {
      if (item.kind === 'solid') continue;
      if (item.kind === 'hoarding') {
        box(f, n.hoarding, item.s0, item.s1, 0, item.glassTop ?? glassTop, 0.0, 0.08);
        const third = (item.s1 - item.s0) / 3;
        box(f, n.poppy, item.s0 + 0.4, item.s0 + third - 0.2, 0.05, 3.1, 0.08, 0.1);
        box(f, n.camel, item.s0 + 2 * third + 0.2, item.s1 - 0.4, 0.05, 3.1, 0.08, 0.1);
        continue;
      }
      storefront(f, item.s0, item.s1, item.glassTop ?? glassTop, { doors: doorS, mullion: item.frame ?? frame, pitch: item.pitch ?? 1.7, transom: item.transom ?? 3.3, d: 0.03, depth: 0.12 });
    }
    if (canopy) {
      const [lo, hi, d0, d1] = canopy;
      box(f, n.canopy, -ends[0], W + ends[1], lo, hi, d0, d1);
      for (const item of modules) if (item.kind !== 'solid') box(f, m.lamp, (item.s0 + item.s1) / 2 - 0.1, (item.s0 + item.s1) / 2 + 0.1, lo - 0.02, lo, (d0 + d1) / 2 - 0.1, (d0 + d1) / 2 + 0.1);
    }
    for (const item of modules) if (item.text) {
      const [lo, hi] = item.signAt ?? [4.45, 5.3];
      signBox(f, item.s0 + 0.4, item.s1 - 0.4, lo, hi, 0.3, 0.52, item.fillMaterial ?? fill(item.fill), item.text, { family: item.family, weight: item.weight ?? 500, color: item.ink, spacing: item.spacing ?? 0.1, height: item.letterHeight ?? 0.44, width: item.letterWidth ?? Math.min(4.8, item.s1 - item.s0 - 1.6) });
    }
  }
  const shopStyle = {
    Vince: { text: 'VINCE.', fill: '#f6f5f1', ink: '#161616', family: 'Futura, Avenir, sans-serif', weight: 400, spacing: 0.35 },
    'Alice + Olivia': { text: 'alice + olivia', fill: '#a7d5ca', ink: '#262626', family: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive', weight: 600, spacing: 0, mint: true, letterHeight: 0.7 },
    'Zadig & Voltaire': { text: 'ZADIG & VOLTAIRE', fill: '#141414', ink: '#f5f5f2', family: 'Futura, Avenir, sans-serif', weight: 700, spacing: 0.02 },
    Kiton: { text: 'KITON', fill: '#1c1a18', ink: '#c9a56a', family: '"Bodoni 72", Didot, Georgia, serif', weight: 700, spacing: 0.25 },
    'de Boulle': { text: 'DE BOULLE', fill: '#f6f5f1', ink: '#1b1b1b', family: 'Didot, "Bodoni 72", Georgia, serif', weight: 500, spacing: 0.2 },
  };

  // The southern residences' boutique row (Vince to Baccarat) and the Bari corner.
  function boutiqueRow(f, W, doors) {
    const doorS = doors.map(item => item.s), tower = Math.max(W - 10.5, W * 0.7), screen = [tower - 6.6, tower];
    const wanted = doorModules(doors.map(item => item.store.name === 'Baccarat' ? { ...item, half: 3.4 } : item), ({ store }) => {
      if (store.name === 'Baccarat') return { kind: 'baccarat', frame: n.steel };
      const style = shopStyle[store.name] ?? { text: store.name.toUpperCase(), fill: '#f6f5f1', ink: '#1b1b1b', family: 'Futura, Avenir, sans-serif', weight: 500, spacing: 0.1 };
      return { ...style, fillMaterial: style.mint ? n.mint : undefined };
    });
    wanted.push({ s0: tower - 5.4, s1: W - 0.9, kind: 'bari', frame: m.charcoal, glassTop: 3.9 });
    const modules = layout(W, wanted, { start: 0, end: W - 0.6, gap: 0.7, bay: 6.4 });
    shopRow(f, W, modules, doorS, { material: n.white, ends: [0, 0.9], canopy: null });
    // Canopy over the boutiques; Baccarat and Bari carry their own.
    const bac = modules.find(item => item.kind === 'baccarat'), bari = modules.find(item => item.kind === 'bari');
    const runEnd = (bac ?? bari)?.s0 ?? W;
    box(f, n.canopy, 0, runEnd - 0.3, 4.22, 4.34, 0.3, 1.8);
    for (const item of modules) if (item.s1 < runEnd) box(f, m.lamp, (item.s0 + item.s1) / 2 - 0.1, (item.s0 + item.s1) / 2 + 0.1, 4.2, 4.22, 0.95, 1.15);
    if (bac) baccaratEntrance(f, bac);
    if (bari) bariTerrace(f, bari.s0 - 0.4, W + 3.1);
    // Level two: residential windows, the terracotta screen beside the corner tower.
    storeys(f, W, { material: n.white, s0: 0, s1: screen[0], ends: [0, 0], phase: 1, from: FLOORS[0] });
    terracotta(f, screen[0], screen[1]);
    storeys(f, W, { material: n.white, s0: screen[0], s1: tower, from: FLOORS[1], ends: [0, 0], phase: 2 });
    cornerTower(f, W, tower, W, 'end');
    eaves(f, W, { ends: [0, 0.9] });
  }
  function baccaratEntrance(f, item) {
    // A projecting box canopy faced in vertical metal ribs, on two steel posts.
    const { s0, s1 } = item;
    box(f, n.canopy, s0 - 0.2, s1 + 0.2, 4.25, 5.55, 0.3, 1.7);
    for (let s = s0 - 0.1; s <= s1 + 0.1; s += 0.14) box(f, n.steel, s - 0.025, s + 0.025, 4.3, 5.5, 1.7, 1.76);
    letter('Baccarat', { family: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive', weight: 600, color: '#b3262b', spacing: 0 }, f, (s0 + s1) / 2, 4.92, 1.775, Math.min(3.6, s1 - s0), 0.85);
    for (const s of [s0, s1]) box(f, n.steel, s - 0.07, s + 0.07, 0, 4.25, 1.45, 1.59);
    box(f, m.lamp, (s0 + s1) / 2 - 0.25, (s0 + s1) / 2 + 0.25, 4.23, 4.25, 0.8, 1.2);
  }
  // Bari's dining terrace: dark glass behind a black pergola with a canvas roof.
  function bariTerrace(f, a, b, depth = 3.1) {
    const posts = Math.max(1, Math.round((b - a) / 3.6));
    for (let i = 0; i <= posts; i++) { const s = a + 0.1 + (b - a - 0.2) * i / posts; box(f, n.iron, s - 0.06, s + 0.06, 0, 3.62, depth - 0.12, depth); }
    box(f, n.iron, a, b, 3.62, 3.78, depth - 0.14, depth + 0.02);
    box(f, n.iron, a, b, 3.62, 3.78, 0.3, 0.42);
    box(f, n.pergola, a, b, 3.78, 3.82, 0.3, depth + 0.02, 0.04);
    box(f, n.pergola, a, b, 3.36, 3.62, depth - 0.02, depth + 0.01);
  }
  // Pleated, perforated terracotta panels over the second storey.
  function terracotta(f, a, b, lo = FLOORS[0] + 0.1, hi = FLOORS[1] - 0.1) {
    box(f, n.white, a, b, FLOORS[0], FLOORS[1], -0.05, 0.3);
    const columns = Math.max(1, Math.round((b - a) / 1.15)), width = (b - a) / columns, rows = Math.max(1, Math.round((hi - lo) / 0.82)), height = (hi - lo) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
      const s = a + c * width, h = lo + r * height;
      box(f, n.terracotta, s + 0.015, s + width - 0.015, h + 0.01, h + height - 0.01, 0.42, 0.47, (r + c) % 2 ? 0.16 : -0.1);
    }
    box(f, n.frame, a - 0.05, b + 0.05, hi + 0.04, hi + 0.1, 0.3, 0.62);
  }
  // The stone tower at the Bari corner: projecting, with tall windows in dark
  // frames, BARI in letters at the second storey. `side` names the frontage end
  // it stands on.
  function cornerTower(f, W, a, b, side) {
    const depth = 1.3, ends = side === 'end' ? [0, depth] : [depth, 0];
    box(f, n.sand, a - (side === 'start' ? depth : 0), b + (side === 'end' ? depth : 0), FLOORS[0], FLOORS[1], -0.05, depth);
    letter('BARI', { family: '"Big Caslon", Baskerville, Georgia, serif', weight: 500, color: '#3a2e27', spacing: 0.18 }, f, (a + b) / 2, 7.5, depth + 0.01, 2.6, 0.62);
    storeys(f, W, { material: n.sand, s0: a, s1: b, from: FLOORS[1], depth, bay: 5, patterns: ['wide'], ends });
  }
  function bariLawn(f, W, doors) {
    // From the corner: tower, terracotta, then white storeys with loggias; the
    // terrace runs along the lawn, further shops beyond it.
    const tower = Math.min(10.5, W * 0.3), screen = [tower, tower + 13.6];
    const wanted = [{ s0: 0.9, s1: screen[1] + 6, kind: 'bari', frame: m.charcoal, glassTop: 3.9, text: 'BARI', fill: '#2b2724', ink: '#efe6d6', family: '"Big Caslon", Baskerville, Georgia, serif', weight: 500, spacing: 0.25, letterHeight: 0.36, letterWidth: 1.6, signAt: [4.0, 4.6] }];
    const modules = layout(W, wanted, { start: 0.9, end: W - 0.6, gap: 0.8, bay: 7 });
    shopRow(f, W, modules.map(item => item.kind === 'bari' ? { ...item, text: undefined } : item), doors.map(item => item.s), { material: n.white, ends: [0.9, 0.3], canopy: null });
    bariTerrace(f, -3.1, screen[1] + 6.4);
    const after = screen[1] + 6.4;
    if (W - after > 2) {
      box(f, n.canopy, after + 0.5, W + 0.3, 4.22, 4.34, 0.3, 1.8);
      for (const item of modules) if (item.s0 > after) box(f, m.lamp, (item.s0 + item.s1) / 2 - 0.1, (item.s0 + item.s1) / 2 + 0.1, 4.2, 4.22, 0.95, 1.15);
    }
    signBox(f, 2.0, 4.6, 4.0, 4.6, 3.12, 3.2, fill('#2b2724'), 'BARI', { family: '"Big Caslon", Baskerville, Georgia, serif', weight: 500, color: '#efe6d6', spacing: 0.25, height: 0.34, width: 1.6 });
    cornerTower(f, W, 0, tower, 'start');
    terracotta(f, screen[0], screen[1]);
    storeys(f, W, { material: n.white, s0: screen[1], s1: W, from: FLOORS[0], ends: [0, 0.9], phase: 0 });
    storeys(f, W, { material: n.white, s0: screen[0], s1: screen[1], from: FLOORS[1], ends: [0, 0], phase: 3 });
    eaves(f, W, { ends: [0.9, 0.9] });
  }
  // Beside Vince: a dark stone podium with a deep horizontal louvre screen over
  // two storeys, sand stone above.
  function louvrePodium(f, W) {
    const count = Math.max(1, Math.round((W - 2) / 8)), width = (W - 1.6 - 0.8 * (count - 1)) / count;
    const holes = Array.from({ length: count }, (_, i) => [0.8 + i * (width + 0.8), 0.8 + i * (width + 0.8) + width]);
    wall(f, n.taupe, -0.9, W, 0, 5.0, -0.05, 0.35, holes.map(([a, b]) => [a, b, 0, 4.2]));
    for (const [a, b] of holes) storefront(f, a, b, 4.2, { mullion: m.charcoal, pitch: 2.2, transom: 4.2, d: 0.03, depth: 0.1 });
    sheet(f, m.charcoal, -0.9, W, 5.0, 12.3, 0.02);
    for (let h = 5.15; h < 12.2; h += 0.3) box(f, n.slats, -0.9, W, h, h + 0.07, 0.18, 0.62);
    for (let i = 0; i <= Math.round(W / 4.7); i++) { const s = Math.min(W - 0.06, Math.max(-0.84, W * i / Math.round(W / 4.7))); box(f, n.slats, s - 0.06, s + 0.06, 5.0, 12.3, 0.1, 0.64); }
    box(f, n.taupe, -0.9, W, 12.3, FLOORS[2], -0.05, 0.9);
    storeys(f, W, { material: n.sand, from: FLOORS[2], ends: [0.9, 0], patterns: ['wide', 'pair'], bay: 6.5 });
    eaves(f, W, { ends: [0.9, 0] });
  }
  // The Kettering Drive corner: sand tile, a flat dark canopy on square posts.
  function kettering(f, W, doors) {
    const modules = layout(W, [], { start: 1.2, end: W - 1.2, gap: 1.2, bay: 6 });
    shopRow(f, W, modules, doors.map(item => item.s), { material: n.sand, frame: n.frame, ends: [0.9, 0.9], canopy: null });
    box(f, n.iron, -0.9, W + 0.9, 4.0, 4.28, 0.3, 3.2);
    const posts = Math.max(1, Math.round(W / 6.5));
    for (let i = 0; i <= posts; i++) { const s = 0.4 + (W - 0.8) * i / posts; box(f, n.iron, s - 0.11, s + 0.11, 0, 4.0, 2.9, 3.12); }
    for (const item of modules) box(f, m.lamp, (item.s0 + item.s1) / 2 - 0.12, (item.s0 + item.s1) / 2 + 0.12, 3.98, 4.0, 1.4, 1.64);
    storeys(f, W, { material: n.sand, ends: [0.9, 0.9], patterns: ['wide', 'pair', 'loggia'], phase: 1 });
    eaves(f, W, { ends: [0.9, 0.9] });
  }

  // Dolce & Gabbana's building: beige limestone, tall shop glass between piers
  // with wall lanterns, the house's dark metal box over its windows.
  function dolce(f, W, doors) {
    const doorS = doors.map(item => item.s), dg = doorAt(doors, 'Dolce & Gabbana') ?? W - 8, box0 = Math.max(0, dg - 6.5);
    const modules = layout(W, [{ s0: box0 + 0.8, s1: W - 0.9, kind: 'dg', frame: m.charcoal, glassTop: 4.5, transom: 3.6 }], { start: 0.9, end: W - 0.9, gap: 1.0, bay: 6.2 });
    const ground = modules.map(item => item.kind === 'dg' ? item : { ...item, glassTop: 4.5, transom: 3.6, frame: m.charcoal });
    shopRow(f, W, ground, doorS, { material: n.sand, ends: [0.9, 0.9], canopy: null, top: FLOORS[0] });
    let last = -0.9;
    for (const item of [...ground, { s0: W + 0.9 }]) {
      if (item.s0 - last > 0.6) { const s = (last + item.s0) / 2; box(f, m.charcoal, s - 0.08, s + 0.08, 2.75, 3.3, 0.3, 0.44); box(f, m.lamp, s - 0.05, s + 0.05, 2.8, 3.25, 0.44, 0.45); }
      last = item.s1;
    }
    // The house's box: two storeys of dark panels with silver letters.
    box(f, n.greige, box0, W + 0.9, 4.75, 8.6, -0.05, 0.85);
    for (let s = box0 + 3.1; s < W; s += 3.1) box(f, n.frame, s - 0.015, s + 0.015, 4.75, 8.6, 0.85, 0.87);
    box(f, n.sand, box0, W + 0.9, 4.55, 4.75, -0.05, 1.05);
    letter('DOLCE & GABBANA', { family: 'Didot, "Bodoni 72", Georgia, serif', weight: 400, color: '#dcdcd8', spacing: 0.05, metalness: 0.8, roughness: 0.3 }, f, (box0 + W) / 2, 6.8, 0.875, Math.min(8.4, W - box0 - 1), 0.72);
    storeys(f, W, { material: n.sand, s0: 0, s1: box0, from: FLOORS[0], ends: [0.9, 0], patterns: ['pair', 'wide'], bay: 6.6 });
    storeys(f, W, { material: n.sand, s0: box0, s1: W, from: FLOORS[1], ends: [0, 0.9], patterns: ['pair', 'wide'], bay: 6.6 });
    box(f, n.sand, box0, W + 0.9, 8.6, FLOORS[1], -0.05, 0.9);
    eaves(f, W, { material: n.sand, ends: [0.9, 0.9] });
  }
  // The Westheimer face of the southern residences: Steak 48's dark box on
  // square columns at the west end, its planters spilling ivy over a timber
  // soffit; then shops under a band of timber louvres, the flats above, and
  // the Grey House pylon out in the planted strip by Westheimer.
  function steakRow(f, W, doors) {
    const doorS = doors.map(item => item.s), door = doorAt(doors, 'Steak 48') ?? 10, B = Math.min(W * 0.4, Math.max(22, door + 13));
    // The restaurant's ground floor: dark panels and steel-gridded glass between stone pilasters.
    const pilasters = [B * 0.24, door + 4.6].filter(s => s > 2 && s < B - 2 && Math.abs(s - door) > 1.6);
    const bays = [0.9, ...pilasters.flatMap(s => [s - 0.5, s + 0.5]), B - 0.6].reduce((all, s, i, list) => i % 2 ? all : [...all, [s, list[i + 1]]], []);
    wall(f, m.charcoal, -0.12, B, 0, 5.3, -0.05, 0.25, bays.map(([a, b]) => [a, b, 0, 4.6]));
    for (const [a, b] of bays) storefront(f, a, b, 4.6, { doors: doorS, mullion: m.charcoal, pitch: 1.0, transom: 2.8, d: 0.03, depth: 0.1 });
    for (const s of pilasters) {
      box(f, n.sand, s - 0.5, s + 0.5, 0, 5.3, -0.05, 0.32);
      box(f, m.charcoal, s - 0.07, s + 0.07, 2.8, 3.3, 0.32, 0.44); box(f, m.lamp, s - 0.05, s + 0.05, 2.85, 3.25, 0.44, 0.45);
    }
    letter('Steak 48', { family: 'Noteworthy, "Avenir Next", Futura, sans-serif', weight: 300, color: '#f2f0ea' }, f, door + 2.0, 2.7, 0.26, 1.3, 0.42);
    // Columns carry the upper box over the pavement; walnut soffit, planter ledge and ivy.
    const columns = Math.max(2, Math.round(B / 6));
    for (let i = 0; i <= columns; i++) { const s = 0.3 + (B - 0.6) * i / columns; box(f, m.charcoal, s - 0.28, s + 0.28, 0, 5.3, 3.0, 3.56); }
    box(f, n.walnut, -0.1, B + 0.1, 5.26, 5.33, 0.25, 3.56);
    box(f, m.charcoal, -0.1, B + 0.1, 5.33, 6.55, 3.0, 3.66);
    for (let s = 0.4; s < B - 1; s += 2.1) box(f, n.hedge, s, Math.min(B - 0.3, s + 1.7), 6.55, 7.12, 2.9, 3.5);
    flowers(f, 0.2, B - 0.2, 6.6, 3.95, { leaf: n.hedge, bloom: n.hedge, count: Math.round(B * 5), hang: 0.75 });
    sheet(f, m.shopGlass, 0.1, B - 0.1, 6.55, 8.7, 2.9);
    for (let s = 0.1; s <= B; s += (B - 0.2) / Math.round(B / 1.6)) box(f, m.charcoal, s - 0.05, s + 0.05, 6.55, 8.7, 2.9, 3.02);
    for (const [a, b] of [[-0.1, 0.15], [B - 0.15, B + 0.1]]) box(f, m.charcoal, a, b, 5.33, 8.7, 0.25, 3.66);
    box(f, m.charcoal, -0.25, B + 0.25, 8.7, 9.0, -0.05, 3.86);
    signBox(f, 0.4, 3.4, 5.5, 6.45, 3.66, 3.76, m.charcoal, 'Steak 48', { family: 'Noteworthy, "Avenir Next", Futura, sans-serif', weight: 300, color: '#f2f0ea', height: 0.55, width: 2.4 });
    // East of the restaurant: shops and hoardings in sand stone under a timber louvre band.
    const shops = layout(W - B, [{ kind: 'hoarding', s0: 1.0, s1: 8.4 }, { kind: 'hoarding', s0: 17.0, s1: 24.0 }], { start: 1.0, end: W - B - 0.8, gap: 1.0, bay: 6.5 }).map(item => ({ ...item, s0: item.s0 + B, s1: item.s1 + B }));
    wall(f, n.sand, B, W, 0, FLOORS[0], -0.05, 0.3, shops.map(item => [item.s0, item.s1, 0, 4.2]));
    for (const item of shops) {
      if (item.kind === 'hoarding') {
        box(f, n.hoarding, item.s0, item.s1, 0, 4.2, 0.0, 0.08);
        box(f, n.poppy, item.s0 + (item.s1 - item.s0) * 0.55, item.s0 + (item.s1 - item.s0) * 0.8, 0.05, 3.4, 0.08, 0.1);
      } else {
        storefront(f, item.s0, item.s1, 4.2, { mullion: m.charcoal, pitch: 1.6, transom: 3.3, d: 0.03, depth: 0.1 });
        box(f, m.charcoal, item.s0 - 0.1, item.s1 + 0.1, 4.25, 4.38, 0.3, 1.6);
      }
    }
    sheet(f, m.charcoal, B, W, FLOORS[0], FLOORS[1], 0.02);
    for (let h = FLOORS[0] + 0.15; h < FLOORS[1] - 0.1; h += 0.24) box(f, n.timber, B, W, h, h + 0.09, 0.18, 0.55);
    for (let s = B; s <= W + 0.01; s += (W - B) / Math.max(1, Math.round((W - B) / 6.2))) box(f, n.white, Math.max(B, s - 0.3), Math.min(W, s + 0.3), FLOORS[0], FLOORS[1], -0.05, 0.6);
    storeys(f, W, { material: n.white, from: FLOORS[1], ends: [0.9, 0], phase: 3 });
    eaves(f, W, { ends: [0.9, 0] });
    // The Grey House pylon: dark and copper, lettered down both broad faces.
    const p = Math.min(W - 6, B + 34), d = 21.5;
    box(f, m.charcoal, p - 0.65, p, -0.4, 6.0, d - 0.25, d + 0.25);
    box(f, n.copper, p, p + 0.65, -0.4, 6.0, d - 0.25, d + 0.25);
    for (const side of [1, -1]) {
      const yaw = f.yaw + (side < 0 ? Math.PI : 0), face = d + side * 0.255;
      letter('GREY HOUSE', { family: 'Futura, Avenir, sans-serif', weight: 500, color: '#f2f0ea', spacing: 0.25 }, f, p - 0.32, 4.4, face, 2.6, 0.36, yaw).rotateZ(-Math.PI / 2);
      letter('LUXURY APARTMENT HOMES', { family: 'Futura, Avenir, sans-serif', weight: 500, color: '#f2f0ea', spacing: 0.12 }, f, p - 0.32, 2.4, face, 0.5, 0.05, yaw);
    }
  }

  // White square tile with a long thin canopy and a clerestory of dark windows,
  // as along the Ojo de Agua frontage. `modules` fill the shop level.
  function tileFrontage(f, W, modules, doorS, ends = [0.9, 0.9]) {
    shopRow(f, W, modules, doorS, { material: n.tile, frame: n.frame, ends, top: 4.6, canopy: [4.32, 4.44, 0.3, 1.9] });
    // The clerestory over the canopy, left solid behind each sign box.
    const count = Math.max(1, Math.round(W / 5.5)), width = W / count, clerestory = [];
    for (let i = 0; i < count; i++) {
      const a = i * width + 0.5, b = (i + 1) * width - 0.5;
      if (!modules.some(item => item.text && a < item.s1 - 0.4 && b > item.s0 + 0.4)) clerestory.push([a, b, 4.75, 6.35]);
    }
    wall(f, n.tile, -ends[0], W + ends[1], 4.6, FLOORS[1], -0.05, 0.3, clerestory);
    for (const [a, b, lo, hi] of clerestory) framedWindow(f, a, b, lo, hi, { d: 0.05, face: 0.3, columns: 2, transom: false });
    storeys(f, W, { material: n.tile, from: FLOORS[1], ends, patterns: ['wide', 'pair', 'pair', 'loggia'], phase: 2 });
    eaves(f, W, { material: n.white, ends });
  }
  function tileRow(f, W, doors) {
    const modules = layout(W, [], { start: 0.9, end: W - 0.9, gap: 0.9, bay: 6.4 });
    tileFrontage(f, W, modules, doors.map(item => item.s), [0.9, 0]);
  }
  function veronica(f, W, doors) {
    const s = doorAt(doors, 'Veronica Beard') ?? W / 2;
    const modules = [{ s0: 0.3, s1: W - 0.3, frame: n.frame }];
    tileFrontage(f, W, modules, doors.map(item => item.s), [0, 0]);
    // A dark blade sign, square to the wall, lettered on both flanks.
    const blade = Math.min(W - 0.4, s + 1.6);
    box(f, n.greige, blade - 0.07, blade + 0.07, 2.9, 4.2, 0.3, 1.35);
    for (const side of [-1, 1]) {
      letter('VERONICA', { family: 'Futura, Avenir, sans-serif', weight: 500, color: '#f4f2ec', spacing: 0.12 }, f, blade + side * 0.075, 3.7, 0.83, 0.9, 0.2, f.yaw + side * Math.PI / 2);
      letter('BEARD', { family: 'Futura, Avenir, sans-serif', weight: 500, color: '#f4f2ec', spacing: 0.12 }, f, blade + side * 0.075, 3.4, 0.83, 0.62, 0.2, f.yaw + side * Math.PI / 2);
    }
  }
  function ojo(f, W, doors) {
    const ojoAt = Math.max(9.8, W - 9), hoard = Math.min(9.0, ojoAt - 5.6);
    const wanted = [
      { kind: 'hoarding', s0: 0.6, s1: hoard },
      { s0: ojoAt - 4.6, s1: Math.min(W - 0.6, ojoAt + 4.6), text: 'OJO DE AGUA', fill: '#4b4a47', ink: '#f6f4ee', family: '"Gill Sans", Futura, Avenir, sans-serif', weight: 600, spacing: 0.12, signAt: [4.55, 5.45], letterHeight: 0.42 },
    ];
    tileFrontage(f, W, layout(W, wanted, { start: 0.6, end: W - 0.6, gap: 0.7, bay: 6 }), doors.map(item => item.s), [0, 0.9]);
  }

  // Hopdoddy: white square tile, two big glazed bays under a dark canopy with
  // string lights, the name in tall letters standing on it, louvred windows above.
  function hopdoddy(f, W, doors) {
    const doorS = doors.map(item => item.s), split = Math.min(W - 6, Math.max(17.5, (doorS[0] ?? 4) + 9));
    const holes = [[1.0, split / 2 - 0.5], [split / 2 + 0.5, split - 1.0], [split + 0.8, W - 1.0]];
    wall(f, n.tile, -0.12, W + 0.12, 0, 10.4, -0.05, 0.3, [...holes.map(([a, b]) => [a, b, 0, 4.3]), ...holes.map(([a, b]) => [a + 0.3, b - 0.3, 5.0, 8.2])]);
    for (const [a, b] of holes) {
      storefront(f, a, b, 4.3, { doors: doorS, mullion: m.charcoal, pitch: 2.4, transom: 3.4, d: 0.03, depth: 0.12 });
      // Upper windows with a band of dark louvres across their heads.
      framedWindow(f, a + 0.3, b - 0.3, 5.0, 6.9, { d: 0.05, face: 0.3, columns: 2, transom: false });
      sheet(f, m.charcoal, a + 0.3, b - 0.3, 6.9, 8.2, 0.03);
      for (let h = 6.98; h < 8.15; h += 0.16) box(f, m.louver, a + 0.3, b - 0.3, h, h + 0.06, 0.06, 0.22);
    }
    box(f, n.canopy, -0.2, W + 0.2, 10.4, 10.62, -0.05, 0.26);
    box(f, m.charcoal, 0.2, split - 0.2, 4.36, 4.56, 0.3, 2.6);
    for (let s = 0.5; s < split - 0.3; s += 0.7) box(f, m.lamp, s - 0.04, s + 0.04, 4.22, 4.3, 2.52, 2.58);
    box(f, m.charcoal, split + 0.5, W - 0.3, 4.36, 4.5, 0.3, 1.8);
    letter('hopdoddy', { family: '"Avenir Next", Futura, Avenir, sans-serif', weight: 300, color: '#eef0ea', spacing: 0.02, emissive: 0.35 }, f, split / 2, 5.3, 1.6, Math.min(7.8, split - 2), 1.45);
    for (const side of [-1, 1]) box(f, m.charcoal, split / 2 + side * 2.6 - 0.02, split / 2 + side * 2.6 + 0.02, 4.56, 4.75, 1.5, 1.7);
    signBox(f, split / 2 - 1.3, split / 2 + 1.3, 4.0, 4.36, 2.4, 2.48, fill('#2b2d2b'), 'BURGER BAR', { family: 'Futura, Avenir, sans-serif', weight: 600, color: '#c6d98b', spacing: 0.2, height: 0.22, width: 2.1 });
  }

  function residence(frontage, f, W) {
    const material = frontage.finish === 'tile' ? n.tile : n.white;
    storeys(f, W, { material, ends: [0.9, 0.9], phase: frontage.edge.index });
    eaves(f, W, { material: n.white });
  }

  const builders = {
    equinox, etro, residence, dior, toulouse,
    plaza: (frontage, f, W) => plaza(frontage, f, W),
    'dior-row': diorRow,
    'boutique-row': (frontage, f, W, doors) => boutiqueRow(f, W, doors),
    'bari-lawn': (frontage, f, W, doors) => bariLawn(f, W, doors),
    'louvre-podium': (frontage, f, W) => louvrePodium(f, W),
    kettering: (frontage, f, W, doors) => kettering(f, W, doors),
    dolce: (frontage, f, W, doors) => dolce(f, W, doors),
    'tile-row': (frontage, f, W, doors) => tileRow(f, W, doors),
    'steak-row': (frontage, f, W, doors) => steakRow(f, W, doors),
    veronica: (frontage, f, W, doors) => veronica(f, W, doors),
    ojo: (frontage, f, W, doors) => ojo(f, W, doors),
    hopdoddy: (frontage, f, W, doors) => hopdoddy(f, W, doors),
  };
  return {
    kinds: new Set(Object.keys(builders)),
    build(frontage, f, W, doors) {
      const builder = builders[frontage.kind];
      if (!builder) return false;
      builder(frontage, f, W, doors);
      return true;
    },
    wall,
    reflective: [n.royalGlass],
    massMaterial: building => ({ [EQUINOX_BLOCK]: n.royalGlass, [ETRO_BLOCK]: n.etroStone, [RESIDENCES_SOUTH]: n.white, [RESIDENCES_NORTH]: n.tile, [DIOR_BLOCK]: n.diorStone })[building.id] ?? null,
  };
}
