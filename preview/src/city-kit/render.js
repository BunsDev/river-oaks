import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT_CONVENTIONS, KIT_MATERIALS, KIT_STYLES, kitFinish } from '../../../shared/city-kit/catalog.js';
import { physicalSurface, paverSurface } from '../materials.js';
import { buildMatureTrees, buildPlanterPlanting } from '../landscape-models.js';
import { treeGrateTexture } from '../street-furniture.js';

// Renders an assembled city-kit plan (shared/city-kit/assemble.js) in world
// east/north metres. Static pieces merge into one mesh per material per block,
// so a neighborhood costs a few draw calls per material; facade detail is a
// separate batch that hides past KIT_CONVENTIONS.lod.detailMetres. Ground pieces
// sample `groundAt`, the same height function movement uses.
const G = KIT_CONVENTIONS.storey.ground, U = KIT_CONVENTIONS.storey.upper;
const unit = new THREE.BoxGeometry(1, 1, 1);
// Text and glow textures need a canvas; headless builds (Node tests) render without them.
const headless = typeof document === 'undefined';
const canvas2d = (width, height) => headless ? null : Object.assign(document.createElement('canvas'), { width, height });

// Render-only slots that no recipe names.
const RENDER_MATERIALS = {
  // A dim, warm shop interior seen through storefront glass.
  'shop-interior': { color: '#15100c', roughness: .95, emissive: '#8a5228', emissiveIntensity: .16 },
  // Market stall produce; peaches and lemons reuse the apricot canvas and brass.
  'produce-red': { color: '#a8382c', roughness: .55 },
  'produce-green': { color: '#5d8a3a', roughness: .7 },
};

// A finish (catalog.js KIT_FINISHES) replaces fields of a slot's spec; slot names, and so
// material names, batching and draw calls, are the same under every finish.
function createMaterials(finish = 'classic') {
  const made = new Map(), recolour = kitFinish(finish).materials;
  const get = name => {
    if (made.has(name)) return made.get(name);
    const base = KIT_MATERIALS[name] ?? RENDER_MATERIALS[name] ?? { color: '#888888' }, spec = recolour[name] ? { ...base, ...recolour[name] } : base;
    let material;
    if (spec.surface === 'district-paver') material = paverSurface();
    else if (spec.surface) material = physicalSurface(spec.surface, { tileSize: spec.tile ?? 4, instanced: false, variation: .08, color: new THREE.Color(spec.color ?? '#ffffff'),
      ...(spec.textureContrast ? { textureContrast: spec.textureContrast, normalScale: new THREE.Vector2(.3, .3) } : {}) });
    else if (spec.reflective) material = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness, envMapIntensity: 1.6, clearcoat: .6, clearcoatRoughness: .08 });
    else if (spec.glass) material = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness, transparent: true, opacity: .26, envMapIntensity: .7, clearcoat: .6, clearcoatRoughness: .06, depthWrite: false });
    else material = new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness ?? .8, metalness: spec.metalness ?? 0,
      ...(spec.emissive ? { emissive: new THREE.Color(spec.emissive), emissiveIntensity: spec.emissiveIntensity ?? 1 } : {}) });
    material.name = `city-kit/${name}`; material.userData.finish = finish;
    made.set(name, material);
    return material;
  };
  return { get, made };
}

// Surface materials expect UVs in metres (materials.js). A box face takes the two
// world axes in its plane, vertical as v, so courses stay level and joints line
// up across neighbouring boxes.
function metricUv(geometry) {
  const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

// Accumulates transformed geometry per material, then merges.
function createBatch() {
  const parts = new Map(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const add = (material, geometry) => { if (!parts.has(material)) parts.set(material, []); parts.get(material).push(geometry); };
  // Box centred at world (east, up, north) in metres, yaw about up (radians, from east toward north).
  const box = (material, east, up, north, sizeAlong, height, sizeAcross, yaw = 0, pitch = 0) => {
    const geometry = unit.clone();
    euler.set(pitch, yaw, 0, 'YXZ'); quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(east, up, -north), quaternion, new THREE.Vector3(sizeAlong, height, sizeAcross));
    geometry.applyMatrix4(matrix); metricUv(geometry); add(material, geometry);
  };
  const mesh = (material, geometry, east, up, north, yaw = 0, scale = [1, 1, 1]) => {
    const copy = geometry.clone(); euler.set(0, yaw, 0); quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(east, up, -north), quaternion, new THREE.Vector3(...scale)); copy.applyMatrix4(matrix); add(material, copy);
  };
  // Takes ownership of `geometry`; rotation is a scene-space Euler [x, y, z].
  const place = (material, geometry, east, up, north, rotation = [0, 0, 0], order = 'XYZ') => {
    euler.set(...rotation, order); quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(east, up, -north), quaternion, new THREE.Vector3(1, 1, 1)); geometry.applyMatrix4(matrix); add(material, geometry);
  };
  const build = (group, name, { shadows = true } = {}) => {
    const geometries = [];
    for (const [material, list] of parts) {
      const merged = mergeGeometries(list.map(item => item.index ? item.toNonIndexed() : item), false);
      list.forEach(item => item.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const result = new THREE.Mesh(merged, material); result.name = `${name}:${material.name}`;
      result.castShadow = shadows && !material.transparent; result.receiveShadow = true;
      group.add(result); geometries.push(merged);
    }
    parts.clear();
    return geometries;
  };
  return { add, box, mesh, place, build };
}

// Face frames: start corner, unit direction along the face, outward normal.
function faceFrame(rect, face) {
  const [w, s, e, n] = rect;
  if (face === 'south') return { origin: [w, s], along: [1, 0], out: [0, -1], length: e - w, depth: n - s };
  if (face === 'north') return { origin: [e, n], along: [-1, 0], out: [0, 1], length: e - w, depth: n - s };
  if (face === 'east') return { origin: [e, s], along: [0, 1], out: [1, 0], length: n - s, depth: e - w };
  return { origin: [w, n], along: [0, -1], out: [-1, 0], length: n - s, depth: e - w };
}

// Sign palettes: the District's teal plate with ivory serif capitals, and `noir`,
// spaced brass sans-serif capitals on black steel for the luxury styles.
const SIGN_PALETTES = {
  teal: { plate: '#1f454a', rule: '#bd9e66', ink: '#f5eee0', font: size => `600 ${size}px Georgia, 'Times New Roman', serif`, spacing: 0 },
  noir: { plate: '#1b1d1f', rule: '#8c7550', ink: '#e4cb93', font: size => `500 ${size}px 'Helvetica Neue', Helvetica, Arial, sans-serif`, spacing: 10 },
};
const signKey = sign => `${sign.palette ?? 'teal'}|${sign.name}`;

function signAtlas(keys) {
  const unique = [...new Set(keys.filter(Boolean))], rows = Math.max(1, unique.length), uv = new Map();
  unique.forEach((key, row) => uv.set(key, [row / rows, (row + 1) / rows]));
  const canvas = canvas2d(1024, 128 * rows);
  if (!canvas) return { texture: null, uv };
  const context = canvas.getContext('2d');
  unique.forEach((key, row) => {
    const [palette, ...rest] = key.split('|'), name = rest.join('|').toUpperCase(), style = SIGN_PALETTES[palette] ?? SIGN_PALETTES.teal;
    context.fillStyle = style.plate; context.fillRect(0, row * 128, 1024, 128);
    context.strokeStyle = style.rule; context.lineWidth = palette === 'noir' ? 3 : 6; context.strokeRect(10, row * 128 + 10, 1004, 108);
    context.fillStyle = style.ink; context.textAlign = 'center'; context.textBaseline = 'middle';
    let size = 74; context.font = style.font(size); if ('letterSpacing' in context) context.letterSpacing = `${style.spacing}px`;
    while (context.measureText(name).width > 940 && size > 30) { size -= 4; context.font = style.font(size); }
    context.fillText(name, 512, row * 128 + 66);
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  // The plan owns and disposes its atlas; the stream counts owned textures (heights-stream.js).
  texture.userData.owned = true;
  return { texture, uv };
}

function signQuad(atlas, name, width, height) {
  const geometry = new THREE.PlaneGeometry(width, height), [v0, v1] = atlas.uv.get(name), uvs = geometry.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setY(i, 1 - (uvs.getY(i) > .5 ? v0 : v1));
  return geometry;
}

// A rectangle draped on `groundAt` (scene height for east/north), lifted by `lift`.
function drape(rect, groundAt, lift, step = 2) {
  const [w, s, e, n] = rect, columns = Math.max(1, Math.ceil((e - w) / step)), rows = Math.max(1, Math.ceil((n - s) / step));
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const x = w + (e - w) * i / columns, y = s + (n - s) * j / rows;
    positions.push(x, groundAt(x, y) + lift, -y); uvs.push(x, y);
    if (i < columns && j < rows) { const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1; indices.push(a, b, c, b, c + 1, c); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

// A planted roof: lawn and raised beds inside the parapet, a rose-gold pergola strung with
// pink lights. Everything stays within 1.9 m of the roof (KIT_PIECES['roof/garden']).
function renderGardenRoof([w, s, e, n], roof, batch, detail, m, accent, wall) {
  const inner = [w + 1.2, s + 1.2, e - 1.2, n - 1.2], cx = (w + e) / 2, cy = (s + n) / 2;
  if (inner[2] - inner[0] < 3 || inner[3] - inner[1] < 3) return;
  batch.box(m('lawn'), cx, roof + .1, cy, inner[2] - inner[0], .12, inner[3] - inner[1]);
  // Raised beds along the two long sides, planted.
  const long = e - w >= n - s;
  for (const sign of [-1, 1]) {
    const length = (long ? e - w : n - s) - 3, bx = long ? cx : cx + sign * ((e - w) / 2 - 1.6), by = long ? cy + sign * ((n - s) / 2 - 1.6) : cy;
    const [sx, sy] = long ? [length, 1.1] : [1.1, length];
    batch.box(wall, bx, roof + .35, by, sx, .5, sy);
    batch.box(m('planting'), bx, roof + .85, by, sx - .2, .55, sy - .2);
  }
  // A pergola over the middle of the roof.
  const px = Math.min(8, (e - w) - 5), py = Math.min(5, (n - s) - 5);
  if (px < 3 || py < 3) return;
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) detail.box(accent, cx + dx * px / 2, roof + .95, cy + dy * py / 2, .14, 1.7, .14);
  for (let k = 0; k <= 4; k++) detail.box(accent, cx - px / 2 + px * k / 4, roof + 1.82, cy, .08, .08, py + .2);
  detail.box(m('neon-rose'), cx, roof + 1.74, cy - py / 2, px, .04, .04);
  detail.box(m('neon-rose'), cx, roof + 1.74, cy + py / 2, px, .04, .04);
}

// Penthouse Row: the top two storeys set back 2.5 m behind glass-railed terraces, a garden
// on the terraces, and a pink light band at the crown. The crown's top is the piece's height.
function renderCrown(piece, [w, s, e, n], bodyTop, top, batch, detail, m, accent, trim, wall) {
  const back = 2.5, r = [w + back, s + back, e - back, n - back], cx = (w + e) / 2, cy = (s + n) / 2, rw = r[2] - r[0], rd = r[3] - r[1];
  batch.box(m('stone-pearl'), cx, bodyTop + .06, cy, e - w - .5, .12, n - s - .5);
  // Penthouse volume: glass storeys between slim slabs, a solid core behind.
  batch.box(wall, cx, (bodyTop + top) / 2, cy, rw - .6, top - bodyTop, rd - .6);
  for (let level = 0; level < 2; level++) {
    const floor = bodyTop + level * U;
    batch.box(m(level ? 'glass-dark' : 'glass-lit'), cx, floor + U / 2, cy, rw, U - .4, rd);
    batch.box(trim, cx, floor + U - .1, cy, rw + .3, .2, rd + .3);
  }
  // Terrace rails at the setback edge, planters at the corners.
  for (const [x, y, along, across] of [[cx, s + .4, e - w - .8, .03], [cx, n - .4, e - w - .8, .03], [w + .4, cy, .03, n - s - .8], [e - .4, cy, .03, n - s - .8]]) {
    detail.box(m('glass-rail'), x, bodyTop + .65, y, along, 1.05, across);
    detail.box(accent, x, bodyTop + 1.2, y, along + .02, .05, across + .04);
  }
  for (const [x, y] of [[w + 1.2, s + 1.2], [e - 1.2, s + 1.2], [e - 1.2, n - 1.2], [w + 1.2, n - 1.2]]) {
    batch.box(wall, x, bodyTop + .4, y, 1.2, .6, 1.2);
    batch.box(m('planting'), x, bodyTop + .85, y, 1.05, .5, 1.05);
  }
  // The pink band the skyline knows it by, and a roof cap.
  batch.box(m('neon-rose'), cx, top - .25, cy, rw + .08, .22, rd + .08);
  batch.box(trim, cx, top + .08, cy, rw + .4, .16, rd + .4);
}

// `forms` (a finish's rounded-form vocabulary, catalog.js KIT_FINISHES) adds facade
// detail only: canopy noses and capsule sign plates in existing slots, never massing,
// ground or collision. Without it a shell renders exactly as before.
function renderShell(piece, batch, detail, m, ground, signs, forms = false) {
  const [w, s, e, n] = piece.rect, style = KIT_STYLES[piece.style] ?? KIT_STYLES['market-row'];
  const wall = m(piece.wall), trim = m(piece.trim), accent = m(style.accent), glass = m('glass'), bronze = m('metal-bronze');
  const top = ground + piece.height, bottom = ground - .4;
  // A crown sets the top two storeys back behind terraces: the body stops below them.
  const crown = piece.roof === 'crown' && piece.storeys > 4, bodyTop = crown ? top - 2 * U : top, bodyStoreys = crown ? piece.storeys - 2 : piece.storeys;
  const faced = new Set(piece.faces ?? []);
  const loggia = piece.variant === 'loggia', recess = loggia ? 2.2 : piece.variant === 'recessed' ? .9 : .45, inset = .25;
  // Ground-floor core sits behind the storefront recess; upper storeys sit behind the window reveal.
  const cut = (amount) => [w + (faced.has('west') ? amount : 0), s + (faced.has('south') ? amount : 0), e - (faced.has('east') ? amount : 0), n - (faced.has('north') ? amount : 0)];
  const core = cut(recess), upper = cut(inset), groundTop = ground + G;
  const solid = (r, y0, y1, material) => batch.box(material, (r[0] + r[2]) / 2, (y0 + y1) / 2, (r[1] + r[3]) / 2, r[2] - r[0], y1 - y0, r[3] - r[1]);
  solid(core, bottom, groundTop, wall);
  if (piece.storeys > 1) solid(upper, groundTop, bodyTop, wall);
  else solid(cut(.02), groundTop - .02, top, wall);
  // Roof membrane inside the parapet.
  solid([w + .24, s + .24, e - .24, n - .24], bodyTop - .02, bodyTop + .04, m(piece.roof === 'garden' ? 'lawn' : 'roof-membrane'));
  // Floor plate between storefront and upper facade, and the loggia soffit.
  solid([w, s, e, n], groundTop - .02, groundTop + .28, trim);
  const roofKind = piece.roof;
  for (const face of ['north', 'south', 'east', 'west']) {
    const f = faceFrame(piece.rect, face), at = (u, o) => [f.origin[0] + f.along[0] * u + f.out[0] * o, f.origin[1] + f.along[1] * u + f.out[1] * o];
    const yaw = Math.atan2(f.along[1], f.along[0]);
    const put = (target, material, u, o, y, along, height, across) => { const [x, yy] = at(u, o); target.box(material, x, y, yy, along, height, across, yaw); };
    // A cylinder centred at (u, o, y): `axis` 'along' runs with the face (a canopy nose),
    // 'out' points away from it (a capsule's round end).
    const round = (material, u, o, y, radius, length, axis) => {
      const [x, yy] = at(u, o), geometry = new THREE.CylinderGeometry(radius, radius, length, 14, 1);
      if (axis === 'along') geometry.rotateZ(Math.PI / 2); else geometry.rotateX(Math.PI / 2);
      detail.place(material, geometry, x, y, yy, [0, yaw, 0], 'YXZ');
    };
    // Parapet and coping on every side; profiled cornice on faced sides.
    put(batch, wall, f.length / 2, -.12, bodyTop + .45, f.length, .9, .24);
    put(batch, trim, f.length / 2, -.06, bodyTop + .93, f.length + .12, .08, .4);
    if (!faced.has(face)) continue;
    if (roofKind === 'cornice') { put(detail, trim, f.length / 2, .04, top - .1, f.length + .3, .22, .32); put(detail, trim, f.length / 2, .1, top + .08, f.length + .45, .14, .44); }
    // A shadow reveal under a black-steel coping reads as a crisp modern parapet.
    if (roofKind === 'reveal') put(detail, trim, f.length / 2, .012, top + .02, f.length + .02, .06, .05);
    if (roofKind === 'stepped') { put(batch, wall, f.length / 2, -.12, top + 1.35, Math.min(6, f.length * .4), .9, .24); put(batch, trim, f.length / 2, -.06, top + 1.83, Math.min(6, f.length * .4) + .12, .08, .4); }
    const bays = face === (piece.faces?.[0]) ? Math.max(1, piece.bays ?? 1) : Math.max(1, Math.round(f.length / 6)), bay = f.length / bays;
    // Piers at bay edges carry the upper storeys to the ground.
    for (let i = 0; i <= bays; i++) {
      const u = Math.min(f.length - .25, Math.max(.25, i * bay));
      put(batch, loggia ? trim : wall, u, -.05, ground + G / 2 - .2, loggia ? .5 : .55, G + .4, loggia ? .5 : recess + .1);
    }
    // Upper storeys: spandrels and piers on the face plane, glass in the reveal.
    // Balconies: a slab and a glass rail along every storey, floor-to-ceiling glass behind with
    // some homes lit, and piers the tower's full height. Runs span the whole face, so a tower
    // costs a few hundred boxes and streams light; slabs and glass are massing, rails detail.
    if (style.windows === 'balcony' && bodyStoreys > 1) {
      const L = f.length, spans = Math.max(1, Math.round(L / 6)), span = L / spans, rise = bodyTop - groundTop, depth = 1.4;
      for (let i = 0; i <= spans; i++) put(batch, wall, Math.min(L - .25, Math.max(.25, i * span)), -inset / 2, groundTop + rise / 2, .5, rise, inset);
      for (let storey = 1; storey < bodyStoreys; storey++) {
        const floor = groundTop + (storey - 1) * U;
        put(batch, m('glass-dark'), L / 2, -inset + .03, floor + U / 2 + .1, L - .5, U - .5, .04);
        for (let i = 0; i < spans; i++) if ((Math.imul(storey * 31 + i * 17 + Math.round(L * 7), 2654435761) >>> 28) < 4)
          put(batch, m('glass-lit'), (i + .5) * span, -inset + .06, floor + U / 2 + .1, span - .5, U - .5, .02);
        put(batch, trim, L / 2, depth / 2 - .05, floor + .12, L - .2, .24, depth);
        put(detail, m('glass-rail'), L / 2, depth - .07, floor + .78, L - .4, 1.05, .03);
      }
    }
    for (let storey = 1; storey < bodyStoreys && style.windows === 'ribbon'; storey++) {
      // A continuous glass band between limestone spandrels, ruled by satin-bronze fins.
      const floor = groundTop + (storey - 1) * U, sill = floor + .75, head = floor + 3.0, L = f.length;
      put(batch, wall, L / 2, -inset / 2, (floor + sill) / 2, L, sill - floor, inset);
      put(batch, wall, L / 2, -inset / 2, (head + floor + U) / 2, L, floor + U - head, inset);
      for (const u of [.2, L - .2]) put(batch, wall, u, -inset / 2, (sill + head) / 2, .4, head - sill, inset);
      put(detail, m('glass-dark'), L / 2, -inset + .03, (sill + head) / 2, L - .4, head - sill, .04);
      for (let u = 1.4; u < L - .9; u += 1.6) put(detail, accent, u, .1, (sill + head) / 2, .06, head - sill + .12, .5);
      put(detail, trim, L / 2, .02, sill - .03, L - .3, .06, .16);
      put(detail, trim, L / 2, .012, head + .03, L - .3, .06, .1);
      // Stone coursing: a fine reveal at each floor line.
      put(detail, trim, L / 2, .004, floor + .3, L, .025, .02);
    }
    for (let storey = 1; storey < bodyStoreys && style.windows !== 'ribbon' && style.windows !== 'balcony'; storey++) {
      const floor = groundTop + (storey - 1) * U, sill = floor + .9, head = floor + (style.windows === 'tall' ? 3.15 : 2.75);
      put(batch, wall, f.length / 2, -inset / 2, (floor + sill) / 2, f.length, sill - floor, inset);
      put(batch, wall, f.length / 2, -inset / 2, (head + floor + U) / 2, f.length, floor + U - head, inset);
      for (let i = 0; i < bays; i++) {
        const openings = style.windows === 'paired' ? [[.2, .46], [.54, .8]] : style.windows === 'tall' ? [[.28, .72]] : [[.22, .78]];
        let cursor = i * bay;
        for (const [a, b] of openings) {
          const u0 = i * bay + a * bay, u1 = i * bay + b * bay;
          if (u0 > cursor) put(batch, wall, (cursor + u0) / 2, -inset / 2, (sill + head) / 2, u0 - cursor, head - sill, inset);
          put(detail, m('glass-dark'), (u0 + u1) / 2, -inset + .03, (sill + head) / 2, u1 - u0, head - sill, .04);
          put(detail, bronze, (u0 + u1) / 2, -inset + .06, (sill + head) / 2, .05, head - sill, .05);
          put(detail, trim, (u0 + u1) / 2, .04, sill - .04, u1 - u0 + .2, .1, .3);
          if (style.windows === 'arched') put(detail, trim, (u0 + u1) / 2, .02, head + .16, u1 - u0 + .3, .32, .16);
          else put(detail, trim, (u0 + u1) / 2, .02, head + .08, u1 - u0 + .12, .16, .12);
          cursor = u1;
        }
        if ((i + 1) * bay > cursor) put(batch, wall, (cursor + (i + 1) * bay) / 2, -inset / 2, (sill + head) / 2, (i + 1) * bay - cursor, head - sill, inset);
      }
    }
    // Storefronts: kickplate, glazing with mullions and transom, a warm interior, a door.
    for (let i = 0; i < bays && piece.variant === 'gallery'; i++) {
      // Gallery fronts: floor-to-head glass in slim black steel over a dark, warm
      // interior, a limestone fascia, and a cantilevered bronze canopy hung on rods
      // with a downlight strip along its edge.
      const u0 = i * bay + .35, u1 = (i + 1) * bay - .35, width = u1 - u0, mid = (u0 + u1) / 2, glassMid = ground + 1.94, glassHeight = 3.62;
      if (width < .8) continue;
      put(detail, trim, mid, -recess + .08, ground + .06, width, .12, .12);
      put(detail, glass, mid, -recess + .05, glassMid, width, glassHeight, .03);
      put(detail, m('shop-interior'), mid, -recess + .015, glassMid, width, glassHeight, .01);
      const panes = Math.max(2, Math.round(width / 1.6)), pane = width / panes;
      // Dark glass reads deep when only small lights show: one slim brass display rail
      // per bay and a pendant per pane, with nothing pale filling the glass.
      put(detail, m('metal-brass'), mid, -recess + .03, ground + 1.05, width * .8, .04, .01);
      for (let k = 0; k < panes; k++) {
        if (i === Math.floor(bays / 2) && k === Math.floor(panes / 2)) continue;
        put(detail, m('lamp-glow'), u0 + pane * (k + .5), -recess + .03, ground + 3.3, .22, .09, .01);
      }
      for (let k = 0; k <= panes; k++) put(detail, trim, u0 + width * k / panes, -recess + .08, glassMid, .05, glassHeight, .08);
      put(detail, trim, mid, -recess + .08, ground + 3.77, width + .05, .07, .08);
      if (i === Math.floor(bays / 2)) { put(detail, accent, mid + .32, -recess + .11, ground + 1.15, .035, 1.6, .05); put(detail, accent, mid - .32, -recess + .11, ground + 1.15, .035, 1.6, .05); }
      put(batch, wall, mid, -.04, ground + 4.19, width + .7, .82, .2);
      put(detail, accent, mid, .82, ground + 3.92, width + .3, .1, 1.62);
      put(detail, accent, mid, 1.6, ground + 3.9, width + .3, .2, .05);
      // Rounded canopy nose: a jet-age leading edge over the flat fascia strip.
      if (forms) round(accent, mid, 1.63, ground + 3.9, .11, width + .3, 'along');
      put(detail, m('lamp-glow'), mid, 1.48, ground + 3.85, width + .1, .02, .07);
      for (const t of [-1, 1]) { const [hx, hy] = at(mid + t * width / 3, .78); detail.box(trim, hx, ground + 4.28, hy, .035, .035, 1.62, yaw, .4); }
    }
    for (let i = 0; i < bays && piece.variant !== 'gallery'; i++) {
      const u0 = i * bay + .35, u1 = (i + 1) * bay - .35, width = u1 - u0, mid = (u0 + u1) / 2;
      if (width < .8) continue;
      put(detail, trim, mid, -recess + .08, ground + .25, width, .5, .12);
      put(detail, glass, mid, -recess + .05, ground + 1.95, width, 2.9, .03);
      // A warm interior just behind the glass, in front of the core wall.
      put(detail, m('shop-interior'), mid, -recess + .015, ground + 1.95, width, 2.9, .01);
      // Display shelves and pendant lights read as a furnished shop through the glass.
      for (const level of [1.05, 1.85]) put(detail, m('metal-brass'), mid, -recess + .03, ground + level, width * .78, .1, .01);
      for (let k = 0, lights = Math.max(1, Math.floor(width / 1.8)); k < lights; k++) put(detail, m('lamp-glow'), u0 + width * (k + .5) / lights, -recess + .03, ground + 3.0, .32, .14, .01);
      for (const t of [.33, .66]) put(detail, bronze, u0 + width * t, -recess + .08, ground + 1.95, .05, 2.9, .06);
      put(detail, bronze, mid, -recess + .08, ground + 2.75, width, .05, .06);
      if (i === Math.floor(bays / 2)) put(detail, bronze, mid, -recess + .09, ground + 1.2, 1.0, 2.35, .05);
      put(batch, trim, mid, -.04, ground + 3.95, width + .7, .7, .2);
      if (piece.variant === 'canopy') {
        put(detail, accent, mid, 1.0, ground + 3.55, width + .6, .1, 2.0);
        // Rounded nose along the canopy's front edge (it ends 2.0 m out).
        if (forms) round(accent, mid, 2.0, ground + 3.55, .09, width + .6, 'along');
        put(detail, bronze, mid - width / 3, .9, ground + 3.95, .04, .8, .04); put(detail, bronze, mid + width / 3, .9, ground + 3.95, .04, .8, .04);
      } else if (piece.variant === 'awning') {
        const [x, y] = at(mid, .7);
        detail.box(m(piece.awning), x, ground + 3.25, y, width + .2, .05, 1.55, yaw, .45);
        put(detail, m(piece.awning), mid, 1.38, ground + 2.92, width + .2, .28, .04);
      }
    }
    // One sign per shop on its primary face; garden-court adds a lettered blade.
    if (piece.sign && face === piece.faces?.[0]) {
      const width = Math.min(f.length - 1, 7), [x, y] = at(f.length / 2, .09);
      // Above a canopy (3.6 m) and within the 3.6–4.3 m sign band.
      const signHeight = Math.min(.6, width / 8), signUp = ground + (piece.variant === 'gallery' ? 4.3 : 3.98);
      signs.push({ name: piece.sign, palette: style.signPalette, width, height: signHeight, east: x, up: signUp, north: y, yaw });
      if (forms) {
        // Capsule sign plate: an ivory band with round ends, just behind the lettering.
        const plate = signHeight + .16, ends = width / 2 + .05;
        put(detail, m('trim-ivory'), f.length / 2, .06, signUp, width + .1, plate, .04);
        for (const side of [-1, 1]) round(m('trim-ivory'), f.length / 2 + side * ends, .06, signUp, plate / 2, .04, 'out');
      }
      if (style.signage === 'blade') {
        // A plate on a bracket, standing out from the facade, lettered top to bottom on both faces.
        put(detail, bronze, .8, .3, ground + 4.3, .05, .05, .6);
        put(detail, accent, .8, .4, ground + 2.95, .06, 2.6, .44);
        for (const side of [1, -1]) { const [bx, by] = at(.8 + side * .035, .4); signs.push({ name: piece.sign, palette: style.signPalette, width: 2.4, height: .3, east: bx, up: ground + 2.95, north: by, yaw: yaw + side * Math.PI / 2, roll: side * Math.PI / 2 }); }
      }
    }
  }
  if (roofKind === 'garden') renderGardenRoof([w, s, e, n], bodyTop, batch, detail, m, accent, wall);
  if (crown) renderCrown(piece, [w, s, e, n], bodyTop, top, batch, detail, m, accent, trim, wall);
  if (roofKind === 'sawtooth') {
    const span = n - s, count = Math.max(2, Math.floor((e - w) / 4));
    for (let i = 0; i < count; i++) { const x = w + (i + .5) * (e - w) / count; batch.box(m('roof-membrane'), x, top + .9, (s + n) / 2, (e - w) / count * .9, .12, span - .8, 0, .0); batch.box(m('glass'), x + (e - w) / count * .3, top + .9, (s + n) / 2, .06, 1.4, span - .8); }
  }
}

function renderFurniture(piece, batch, m, groundAt) {
  const [x, y] = piece.at ?? [(piece.rect[0] + piece.rect[2]) / 2, (piece.rect[1] + piece.rect[3]) / 2], g = groundAt(x, y), yaw = piece.yaw ?? 0;
  const local = (u, v) => [x + Math.cos(yaw) * u - Math.sin(yaw) * v, y + Math.sin(yaw) * u + Math.cos(yaw) * v];
  const part = (material, u, v, up, along, height, across) => { const [px, py] = local(u, v); batch.box(material, px, up, py, along, height, across, yaw); };
  switch (piece.piece) {
    case 'furniture/bench':
      // Honed limestone plinths carrying a timber seat and a slatted back on bronze stays.
      for (let i = 0; i < 5; i++) part(m('wood-bench'), 0, -.22 + i * .1, g + .45, 1.85, .045, .085);
      for (let i = 0; i < 3; i++) part(m('wood-bench'), 0, .3, g + .6 + i * .11, 1.85, .075, .035);
      for (const u of [-.72, .72]) { part(m('limestone'), u, 0, g + .21, .3, .42, .56); part(m('bronze-satin'), u, .29, g + .66, .04, .42, .04); }
      break;
    case 'furniture/lamp': {
      // The District's mid-century orbital lamp (street-furniture.js): a deep-teal
      // column, a porcelain disc, an opal globe and a brass orbital ring.
      const place = (material, geometry, up) => batch.place(material, geometry, x, up, y);
      // Segment counts are sized for street distance; each lamp's geometry is merged per block.
      place(m('lamp-teal'), new THREE.CylinderGeometry(.17, .17, .24, 10), g + .12);
      place(m('lamp-teal'), new THREE.CylinderGeometry(.05, .06, 4.9, 8), g + 2.6);
      place(m('metal-brass'), new THREE.CylinderGeometry(.075, .075, .065, 8), g + 4.7);
      place(m('porcelain'), new THREE.SphereGeometry(1, 14, 6).scale(.61, .11, .61), g + 5.08);
      place(m('opal-glow'), new THREE.SphereGeometry(1, 10, 6).scale(.28, .19, .28), g + 4.93);
      place(m('metal-brass'), new THREE.TorusGeometry(.58, .023, 4, 28).rotateX(Math.PI / 2), g + 5.02);
      break;
    }
    case 'furniture/bollard':
      part(m('metal-bronze'), 0, 0, g + .45, .2, .9, .2); part(m('metal-brass'), 0, 0, g + .82, .23, .06, .23);
      break;
    case 'furniture/bike-rack':
      for (const u of [-.6, 0, .6]) { part(m('metal-brass'), u, 0, g + .4, .05, .8, .05); part(m('metal-brass'), u, 0, g + .78, .05, .05, .32); }
      part(m('metal-brass'), 0, 0, g + .05, 1.6, .05, .05);
      break;
    case 'furniture/cafe-set': {
      // A round marble bistro table on a bronze pedestal, with four timber chairs facing it.
      batch.place(m('porcelain'), new THREE.CylinderGeometry(.38, .38, .03, 18), x, g + .75, y);
      batch.place(m('bronze-satin'), new THREE.CylinderGeometry(.03, .03, .72, 8), x, g + .37, y);
      batch.place(m('bronze-satin'), new THREE.CylinderGeometry(.2, .22, .03, 12), x, g + .015, y);
      for (const [u, v] of [[.64, 0], [-.64, 0], [0, .64], [0, -.64]]) {
        const out = Math.hypot(u, v), du = u / out, dv = v / out, chairYaw = Math.atan2(dv, du);
        const [cx, cy] = local(u, v), [bx, by] = local(u + du * .2, v + dv * .2);
        batch.box(m('wood-bench'), cx, g + .46, cy, .42, .045, .42, yaw + chairYaw);
        batch.box(m('wood-bench'), bx, g + .7, by, .04, .34, .4, yaw + chairYaw);
        for (const [a, b] of [[.18, .18], [.18, -.18], [-.18, .18], [-.18, -.18]]) { const [lx, ly] = local(u + a, v + b); batch.box(m('steel-black'), lx, g + .22, ly, .025, .44, .025, yaw); }
      }
      break;
    }
    case 'furniture/railing':
      batch.box(m('metal-bronze'), x, g + 1.02, y, piece.rect[2] - piece.rect[0], .06, piece.rect[3] - piece.rect[1]);
      for (let v = piece.rect[1]; v <= piece.rect[3]; v += 1.6) batch.box(m('metal-bronze'), x, g + .5, v, .05, 1.0, .05);
      batch.box(m('metal-bronze'), x, g + .55, y, .03, .03, piece.rect[3] - piece.rect[1]);
      break;
    case 'street/crosswalk': {
      // Bars run in the walking direction, repeated across the lane.
      const [w, s, e, n] = piece.rect, alongX = piece.across === 'x';
      if (alongX) for (let v = s + .45; v < n - .3; v += 1) batch.box(m('trim-ivory'), (w + e) / 2, groundAt((w + e) / 2, v) + .012, v + .25, e - w - .4, .02, .5);
      else for (let u = w + .45; u < e - .3; u += 1) batch.box(m('trim-ivory'), u + .25, groundAt(u, (s + n) / 2) + .012, (s + n) / 2, .5, .02, n - s - .4);
      break;
    }
    case 'street/crossing-table': {
      const [w, s, e, n] = piece.rect;
      for (let v = s + .5; v < n - .3; v += 1) batch.box(m('trim-ivory'), (w + e) / 2, groundAt((w + e) / 2, v) + .012, v + .25, e - w - .4, .02, .5);
      break;
    }
  }
}

// A market stall faces −v (its counter side), like a bench. Everything merges into
// the shared batch; the stall's name joins the sign atlas on a board above the roof.
function renderMarketStall(piece, batch, m, groundAt, signs) {
  const [x, y] = piece.at, g = groundAt(x, y), yaw = piece.yaw ?? 0, canvas = m(piece.awning ?? 'canvas-teal');
  const local = (u, v) => [x + Math.cos(yaw) * u - Math.sin(yaw) * v, y + Math.sin(yaw) * u + Math.cos(yaw) * v];
  const part = (material, u, v, up, along, height, across, pitch = 0) => { const [px, py] = local(u, v); batch.box(material, px, up, py, along, height, across, yaw, pitch); };
  // Counter and back table, with crates of produce on both.
  part(m('wood-bench'), 0, -.78, g + .47, 3.3, .94, .6); part(m('trim-ivory'), 0, -.8, g + .96, 3.42, .05, .72);
  part(m('wood-bench'), 0, .78, g + .4, 3.2, .8, .5);
  const produce = [m('produce-red'), m('canvas-apricot'), m('produce-green'), m('metal-brass'), m('produce-red')];
  produce.forEach((material, i) => {
    const u = -1.32 + i * .66;
    part(m('wood-bench'), u, -.8, g + 1.04, .56, .12, .5); part(material, u, -.8, g + 1.13, .48, .08, .42);
    part(m('wood-bench'), u, .78, g + .86, .56, .12, .44); part(produce[(i + 2) % produce.length], u, .78, g + .95, .48, .08, .36);
  });
  // Posts and a striped canvas roof falling toward the customer, with a valance.
  for (const [u, v] of [[-1.72, -1.12], [1.72, -1.12], [-1.72, 1.12], [1.72, 1.12]]) part(m('metal-bronze'), u, v, g + 1.3, .07, 2.6, .07);
  for (let i = 0; i < 6; i++) {
    const u = -1.5 + i * .6, stripe = i % 2 ? m('trim-ivory') : canvas;
    part(stripe, u, 0, g + 2.66, .6, .04, 2.75, -.14);
    part(stripe, u, -1.37, g + 2.32, .6, .26, .03);
  }
  if (piece.sign) {
    // The lettering sits just proud of the board's customer face.
    const [bx, by] = local(0, -1.21);
    part(m('metal-bronze'), 0, -1.17, g + 3.05, 2.9, .44, .05);
    signs.push({ name: piece.sign, width: 2.76, height: .34, east: bx, up: g + 3.05, north: by, yaw });
  }
}

// The post and cap merge into the shared batch; only the glass and halo switch.
function renderLantern(piece, m, groundAt, batch) {
  const [x, y] = piece.at, g = groundAt(x, y), group = new THREE.Group(); group.name = piece.id;
  const glow = m('lantern-glass').clone(); glow.name = `city-kit/lantern-glass:${piece.id}`;
  batch.place(m('metal-bronze'), new THREE.CylinderGeometry(.16, .22, .3, 12), x, g + .15, y);
  batch.place(m('metal-bronze'), new THREE.CylinderGeometry(.06, .07, 1.4, 10), x, g + 1.0, y);
  batch.place(m('metal-brass'), new THREE.CylinderGeometry(.24, .2, .07, 12), x, g + 1.72, y);
  batch.place(m('metal-brass'), new THREE.ConeGeometry(.28, .22, 12), x, g + 2.25, y);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .38, 12), glow); lamp.position.set(x, g + 1.95, -y); group.add(lamp);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: haloTexture() }));
  halo.scale.set(2.2, 2.2, 1); halo.position.set(x, g + 1.95, -y); group.add(halo);
  group.userData.setLit = lit => { glow.emissiveIntensity = lit ? 2.4 : 0; glow.color.set(lit ? '#fff1d0' : '#d9d2c1'); halo.material.opacity = lit ? .55 : 0; };
  group.userData.dispose = () => { glow.dispose(); halo.material.dispose(); group.traverse(item => { if (item.isMesh) item.geometry.dispose(); }); };
  return group;
}

let halo = null;
function haloTexture() {
  if (halo || headless) return halo;
  const canvas = canvas2d(64, 64);
  const context = canvas.getContext('2d'), gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.35, 'rgba(255,214,150,.45)'); gradient.addColorStop(1, 'rgba(255,200,120,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(canvas); return halo;
}

// The Neighborhood Green's ribbon: one looped band crossing itself, on a pearl stone plinth
// with a rose-gold band and uplights. Its loop tops out under KIT_PIECES['landmark/ribbon'].height.
function renderRibbon(piece, m, ground, batch) {
  const [x, y] = piece.at, yaw = piece.yaw ?? 0;
  batch.place(m('stone-pearl'), new THREE.BoxGeometry(3.4, 1.1, 3.4), x, ground + .55, y, [0, yaw, 0]);
  batch.place(m('rose-gold'), new THREE.BoxGeometry(3.46, .08, 3.46), x, ground + .9, y, [0, yaw, 0]);
  batch.place(m('steel-black'), new THREE.BoxGeometry(3.6, .1, 3.6), x, ground + .05, y, [0, yaw, 0]);
  // The tails cross at 3.4 m, pass behind each other, and meet again at the loop's top.
  const points = [[-1.5, 1.1, .3], [-.9, 2.2, .3], [0, 3.4, .32], [.95, 4.7, .1], [1.2, 6.0, 0], [.6, 7.3, -.05], [0, 7.65, 0],
    [-.6, 7.3, .05], [-1.2, 6.0, 0], [-.95, 4.7, -.1], [0, 3.4, -.32], [.9, 2.2, -.3], [1.5, 1.1, -.3]].map(([a, b, c]) => new THREE.Vector3(a, b, c));
  const ribbon = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', .5), 72, .34, 6, false);
  ribbon.scale(1, 1, .38);
  batch.place(m('ribbon-rose'), ribbon, x, ground + .02, y, [0, yaw, 0]);
  for (const [dx, dy] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) {
    const ux = x + dx * Math.cos(yaw) - dy * Math.sin(yaw), uy = y + dx * Math.sin(yaw) + dy * Math.cos(yaw);
    batch.place(m('neon-rose'), new THREE.CylinderGeometry(.12, .14, .06, 12), ux, ground + 1.13, uy);
  }
}

// Structure merges into the shared batch; the lettered band, beacon and crown
// glow are the tower's own meshes.
function renderWaterTower(piece, m, ground, batch) {
  const group = new THREE.Group(); group.name = piece.id;
  const [x, y] = piece.at, teal = m('trim-teal'), ivory = m('trim-ivory'), brass = m('metal-brass'), bronze = m('metal-bronze');
  const add = (geometry, material, px, up, py, rotation = [0, 0, 0], order = 'XYZ') => batch.place(material, geometry, px, ground + up, py, rotation, order);
  const own = (geometry, material, px, up, py) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(px, ground + up, -py); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
  const legs = [[-3, -3], [3, -3], [3, 3], [-3, 3]];
  for (const [dx, dy] of legs) {
    add(new THREE.CylinderGeometry(.22, .32, 16.4, 10), teal, x + dx * .93, 8.2, y + dy * .93, [dy * .012, 0, -dx * .012]);
    add(new THREE.CylinderGeometry(.42, .5, .5, 10), ivory, x + dx, .25, y + dy);
  }
  // Cross bracing between legs at two levels.
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = legs[i], [bx, by] = legs[(i + 1) % 4], mx = x + (ax + bx) / 2 * .95, my = y + (ay + by) / 2 * .95, yaw = Math.atan2(by - ay, bx - ax);
    for (const level of [5.5, 11]) {
      add(new THREE.BoxGeometry(6.1, .1, .1), bronze, mx, level, my, [0, yaw, 0]);
      for (const sign of [1, -1]) add(new THREE.BoxGeometry(7.4, .06, .06), bronze, mx, level + 2.75, my, [0, yaw, sign * .72], 'YXZ');
    }
  }
  add(new THREE.CylinderGeometry(4.6, 4.6, .18, 40), ivory, x, 16.4, y);
  add(new THREE.TorusGeometry(4.55, .035, 6, 48), brass, x, 17.45, y, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; add(new THREE.BoxGeometry(.04, 1.05, .04), brass, x + Math.cos(a) * 4.55, 16.95, y + Math.sin(a) * 4.55); }
  add(new THREE.CylinderGeometry(3.9, 3.9, 5.4, 40), teal, x, 19.4, y);
  // A lettered ivory band, readable from every approach.
  const canvas = canvas2d(2048, 128);
  let texture = null;
  if (canvas) {
    const context = canvas.getContext('2d'); context.fillStyle = '#f5eee0'; context.fillRect(0, 0, 2048, 128);
    context.fillStyle = '#1f454a'; context.font = '700 84px Georgia, serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    const words = piece.lettering ?? 'BAYOU MARKET'; context.fillText(`★ ${words} ★`, 512, 68); context.fillText(`★ ${words} ★`, 1536, 68);
    texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; texture.userData.owned = true;
  }
  const band = new THREE.MeshStandardMaterial({ map: texture, color: texture ? '#ffffff' : '#f5eee0', roughness: .7 }); band.name = 'city-kit/tower-lettering';
  own(new THREE.CylinderGeometry(3.94, 3.94, 1.3, 48, 1, true), band, x, 20.1, y);
  add(new THREE.ConeGeometry(4.25, 2.9, 40), ivory, x, 23.55, y);
  add(new THREE.CylinderGeometry(4.3, 4.3, .14, 40), brass, x, 22.12, y);
  const beacon = m('lantern-glass').clone(); beacon.name = 'city-kit/tower-beacon';
  own(new THREE.CylinderGeometry(.42, .42, .8, 16), beacon, x, 25.5, y);
  add(new THREE.ConeGeometry(.6, .7, 16), brass, x, 26.25, y);
  add(new THREE.SphereGeometry(.16, 12, 8), brass, x, 26.75, y);
  const crown = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: haloTexture() }));
  crown.scale.set(9, 9, 1); crown.position.set(x, ground + 25.5, -y); group.add(crown);
  group.userData.setLit = lit => { beacon.emissiveIntensity = lit ? 4 : 0; beacon.color.set(lit ? '#fff1d0' : '#d9d2c1'); crown.material.opacity = lit ? .8 : 0; };
  group.userData.dispose = () => { texture?.dispose(); band.dispose(); beacon.dispose(); crown.material.dispose(); group.traverse(item => { if (item.isMesh) item.geometry.dispose(); }); };
  return group;
}

/**
 * The plan's street trees and lane planting, as placements for buildMatureTrees and
 * buildPlanterPlanting. The kit draws its own; a caller that streams several
 * neighborhoods (bayou-heights.js) draws theirs once, with `landscape: false`.
 */
export function cityKitLandscape(plan, { groundAt, ground }) {
  const trees = [], planters = [];
  for (const piece of plan.pieces) {
    if (piece.piece === 'landscape/hedge') {
      // Planted along the length of the limestone planter wall.
      const [w, s, e, n] = piece.rect;
      for (let x = w + .9; x < e - .5; x += 1.6) planters.push([x, ground - .05, -(s + n) / 2, 0]);
    }
    else if (piece.piece === 'landscape/planter') {
      const [w, s, e, n] = piece.rect;
      // Planting fills the bed in rows; a narrow planter gets one row down its middle.
      const rows = Math.max(1, Math.floor((n - s) / 1.4));
      for (let row = 0; row < rows; row++) for (let x = w + .7; x < e - .3; x += 1.4) planters.push([x, ground - .12, -(s + (n - s) * (row + .5) / rows), (row % 2) * Math.PI]);
    }
    else if (piece.piece === 'landscape/bayou') {
      const [, s, e, n] = piece.rect;
      for (let v = s + 3; v < n; v += 7.5) trees.push({ position: [e - 3, ground + .2, -v], height: 10 + (Math.abs(Math.sin(v)) * 3), radius: 4.2, yaw: v });
    }
    else if (piece.piece === 'landscape/street-tree') {
      const [x, y] = piece.at;
      trees.push({ position: [x, groundAt(x, y), -y], height: piece.height, radius: piece.radius, yaw: piece.yaw });
    }
  }
  return { trees, planters };
}

// Planting draws in 12 m and 24 m batches (spatial-instances.js, procedural-plants.js); only
// the fine grass flower stems span a whole plan, and they stay drawn with the planting.
const PLANTING_BATCH_RADIUS = 30;
/** Hides planting batches (buildPlanterPlanting) farther than `metres`, and any `shown` rejects. */
export function cullPlanting(planting, position, metres, shown = () => true) {
  for (const mesh of planting.children) if (mesh.boundingSphere?.radius < PLANTING_BATCH_RADIUS)
    mesh.visible = shown(mesh) && position.distanceTo(mesh.boundingSphere.center) - mesh.boundingSphere.radius < metres;
}

/** Dispose tree and planting groups (buildMatureTrees, buildPlanterPlanting). */
export function disposeLandscape(groups) {
  // Landscape meshes own cloned buffers/materials and instance storage. Their
  // texture maps belong to the shared template cache and must survive eviction.
  const landscapeGeometries = new Set(), landscapeMaterials = new Set();
  for (const landscape of groups.filter(Boolean)) {
    landscape.userData.cancelLandscapeLoad?.();
    landscape.traverse(item => {
      if (item.geometry) landscapeGeometries.add(item.geometry);
      for (const material of [item.material].flat().filter(Boolean)) landscapeMaterials.add(material);
      if (item.isInstancedMesh) item.dispose();
    });
    landscape.clear();
  }
  for (const geometry of landscapeGeometries) geometry.dispose();
  for (const material of landscapeMaterials) material.dispose();
}

/**
 * Build the plan's scene. `groundAt(east, north)` returns walking ground height;
 * `ground` is the level site height for shells and edges. With `landscape: false`
 * the caller draws the plan's trees and planting (cityKitLandscape). Planting draws at
 * every distance unless `plantingMetres` limits it. `finish` (catalog.js KIT_FINISHES)
 * recolours material slots only; the default `classic` renders exactly as before.
 */
export function buildCityKit(plan, { groundAt, ground, landscape = true, plantingMetres = Infinity, finish = 'classic' }) {
  const group = new THREE.Group(); group.name = `City kit: ${plan.id}`; group.userData.finish = finish;
  const materials = createMaterials(finish), m = materials.get, disposables = [], forms = Boolean(kitFinish(finish).forms);
  const blocks = new Map(), blockFor = piece => {
    // Context massing shares one level-of-detail group; blocks get their own.
    const key = piece.piece === 'building/context' ? 'context' : piece.id.split('/')[1];
    if (!blocks.has(key)) { const massing = createBatch(), detail = createBatch(), center = new THREE.Vector3(), count = { n: 0 }; blocks.set(key, { massing, detail, center, count }); }
    const block = blocks.get(key), [x, y] = piece.at ?? [(piece.rect[0] + piece.rect[2]) / 2, (piece.rect[1] + piece.rect[3]) / 2];
    block.center.add(new THREE.Vector3(x, ground, -y)); block.count.n++;
    return block;
  };
  const flat = createBatch(), signs = [], lanterns = new Map(), { trees, planters } = cityKitLandscape(plan, { groundAt, ground });
  // Ground: draped paving and lawns; overlays use polygon offset instead of height.
  const overlay = name => { const material = m(name).clone(); material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2; material.name = `${m(name).name}:overlay`; disposables.push(material); return material; };
  const groundPiece = { 'street/shared-lane': ['lane-brick', 0], 'street/intersection': ['lane-brick', 0], 'street/crosswalk': ['lane-brick', 0], 'street/sidewalk': ['paver-sidewalk', 0], 'street/court': ['plaza-stone', 0], 'landscape/lawn': ['lawn', 1], 'street/flush-curb': ['curb-granite', 2], 'street/band': ['porcelain', 2], 'street/channel': ['steel-black', 2], 'landscape/tree-pit': ['porcelain', 3] };
  // Tree pits match the District's (street-furniture.js): a cast-iron grate in a pale stone surround.
  const grateTexture = treeGrateTexture(); grateTexture.userData.owned = true;
  const grate = new THREE.MeshStandardMaterial({ map: grateTexture, roughness: .55, metalness: .6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  grate.name = 'city-kit/tree-grate'; disposables.push(grate);
  const overlays = new Map();
  const clipStreet = plan.pieces.find(p => p.piece === 'street/court' && p.id.endsWith('/paving'))?.rect;
  for (const piece of plan.pieces) {
    const spec = groundPiece[piece.piece];
    if (!spec) continue;
    let rect = piece.rect;
    // Street paving stops where the plaza paving begins; neither overlaps the other.
    if (clipStreet && piece.piece.startsWith('street/') && !piece.id.endsWith('/paving') && rect[2] > clipStreet[0] && rect[0] < clipStreet[0]) rect = [rect[0], rect[1], clipStreet[0], rect[3]];
    const name = piece.material ?? spec[0], layer = spec[1], material = layer ? (overlays.get(name) ?? overlays.set(name, overlay(name)).get(name)) : m(name);
    flat.add(material, drape(rect, groundAt, layer ? .004 * layer : 0, layer ? 4 : 2));
    if (piece.piece === 'landscape/tree-pit') {
      // The grate's texture spans the pit once, its round opening on the trunk.
      const [w, s, e, n] = rect, inner = [w + .12, s + .12, e - .12, n - .12], plate = drape(inner, groundAt, .02, 4), uv = plate.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - inner[0]) / (inner[2] - inner[0]), (uv.getY(i) - inner[1]) / (inner[3] - inner[1]));
      flat.add(grate, plate);
    }
  }
  // A plinth under the whole site reads as ground behind the blocks and as a
  // bayou retaining wall at the east edge.
  const [sw, ss, se, sn] = plan.site;
  flat.box(m('curb-granite'), (sw + se) / 2, ground - 1.9, (ss + sn) / 2, se - sw, 3.4, sn - ss + 30);
  for (const piece of plan.pieces) {
    if (piece.piece === 'building/shell') { const block = blockFor(piece); renderShell(piece, block.massing, block.detail, m, ground, signs, forms); }
    else if (piece.piece === 'building/context') {
      const [w, s, e, n] = piece.rect, block = blockFor(piece);
      block.massing.box(m(piece.wall ?? 'stucco-ivory'), (w + e) / 2, ground - 1.5 + (piece.height + 1.5) / 2, (s + n) / 2, e - w, piece.height + 1.5, n - s);
      block.massing.box(m('trim-ivory'), (w + e) / 2, ground + piece.height + .2, (s + n) / 2, e - w + .2, .4, n - s + .2);
      for (let level = ground + 1; level < ground + piece.height - 2; level += 3.3) block.detail.box(m('glass-dark'), (w + e) / 2, level + 1.3, (s + n) / 2, e - w + .04, 1.6, n - s + .04);
    }
    else if (piece.piece === 'landscape/hedge') {
      // A honed limestone planter wall under a porcelain cap, planted along its length.
      const [w, s, e, n] = piece.rect;
      flat.box(m('limestone'), (w + e) / 2, ground + .275, (s + n) / 2, e - w, .55, n - s);
      flat.box(m('porcelain'), (w + e) / 2, ground + .575, (s + n) / 2, e - w + .08, .05, n - s + .08);
    }
    else if (piece.piece === 'landscape/lawn') {
      // Black steel edging keeps the lawn's line crisp against the paving.
      const [w, s, e, n] = piece.rect, edge = (x0, y0, x1, y1) => flat.box(m('steel-black'), (x0 + x1) / 2, groundAt((x0 + x1) / 2, (y0 + y1) / 2) + .012, (y0 + y1) / 2, Math.max(.035, x1 - x0), .03, Math.max(.035, y1 - y0));
      edge(w, s, e, s); edge(w, n, e, n); edge(w, s, w, n); edge(e, s, e, n);
    }
    else if (piece.piece === 'landscape/planter') {
      // The District's planter: a porcelain body on a deep-teal base, a brass rim and dark mulch.
      const [w, s, e, n] = piece.rect;
      flat.box(m('lamp-teal'), (w + e) / 2, ground + .06, (s + n) / 2, e - w - .12, .12, n - s - .12);
      flat.box(m('porcelain'), (w + e) / 2, ground + .36, (s + n) / 2, e - w, .48, n - s);
      flat.box(m('metal-brass'), (w + e) / 2, ground + .6, (s + n) / 2, e - w + .02, .025, n - s + .02);
      flat.box(m('soil'), (w + e) / 2, ground + .608, (s + n) / 2, e - w - .1, .012, n - s - .1);
    }
    else if (piece.piece === 'landscape/bayou') {
      const [w, s, e, n] = piece.rect, water = new THREE.MeshPhysicalMaterial({ color: '#3e5f55', roughness: .12, metalness: .1, clearcoat: 1, envMapIntensity: 1.2 });
      water.name = 'city-kit/bayou'; disposables.push(water);
      flat.box(m('lawn'), w + 2.4, ground - 1.5, (s + n) / 2, 4.8, .3, n - s, 0, 0);
      flat.add(water, drape([w + 3, s, e - 6, n], () => ground - 2.6, 0, 6));
      flat.box(m('lawn'), e - 3, ground - 1.2, (s + n) / 2, 6, 2.8, n - s);
    }
    else if (piece.piece === 'furniture/lantern') lanterns.set(piece.id, renderLantern(piece, m, groundAt, flat));
    else if (piece.piece === 'furniture/market-stall') renderMarketStall(piece, flat, m, groundAt, signs);
    else if (piece.piece === 'landmark/ribbon') renderRibbon(piece, m, groundAt(...piece.at), flat);
    else if (piece.piece === 'landmark/water-tower') { const tower = renderWaterTower(piece, m, ground, flat); group.add(tower); group.userData.tower = tower; }
    else if (piece.piece.startsWith('furniture/') || piece.piece === 'street/crossing-table' || piece.piece === 'street/crosswalk') renderFurniture(piece, flat, m, groundAt);
  }
  const geometries = [...flat.build(group, 'ground and street furniture')];
  const levels = [];
  for (const [key, block] of blocks) {
    const massing = new THREE.Group(), detail = new THREE.Group(); massing.name = `${key} massing`; detail.name = `${key} detail`;
    geometries.push(...block.massing.build(massing, key), ...block.detail.build(detail, key));
    group.add(massing, detail); levels.push({ center: block.center.divideScalar(block.count.n), detail });
  }
  // Shop signs share one atlas texture and one material.
  const atlas = signAtlas(signs.map(signKey)), signMaterial = new THREE.MeshStandardMaterial({ map: atlas.texture, color: atlas.texture ? '#ffffff' : '#1f454a', roughness: .55 }); signMaterial.name = 'city-kit/signs';
  const signBatch = createBatch();
  for (const sign of signs) {
    const quad = signQuad(atlas, signKey(sign), sign.width, sign.height);
    if (sign.roll) quad.rotateZ(sign.roll);
    signBatch.mesh(signMaterial, quad, sign.east, sign.up, sign.north, sign.yaw);
  }
  geometries.push(...signBatch.build(group, 'shop signs', { shadows: false }));
  for (const lantern of lanterns.values()) group.add(lantern);
  // Tree and planting models stream from /assets; headless builds count placements only.
  const drawn = landscape && !headless;
  const treeGroup = drawn ? buildMatureTrees({}, trees) : Object.assign(new THREE.Group(), { userData: { shadowProxies: [] } });
  treeGroup.name = `${plan.id} trees`; treeGroup.userData.placements = trees.length; group.add(treeGroup);
  const planting = planters.length && drawn ? buildPlanterPlanting(planters) : null; if (planting) group.add(planting);
  group.userData.ready = Promise.all([treeGroup.userData.ready, planting?.userData.ready]);
  group.userData.plantingModules = planters.length;
  group.userData.shadowProxies = treeGroup.userData.shadowProxies;
  group.userData.lanterns = lanterns;
  group.userData.stats = () => { let meshes = 0, triangles = 0; group.traverse(item => { if (item.isMesh && item.visible) { meshes++; triangles += (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3 * (item.count ?? 1); } }); return { meshes, triangles: Math.round(triangles), materials: materials.made.size + disposables.length }; };
  group.userData.plantingMetres = plantingMetres;
  group.userData.update = position => {
    treeGroup.userData.update?.(position);
    for (const level of levels) level.detail.visible = position.distanceTo(level.center) < KIT_CONVENTIONS.lod.detailMetres;
    if (planting && plantingMetres < Infinity) cullPlanting(planting, position, plantingMetres);
  };
  group.userData.setLanterns = (lit, complete) => {
    for (const [id, lantern] of lanterns) lantern.userData.setLit(lit.has(id));
    group.userData.tower?.userData.setLit(Boolean(complete));
  };
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return; disposed = true;
    disposeLandscape([treeGroup, planting]);
    treeGroup.userData.shadowProxies.length = 0;
    for (const geometry of geometries) geometry.dispose();
    for (const lantern of lanterns.values()) lantern.userData.dispose();
    group.userData.tower?.userData.dispose();
    atlas.texture?.dispose(); signMaterial.dispose(); grateTexture.dispose();
    // Shared PBR textures stay cached in materials.js; only the materials go.
    for (const material of [...disposables, ...materials.made.values()]) material.dispose();
    group.clear();
  };
  return group;
}
