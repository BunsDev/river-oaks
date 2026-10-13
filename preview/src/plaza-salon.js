import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHESS_CELL_M, DOMINO, cafeChairAngle, chessCell, chessCellIsDark, chessCellPosition, dominoLine, plazaSalonPlan } from './plaza-salon-plan.js';
import { START_FEN, fromFEN } from './chess-rules.js';
import { groundSurfaceHeight } from './world-surface.js';
import { buildPlanterPlanting } from './landscape-models.js';

// The plaza salon drawn from its shared plan (plaza-salon-plan.js): teak and
// walnut, dusty-pink upholstery, pitted travertine, smoked bronze and warm
// glass, after Val's reference set. Authored geometry and procedural textures
// only. Every repeated part is one InstancedMesh per geometry and material; the
// light comes from emissive glass and bulbs (with the existing bloom), not from
// added dynamic lights, so the plaza costs a few dozen draw calls.

const scene = ([east, north]) => [east, -north];

// Small RGBA textures built from arithmetic, so the plaza needs no image assets.
function dataTexture(size, pixel, { repeat = true, srgb = true } = {}) {
  const [width, height] = Array.isArray(size) ? size : [size, size], data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y, width, height), (y * width + x) * 4);
  const texture = new THREE.DataTexture(data, width, height);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// One teak slat across the texture width, with a dark joint at each edge.
const slatTexture = () => dataTexture([32, 4], x => {
  const edge = Math.min(x, 31 - x), grain = hash(x, 3) * 0.18 + Math.sin(x * 0.9) * 0.06;
  if (edge < 2) return [62, 38, 22, 255];
  return [...mix([176, 118, 70], [140, 90, 52], grain + (edge < 4 ? 0.35 : 0)), 255];
});
// Pale travertine with fine banding and small open pores.
const travertineTexture = () => dataTexture(128, (x, y) => {
  const band = Math.sin(y * 0.21 + Math.sin(x * 0.05) * 2) * 0.5 + 0.5, pore = hash(x >> 1, y >> 1) > 0.965;
  const base = mix([231, 220, 199], [214, 199, 174], band * 0.55 + hash(x, y) * 0.25);
  return [...(pore ? mix(base, [150, 132, 104], 0.7) : base), 255];
});
// An eight-by-eight inlay of cream and charcoal stone within a brass line.
const chessTexture = () => dataTexture(128, (x, y) => {
  const inner = x >= 6 && x < 122 && y >= 6 && y < 122, line = !inner && (x >= 4 && x < 124 && y >= 4 && y < 124);
  if (line) return [168, 132, 74, 255];
  if (!inner) return [226, 214, 192, 255];
  // Texel rows run from the slab's +z edge, so cell (i, j) is the plan's (see chessCellPosition).
  const dark = chessCellIsDark(Math.floor((x - 6) / 14.5), Math.floor((y - 6) / 14.5)), n = hash(x, y) * 0.08;
  return [...(dark ? mix([52, 51, 55], [70, 68, 72], n) : mix([236, 226, 205], [222, 210, 188], n)), 255];
}, { repeat: false });
// A walnut sunburst veneer: sixteen wedges in two tones around the centre.
const sunburstTexture = () => dataTexture(128, (x, y) => {
  const dx = x - 63.5, dy = y - 63.5, angle = Math.atan2(dy, dx), wedge = Math.floor((angle + Math.PI) / (Math.PI / 8)) & 1;
  const grain = Math.sin(Math.hypot(dx, dy) * 0.9 + hash(wedge, Math.floor(angle * 8)) * 6) * 0.5 + 0.5;
  return [...mix(wedge ? [148, 100, 62] : [129, 84, 50], [104, 66, 38], grain * 0.25), 255];
}, { repeat: false });

// An annular sector in the XZ plane between two radii and heights, built from
// a 2D shape so caps and walls have correct normals. Angles are headings
// (Three.js cylinder theta), measured from +Z towards +X.
// Staunton-style pieces from a few primitives, standing on y = 0 and facing +z
// (the knight's head). Sized to the 6.8 cm cells: kings stand about 6.4 cm.
function chessPieceGeometries() {
  const cylinder = (top, bottom, height, y) => new THREE.CylinderGeometry(top, bottom, height, 16).translate(0, y + height / 2, 0);
  const ball = (radius, y, squash = 1) => new THREE.SphereGeometry(radius, 14, 10).scale(1, squash, 1).translate(0, y, 0);
  const box = (w, h, d, [x, y, z], tilt = 0) => new THREE.BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z);
  const base = radius => [cylinder(radius, radius * 1.06, 0.004, 0), cylinder(radius * 0.86, radius, 0.004, 0.004)];
  const parts = {
    p: [...base(0.016), cylinder(0.006, 0.011, 0.014, 0.008), cylinder(0.009, 0.009, 0.002, 0.022), ball(0.0085, 0.031)],
    r: [...base(0.018), cylinder(0.011, 0.013, 0.026, 0.008), cylinder(0.014, 0.012, 0.008, 0.034),
      ...[0, 1, 2, 3].map(k => box(0.007, 0.006, 0.005, [Math.sin(k * Math.PI / 2) * 0.01, 0.045, Math.cos(k * Math.PI / 2) * 0.01]).rotateY(Math.PI / 4))],
    n: [...base(0.018), cylinder(0.009, 0.013, 0.016, 0.008), box(0.012, 0.03, 0.017, [0, 0.036, -0.002], -0.22), box(0.011, 0.011, 0.021, [0, 0.045, 0.008], 0.35),
      box(0.004, 0.008, 0.004, [0.004, 0.054, -0.004]), box(0.004, 0.008, 0.004, [-0.004, 0.054, -0.004])],
    b: [...base(0.018), cylinder(0.006, 0.012, 0.028, 0.008), cylinder(0.01, 0.01, 0.002, 0.036), ball(0.0095, 0.047, 1.35), ball(0.0035, 0.0605)],
    q: [...base(0.02), cylinder(0.007, 0.014, 0.034, 0.008), cylinder(0.011, 0.011, 0.002, 0.041), cylinder(0.013, 0.008, 0.01, 0.043), ball(0.005, 0.058)],
    k: [...base(0.02), cylinder(0.008, 0.014, 0.036, 0.008), cylinder(0.011, 0.011, 0.002, 0.044), cylinder(0.012, 0.009, 0.009, 0.046),
      box(0.004, 0.014, 0.004, [0, 0.062, 0]), box(0.012, 0.004, 0.004, [0, 0.063, 0])],
  };
  return Object.fromEntries(Object.entries(parts).map(([type, list]) => [type, mergeGeometries(list)]));
}

// Card faces for the café table: a 13 × 4 atlas (ranks across, suits C D S H down),
// drawn on a canvas. Without a document (tests, workers) there is no atlas.
function cardAtlas() {
  const canvas = globalThis.document?.createElement?.('canvas'), context = canvas?.getContext?.('2d');
  if (!context) return null;
  const width = 64, height = 90;
  canvas.width = width * 13; canvas.height = height * 4;
  [...'CDSH'].forEach((suit, row) => [...'23456789TJQKA'].forEach((rank, column) => {
    const x = column * width, y = row * height, red = suit === 'H' || suit === 'D', glyph = { C: '\u2663', D: '\u2666', S: '\u2660', H: '\u2665' }[suit];
    context.fillStyle = '#fbf8f1'; context.fillRect(x + 1, y + 1, width - 2, height - 2);
    context.fillStyle = red ? '#b3262e' : '#1d1b1f';
    context.font = '700 20px Georgia, serif'; context.textAlign = 'left'; context.textBaseline = 'top';
    context.fillText(rank === 'T' ? '10' : rank, x + 6, y + 5);
    context.font = '40px Georgia, "Apple Symbols", serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(glyph, x + width / 2, y + height / 2 + 6);
  }));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function sector(innerRadius, outerRadius, bottom, top, start, length, segments = 48) {
  const shape = new THREE.Shape(), a0 = start - Math.PI / 2, a1 = a0 + length;
  shape.absarc(0, 0, outerRadius, a0, a1, false);
  shape.absarc(0, 0, innerRadius, a1, a0, true);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: segments });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, bottom, 0);
  return geometry;
}
// An open curved wall carrying the slat texture once per slat width.
function slattedWall(radius, height, start, length, slatWidth = 0.075) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true, start, length);
  const uv = geometry.attributes.uv, slats = Math.max(1, Math.round(radius * length / slatWidth));
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * slats);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

export function buildPlazaSalon(world) {
  const group = new THREE.Group(); group.name = 'Plaza salon';
  const plan = plazaSalonPlan(world);
  if (!plan) return group;
  const textures = { slat: slatTexture(), travertine: travertineTexture(), chess: chessTexture(), sunburst: sunburstTexture() };
  // The world reload releases a texture through userData.texture (main.js populateWorld).
  for (const texture of Object.values(textures)) { const holder = new THREE.Object3D(); holder.userData.texture = texture; group.add(holder); }
  const material = {
    teak: new THREE.MeshStandardMaterial({ color: '#9a643c', roughness: 0.62 }),
    slat: new THREE.MeshStandardMaterial({ map: textures.slat, roughness: 0.6, side: THREE.DoubleSide }),
    walnut: new THREE.MeshStandardMaterial({ color: '#5e3c27', roughness: 0.55 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#c8757f', roughness: 0.96 }),
    travertine: new THREE.MeshStandardMaterial({ map: textures.travertine, roughness: 0.88 }),
    chess: new THREE.MeshStandardMaterial({ map: textures.chess, roughness: 0.42 }),
    sunburst: new THREE.MeshStandardMaterial({ map: textures.sunburst, roughness: 0.5 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#5f4a33', metalness: 0.82, roughness: 0.36 }),
    // Warm lantern glass reads as lit by day; bulbs exceed the bloom threshold at dusk.
    glass: new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45e', emissiveIntensity: 1.35, roughness: 0.2, transparent: true, opacity: 0.86 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffcf8a', emissiveIntensity: 3.4, roughness: 0.3 }),
    cable: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 }),
    ivory: new THREE.MeshStandardMaterial({ color: '#efe6d4', roughness: 0.35 }),
    ebony: new THREE.MeshStandardMaterial({ color: '#2b2522', roughness: 0.3 }),
    bloom: new THREE.MeshStandardMaterial({ color: '#e48a9a', roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#4f6b3a', roughness: 0.9 }),
    mulch: new THREE.MeshStandardMaterial({ color: '#2e241b', roughness: 1 }),
  };
  const unit = {
    box: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    post: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    ball: new THREE.SphereGeometry(0.5, 12, 8),
    roof: new THREE.ConeGeometry(0.5 * Math.SQRT2, 1, 4, 1).rotateY(Math.PI / 4),
    ring: new THREE.TorusGeometry(1, 0.018, 6, 48).rotateX(Math.PI / 2),
  };
  // A round table top: sunburst veneer on top, teak edge and underside.
  const tableTop = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
  const pedestal = new THREE.CylinderGeometry(0.5 * 0.62, 0.5, 1, 32, 1, true);
  { const uv = pedestal.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 26); }
  // The swan-neck lantern arm: an arc from the post, over and down to the hook.
  const arm = new THREE.TorusGeometry(0.23, 0.02, 6, 20, Math.PI + 0.4).rotateZ(-0.4).rotateY(-Math.PI / 2).translate(0, 2.78, 0.23);
  // A single stage disc carries slats on its side and plain teak on top.
  const stageDisc = new THREE.CylinderGeometry(0.5, 0.5, 1, 96);
  { const uv = stageDisc.attributes.uv, slats = Math.round(Math.PI * plan.stage.radius * 2 / 0.08); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * slats); }

  const batches = new Map(), dummy = new THREE.Object3D();
  const add = (geometry, materials, [x, y, z], scale, yaw = 0) => {
    const key = `${geometry.uuid}:${[materials].flat().map(m => m.uuid).join(',')}`;
    if (!batches.has(key)) batches.set(key, { geometry, material: materials, parts: [] });
    batches.get(key).parts.push({ position: [x, y, z], scale, yaw });
  };
  // Local offsets of a piece facing local +Z, turned by its yaw.
  const at = (base, yaw, [lx, ly, lz]) => [base[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw), base[1] + ly, base[2] - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const groundAt = (x, z) => groundSurfaceHeight(world, x, z);
  const base = item => { const [x, z] = scene([item.x, item.north]); return [x, groundAt(x, z), z]; };

  // Café armchairs after the walnut slat-back reference: front legs rise to the arms.
  for (const chair of plan.chairs) {
    const origin = base(chair), yaw = chair.heading, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    for (const side of [-1, 1]) {
      part(unit.box, material.walnut, [side * 0.27, 0.31, 0.24], [0.046, 0.62, 0.046]);
      part(unit.box, material.walnut, [side * 0.27, 0.44, -0.25], [0.046, 0.88, 0.046]);
      part(unit.box, material.walnut, [side * 0.28, 0.635, 0.01], [0.065, 0.034, 0.6]);
      part(unit.box, material.walnut, [side * 0.27, 0.36, 0], [0.04, 0.05, 0.5]);
    }
    for (const lz of [-0.25, 0.24]) part(unit.box, material.walnut, [0, 0.36, lz], [0.56, 0.05, 0.04]);
    for (const ly of [0.54, 0.6, 0.66]) part(unit.box, material.walnut, [0, ly, -0.255], [0.52, 0.035, 0.022]);
    part(unit.box, material.fabric, [0, 0.43, 0.01], [0.54, 0.1, 0.52]);
    part(unit.box, material.fabric, [0, 0.79, -0.24], [0.5, 0.2, 0.07]);
  }
  // The round collaboration table on its fluted teak pedestal and bronze foot.
  {
    const origin = base(plan.round), d = plan.round.radius * 2;
    add(tableTop, [material.teak, material.sunburst, material.teak], [origin[0], origin[1] + 0.745, origin[2]], [d, 0.05, d]);
    add(pedestal, material.slat, [origin[0], origin[1] + 0.38, origin[2]], [0.62, 0.68, 0.62]);
    add(unit.disc, material.bronze, [origin[0], origin[1] + 0.03, origin[2]], [0.68, 0.06, 0.68]);
    add(unit.disc, material.travertine, [origin[0], origin[1] + 0.82, origin[2]], [0.26, 0.1, 0.26]);
    add(unit.ball, material.leaf, [origin[0], origin[1] + 0.9, origin[2]], [0.3, 0.13, 0.3]);
    for (const [a, r] of [[0, 0.06], [2.1, 0.08], [4.2, 0.05], [1, 0.1], [3.3, 0.09]])
      add(unit.ball, material.bloom, [origin[0] + Math.sin(a) * r, origin[1] + 0.95, origin[2] + Math.cos(a) * r], [0.07, 0.06, 0.07]);
  }
  // Travertine chess tables, their pieces set from a position (see the chess mirror below).
  for (const table of plan.chess) {
    const origin = base(table), yaw = Math.PI / 2, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    part(unit.box, material.travertine, [0, 0.72, 0], [0.8, 0.1, 0.8]);
    part(unit.box, material.chess, [0, 0.772, 0], [0.6, 0.004, 0.6]);
    part(unit.box, material.travertine, [0, 0.36, 0], [0.24, 0.62, 0.24]);
    part(unit.box, material.travertine, [0, 0.03, 0], [0.52, 0.06, 0.52]);
  }
  // The curved bench: a slatted teak body, dusty-pink seat and back cushions,
  // flat teak ledges at each end, around a travertine drum with candle lanterns.
  {
    const { bench } = plan, [x, y, z] = base(bench), back = bench.opening + Math.PI, start = back - bench.span / 2, cushionStart = start + 0.26, cushionSpan = bench.span - 0.52;
    const body = mergeGeometries([sector(1.12, 2.0, 0, 0.42, start, bench.span), sector(1.97, 2.08, 0.42, 0.93, start, bench.span)]);
    // Slatted faces sit just outside the bodies' 12 mm bevel, or the bevel would hide them.
    const wall = mergeGeometries([slattedWall(1.1, 0.42, start, bench.span), slattedWall(2.1, 0.94, start, bench.span)]);
    const seat = sector(1.2, 1.92, 0.42, 0.55, cushionStart, cushionSpan);
    const backs = mergeGeometries([0, 1, 2].map(i => sector(1.83, 1.96, 0.55, 0.9, cushionStart + cushionSpan * i / 3 + 0.015, cushionSpan / 3 - 0.03)));
    for (const [geometry, m] of [[body, material.teak], [wall, material.slat], [seat, material.fabric], [backs, material.fabric]]) {
      const mesh = new THREE.Mesh(geometry, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    }
    add(unit.disc, material.travertine, [x, y + 0.2, z], [0.84, 0.4, 0.84]);
    for (const offset of [[-0.16, 0.08], [0.15, -0.1]]) {
      const lantern = [x + offset[0], y + 0.4, z + offset[1]];
      add(unit.box, material.glass, [lantern[0], lantern[1] + 0.09, lantern[2]], [0.09, 0.14, 0.09]);
      add(unit.box, material.bronze, [lantern[0], lantern[1] + 0.17, lantern[2]], [0.11, 0.02, 0.11]);
      add(unit.box, material.bronze, [lantern[0], lantern[1] + 0.01, lantern[2]], [0.11, 0.02, 0.11]);
      add(unit.ball, material.bulb, [lantern[0], lantern[1] + 0.08, lantern[2]], [0.03, 0.05, 0.03]);
    }
    add(unit.disc, material.travertine, [x + 0.05, y + 0.45, z - 0.16], [0.16, 0.08, 0.16]);
    for (const [a, r] of [[0, 0], [2, 0.04], [4, 0.05]]) add(unit.ball, material.bloom, [x + 0.05 + Math.sin(a) * r, y + 0.5, z - 0.16 + Math.cos(a) * r], [0.07, 0.06, 0.07]);
  }
  // Long travertine planters on a recessed bronze plinth, planted with the
  // district's seeded mixes (lane planters share the same composer).
  const planterTops = [];
  for (const planter of plan.planters) {
    const origin = base(planter), yaw = planter.heading;
    add(unit.box, material.bronze, [origin[0], origin[1] + 0.025, origin[2]], [1.62, 0.05, 0.48], yaw);
    add(unit.box, material.travertine, [origin[0], origin[1] + 0.32, origin[2]], [1.72, 0.54, 0.56], yaw);
    add(unit.box, material.mulch, [origin[0], origin[1] + 0.592, origin[2]], [1.6, 0.012, 0.46], yaw);
    planterTops.push([origin[0], origin[1] - 0.03, origin[2], yaw]);
  }
  group.add(buildPlanterPlanting(planterTops));
  // Smoked-bronze lantern posts: swan-neck arm, glazed lantern, warm filament.
  for (const post of plan.lanterns) {
    const origin = base(post), yaw = post.heading, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    part(unit.post, material.bronze, [0, 0.1, 0], [0.24, 0.2, 0.24]);
    part(unit.post, material.bronze, [0, plan.postHeight / 2, 0], [0.09, plan.postHeight, 0.09]);
    part(unit.ball, material.bronze, [0, plan.postHeight + 0.03, 0], [0.11, 0.11, 0.11]);
    add(arm, material.bronze, origin, [1, 1, 1], yaw);
    const lantern = [0, 2.36, 0.45];
    part(unit.roof, material.bronze, [lantern[0], lantern[1] + 0.23, lantern[2]], [0.3, 0.13, 0.3]);
    part(unit.box, material.bronze, [lantern[0], lantern[1] + 0.165, lantern[2]], [0.27, 0.025, 0.27]);
    part(unit.box, material.bronze, [lantern[0], lantern[1] - 0.17, lantern[2]], [0.27, 0.035, 0.27]);
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(unit.box, material.bronze, [lantern[0] + lx * 0.12, lantern[1], lantern[2] + lz * 0.12], [0.022, 0.33, 0.022]);
    part(unit.box, material.glass, lantern, [0.22, 0.3, 0.22]);
    part(unit.ball, material.bulb, [lantern[0], lantern[1] - 0.01, lantern[2]], [0.07, 0.11, 0.07]);
    part(unit.post, material.bronze, [lantern[0], lantern[1] + 0.32, lantern[2]], [0.02, 0.12, 0.02]);
  }
  // A small timber stage with a warm uplight ring, two stools and a microphone.
  {
    const { stage } = plan, origin = base(stage), d = stage.radius * 2, yaw = stage.heading, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    add(stageDisc, [material.slat, material.teak, material.teak], [origin[0], origin[1] + 0.11, origin[2]], [d, 0.22, d]);
    add(unit.ring, material.bulb, [origin[0], origin[1] + 0.03, origin[2]], [stage.radius + 0.02, 1, stage.radius + 0.02]);
    for (const lx of [-0.45, 0.45]) {
      part(unit.disc, material.teak, [lx, 0.92, -0.2], [0.34, 0.05, 0.34]);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(unit.box, material.walnut, [lx + a * 0.1, 0.57, -0.2 + b * 0.1], [0.03, 0.68, 0.03]);
    }
    part(unit.disc, material.bronze, [0, 0.235, 0.35], [0.24, 0.02, 0.24]);
    part(unit.post, material.bronze, [0, 0.98, 0.35], [0.022, 1.5, 0.022]);
    part(unit.ball, material.ebony, [0, 1.75, 0.35], [0.06, 0.09, 0.06]);
  }
  // String lights sag between the trees and the lantern posts, with a ring of
  // bulbs around each trunk under the crown.
  {
    const cables = [], bulbs = [];
    for (const { from, to } of plan.strands) {
      const [ax, az] = scene([from.x, from.north]), [bx, bz] = scene([to.x, to.north]);
      const ay = groundAt(ax, az) + from.height, by = groundAt(bx, bz) + to.height, length = Math.hypot(bx - ax, bz - az), sag = 0.18 + length * 0.03;
      const points = [];
      for (let i = 0, n = Math.max(8, Math.ceil(length / 0.25)); i <= n; i++) {
        const t = i / n; points.push(new THREE.Vector3(ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      cables.push(new THREE.TubeGeometry(curve, points.length * 2, 0.006, 4, false));
      for (let i = 1, n = Math.floor(length / 0.5); i < n; i++) { const p = curve.getPoint(i / n); bulbs.push([p.x, p.y - 0.05, p.z]); }
    }
    for (const tree of plan.trees) {
      const [tx, tz] = scene([tree.x, tree.north]), ty = groundAt(tx, tz) + 3.35;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bulbs.push([tx + Math.sin(a) * 0.52, ty - 0.08 * (i % 2), tz + Math.cos(a) * 0.52]); }
    }
    const cable = new THREE.Mesh(mergeGeometries(cables), material.cable); cable.name = 'Plaza string-light cable'; group.add(cable);
    for (const p of bulbs) add(unit.ball, material.bulb, p, [0.07, 0.07, 0.07]);
  }

  for (const { geometry, material: materials, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, materials, parts.length);
    parts.forEach((p, i) => { dummy.position.fromArray(p.position); dummy.scale.fromArray(p.scale); dummy.rotation.set(0, p.yaw, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    const glowing = [materials].flat().some(m => m === material.bulb || m === material.glass);
    mesh.castShadow = !glowing && materials !== material.mulch && materials !== material.chess; mesh.receiveShadow = !glowing;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  // The game mirror: one InstancedMesh per chess piece shape plus one for checkers
  // discs, for both colours and both tables (ivory and ebony are instance colours),
  // so a full chess set costs six draw calls and checkers one more.
  {
    const shapes = chessPieceGeometries(), meshes = {}, tint = { w: new THREE.Color('#efe6d4'), b: new THREE.Color('#2b2522') };
    tint.l = tint.w; tint.d = tint.b;
    const piece = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.33 });
    for (const [type, geometry] of Object.entries(shapes)) {
      // Per table: sixteen pawns, or up to ten of a promoted piece per side.
      const mesh = new THREE.InstancedMesh(geometry, piece, 20 * plan.chess.length);
      mesh.name = `Chess ${type}`; mesh.castShadow = mesh.receiveShadow = true; mesh.count = 0;
      meshes[type] = mesh; group.add(mesh);
    }
    // A checkers disc with a turned rim; a king is two stacked. Twelve a side per table.
    const disc = new THREE.CylinderGeometry(0.026, 0.0275, 0.009, 28).translate(0, 0.0045, 0);
    meshes.disc = new THREE.InstancedMesh(disc, piece, 48 * plan.chess.length);
    Object.assign(meshes.disc, { name: 'Checkers disc', castShadow: true, receiveShadow: true, count: 0 }); group.add(meshes.disc);
    const opening = fromFEN(START_FEN).board, boards = new Map(plan.chess.map(table => [table.id, { board: opening, whiteChair: 0 }]));
    const draw = () => {
      const placed = Object.fromEntries(Object.keys(meshes).map(key => [key, 0]));
      for (const table of plan.chess) {
        const { board, whiteChair } = boards.get(table.id), [, y] = base(table);
        board.forEach((letter, square) => {
          if (!letter) return;
          // Checkers: dark ('d', 'D' crowned) moves first and sits where chess has white.
          if ('dDlL'.includes(letter)) {
            const [east, north] = chessCellPosition(table, chessCell(square, whiteChair)), side = letter.toLowerCase();
            for (let layer = 0; layer < (letter === side ? 1 : 2) && placed.disc < meshes.disc.instanceMatrix.count; layer++) {
              dummy.position.set(east, y + 0.774 + layer * 0.0095, -north); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
              meshes.disc.setColorAt(placed.disc, tint[side]); meshes.disc.setMatrixAt(placed.disc++, dummy.matrix);
            }
            return;
          }
          const colour = letter === letter.toUpperCase() ? 'w' : 'b', key = letter.toLowerCase(), mesh = meshes[key];
          if (placed[key] >= mesh.instanceMatrix.count) return;
          const [east, north] = chessCellPosition(table, chessCell(square, whiteChair)), toward = (colour === 'w') === (whiteChair === 0) ? -1 : 1;
          // Pieces face the other player: white's forward is away from white's chair.
          dummy.position.set(east, y + 0.774, -north); dummy.scale.set(1, 1, 1);
          dummy.rotation.set(0, toward < 0 ? -Math.PI / 2 : Math.PI / 2, 0); dummy.updateMatrix();
          mesh.setColorAt(placed[key], tint[colour]); mesh.setMatrixAt(placed[key]++, dummy.matrix);
        });
      }
      for (const [key, mesh] of Object.entries(meshes)) {
        mesh.count = placed[key]; mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    };
    draw();
    group.userData.chess = {
      cell: CHESS_CELL_M,
      tables: plan.chess.map(table => table.id),
      // A table's position, or the chess opening when board is null: a 64-square board from
      // chess-rules.js or checkers-rules.js, and the chair of the side that moves first.
      show(tableId, board = null, whiteChair = 0) {
        if (!boards.has(tableId)) return false;
        boards.set(tableId, { board: board ?? opening, whiteChair: whiteChair === 1 ? 1 : 0 }); draw(); return true;
      },
      board: tableId => boards.get(tableId)?.board.slice() ?? null,
    };
    // Connect Four (plaza-table-games.js): a standing frame across the middle of a chess
    // table, shown only while Connect Four is that table's game. Columns run from the
    // first player's left; dark slots show where discs can go.
    const FOUR = 0.058, frameMaterial = new THREE.MeshStandardMaterial({ color: '#2f5fae', roughness: 0.42 });
    const width = 7 * FOUR + 0.03, height = 6 * FOUR + 0.03, lift = 0.03;
    const fourSlot = new THREE.CylinderGeometry(0.022, 0.022, 0.014, 20).rotateX(Math.PI / 2);
    const fourDisc = new THREE.CylinderGeometry(0.024, 0.024, 0.022, 24).rotateX(Math.PI / 2);
    const fours = new Map(), tintOf = { r: new THREE.Color('#d2352d'), y: new THREE.Color('#f2c230') };
    const cellAt = index => [((index % 7) - 3) * FOUR, lift + (Math.floor(index / 7) + 0.5) * FOUR + 0.015, 0];
    for (const table of plan.chess) {
      const [, y] = base(table), centre = chessCellPosition(table, { i: 3.5, j: 3.5 }), across = chessCellPosition(table, { i: 4.5, j: 3.5 });
      const holder = new THREE.Group(); holder.name = `Connect Four ${table.id}`; holder.visible = false;
      holder.position.set(centre[0], y + 0.774, -centre[1]);
      holder.rotation.y = Math.atan2(-(-across[1] + centre[1]), across[0] - centre[0]);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.012), frameMaterial);
      frame.position.y = lift + height / 2; frame.castShadow = frame.receiveShadow = true;
      const feet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.012, 0.09), frameMaterial);
      feet.position.y = 0.006;
      const slots = new THREE.InstancedMesh(fourSlot, new THREE.MeshStandardMaterial({ color: '#16294a', roughness: 0.6 }), 42);
      for (let index = 0; index < 42; index++) { dummy.position.set(...cellAt(index)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); slots.setMatrixAt(index, dummy.matrix); }
      const discs = new THREE.InstancedMesh(fourDisc, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.38 }), 42);
      discs.count = 0; discs.castShadow = true;
      holder.add(frame, feet, slots, discs); group.add(holder);
      fours.set(table.id, { holder, discs });
    }
    group.userData.connectFour = {
      // A table's Connect Four grid (42 cells from connect-four-rules.js) and the chair of
      // the side that moves first, or null to put the frame away.
      show(tableId, board = null, firstChair = 0) {
        const four = fours.get(tableId);
        if (!four) return false;
        four.holder.visible = Boolean(board);
        if (!board) return true;
        four.holder.scale.x = firstChair === 1 ? -1 : 1;
        let count = 0;
        board.forEach((side, index) => {
          if (!tintOf[side]) return;
          dummy.position.set(...cellAt(index)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          four.discs.setColorAt(count, tintOf[side]); four.discs.setMatrixAt(count++, dummy.matrix);
        });
        four.discs.count = count; four.discs.instanceMatrix.needsUpdate = true;
        if (four.discs.instanceColor) four.discs.instanceColor.needsUpdate = true;
        four.discs.computeBoundingSphere();
        return true;
      },
      visible: tableId => fours.get(tableId)?.holder.visible ?? null,
      discs: tableId => fours.get(tableId)?.discs.count ?? null,
    };
  }
  // Dominoes at the café table: the line lies face up on an arc around the centrepiece,
  // and each hand stands at the table edge before its player's chair. Only an open hand
  // (yours) shows its pips, so the regulars' tiles stay secret from any camera angle.
  {
    const table = plan.round, [tx, ty, tz] = base(table), top = ty + 0.77, thick = 0.009;
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.35 }), 28);
    const pips = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshStandardMaterial({ color: '#1f1b19', roughness: 0.5 }), 28 * 13);
    Object.assign(tiles, { name: 'Domino tiles', castShadow: true, receiveShadow: true, count: 0 });
    Object.assign(pips, { name: 'Domino pips', count: 0 });
    group.add(tiles, pips);
    // Pip spots on a half face, in steps of 6.5 mm across a 25 mm square.
    const SPOTS = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
      5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]] };
    const up = new THREE.Vector3(0, 1, 0), matrix = new THREE.Matrix4(), width = new THREE.Vector3(), at = new THREE.Vector3(), size = new THREE.Vector3();
    // One tile: its long axis, the outward normal of its face, and the values at each end (null: face hidden).
    const place = (origin, long, normal, ends) => {
      width.crossVectors(long, normal);
      matrix.makeBasis(long, normal, width).scale(size.set(DOMINO.length, thick, DOMINO.width)).setPosition(origin);
      tiles.setMatrixAt(tiles.count++, matrix);
      if (!ends) return;
      const spot = (l, w, sl, sw) => {
        at.copy(origin).addScaledVector(normal, thick / 2 + 0.0005).addScaledVector(long, l).addScaledVector(width, w);
        matrix.makeBasis(long, normal, width).scale(size.set(sl, 0.001, sw)).setPosition(at);
        pips.setMatrixAt(pips.count++, matrix);
      };
      spot(0, 0, 0.0009, 0.0095);
      ends.forEach((value, half) => { for (const [l, w] of SPOTS[value]) spot((half ? 1 : -1) * DOMINO.length / 4 + l * 0.0065, w * 0.0065, 0.0026, 0.0026); });
    };
    const show = game => {
      tiles.count = 0; pips.count = 0;
      if (game) {
        for (const tile of dominoLine(table, game.line, game.leadIndex ?? 0, game.facing ?? 0)) {
          const tangent = new THREE.Vector3(Math.cos(tile.angle), 0, -Math.sin(tile.angle)), radial = new THREE.Vector3(Math.sin(tile.angle), 0, Math.cos(tile.angle));
          place(new THREE.Vector3(tile.position[0], top + thick / 2, -tile.position[1]), tile.double ? radial : tangent, up, [tile.left, tile.right]);
        }
        for (const hand of game.hands ?? []) {
          const angle = cafeChairAngle(hand.chair), radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
          const count = hand.tiles?.length ?? hand.count ?? 0;
          for (let k = 0; k < count && tiles.count < 28; k++) {
            const origin = new THREE.Vector3(tx, top + DOMINO.length / 2, tz).addScaledVector(radial, 0.64).addScaledVector(tangent, (k - (count - 1) / 2) * 0.03);
            place(origin, up, radial, hand.tiles ? hand.tiles[k].split('-').map(Number) : null);
          }
        }
      }
      for (const mesh of [tiles, pips]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    };
    group.userData.dominoes = {
      // The café game: { line, leadIndex, facing (your chair), hands: [{ chair, tiles | count }] }, or null to clear.
      show,
      count: () => ({ tiles: tiles.count, pips: pips.count }),
    };
  }
  // Hearts at the café table: the trick lies face up, each card in front of the player
  // who played it; hands and won tricks wait face down at each seat. Faces come from a
  // canvas atlas where there is a document (a plain face elsewhere); backs are one mesh.
  {
    const table = plan.round, [tx, ty, tz] = base(table), top = ty + 0.77, CARD = { width: 0.063, length: 0.088, thick: 0.0006 };
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(CARD.width, CARD.thick, CARD.length), new THREE.MeshStandardMaterial({ color: '#7b2f45', roughness: 0.55 }), 4 * 13 + 4 * 13);
    Object.assign(backs, { name: 'Card backs', castShadow: true, receiveShadow: true, count: 0 });
    group.add(backs);
    const atlas = cardAtlas();
    if (atlas) { const holder = new THREE.Object3D(); holder.userData.texture = atlas; group.add(holder); }
    const edge = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.6 });
    const faces = [0, 1, 2, 3].map(index => {
      const map = atlas?.clone() ?? null;
      if (map) map.repeat.set(1 / 13, 1 / 4);
      const face = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, map });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(CARD.width, CARD.thick, CARD.length), [edge, edge, face, edge, edge, edge]);
      mesh.name = `Card in the trick ${index}`; mesh.visible = false; mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); return mesh;
    });
    const at = (chair, out, along = 0) => {
      const angle = cafeChairAngle(chair);
      return [tx + Math.sin(angle) * out + Math.cos(angle) * along, tz + Math.cos(angle) * out - Math.sin(angle) * along, angle];
    };
    const show = game => {
      backs.count = 0; faces.forEach(mesh => { mesh.visible = false; });
      if (game) {
        (game.trick ?? []).forEach(({ chair, card }, order) => {
          const mesh = faces[order], [x, z, angle] = at(chair, 0.2);
          mesh.position.set(x, top + CARD.thick / 2 + order * 0.0008, z); mesh.rotation.set(0, angle + (order - 1.5) * 0.08, 0); mesh.visible = true;
          if (mesh.material[2].map) { const column = '23456789TJQKA'.indexOf(card[0]), row = 'CDSH'.indexOf(card[1]); mesh.material[2].map.offset.set(column / 13, 1 - (row + 1) / 4); }
        });
        const stack = (chair, count, along, spread) => {
          for (let k = 0; k < count && backs.count < backs.instanceMatrix.count; k++) {
            const [x, z, angle] = at(chair, 0.6, along + (k - (count - 1) / 2) * spread);
            dummy.position.set(x, top + CARD.thick / 2 + k * 0.0007, z); dummy.rotation.set(0, angle + (k - (count - 1) / 2) * 0.05, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
            backs.setMatrixAt(backs.count++, dummy.matrix);
          }
        };
        for (const hand of game.hands ?? []) stack(hand.chair, hand.count, 0, 0.012);
        for (const pile of game.won ?? []) stack(pile.chair, pile.tricks, 0.16, 0);
      }
      backs.instanceMatrix.needsUpdate = true; backs.computeBoundingSphere();
    };
    group.userData.cards = {
      // The café Hearts hand: { trick: [{ chair, card }], hands: [{ chair, count }], won: [{ chair, tricks }] }, or null to clear.
      show,
      count: () => ({ faces: faces.filter(mesh => mesh.visible).length, backs: backs.count, drawn: Boolean(atlas) }),
    };
  }
  group.userData.counts = { chairs: plan.chairs.length, chess: plan.chess.length, planters: plan.planters.length, lanterns: plan.lanterns.length, strands: plan.strands.length };
  return group;
}
