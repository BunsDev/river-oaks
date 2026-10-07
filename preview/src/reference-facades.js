import * as THREE from 'three';
import { physicalSurface } from './materials.js';
import { blockFacades, planBlocks } from './reference-blocks.js';

// District buildings rebuilt from street-level photographs (Street View,
// 2024–2025): the Hermès flagship, the IPIC Theaters block and the Bella Rinova
// salon here, five more blocks in reference-blocks.js. Each frontage replaces
// the shared storefront kit along the mapped edge it covers; every other facade
// keeps the space-age kit in district.js. Dimensions are read off the
// photographs, not surveyed.
export const HERMES_BLOCK = 'osm-way-625330792', IPIC_BLOCK = 'osm-way-625330798', BELLA_BLOCK = 'osm-way-625333009';
// The Hermès pavilion is the block's tallest part and sets its mapped (flight)
// height; the neighbouring shops in the same OSM footprint stay two storeys.
const PODIUM = { [HERMES_BLOCK]: 9.6 };
const plans = new WeakMap();

// Ring edges with the same numbering, outward normals and bay grid as the renderer.
export function facadeEdges(building) {
  const ring = building.ring ?? [], edges = [];
  const winding = Math.sign(ring.slice(1).reduce((sum, b, i) => sum + ring[i][0] * b[1] - b[0] * ring[i][1], 0));
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const o = [winding * dy / length, -winding * dx / length], bays = Math.floor(length / 3.2);
    edges.push({ index: i, a, b, length, u: [dx / length, dy / length], o, span: length / Math.max(1, bays),
      facing: o[0] < -0.7 ? 'west' : o[0] > 0.7 ? 'east' : o[1] > 0.7 ? 'north' : 'south' });
  }
  return edges;
}
const alongEdge = (edge, [east, north]) => {
  const sx = east - edge.a[0], sy = north - edge.a[1];
  return { along: sx * edge.u[0] + sy * edge.u[1], distance: Math.abs(sx * edge.u[1] - sy * edge.u[0]) };
};
function storeEdge(building, store) {
  for (const edge of facadeEdges(building)) {
    const { along, distance } = alongEdge(edge, store.facade);
    if (distance < 0.2 && along >= 0 && along <= edge.length) return { edge, along };
  }
  return null;
}

// Which mapped edges are rebuilt, and how high each mass visibly stands. Pure
// data, shared by the facade renderer and the decorative layer.
export function referencePlan(world) {
  if (world && plans.has(world)) return plans.get(world);
  const plan = { spans: new Map(), frontages: [], stores: new Set(), roofs: new Map() };
  const building = id => world?.buildings?.find(item => item.id === id && item.ring?.length > 3);
  const store = (name, id) => world?.stores?.find(item => item.name === name && item.building_id === id);
  // full: the frontage replaces the whole facade; otherwise only above the shopfronts.
  const add = (kind, item, edge, lo, hi, full, extra = {}) => {
    const key = `${item.id}:${edge.index}`;
    if (!plan.spans.has(key)) plan.spans.set(key, []);
    plan.spans.get(key).push({ lo, hi, full });
    plan.frontages.push({ kind, building: item, edge, lo, hi, full, ...extra });
  };
  const hermes = building(HERMES_BLOCK), hermesStore = hermes && store('Hermès', HERMES_BLOCK), entry = hermesStore && storeEdge(hermes, hermesStore);
  if (entry) {
    const { edge, along } = entry, edges = facadeEdges(hermes), atEnd = along > edge.length / 2;
    // The pavilion turns the corner nearest the door; both faces end on the bay grid.
    const corner = atEnd ? edge.b : edge.a, side = edges.find(other => other.index !== edge.index && (other.a === corner || other.b === corner));
    const door = atEnd ? edge.length - along : along;
    const width = edge.length - Math.floor((edge.length - Math.max(30.5, door + 19.4)) / edge.span) * edge.span;
    if (side && width < edge.length - 6) {
      const sideWidth = Math.min(side.length - 6, Math.ceil(16 / side.span) * side.span);
      add('hermes', hermes, edge, atEnd ? edge.length - width : 0, atEnd ? edge.length : width, true, { door, corner, width, side, sideWidth });
      add('hermes-side', hermes, side, side.a === corner ? 0 : side.length - sideWidth, side.a === corner ? sideWidth : side.length, true, { corner, width: sideWidth });
      plan.roofs.set(HERMES_BLOCK, PODIUM[HERMES_BLOCK]);
    }
  }
  const ipic = building(IPIC_BLOCK);
  if (ipic && store('IPIC Theaters', IPIC_BLOCK)) for (const edge of facadeEdges(ipic)) {
    if (edge.facing === 'west') add('ipic', ipic, edge, 0, edge.length, true);
    else if (edge.facing !== 'east') add('ipic-upper', ipic, edge, 0, edge.length, false);
  }
  const bella = building(BELLA_BLOCK);
  if (bella && store('Bella Rinova', BELLA_BLOCK)) {
    // Hopdoddy's face of the block is photographed separately (reference-blocks.js).
    const hopdoddy = store('Hopdoddy Burger Bar', BELLA_BLOCK), burgers = hopdoddy && storeEdge(bella, hopdoddy)?.edge;
    for (const edge of facadeEdges(bella)) {
      const full = edge.facing === 'north' || edge.facing === 'east';
      if (edge.index === burgers?.index && !full) add('hopdoddy', bella, edge, 0, edge.length, true);
      else add(full ? `bella-${edge.facing}` : 'bella-upper', bella, edge, 0, edge.length, full);
    }
  }
  planBlocks(world, { building, store, add, plan, facadeEdges, storeEdge });
  for (const item of world?.stores ?? []) {
    const owner = world.buildings?.find(candidate => candidate.id === item.building_id), found = owner && storeEdge(owner, item);
    if (found && plan.spans.get(`${owner.id}:${found.edge.index}`)?.some(span => span.full && found.along >= span.lo && found.along <= span.hi)) plan.stores.add(item.id);
  }
  if (world) plans.set(world, plan);
  return plan;
}
// The height the generic mass is drawn to: the podium where one is photographed.
export const visibleRoofHeight = (world, building) => referencePlan(world).roofs.get(building.id) ?? building.size[2];

// Large-format cladding with metric joints. The tone varies per panel; veins add
// the horizontal striation of the grey stone on the IPIC podium.
function cladding({ color, panel, bond = false, tone = 0.04, joint = 0.8, veins = 0, roughness = 0.42 }) {
  // The photographed stone texture only lends grain: its own block shading is muted.
  const material = physicalSurface('stone', { instanced: true, tileSize: 3, normalScale: new THREE.Vector2(0.03, 0.03), roughness, aoMapIntensity: 0.2 });
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  const rgb = new THREE.Color(color).toArray().map(x => x.toFixed(4)).join(','), [w, h] = panel.map(x => x.toFixed(4));
  material.onBeforeCompile = shader => {
    compile(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = mix(vec3(${rgb}), diffuseColor.rgb, 0.05);
      vec2 roMeters = vMapUv * 3.0, roCell = roMeters / vec2(${w}, ${h});
      ${bond ? 'roCell.x += 0.5 * mod(floor(roCell.y), 2.0);' : ''}
      vec2 roEdge = min(fract(roCell), 1.0 - fract(roCell)) * vec2(${w}, ${h});
      float roJoint = min(smoothstep(0.003, 0.011, roEdge.x), smoothstep(0.003, 0.011, roEdge.y));
      float roTone = fract(sin(dot(floor(roCell), vec2(12.9898, 78.233))) * 43758.5453);
      float roVein = sin(roMeters.y * 41.0 + 2.6 * sin(roMeters.x * 1.3 + roTone * 6.2831)) * 0.5 + 0.5;
      diffuseColor.rgb *= mix(${joint.toFixed(3)}, 1.0, roJoint) * (1.0 - ${(tone / 2).toFixed(4)} + ${tone.toFixed(4)} * roTone) * (1.0 - ${veins.toFixed(4)} * roVein * roVein);`);
  };
  material.customProgramCacheKey = () => `${key()}-reference-cladding-${color}-${panel.join('x')}-${bond}-${veins}`;
  return material;
}

// Applied lettering: one canvas per sign, alpha-tested so it never sorts
// against the glazing behind it.
function lettering(text, { width, height, family = 'Georgia, serif', weight = 600, color = '#1b1c1e', spacing = 0, smallCaps = false, metalness = 0, roughness = 0.5, emissive = 0, background = null }) {
  const canvas = document.createElement('canvas'), w = 2048, h = Math.max(64, Math.min(1024, Math.round(w * height / width)));
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, w, h); }
  let size = h * 0.82;
  const fit = () => {
    context.font = `${weight} ${size}px ${family}`;
    if ('fontVariantCaps' in context) context.fontVariantCaps = smallCaps ? 'small-caps' : 'normal';
    if ('letterSpacing' in context) context.letterSpacing = `${(spacing * size).toFixed(1)}px`;
  };
  fit();
  const measured = context.measureText(text).width;
  if (measured > w * 0.97) { size *= w * 0.97 / measured; fit(); }
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = color; context.fillText(text, w / 2 + spacing * size / 2, h * 0.53);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: background ? 0 : 0.45, transparent: false, metalness, roughness,
    emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? texture : null, emissiveIntensity: emissive });
  return material;
}

// The IPIC blade: an orange IPIC head on brass over stacked THEATERS on violet.
function bladeFace() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 2304;
  const context = canvas.getContext('2d');
  context.fillStyle = '#c4a45c'; context.fillRect(0, 0, 256, 2304);
  context.fillStyle = '#4a2c86'; context.fillRect(30, 300, 196, 1974);
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = '#e8613f'; context.font = '700 92px Futura, Avenir, Helvetica, sans-serif';
  context.save(); context.translate(128, 160); context.rotate(-Math.PI / 2); context.fillText('IPIC', 0, 0); context.restore();
  context.fillStyle = '#f4efe8'; context.font = '600 190px Futura, Avenir, Helvetica, sans-serif';
  [...'THEATERS'].forEach((letter, i) => context.fillText(letter, 128, 420 + i * 236));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4, metalness: 0.25, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.08 });
}

function stripes() {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 8;
  const context = canvas.getContext('2d');
  for (let i = 0; i < 12; i++) { context.fillStyle = i % 2 ? '#f1efe8' : '#2f5d99'; context.fillRect(i * 32, 0, 32, 8); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
}

// Street-side frame for one rebuilt edge: s runs along the facade from the
// frontage's start, h up from the footprint base, d out from the mapped wall.
function frame(frontage, start, direction, buildingIndex) {
  const { edge, building } = frontage, [ox, oy] = edge.o, base = building.center[2];
  const at = (s, h, d = 0) => {
    const along = start + direction * s;
    return [edge.a[0] + edge.u[0] * along + ox * d, base + h, -(edge.a[1] + edge.u[1] * along + oy * d)];
  };
  return { at, yaw: Math.atan2(ox, -oy), base, buildingIndex, sOf: along => (along - start) * direction };
}

export function createReferenceFacades(world, { part, pane, plane, glass }) {
  const plan = referencePlan(world), group = new THREE.Group(), materials = [], textures = [], geometries = [];
  group.name = 'Reference-photographed frontages';
  const keep = (material, name) => { material.name = `reference-${name}`; materials.push(material); if (material.map?.isCanvasTexture) textures.push(material.map); return material; };
  const surface = (name, options) => keep(new THREE.MeshStandardMaterial(options), name);
  const glazing = (name, options) => { const material = surface(name, options); material.userData.breakableGlass = true; return material; };
  const m = {
    limestone: keep(cladding({ color: '#e9e3d6', panel: [1.5, 0.75], bond: true, tone: 0.035, joint: 0.8 }), 'limestone'),
    granite: surface('granite', { color: '#1c1c1e', roughness: 0.32, metalness: 0.1 }),
    bronze: surface('bronze', { color: '#3c2c22', roughness: 0.38, metalness: 0.6 }),
    copper: surface('copper', { color: '#8e5434', roughness: 0.45, metalness: 0.62 }),
    blueGlass: glazing('hermes-glass', { color: '#4a6fa3', roughness: 0.03, metalness: 0.82, envMapIntensity: 2.4 }),
    greyStone: keep(cladding({ color: '#aeaca7', panel: [1.2, 0.6], bond: true, tone: 0.12, joint: 0.86, veins: 0.16, roughness: 0.5 }), 'grey-stone'),
    concrete: keep(cladding({ color: '#a19f9a', panel: [3, 1.5], tone: 0.03, joint: 0.9, roughness: 0.7 }), 'concrete'),
    tan: keep(cladding({ color: '#dccaa5', panel: [3, 1.5], tone: 0.07, joint: 0.84, roughness: 0.55 }), 'tan'),
    aluminium: surface('aluminium', { color: '#b8bbbb', roughness: 0.3, metalness: 0.8 }),
    charcoal: surface('charcoal', { color: '#252629', roughness: 0.42, metalness: 0.3 }),
    whiteBand: surface('sign-band', { color: '#f1f0eb', roughness: 0.5 }),
    shopGlass: glazing('shop-glass', { color: '#3f5164', roughness: 0.05, metalness: 0.7, envMapIntensity: 2 }),
    tuckGlass: glazing('tuck-glass', { color: '#43608a', roughness: 0.04, metalness: 0.78, envMapIntensity: 2.2 }),
    railGlass: glazing('rail-glass', { color: '#b8cccc', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false }),
    slat: surface('wood-slat', { color: '#b29b7b', roughness: 0.72 }),
    teak: surface('screen-slat', { color: '#8d6c4d', roughness: 0.6 }),
    cream: keep(cladding({ color: '#e7dfcf', panel: [0.75, 0.375], bond: true, tone: 0.04, joint: 0.86 }), 'cream-tile'),
    band: surface('metal-band', { color: '#dcddd9', roughness: 0.42, metalness: 0.3 }),
    ribbon: glazing('ribbon-glass', { color: '#7f979c', roughness: 0.04, metalness: 0.7, envMapIntensity: 2.2 }),
    louver: surface('louver', { color: '#38393b', roughness: 0.55, metalness: 0.35 }),
    gold: surface('blade-brass', { color: '#b89a55', roughness: 0.3, metalness: 0.78 }),
    lamp: surface('sconce-glow', { color: '#fff1d6', emissive: '#ffdcae', emissiveIntensity: 2.2 }),
    awning: keep(stripes(), 'awning'),
    taupe: surface('amorino-canopy', { color: '#8c806e', roughness: 0.5, metalness: 0.3 }),
    chequer: keep(cladding({ color: '#a9a8a4', panel: [0.6, 0.6], tone: 0.28, joint: 0.9, veins: 0.08, roughness: 0.5 }), 'chequer-stone'),
  };
  const sign = (material, f, s, h, d, width, height, yaw = f.yaw) => {
    if (!materials.includes(material)) keep(material, 'lettering');
    const mesh = new THREE.Mesh(plane, material); mesh.position.fromArray(f.at(s, h, d)); mesh.rotation.y = yaw; mesh.scale.set(width, height, 1);
    mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (f, material, s0, s1, h0, h1, d0, d1, pitch = 0) => {
    if (s1 - s0 < 0.005 || h1 - h0 < 0.005) return;
    part(material, f.at((s0 + s1) / 2, (h0 + h1) / 2, (d0 + d1) / 2), [s1 - s0, h1 - h0, Math.abs(d1 - d0)], f.yaw, f.buildingIndex, pitch);
  };
  const sheet = (f, material, s0, s1, h0, h1, d) => {
    if (s1 - s0 < 0.02 || h1 - h0 < 0.02) return;
    part(material, f.at((s0 + s1) / 2, (h0 + h1) / 2, d), [s1 - s0, h1 - h0, 1], f.yaw, f.buildingIndex, 0, material === glass ? undefined : pane);
  };
  const doorsOn = (frontage, f) => {
    return world.stores.filter(item => plan.stores.has(item.id) && item.building_id === frontage.building.id)
      .map(item => ({ store: item, ...alongEdge(frontage.edge, item.facade) }))
      .filter(item => item.distance < 0.2 && item.along >= frontage.lo - 0.01 && item.along <= frontage.hi + 0.01)
      .map(item => ({ ...item, s: f.sOf(item.along) }));
  };
  // A glazed storefront between s0 and s1: mullions, transoms and an opening
  // left for each mapped door, whose leaf the district renderer still hangs.
  // Upper window rows use the same frame with h0 above grade and their own glass.
  function storefront(f, s0, s1, h1, { h0 = 0.06, doors = [], mullion = m.aluminium, pitch = 1.5, transom = 3.35, d = 0.03, depth = 0.16, lower = glass, upper = glass }) {
    const columns = Math.max(1, Math.round((s1 - s0) / pitch)), width = (s1 - s0) / columns, open = doors.filter(s => s > s0 && s < s1);
    let runs = [[s0, s1]];
    for (const s of open) runs = runs.flatMap(([p, q]) => [[p, Math.min(q, s - 0.88)], [Math.max(p, s + 0.88), q]].filter(([x, y]) => y - x > 0.05));
    for (const [p, q] of runs) sheet(f, lower, p, q, h0, Math.min(h1, transom), d);
    if (h1 > transom) sheet(f, upper, s0, s1, transom, h1, d);
    for (let i = 0; i <= columns; i++) {
      const s = s0 + i * width, door = open.some(x => Math.abs(x - s) < 0.95);
      box(f, mullion, s - 0.04, s + 0.04, door ? transom : h0 - 0.02, h1, d, d + depth);
    }
    for (const s of open) for (const side of [-1, 1]) box(f, mullion, s + side * 0.9 - 0.05, s + side * 0.9 + 0.05, h0 - 0.02, transom, d, d + depth);
    for (const h of new Set([h0, transom, h1])) if (h <= h1) box(f, mullion, s0, s1, h - 0.04, h + 0.04, d, d + depth);
  }
  const windowRow = (f, s0, s1, h0, h1, mullion, pitch) => storefront(f, s0, s1, h1, { h0, transom: h1, mullion, pitch, lower: m.shopGlass, d: 0.13, depth: 0.1 });
  const blocks = blockFacades({ m, keep, surface, glazing, sign, box, sheet, storefront, lettering, cladding });

  // The Hermès faces measure from their shared corner; the rest read left to
  // right as seen from the street.
  const frames = new Map(plan.frontages.map(frontage => {
    const index = world.buildings.indexOf(frontage.building), { edge } = frontage;
    if (frontage.corner) return [frontage, frame(frontage, frontage.corner === edge.b ? edge.length : 0, frontage.corner === edge.b ? -1 : 1, index)];
    const forward = -edge.o[1] * edge.u[0] + edge.o[0] * edge.u[1] > 0;
    return [frontage, frame(frontage, forward ? frontage.lo : frontage.hi, forward ? 1 : -1, index)];
  }));

  // Hermès (RDAI, 2015): limestone piers frame two double-height bronze curtain
  // walls with a copper spandrel between storeys, a stone attic carrying the
  // name, and a dark coping. The corner pier wraps onto the side street.
  function hermesFace(frontage, f, doors) {
    const main = frontage.kind === 'hermes', W = frontage.width, door = doors[0];
    let bays;
    if (main) {
      const b1 = Math.max(2.4, door - 6.6), b1e = b1 + 10.6, b2 = b1e + 2.8, b2e = W - 2.6;
      bays = [[b1, b1e, Math.round((b1e - b1) / 1.33)], [b2, b2e, Math.round((b2e - b2) / 1.42)]];
    } else bays = [[2.4, W - 2.4, Math.round((W - 4.8) / 1.36)]];
    // The stone frame stands REVEAL proud of the bronze glass, so the curtain
    // walls read set back into it; the main face runs past the corner to close it.
    const REVEAL = 0.6, lead = main ? -REVEAL : 0, piers = [[lead, bays[0][0]], ...bays.slice(1).map((bay, i) => [bays[i][1], bay[0]]), [bays.at(-1)[1], W]];
    for (const [s0, s1] of piers) {
      box(f, m.limestone, s0, s1, 0.55, 12.2, -0.05, REVEAL);
      box(f, m.granite, s0 - (s0 === lead && main ? 0.04 : 0), s1, 0, 0.55, -0.05, REVEAL + 0.04);
      // Bronze wall sconces on each pier, as photographed at door height.
      const s = s0 === lead ? s1 - 1.1 : (s0 + s1) / 2;
      box(f, m.bronze, s - 0.08, s + 0.08, 3.0, 3.62, REVEAL, REVEAL + 0.12);
      box(f, m.lamp, s - 0.05, s + 0.05, 2.97, 3.0, REVEAL + 0.01, REVEAL + 0.11);
      box(f, m.lamp, s - 0.05, s + 0.05, 3.62, 3.65, REVEAL + 0.01, REVEAL + 0.11);
    }
    box(f, m.limestone, lead, W, 12.2, 14.1, -0.05, REVEAL);
    box(f, m.bronze, main ? -REVEAL - 0.12 : 0, W + 0.12, 14.1, 14.5, -0.05, REVEAL + 0.12);
    for (const [s0, s1, columns] of bays) {
      const step = (s1 - s0) / columns, open = doors.filter(s => s > s0 && s < s1);
      let runs = [[s0, s1]];
      for (const s of open) runs = runs.flatMap(([p, q]) => [[p, Math.min(q, s - 0.88)], [Math.max(p, s + 0.88), q]].filter(([x, y]) => y - x > 0.05));
      for (const [p, q] of runs) sheet(f, glass, p, q, 0.05, 4.15, 0.02);
      for (const s of open) sheet(f, glass, s - 0.88, s + 0.88, 3.35, 4.15, 0.02);
      sheet(f, m.blueGlass, s0, s1, 4.15, 5.0, 0.025);
      box(f, m.copper, s0, s1, 5.0, 5.9, 0.0, 0.13);
      sheet(f, m.blueGlass, s0, s1, 5.9, 12.2, 0.025);
      for (let i = 0; i <= columns; i++) {
        const s = s0 + i * step, overDoor = open.some(x => Math.abs(x - s) < 0.95);
        box(f, m.bronze, s - 0.045, s + 0.045, overDoor ? 3.35 : 0.05, 12.2, 0.0, 0.21);
      }
      for (const s of open) for (const side of [-1, 1]) box(f, m.bronze, s + side * 0.9 - 0.055, s + side * 0.9 + 0.055, 0.05, 3.35, 0.0, 0.22);
      for (const h of [0.05, 3.35, 4.15, 5.0, 5.9, 8.0, 10.1, 12.2]) box(f, m.bronze, s0, s1, h - 0.045, h + 0.045, 0.0, 0.21);
      // Gilt name in the transom over the doors, read through the glass.
      for (const s of open) sign(lettering('HERMÈS', { width: 1.7, height: 0.34, family: 'Didot, "Bodoni 72", Georgia, serif', weight: 700, color: '#c8a462', spacing: 0.12, metalness: 0.5, roughness: 0.35 }), f, s, 3.76, -0.06, 1.7, 0.34);
    }
    if (main) {
      const middle = (bays[0][1] + bays[1][0]) / 2;
      sign(lettering('HERMÈS', { width: 5.4, height: 0.95, family: 'Didot, "Bodoni 72", "Big Caslon", Georgia, serif', weight: 700, color: '#8a6a47', spacing: 0.1, metalness: 0.55, roughness: 0.38 }), f, middle, 13.15, 0.61, 5.4, 0.95);
    }
  }
  // The pavilion's own mass rises over its two-storey neighbours.
  function hermesPavilion(frontage) {
    const { width, side, sideWidth, building } = frontage, f = frames.get(frontage), other = { edge: side, building };
    const fromB = frontage.corner === side.b, g = frame(other, fromB ? side.length : 0, fromB ? -1 : 1, -1);
    const point = ([e, h, z]) => new THREE.Vector2(e, -z);
    const corner = point(f.at(0, 0)), along = point(f.at(width, 0)), across = point(g.at(sideWidth, 0));
    const far = along.clone().add(across).sub(corner);
    const shape = new THREE.Shape([corner, along, far, across]);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 14.1 - 4.25, bevelEnabled: false, steps: 1, curveSegments: 1 }); geometry.rotateX(-Math.PI / 2); geometries.push(geometry);
    const mass = new THREE.Mesh(geometry, m.limestone); mass.position.y = f.base + 4.25; mass.castShadow = mass.receiveShadow = true; mass.userData.districtBuilding = building.id; group.add(mass);
    const roofGeometry = new THREE.ShapeGeometry(shape); roofGeometry.rotateX(-Math.PI / 2); geometries.push(roofGeometry);
    const top = new THREE.Mesh(roofGeometry, m.bronze); top.position.y = f.base + 14.45; top.receiveShadow = true; group.add(top);
    // A stone cap on the two faces above the neighbouring roofs.
    const cap = (from, to) => {
      const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
      part(m.limestone, [(from.x + to.x) / 2, f.base + 14.25, -(from.y + to.y) / 2], [length + 0.3, 0.4, 0.3], Math.atan2(dy, dx), -1);
    };
    cap(along, far); cap(far, across);
  }

  // The IPIC block, west face: striped grey stone frames each shopfront below a
  // tan theatre box with vertical slot windows; the Tuck Room's glass box sits
  // over its terrace, and the violet IPIC blade stands beside the cinema door.
  // Street order as photographed: Venus et Fleur's look (on MAD Houston), Amorino,
  // Cos Bar, the IPIC entrance, Van Cleef & Arpels.
  function ipicWest(f, W, doors) {
    const at = name => doors.find(item => item.store.name === name)?.s;
    const mad = at('MAD Houston') ?? 9.4, amorino = at('Amorino') ?? 28.4, cinema = at('IPIC Theaters') ?? 42.1, vca = at('Van Cleef & Arpels') ?? 57.7;
    const doorS = doors.map(item => item.s), named = name => doors.find(item => item.store.name === name)?.store.name ?? name;
    const modules = [
      { kind: 'letters', s0: 1.6, s1: Math.min(amorino - 4.0, mad + 15), name: named('MAD Houston') },
      { kind: 'amorino', s0: amorino - 3.2, s1: amorino + 3.2, name: named('Amorino') },
      { kind: 'band', s0: amorino + 4.0, s1: cinema - 4.4, name: 'COS BAR' },
      { kind: 'cinema', s0: cinema - 3.8, s1: cinema + 4.4 },
      { kind: 'jeweller', s0: vca - 8.1, s1: vca + 8.1, name: named('Van Cleef & Arpels') },
      { kind: 'dark', s0: vca + 9.3, s1: vca + 22.3 },
      { kind: 'plain', s0: vca + 23.5, s1: W - 1.6 },
    ].filter(item => item.s1 - item.s0 > 3);
    const blade = cinema + 6.5;
    // Piers fill every gap between shopfront modules, full podium height.
    let last = -0.25;
    for (const module of [...modules, { s0: W + 0.25 }]) { box(f, m.greyStone, last, module.s0, 0, 9.4, -0.05, 0.25); last = module.s1; }
    box(f, m.greyStone, -0.25, W + 0.25, 9.4, 9.7, -0.05, 0.45);
    for (const module of modules) {
      const { s0, s1, kind } = module;
      if (kind === 'letters') {
        // As at Venus et Fleur: two shop bays under thin dark canopies, a
        // clerestory row over each, the name in pale letters on the stone band
        // above them and a projecting ledge.
        let split = (s0 + s1) / 2;
        for (const s of doorS) if (Math.abs(s - split) < 1.4) split = s + 1.6;
        const halves = [[s0, split - 0.45], [split + 0.45, s1]];
        blocks.wall(f, m.greyStone, s0, s1, 4.2, 9.4, -0.05, 0.4, halves.map(([a, b]) => [a + 0.2, b - 0.2, 4.6, 5.65]));
        box(f, m.greyStone, split - 0.45, split + 0.45, 0, 4.2, -0.05, 0.25);
        for (const [a, b] of halves) {
          storefront(f, a, b, 4.2, { doors: doorS, mullion: m.charcoal, pitch: 1.6 });
          box(f, m.charcoal, a - 0.1, b + 0.1, 4.22, 4.36, 0.05, 1.45);
          windowRow(f, a + 0.2, b - 0.2, 4.6, 5.65, m.charcoal, 1.3);
        }
        sign(lettering(module.name.toUpperCase(), { width: 8, height: 0.62, family: 'Optima, Candara, "Gill Sans", sans-serif', weight: 500, color: '#e6e4de', spacing: 0.14, metalness: 0.6, roughness: 0.35 }), f, (s0 + s1) / 2, 6.35, 0.41, Math.min(8, s1 - s0 - 2), 0.62);
        box(f, m.greyStone, s0 - 0.2, s1 + 0.2, 7.0, 7.22, -0.05, 0.95);
      } else if (kind === 'amorino') {
        // Amorino: a narrow portal of chequered stone standing proud of its
        // neighbours, a taupe canopy box with the name, a dark band and a clerestory.
        const middle = (s0 + s1) / 2;
        for (const [a, b] of [[s0, s0 + 0.6], [s1 - 0.6, s1]]) {
          box(f, m.greyStone, a, b, 0, 9.4, -0.05, 0.55);
          box(f, m.charcoal, (a + b) / 2 - 0.08, (a + b) / 2 + 0.08, 3.0, 3.5, 0.55, 0.68);
        }
        storefront(f, s0 + 0.6, s1 - 0.6, 3.9, { doors: doorS, mullion: m.charcoal, pitch: 1.5, transom: 3.1 });
        box(f, m.taupe, s0 + 0.5, s1 - 0.5, 3.9, 4.45, 0.0, 1.2);
        sign(lettering(module.name, { width: 3.4, height: 0.46, family: '"Snell Roundhand", "Apple Chancery", Georgia, serif', weight: 600, color: '#3a2a1f' }), f, middle, 4.17, 1.205, Math.min(3.4, s1 - s0 - 1.6), 0.46);
        box(f, m.charcoal, s0 + 0.6, s1 - 0.6, 4.45, 5.05, -0.05, 0.2);
        windowRow(f, s0 + 0.6, s1 - 0.6, 5.05, 6.3, m.charcoal, 1.7);
        box(f, m.chequer, s0 + 0.6, s1 - 0.6, 6.3, 9.4, -0.05, 0.55);
      } else if (kind === 'band') {
        // As at COS BAR: a two-storey stone frame around a white name band, a
        // clerestory and a thin white canopy over the shop glass.
        box(f, m.greyStone, s0, s0 + 0.7, 0, 9.4, 0.25, 0.75); box(f, m.greyStone, s1 - 0.7, s1, 0, 9.4, 0.25, 0.75);
        box(f, m.greyStone, s0, s1, 7.4, 9.4, 0.25, 0.75);
        storefront(f, s0 + 0.7, s1 - 0.7, 4.9, { doors: doorS, pitch: 1.75, transom: 3.9, upper: glass });
        box(f, m.whiteBand, s0 + 0.7, s1 - 0.7, 3.9, 4.04, 0.03, 1.75);
        box(f, m.whiteBand, s0 + 0.7, s1 - 0.7, 4.9, 6.6, 0.03, 0.45);
        box(f, m.greyStone, s0 + 0.7, s1 - 0.7, 6.6, 7.4, -0.05, 0.25);
        const wide = Math.min(5.6, s1 - s0 - 1.8);
        sign(lettering(module.name.toUpperCase(), { width: wide, height: 0.82, family: '"Bodoni 72", Didot, Georgia, serif', weight: 500, color: '#18191b', spacing: 0.04 }), f, (s0 + s1) / 2, 6.0, 0.46, wide, 0.82);
        box(f, m.charcoal, (s0 + s1) / 2 - wide / 2 - 0.2, (s0 + s1) / 2 + wide / 2 + 0.2, 5.53, 5.56, 0.45, 0.47);
        if (module.name === 'COS BAR') sign(lettering('BEAUTY ELEVATED', { width: wide * 0.62, height: 0.16, family: 'Futura, Avenir, sans-serif', weight: 600, color: '#18191b', spacing: 0.3 }), f, (s0 + s1) / 2, 5.3, 0.46, wide * 0.62, 0.16);
      } else if (kind === 'cinema') {
        // The cinema entrance: smooth grey panels, a slatted screen carrying the
        // IPIC name, glazed doors below, all inset between stone returns a
        // metre deep, with a dark soffit over the doors.
        box(f, m.concrete, s0, s1, 5.6, 9.4, -0.05, 0.1);
        for (const [a, b] of [[s0 - 0.3, s0], [s1, s1 + 0.3]]) box(f, m.greyStone, a, b, 0, 9.4, -0.05, 1.1);
        box(f, m.charcoal, s0, s1, 3.55, 3.62, 0.1, 1.1);
        for (const s of [s0 + (s1 - s0) * 0.25, (s0 + s1) / 2, s0 + (s1 - s0) * 0.75]) box(f, m.lamp, s - 0.1, s + 0.1, 3.53, 3.55, 0.55, 0.75);
        storefront(f, s0 + 0.5, s1 - 0.5, 3.6, { doors: doorS, mullion: m.charcoal, pitch: 1.4, transom: 3.0, upper: m.shopGlass });
        box(f, m.concrete, s0, s1, 3.6, 5.6, -0.05, 0.02);
        for (let i = 0; i < 8; i++) box(f, m.teak, s0 + 1.2, s1 - 1.2, 3.75 + i * 0.22, 3.86 + i * 0.22, 0.05, 0.2);
        sign(lettering('IPIC', { width: 2.9, height: 1.05, family: 'Futura, Avenir, Helvetica, sans-serif', weight: 700, color: '#e3583c', spacing: 0.02, emissive: 0.25 }), f, (s0 + s1) / 2, 4.85, 0.24, 2.9, 1.05);
        sign(lettering('THEATERS', { width: 3.6, height: 0.3, family: 'Futura, Avenir, Helvetica, sans-serif', weight: 600, color: '#f3f0ea', spacing: 0.55 }), f, (s0 + s1) / 2, 4.08, 0.24, 3.6, 0.3);
      } else if (kind === 'jeweller') {
        // A black portal with the maison's name over shop glass, and a large
        // upper window in the striped stone.
        box(f, m.charcoal, s0 + 0.6, s0 + 1.0, 0, 5.2, -0.05, 0.32); box(f, m.charcoal, s1 - 1.0, s1 - 0.6, 0, 5.2, -0.05, 0.32);
        box(f, m.charcoal, s0 + 0.6, s1 - 0.6, 4.05, 5.2, -0.05, 0.32);
        box(f, m.greyStone, s0, s0 + 0.6, 0, 9.4, -0.05, 0.25); box(f, m.greyStone, s1 - 0.6, s1, 0, 9.4, -0.05, 0.25);
        storefront(f, s0 + 1.0, s1 - 1.0, 4.05, { doors: doorS, mullion: m.charcoal, pitch: 1.9, transom: 3.4, upper: glass });
        blocks.wall(f, m.greyStone, s0 + 0.6, s1 - 0.6, 5.2, 9.4, -0.05, 0.4, [[s0 + 1.8, s1 - 1.8, 6.0, 8.9]]);
        windowRow(f, s0 + 1.8, s1 - 1.8, 6.0, 8.9, m.bronze, 2.1);
        sign(lettering(module.name, { width: 5.6, height: 0.62, family: '"Big Caslon", Baskerville, Georgia, serif', weight: 500, color: '#efe9dd', spacing: 0.01 }), f, (s0 + s1) / 2, 4.63, 0.33, 5.6, 0.62);
        sign(lettering(module.name, { width: 4.6, height: 0.5, family: '"Big Caslon", Baskerville, Georgia, serif', weight: 500, color: '#3a2d22', spacing: 0.01 }), f, (s0 + s1) / 2, 7.7, 0.25, 4.6, 0.5);
      } else if (kind === 'dark') {
        box(f, m.charcoal, s0, s1, 4.5, 9.4, -0.05, 0.4);
        storefront(f, s0 + 0.4, s1 - 0.4, 4.5, { doors: doorS, mullion: m.charcoal, pitch: 1.8, transom: 3.6, upper: m.shopGlass });
        box(f, m.charcoal, s0, s0 + 0.4, 0, 4.5, -0.05, 0.4); box(f, m.charcoal, s1 - 0.4, s1, 0, 4.5, -0.05, 0.4);
      } else {
        storefront(f, s0, s1, 4.4, { doors: doorS, pitch: 1.6, transom: 3.5, upper: glass });
        blocks.wall(f, m.greyStone, s0, s1, 4.4, 9.4, -0.05, 0.4, [[s0 + 1, s1 - 1, 6.2, 8.4]]);
        windowRow(f, s0 + 1, s1 - 1, 6.2, 8.4, m.aluminium, 1.6);
      }
    }
    // The Tuck Room: a deep-framed glass box on a railed terrace over the frame.
    const tuck = [amorino - 6, amorino + 6];
    box(f, m.greyStone, tuck[0] - 1, tuck[1] + 1, 9.4, 9.7, 0.45, 1.45);
    sheet(f, m.railGlass, tuck[0] - 0.9, tuck[1] + 0.9, 9.7, 10.75, 1.38);
    box(f, m.aluminium, tuck[0] - 0.9, tuck[1] + 0.9, 10.75, 10.8, 1.33, 1.43);
    sheet(f, m.tuckGlass, tuck[0], tuck[1], 9.7, 14.0, 0.06);
    for (let s = tuck[0]; s <= tuck[1] + 0.01; s += (tuck[1] - tuck[0]) / 8) box(f, m.charcoal, s - 0.04, s + 0.04, 9.7, 14.0, 0.06, 0.18);
    box(f, m.charcoal, tuck[0], tuck[1], 12.55, 12.62, 0.06, 0.18);
    box(f, m.charcoal, tuck[0] - 0.45, tuck[1] + 0.45, 14.0, 14.7, -0.05, 1.05);
    for (const s of tuck) box(f, m.charcoal, s - 0.45 + (s === tuck[1] ? 0.45 : 0), s + (s === tuck[1] ? 0.45 : 0), 9.7, 14.0, -0.05, 1.05);
    sign(lettering('THE TUCK ROOM', { width: 3.4, height: 0.42, family: '"Gill Sans", Futura, Avenir, sans-serif', weight: 400, color: '#e7f0ec', spacing: 0.2, emissive: 0.2 }), f, (tuck[0] + tuck[1]) / 2, 12.15, 0.08, 3.4, 0.42);
    sign(lettering('BAR · EATS · LOUNGE', { width: 2.2, height: 0.16, family: '"Gill Sans", Futura, Avenir, sans-serif', weight: 400, color: '#e7f0ec', spacing: 0.25, emissive: 0.2 }), f, (tuck[0] + tuck[1]) / 2, 11.75, 0.08, 2.2, 0.16);
    // The blade: brass body, violet faces on both flanks.
    box(f, m.gold, blade - 0.28, blade + 0.28, 7.4, 18.2, 0.2, 1.55);
    const face = keep(bladeFace(), 'ipic-blade');
    for (const side of [-1, 1]) sign(face, f, blade + side * 0.285, 12.8, 0.88, 1.2, 10.6, f.yaw + side * Math.PI / 2);
    theatreBox(f, W, [[tuck[0] - 0.8, tuck[1] + 0.8], [blade - 0.6, blade + 0.6]]);
  }
  // Tan panels above the podium with vertical slot windows in an uneven rhythm.
  function theatreBox(f, W, skip = []) {
    const rhythm = [1.15, 1.15, 2.9, 1.4, 3.6, 1.15, 2.3, 1.4, 1.4, 3.1];
    for (let s = 1.4, i = 0; s < W - 1.2; s += rhythm[i++ % rhythm.length]) {
      if (skip.some(([a, b]) => s > a - 0.4 && s < b + 0.4)) continue;
      const tall = i % 3 === 1 ? 5.4 : 6.6, h0 = 10.8, h1 = h0 + tall;
      sheet(f, m.shopGlass, s - 0.19, s + 0.19, h0, h1, 0.03);
      // Jambs, head and sill stand 0.42 m proud, so each slot reads cut deep into the box.
      for (const side of [-1, 1]) box(f, m.tan, s + side * 0.26 - 0.07, s + side * 0.26 + 0.07, h0 - 0.1, h1 + 0.1, -0.05, 0.42);
      box(f, m.tan, s - 0.33, s + 0.33, h1, h1 + 0.12, -0.05, 0.42);
      box(f, m.tan, s - 0.33, s + 0.33, h0 - 0.14, h0, -0.05, 0.46);
    }
    box(f, m.tan, -0.1, W + 0.1, 18.25, 18.6, -0.05, 0.22);
  }
  function ipicUpper(f, W) {
    box(f, m.greyStone, -0.25, W + 0.25, 5.3, 9.4, -0.05, 0.12);
    box(f, m.greyStone, -0.25, W + 0.25, 9.4, 9.7, -0.05, 0.45);
    theatreBox(f, W);
  }

  // Bella Rinova: cream tile below a salon ribbon window and a pale metal band
  // carrying the name; a slatted stair screen and blue-striped awnings at grade.
  function ribbon(f, W, { name = false, at = W / 2 } = {}) {
    box(f, m.aluminium, -0.1, W + 0.1, 5.5, 5.62, -0.05, 0.5);
    sheet(f, m.ribbon, -0.05, W + 0.05, 5.62, 8.5, 0.04);
    const columns = Math.max(1, Math.round(W / 1.6));
    for (let i = 0; i <= columns; i++) { const s = i * W / columns; box(f, m.aluminium, s - 0.035, s + 0.035, 5.62, 8.5, 0.04, 0.16); }
    box(f, m.aluminium, -0.1, W + 0.1, 6.02, 6.07, 0.04, 0.15);
    // The metal band stands 0.45 m out, so the ribbon window reads recessed beneath it.
    box(f, m.band, -0.45, W + 0.45, 8.5, 10.4, -0.05, 0.45);
    for (let i = 1; i < Math.round(W / 2.4); i++) { const s = i * W / Math.round(W / 2.4); box(f, m.louver, s - 0.012, s + 0.012, 8.52, 10.38, 0.44, 0.455); }
    box(f, m.aluminium, -0.5, W + 0.5, 10.4, 10.62, -0.05, 0.55);
    if (name) sign(lettering('Bella Rinova salon', { width: 10.5, height: 1.0, family: '"Trajan Pro", Optima, Baskerville, Georgia, serif', weight: 600, color: '#1c1d1f', spacing: 0.06, smallCaps: true }), f, at, 9.45, 0.46, 10.5, 1.0);
  }
  const tile = (f, s0, s1, h0 = 0, h1 = 5.5) => box(f, m.cream, s0, s1, h0, h1, -0.12, 0.08);
  function awningWindow(f, s0, s1) {
    storefront(f, s0, s1, 3.4, { mullion: m.charcoal, pitch: 1.4, transom: 3.4, d: 0.09, depth: 0.08 });
    tile(f, s0, s1, 3.4, 5.5);
    // A sloped striped canvas with a valance, pitched down away from the wall.
    const run = 1.25, pitch = 0.5, drop = Math.sin(pitch) * run / 2, middle = 0.12 + run / 2 * Math.cos(pitch), edge = 0.12 + run * Math.cos(pitch);
    box(f, m.awning, s0, s1, 3.95 - drop - 0.015, 3.95 - drop + 0.015, middle - run / 2, middle + run / 2, pitch);
    box(f, m.awning, s0, s1, 3.95 - drop * 2 - 0.22, 3.95 - drop * 2, edge - 0.015, edge + 0.015);
  }
  function louvredBay(f, s0, s1) {
    box(f, m.aluminium, s0 - 0.08, s1 + 0.08, 4.95, 5.05, -0.05, 0.12);
    for (const s of [s0, s1]) box(f, m.aluminium, s - 0.08, s + 0.08, 0, 5.05, -0.05, 0.12);
    sheet(f, m.louver, s0, s1, 0, 4.95, 0.0);
    for (let h = 2.7; h < 4.85; h += 0.21) box(f, m.charcoal, s0, s1, h, h + 0.05, 0.02, 0.14, -0.35);
  }
  function stairScreen(f, s0, s1, depth = 0.75, top = 9.0) {
    sheet(f, m.charcoal, s0, s1, 0.3, 5.5, 0.13);
    for (let h = 0.45; h < top - 0.1; h += 0.28) {
      box(f, m.slat, s0, s1, h, h + 0.11, depth - 0.06, depth);
      for (const s of [s0, s1]) box(f, m.slat, s - 0.03, s + 0.03, h, h + 0.11, 0.1, depth);
    }
    for (const s of [s0, (s0 + s1) / 2, s1]) box(f, m.slat, s - 0.06, s + 0.06, 0, top, depth - 0.12, depth + 0.02);
    box(f, m.slat, s0 - 0.06, s1 + 0.06, top, top + 0.12, 0.05, depth + 0.02);
  }
  function bellaNorth(f, W, doors) {
    // Viewed from the plaza: awnings at the left, the stair screen, then the
    // salon entrance and two louvred service bays.
    const door = doors[0] ?? W * 0.62;
    tile(f, -0.12, 1.2); awningWindow(f, 1.2, 4.0); tile(f, 4.0, 4.6); awningWindow(f, 4.6, 7.4); tile(f, 7.4, 8.4);
    stairScreen(f, 8.4, Math.min(16.2, door - 3.2)); tile(f, 8.4, door - 1.4, 0, 5.5);
    box(f, m.louver, door - 3.0, door - 2.0, 0, 2.3, 0.08, 0.11);
    storefront(f, door - 1.4, door + 1.4, 3.6, { doors: [door], mullion: m.charcoal, pitch: 1.4, transom: 3.0, d: 0.09, depth: 0.08 });
    tile(f, door - 1.4, door + 1.4, 3.6, 5.5);
    box(f, m.charcoal, door - 1.7, door + 1.7, 3.62, 3.72, 0.08, 1.2);
    const bays = [[door + 3.0, door + 6.0], [door + 7.2, door + 10.2]].filter(([, s1]) => s1 < W - 0.8);
    let last = door + 1.4;
    for (const [s0, s1] of bays) { tile(f, last, s0); louvredBay(f, s0, s1); last = s1; }
    tile(f, last, W + 0.12);
    ribbon(f, W, { name: true, at: Math.max(6, door - 7.5) });
  }
  function bellaEast(f, W) {
    tile(f, -0.12, 1.0); awningWindow(f, 1.0, 3.8); tile(f, 3.8, 4.4); awningWindow(f, 4.4, 7.2); tile(f, 7.2, 8.6);
    storefront(f, 8.6, W - 0.6, 4.4, { mullion: m.charcoal, pitch: 1.6, transom: 3.4, d: 0.09, depth: 0.08 });
    tile(f, 8.6, W - 0.6, 4.4, 5.5); tile(f, W - 0.6, W + 0.12);
    ribbon(f, W, { name: true });
  }
  function bellaUpper(f, W) { ribbon(f, W); }

  // Built after the shared kit, so existing instance order (and glass pane ids) holds.
  function build() {
    for (const frontage of plan.frontages) {
      const { kind } = frontage, f = frames.get(frontage), width = frontage.hi - frontage.lo, doors = doorsOn(frontage, f);
      if (kind === 'hermes' || kind === 'hermes-side') hermesFace(frontage, f, doors.map(item => item.s));
      else if (kind === 'ipic') ipicWest(f, width, doors);
      else if (kind === 'ipic-upper') ipicUpper(f, width);
      else if (kind === 'bella-north') bellaNorth(f, width, doors.map(item => item.s));
      else if (kind === 'bella-east') bellaEast(f, width);
      else if (kind === 'bella-upper') bellaUpper(f, width);
      else blocks.build(frontage, f, width, doors);
    }
    const hermes = plan.frontages.find(frontage => frontage.kind === 'hermes');
    if (hermes) hermesPavilion(hermes);
  }

  return {
    group, materials, textures, geometries, plan, build,
    reflective: [m.blueGlass, m.shopGlass, m.tuckGlass, m.ribbon, ...blocks.reflective],
    massMaterial: building => building.id === IPIC_BLOCK ? m.tan : building.id === BELLA_BLOCK ? m.cream : blocks.massMaterial(building),
  };
}
