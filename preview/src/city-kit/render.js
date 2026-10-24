import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT_CONVENTIONS, KIT_MATERIALS, KIT_STYLES } from '../../../shared/city-kit/catalog.js';
import { physicalSurface, paverSurface } from '../materials.js';
import { buildMatureTrees, buildPlanterPlanting } from '../landscape-models.js';

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

function createMaterials() {
  const made = new Map();
  const get = name => {
    if (made.has(name)) return made.get(name);
    const spec = KIT_MATERIALS[name] ?? RENDER_MATERIALS[name] ?? { color: '#888888' };
    let material;
    if (spec.surface === 'district-paver') material = paverSurface();
    else if (spec.surface) material = physicalSurface(spec.surface, { tileSize: spec.tile ?? 4, instanced: false, variation: .08, color: new THREE.Color(spec.color ?? '#ffffff'),
      ...(spec.textureContrast ? { textureContrast: spec.textureContrast, normalScale: new THREE.Vector2(.3, .3) } : {}) });
    else if (spec.reflective) material = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness, envMapIntensity: 1.6, clearcoat: .6, clearcoatRoughness: .08 });
    else if (spec.glass) material = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness, transparent: true, opacity: .26, envMapIntensity: .7, clearcoat: .6, clearcoatRoughness: .06, depthWrite: false });
    else material = new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness ?? .8, metalness: spec.metalness ?? 0,
      ...(spec.emissive ? { emissive: new THREE.Color(spec.emissive), emissiveIntensity: spec.emissiveIntensity ?? 1 } : {}) });
    material.name = `city-kit/${name}`;
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

function signAtlas(names) {
  const unique = [...new Set(names.filter(Boolean))], rows = Math.max(1, unique.length), uv = new Map();
  unique.forEach((name, row) => uv.set(name, [row / rows, (row + 1) / rows]));
  const canvas = canvas2d(1024, 128 * rows);
  if (!canvas) return { texture: null, uv };
  const context = canvas.getContext('2d');
  unique.forEach((name, row) => {
    context.fillStyle = '#1f454a'; context.fillRect(0, row * 128, 1024, 128);
    context.strokeStyle = '#bd9e66'; context.lineWidth = 6; context.strokeRect(10, row * 128 + 10, 1004, 108);
    context.fillStyle = '#f5eee0'; context.textAlign = 'center'; context.textBaseline = 'middle';
    let size = 74; context.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    while (context.measureText(name.toUpperCase()).width > 940 && size > 30) { size -= 4; context.font = `600 ${size}px Georgia, 'Times New Roman', serif`; }
    context.fillText(name.toUpperCase(), 512, row * 128 + 66);
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
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

function renderShell(piece, batch, detail, m, ground, signs) {
  const [w, s, e, n] = piece.rect, style = KIT_STYLES[piece.style] ?? KIT_STYLES['market-row'];
  const wall = m(piece.wall), trim = m(piece.trim), accent = m(style.accent), glass = m('glass'), bronze = m('metal-bronze');
  const top = ground + piece.height, bottom = ground - .4;
  const faced = new Set(piece.faces ?? []);
  const loggia = piece.variant === 'loggia', recess = loggia ? 2.2 : piece.variant === 'recessed' ? .9 : .45, inset = .25;
  // Ground-floor core sits behind the storefront recess; upper storeys sit behind the window reveal.
  const cut = (amount) => [w + (faced.has('west') ? amount : 0), s + (faced.has('south') ? amount : 0), e - (faced.has('east') ? amount : 0), n - (faced.has('north') ? amount : 0)];
  const core = cut(recess), upper = cut(inset), groundTop = ground + G;
  const solid = (r, y0, y1, material) => batch.box(material, (r[0] + r[2]) / 2, (y0 + y1) / 2, (r[1] + r[3]) / 2, r[2] - r[0], y1 - y0, r[3] - r[1]);
  solid(core, bottom, groundTop, wall);
  if (piece.storeys > 1) solid(upper, groundTop, top, wall);
  else solid(cut(.02), groundTop - .02, top, wall);
  // Roof membrane inside the parapet.
  solid([w + .24, s + .24, e - .24, n - .24], top - .02, top + .04, m('roof-membrane'));
  // Floor plate between storefront and upper facade, and the loggia soffit.
  solid([w, s, e, n], groundTop - .02, groundTop + .28, trim);
  const roofKind = piece.roof;
  for (const face of ['north', 'south', 'east', 'west']) {
    const f = faceFrame(piece.rect, face), at = (u, o) => [f.origin[0] + f.along[0] * u + f.out[0] * o, f.origin[1] + f.along[1] * u + f.out[1] * o];
    const yaw = Math.atan2(f.along[1], f.along[0]);
    const put = (target, material, u, o, y, along, height, across) => { const [x, yy] = at(u, o); target.box(material, x, y, yy, along, height, across, yaw); };
    // Parapet and coping on every side; profiled cornice on faced sides.
    put(batch, wall, f.length / 2, -.12, top + .45, f.length, .9, .24);
    put(batch, trim, f.length / 2, -.06, top + .93, f.length + .12, .08, .4);
    if (!faced.has(face)) continue;
    if (roofKind === 'cornice') { put(detail, trim, f.length / 2, .04, top - .1, f.length + .3, .22, .32); put(detail, trim, f.length / 2, .1, top + .08, f.length + .45, .14, .44); }
    if (roofKind === 'stepped') { put(batch, wall, f.length / 2, -.12, top + 1.35, Math.min(6, f.length * .4), .9, .24); put(batch, trim, f.length / 2, -.06, top + 1.83, Math.min(6, f.length * .4) + .12, .08, .4); }
    const bays = face === (piece.faces?.[0]) ? Math.max(1, piece.bays ?? 1) : Math.max(1, Math.round(f.length / 6)), bay = f.length / bays;
    // Piers at bay edges carry the upper storeys to the ground.
    for (let i = 0; i <= bays; i++) {
      const u = Math.min(f.length - .25, Math.max(.25, i * bay));
      put(batch, loggia ? trim : wall, u, -.05, ground + G / 2 - .2, loggia ? .5 : .55, G + .4, loggia ? .5 : recess + .1);
    }
    // Upper storeys: spandrels and piers on the face plane, glass in the reveal.
    for (let storey = 1; storey < piece.storeys; storey++) {
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
    for (let i = 0; i < bays; i++) {
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
      signs.push({ name: piece.sign, width, height: Math.min(.6, width / 8), east: x, up: ground + 3.98, north: y, yaw });
      if (style.signage === 'blade') {
        // A plate on a bracket, standing out from the facade, lettered top to bottom on both faces.
        put(detail, bronze, .8, .3, ground + 4.3, .05, .05, .6);
        put(detail, accent, .8, .4, ground + 2.95, .06, 2.6, .44);
        for (const side of [1, -1]) { const [bx, by] = at(.8 + side * .035, .4); signs.push({ name: piece.sign, width: 2.4, height: .3, east: bx, up: ground + 2.95, north: by, yaw: yaw + side * Math.PI / 2, roll: side * Math.PI / 2 }); }
      }
    }
  }
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
      for (let i = 0; i < 4; i++) part(m('wood-bench'), 0, -.2 + i * .12, g + .45, 1.85, .04, .09);
      for (let i = 0; i < 2; i++) part(m('wood-bench'), 0, .27, g + .62 + i * .14, 1.85, .09, .04);
      for (const u of [-.75, .75]) { part(m('metal-bronze'), u, 0, g + .22, .06, .44, .5); part(m('metal-bronze'), u, .27, g + .6, .05, .5, .05); }
      break;
    case 'furniture/lamp':
      part(m('metal-bronze'), 0, 0, g + .3, .32, .6, .32);
      part(m('metal-bronze'), 0, 0, g + 2.4, .12, 4.2, .12);
      part(m('metal-brass'), 0, 0, g + 4.35, .34, .12, .34);
      part(m('lamp-glow'), 0, 0, g + 4.62, .3, .42, .3);
      part(m('metal-bronze'), 0, 0, g + 4.9, .44, .1, .44);
      break;
    case 'furniture/bollard':
      part(m('metal-bronze'), 0, 0, g + .45, .2, .9, .2); part(m('metal-brass'), 0, 0, g + .82, .23, .06, .23);
      break;
    case 'furniture/bike-rack':
      for (const u of [-.6, 0, .6]) { part(m('metal-brass'), u, 0, g + .4, .05, .8, .05); part(m('metal-brass'), u, 0, g + .78, .05, .05, .32); }
      part(m('metal-brass'), 0, 0, g + .05, 1.6, .05, .05);
      break;
    case 'furniture/cafe-set':
      part(m('metal-bronze'), 0, 0, g + .37, .06, .74, .06); part(m('trim-ivory'), 0, 0, g + .75, .72, .03, .72);
      for (const [u, v] of [[.62, 0], [-.62, 0], [0, .62], [0, -.62]]) { part(m('metal-brass'), u, v, g + .23, .4, .45, .4); part(m('canvas-teal'), u, v, g + .47, .42, .04, .42); }
      break;
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
    texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
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
      const [w, s, e, n] = piece.rect;
      for (let x = w + .9; x < e - .5; x += 1.6) planters.push([x, ground - .32, -(s + n) / 2, 0]);
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
 * the caller draws the plan's trees and planting (cityKitLandscape).
 */
export function buildCityKit(plan, { groundAt, ground, landscape = true }) {
  const group = new THREE.Group(); group.name = `City kit: ${plan.id}`;
  const materials = createMaterials(), m = materials.get, disposables = [];
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
  const groundPiece = { 'street/shared-lane': ['lane-brick', 0], 'street/intersection': ['lane-brick', 0], 'street/crosswalk': ['lane-brick', 0], 'street/sidewalk': ['paver-sidewalk', 0], 'street/court': ['plaza-stone', 0], 'landscape/lawn': ['lawn', 1], 'street/flush-curb': ['curb-granite', 2], 'landscape/tree-pit': ['soil', 3] };
  const overlays = new Map();
  const clipStreet = plan.pieces.find(p => p.piece === 'street/court' && p.id.endsWith('/paving'))?.rect;
  for (const piece of plan.pieces) {
    const spec = groundPiece[piece.piece];
    if (!spec) continue;
    let rect = piece.rect;
    // Street paving stops where the plaza paving begins; neither overlaps the other.
    if (clipStreet && piece.piece.startsWith('street/') && !piece.id.endsWith('/paving') && rect[2] > clipStreet[0] && rect[0] < clipStreet[0]) rect = [rect[0], rect[1], clipStreet[0], rect[3]];
    const [name, layer] = spec, material = layer ? (overlays.get(name) ?? overlays.set(name, overlay(name)).get(name)) : m(name);
    flat.add(material, drape(rect, groundAt, layer ? .004 * layer : 0, layer ? 4 : 2));
  }
  // A plinth under the whole site reads as ground behind the blocks and as a
  // bayou retaining wall at the east edge.
  const [sw, ss, se, sn] = plan.site;
  flat.box(m('curb-granite'), (sw + se) / 2, ground - 1.9, (ss + sn) / 2, se - sw, 3.4, sn - ss + 30);
  for (const piece of plan.pieces) {
    if (piece.piece === 'building/shell') { const block = blockFor(piece); renderShell(piece, block.massing, block.detail, m, ground, signs); }
    else if (piece.piece === 'building/context') {
      const [w, s, e, n] = piece.rect, block = blockFor(piece);
      block.massing.box(m(piece.wall ?? 'stucco-ivory'), (w + e) / 2, ground - 1.5 + (piece.height + 1.5) / 2, (s + n) / 2, e - w, piece.height + 1.5, n - s);
      block.massing.box(m('trim-ivory'), (w + e) / 2, ground + piece.height + .2, (s + n) / 2, e - w + .2, .4, n - s + .2);
      for (let level = ground + 1; level < ground + piece.height - 2; level += 3.3) block.detail.box(m('glass-dark'), (w + e) / 2, level + 1.3, (s + n) / 2, e - w + .04, 1.6, n - s + .04);
    }
    else if (piece.piece === 'landscape/hedge') {
      const [w, s, e, n] = piece.rect;
      flat.box(m('curb-granite'), (w + e) / 2, ground + .15, (s + n) / 2, e - w, .3, n - s);
    }
    else if (piece.piece === 'landscape/planter') {
      const [w, s, e, n] = piece.rect;
      flat.box(m('stucco-ivory'), (w + e) / 2, ground + .25, (s + n) / 2, e - w, .5, n - s);
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
  const atlas = signAtlas(signs.map(sign => sign.name)), signMaterial = new THREE.MeshStandardMaterial({ map: atlas.texture, color: atlas.texture ? '#ffffff' : '#1f454a', roughness: .55 }); signMaterial.name = 'city-kit/signs';
  const signBatch = createBatch();
  for (const sign of signs) {
    const quad = signQuad(atlas, sign.name, sign.width, sign.height);
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
  group.userData.update = position => {
    treeGroup.userData.update?.(position);
    for (const level of levels) level.detail.visible = position.distanceTo(level.center) < KIT_CONVENTIONS.lod.detailMetres;
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
    atlas.texture?.dispose(); signMaterial.dispose();
    // Shared PBR textures stay cached in materials.js; only the materials go.
    for (const material of [...disposables, ...materials.made.values()]) material.dispose();
    group.clear();
  };
  return group;
}
