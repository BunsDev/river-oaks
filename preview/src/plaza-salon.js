import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BACKGAMMON, CHESS_CELL_M, DARTS, DOMINO, GO, JENGA, MANCALA, WINE_PONG_STAND, backgammonSpot, cafeChairAngle, chessCell, chessCellIsDark, chessCellPosition, dominoLine, dartSpot, goSpot, jengaBlock, mancalaSpot, plazaSalonPlan, winePongPoint, plazaSalonRack } from './plaza-salon-plan.js';
import { startGame as backgammonStart } from './backgammon-rules.js';
import { startTower } from './jenga-rules.js';
import { scoreAt } from './darts-rules.js';
import { startGame as mancalaStart } from './mancala-rules.js';
import { GLASS_HEIGHT, TABLE as PONG_TABLE, glassAt } from './wine-pong-rules.js';
import { seededRandom } from './seeded-random.js';
import { createRoadVehicle } from './road-vehicles.js';
import { START_FEN, fromFEN } from './chess-rules.js';
import { MILLS as MORRIS_MILLS, POINTS as MORRIS_POINTS, SIZE as MORRIS_SIZE } from './morris-rules.js';
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
// Ivory dice with painted pips. BoxGeometry's faces (+x, −x, +y, −y, +z, −z) show 3, 4,
// 1, 6, 2, 5, so opposites sum to seven; DIE_UP is the turn that brings a value face up.
const DIE_PIPS = { 1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]] };
const DIE_UP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
const dieFaceTexture = value => dataTexture(32, (px, py, w, h) => DIE_PIPS[value].some(([u, v]) => Math.hypot((px + 0.5) / w - u, (py + 0.5) / h - v) < 0.1) ? [32, 28, 26, 255] : [240, 233, 216, 255], { repeat: false });
function ivoryDice(group, { size, count, name }) {
  const textures = [3, 4, 1, 6, 2, 5].map(dieFaceTexture);
  // The world reload releases a texture through userData.texture (main.js populateWorld).
  for (const texture of textures) { const holder = new THREE.Object3D(); holder.userData.texture = texture; group.add(holder); }
  const dice = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), textures.map(map => new THREE.MeshStandardMaterial({ map, roughness: 0.4 })), count);
  return Object.assign(dice, { name, count: 0, castShadow: true });
}
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
// A backgammon board seen from above: a walnut frame and bar, green felt, and
// twenty-four points alternating oxblood and cream (see backgammonSpot for the layout).
const backgammonTexture = () => dataTexture([264, 208], (px, py) => {
  const { width, depth, column, bar } = BACKGAMMON, x = (px / 264 - 0.5) * (width + 0.04), z = (0.5 - py / 208) * (depth + 0.04);
  if (Math.abs(x) > width / 2 || Math.abs(z) > depth / 2 || Math.abs(x) < bar / 2) return [86, 56, 36, 255];
  const right = x > 0, inHalf = Math.floor((Math.abs(x) - bar / 2) / column), col = right ? 6 + inHalf : 5 - inHalf, near = z > 0;
  const centre = (col - 5.5) * column + (col >= 6 ? bar / 2 : -bar / 2), reach = depth / 2 - 0.02 - Math.abs(z);
  const inside = reach >= 0 && reach <= 0.2 && Math.abs(x - centre) < (column / 2) * (1 - reach / 0.2);
  if (!inside) return [...mix([52, 82, 60], [44, 70, 52], hash(px, py) * 0.6), 255];
  return ((col + (near ? 0 : 1)) & 1) ? [150, 54, 48, 255] : [232, 220, 192, 255];
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
  const textures = { slat: slatTexture(), travertine: travertineTexture(), chess: chessTexture(), sunburst: sunburstTexture(), backgammon: backgammonTexture() };
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
    backgammon: new THREE.MeshStandardMaterial({ map: textures.backgammon, roughness: 0.62 }),
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
    linen: new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.92 }),
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
  // The backgammon table: a walnut top on a pedestal, the board laid across it.
  {
    const table = plan.backgammon, origin = base(table), yaw = Math.PI / 2, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    part(unit.box, material.walnut, [0, 0.72, 0], [0.8, 0.05, 0.64]);
    part(unit.box, [material.walnut, material.walnut, material.backgammon, material.walnut, material.walnut, material.walnut], [0, 0.752, 0], [BACKGAMMON.width + 0.04, 0.014, BACKGAMMON.depth + 0.04]);
    part(unit.box, material.walnut, [0, 0.36, 0], [0.16, 0.62, 0.16]);
    part(unit.box, material.bronze, [0, 0.03, 0], [0.5, 0.06, 0.42]);
  }
  // The wine pong table: a long linen-topped table on four walnut legs, east–west.
  {
    const table = plan.winePong, origin = base(table), yaw = table.heading, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    const { length, width, height } = PONG_TABLE;
    part(unit.box, material.linen, [0, height - 0.015, 0], [length + 0.04, 0.03, width + 0.04]);
    part(unit.box, material.walnut, [0, height - 0.06, 0], [length - 0.1, 0.06, width - 0.08]);
    for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) part(unit.box, material.walnut, [u * (length / 2 - 0.08), (height - 0.09) / 2, v * (width / 2 - 0.07)], [0.05, height - 0.09, 0.05]);
  }
  // The grove table: a small round walnut top on a pedestal, with the mancala board laid
  // across it north–south: a carved walnut board, six cups a side and a long store at each end.
  {
    const table = plan.grove, origin = base(table), part = (geometry, m, local, scale) => add(geometry, m, at(origin, 0, local), scale, 0);
    part(unit.disc, material.walnut, [0, 0.725, 0], [0.8, 0.04, 0.8]);
    part(unit.box, material.walnut, [0, 0.36, 0], [0.14, 0.62, 0.14]);
    part(unit.disc, material.bronze, [0, 0.025, 0], [0.46, 0.05, 0.46]);
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
    // Lights for a performer (plaza-stage.js): a soft shaft fading upward and a warm
    // pool on the boards. Shown only while someone in town holds the stage.
    const top = origin[1] + 0.22, live = new THREE.Group(), glow = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
    const shaft = new THREE.CylinderGeometry(0.16, stage.radius * 0.8, 4.4, 40, 1, true), shaftAt = shaft.attributes.position, fade = [];
    for (let i = 0; i < shaftAt.count; i++) fade.push(1, 0.86, 0.62, (1 - (shaftAt.getY(i) + 2.2) / 4.4) * 0.2);
    shaft.setAttribute('color', new THREE.Float32BufferAttribute(fade, 4));
    const beam = new THREE.Mesh(shaft, new THREE.MeshBasicMaterial({ ...glow, vertexColors: true }));
    beam.position.set(origin[0], top + 2.2, origin[2]);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(stage.radius * 0.82, 48), new THREE.MeshBasicMaterial({ ...glow, color: '#ffdca8', opacity: 0.28 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(origin[0], top + 0.006, origin[2]);
    live.name = 'Stage lights'; live.visible = false; live.add(beam, pool); group.add(live);
    group.userData.stage = { setLive(on) { live.visible = Boolean(on); }, get live() { return live.visible; } };
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
    // A checkers disc with a turned rim; a king is two stacked. Twelve a side per table,
    // and up to all 64 squares for Reversi, whose black and white discs are the same disc.
    const disc = new THREE.CylinderGeometry(0.026, 0.0275, 0.009, 28).translate(0, 0.0045, 0);
    meshes.disc = new THREE.InstancedMesh(disc, piece, 64 * plan.chess.length);
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
    // Both tables share the frame, slot and disc geometries and materials.
    const frameGeometry = new THREE.BoxGeometry(width, height, 0.012), feetGeometry = new THREE.BoxGeometry(width + 0.04, 0.012, 0.09);
    const slotMaterial = new THREE.MeshStandardMaterial({ color: '#16294a', roughness: 0.6 }), discMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.38 });
    const fours = new Map(), tintOf = { r: new THREE.Color('#d2352d'), y: new THREE.Color('#f2c230') };
    const cellAt = index => [((index % 7) - 3) * FOUR, lift + (Math.floor(index / 7) + 0.5) * FOUR + 0.015, 0];
    for (const table of plan.chess) {
      const [, y] = base(table), centre = chessCellPosition(table, { i: 3.5, j: 3.5 }), across = chessCellPosition(table, { i: 4.5, j: 3.5 });
      const holder = new THREE.Group(); holder.name = `Connect Four ${table.id}`; holder.visible = false;
      holder.position.set(centre[0], y + 0.774, -centre[1]);
      holder.rotation.y = Math.atan2(-(-across[1] + centre[1]), across[0] - centre[0]);
      const frame = new THREE.Mesh(frameGeometry, frameMaterial);
      frame.position.y = lift + height / 2; frame.castShadow = frame.receiveShadow = true;
      const feet = new THREE.Mesh(feetGeometry, frameMaterial);
      feet.position.y = 0.006;
      const slots = new THREE.InstancedMesh(fourSlot, slotMaterial, 42);
      for (let index = 0; index < 42; index++) { dummy.position.set(...cellAt(index)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); slots.setMatrixAt(index, dummy.matrix); }
      const discs = new THREE.InstancedMesh(fourDisc, discMaterial, 42);
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
  // Nine men's morris (plaza-table-games.js): a walnut board laid over a chess table's
  // squares while morris is that table's game, with its three squares and joining lines
  // inlaid in brass and the pieces on its 24 points. White sits at the first player's chair.
  {
    const span = 8 * CHESS_CELL_M, step = span / MORRIS_SIZE, top = 0.774 + 0.006;
    // A point's chess-cell coordinates (fractional), turned for the first player's chair.
    const cellOfPoint = (point, firstChair) => {
      let file = point % MORRIS_SIZE, rank = Math.floor(point / MORRIS_SIZE);
      if (firstChair === 1) { file = MORRIS_SIZE - 1 - file; rank = MORRIS_SIZE - 1 - rank; }
      return { i: 3.5 + (file - 3) * step / CHESS_CELL_M, j: 3.5 + (rank - 3) * step / CHESS_CELL_M };
    };
    const walnut = new THREE.MeshStandardMaterial({ color: '#5b3a26', roughness: 0.5 }), brass = new THREE.MeshStandardMaterial({ color: '#c9a45c', roughness: 0.32, metalness: 0.55 });
    const plate = new THREE.BoxGeometry(span + 0.012, 0.006, span + 0.012), stud = new THREE.CylinderGeometry(0.009, 0.009, 0.002, 16);
    const piece = new THREE.CylinderGeometry(0.019, 0.02, 0.008, 24).translate(0, 0.004, 0), pieceMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
    const tint = { w: new THREE.Color('#efe6d4'), b: new THREE.Color('#2b2522') }, boards = new Map();
    for (const table of plan.chess) {
      const [, y] = base(table), holder = new THREE.Group();
      holder.name = `Morris ${table.id}`; holder.visible = false; group.add(holder);
      const [east, north] = chessCellPosition(table, { i: 3.5, j: 3.5 });
      const board = new THREE.Mesh(plate, walnut); board.position.set(east, y + 0.774 + 0.003, -north); board.receiveShadow = true; holder.add(board);
      // The lines: one brass strip per neighbouring pair along each mill.
      const strips = [];
      for (const [a, b, c] of MORRIS_MILLS) for (const [from, to] of [[a, b], [b, c]]) strips.push([from, to]);
      const lines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.0015, 0.0035), brass, strips.length), studs = new THREE.InstancedMesh(stud, brass, MORRIS_POINTS.length);
      const pieces = new THREE.InstancedMesh(piece, pieceMaterial, 18);
      Object.assign(pieces, { name: `Morris pieces ${table.id}`, castShadow: true, receiveShadow: true, count: 0 });
      holder.add(lines, studs, pieces);
      boards.set(table.id, { holder, lines, studs, pieces, strips, y, table, firstChair: -1 });
    }
    const layout = (entry, firstChair) => {
      const { lines, studs, strips, y, table } = entry, at = point => chessCellPosition(table, cellOfPoint(point, firstChair));
      strips.forEach(([from, to], index) => {
        const [e1, n1] = at(from), [e2, n2] = at(to);
        dummy.position.set((e1 + e2) / 2, y + top, -(n1 + n2) / 2); dummy.rotation.set(0, -Math.atan2(-(n2 - n1), e2 - e1), 0);
        dummy.scale.set(Math.hypot(e2 - e1, n2 - n1), 1, 1); dummy.updateMatrix(); lines.setMatrixAt(index, dummy.matrix);
      });
      MORRIS_POINTS.forEach((point, index) => {
        const [e, n] = at(point);
        dummy.position.set(e, y + top, -n); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); studs.setMatrixAt(index, dummy.matrix);
      });
      lines.instanceMatrix.needsUpdate = studs.instanceMatrix.needsUpdate = true; lines.computeBoundingSphere(); studs.computeBoundingSphere();
      entry.firstChair = firstChair;
    };
    group.userData.morris = {
      // A table's morris board (49 cells from morris-rules.js) and the first player's
      // chair, or null to put the board away.
      show(tableId, board = null, firstChair = 0) {
        const entry = boards.get(tableId);
        if (!entry) return false;
        entry.holder.visible = Boolean(board);
        if (!board) return true;
        const chair = firstChair === 1 ? 1 : 0;
        if (entry.firstChair !== chair) layout(entry, chair);
        let count = 0;
        for (const point of MORRIS_POINTS) {
          const side = board[point];
          if (!tint[side] || count >= 18) continue;
          const [e, n] = chessCellPosition(entry.table, cellOfPoint(point, chair));
          dummy.position.set(e, entry.y + top, -n); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          entry.pieces.setColorAt(count, tint[side]); entry.pieces.setMatrixAt(count++, dummy.matrix);
        }
        entry.pieces.count = count; entry.pieces.instanceMatrix.needsUpdate = true;
        if (entry.pieces.instanceColor) entry.pieces.instanceColor.needsUpdate = true;
        entry.pieces.computeBoundingSphere();
        return true;
      },
      visible: tableId => boards.get(tableId)?.holder.visible ?? null,
      pieces: tableId => boards.get(tableId)?.pieces.count ?? null,
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
  // Backgammon checkers: one InstancedMesh for both colours (instance colours), set
  // from a game's points, bar and borne-off trays; idle, the table shows the opening.
  {
    const table = plan.backgammon, [, y] = base(table), top = y + 0.759, tint = [new THREE.Color('#efe6d4'), new THREE.Color('#2b2522')];
    const checkers = new THREE.InstancedMesh(new THREE.CylinderGeometry(BACKGAMMON.radius, BACKGAMMON.radius, 0.007, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), 30);
    Object.assign(checkers, { name: 'Backgammon checkers', castShadow: true, receiveShadow: true, count: 0 });
    group.add(checkers);
    const show = (game = null, whiteChair = 0) => {
      const position = game ?? backgammonStart(1);
      checkers.count = 0;
      const put = (place, slot, colour) => {
        const spot = backgammonSpot(table, place, slot, whiteChair);
        dummy.position.set(spot.position[0], top + 0.0035 + spot.layer * 0.0075, -spot.position[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        checkers.setColorAt(checkers.count, tint[colour]); checkers.setMatrixAt(checkers.count++, dummy.matrix);
      };
      for (let point = 1; point <= 24; point++) for (let slot = 0; slot < Math.abs(position.points[point]); slot++) put(point, slot, position.points[point] > 0 ? 0 : 1);
      for (const colour of [0, 1]) {
        for (let slot = 0; slot < position.bar[colour]; slot++) put(colour ? 'bar-black' : 'bar-white', slot, colour);
        for (let slot = 0; slot < position.off[colour]; slot++) put(colour ? 'off-black' : 'off-white', slot, colour);
      }
      checkers.instanceMatrix.needsUpdate = true; if (checkers.instanceColor) checkers.instanceColor.needsUpdate = true; checkers.computeBoundingSphere();
    };
    show();
    group.userData.backgammon = {
      // A position ({ points, bar, off } from backgammon-rules.js) or null for the opening, and white's chair.
      show,
      count: () => checkers.count,
      // Puts the checkers away while the table plays cribbage.
      setVisible(visible) { checkers.visible = visible; },
      visible: () => checkers.visible,
    };
  }
  // Cribbage on the walnut table: a maple pegging board laid over the backgammon board,
  // two lanes of sixty holes out and back, an ivory peg for the chair across the board
  // from you and a red one for yours, a cut deck and the starter; shown while cribbage
  // is the table's game.
  {
    const table = plan.backgammon, [tx, y, tz] = base(table), top = y + 0.759 + 0.012;
    const board = new THREE.Group(); board.name = 'Cribbage board'; board.visible = false; group.add(board);
    const plank = new THREE.Mesh(unit.box, new THREE.MeshStandardMaterial({ color: '#c99a5e', roughness: 0.55 }));
    plank.position.set(tx, top - 0.006, tz); plank.scale.set(0.12, 0.012, 0.46); plank.castShadow = plank.receiveShadow = true;
    const holes = new THREE.InstancedMesh(unit.disc, material.ebony, 244);
    const pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.022, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), 2);
    pegs.count = 0; pegs.castShadow = true;
    const deck = new THREE.Mesh(unit.box, new THREE.MeshStandardMaterial({ color: '#7b2f45', roughness: 0.55 }));
    deck.position.set(tx - 0.13, top + 0.01, tz); deck.scale.set(0.063, 0.02, 0.088);
    board.add(plank, holes, pegs, deck);
    // The hole for a score on one side (0: the near lane from chair 0, 1: the far), out along the outer row and back along the inner.
    const hole = (side, score) => {
      const sign = side === 0 ? 1 : -1, back = score > 60, step = Math.min(score, 120) - (back ? 60 : 0);
      const along = back ? 0.21 - (step - 1) * 0.007 : -0.21 + (step - 1) * 0.007, across = sign * (back ? 0.016 : 0.04);
      return score >= 121 ? [0, -0.222] : [across, along];
    };
    for (let side = 0; side < 2; side++) for (let score = 1; score <= 120; score++) {
      const [across, along] = hole(side, score);
      dummy.position.set(tx + across, top + 0.0002, tz + along); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.0035, 0.0004, 0.0035); dummy.updateMatrix(); holes.setMatrixAt(side * 120 + score - 1, dummy.matrix);
    }
    holes.count = 240;
    const tint = [new THREE.Color('#b7342c'), new THREE.Color('#efe6d4')];
    group.userData.cribbage = {
      // Scores [yours, the other's] with your chair (0 east, 1 west), or null to put the pegs away.
      show(scores = null, yourChair = 0) {
        pegs.count = 0;
        if (scores) scores.forEach((score, player) => {
          // Your lane is the one nearer your chair.
          const side = (yourChair === 0) === (player === 0) ? 0 : 1, [across, along] = score > 0 ? hole(side, score) : [(side === 0 ? 1 : -1) * 0.04, -0.226];
          dummy.position.set(tx + across, top + 0.011, tz + along); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          pegs.setColorAt(pegs.count, tint[player]); pegs.setMatrixAt(pegs.count++, dummy.matrix);
        });
        pegs.instanceMatrix.needsUpdate = true; if (pegs.instanceColor) pegs.instanceColor.needsUpdate = true; pegs.computeBoundingSphere();
      },
      pegs: () => pegs.count,
      setVisible(visible) { board.visible = visible; },
      visible: () => board.visible,
    };
  }
  // Jenga on the bench's drum: one InstancedMesh of maple blocks (a little colour
  // variation each), standing as the game's tower, or scattered over the drum and the
  // paving once it falls. Idle, the full tower stands.
  {
    const { bench } = plan, [, y] = base(bench), [ox, , oz] = base({ x: bench.x + JENGA.offset[0], north: bench.north + JENGA.offset[1] });
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(JENGA.length, JENGA.height, JENGA.width), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72 }), 80);
    Object.assign(blocks, { name: 'Jenga blocks', castShadow: true, receiveShadow: true, count: 0 });
    group.add(blocks);
    const grain = Array.from({ length: 80 }, (_, i) => new THREE.Color('#d9b98b').offsetHSL(0, 0, (seededRandom(Math.imul(i + 1, 0x9e3779b1) >>> 0)() - 0.5) * 0.08));
    const put = (x, height, z, yaw, roll = 0) => {
      dummy.position.set(x, y + height, z); dummy.rotation.set(0, yaw, roll); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      blocks.setColorAt(blocks.count, grain[blocks.count]); blocks.setMatrixAt(blocks.count++, dummy.matrix);
    };
    let fallen = false;
    const show = (tower = null) => {
      const state = tower ?? startTower();
      blocks.count = 0; fallen = Boolean(state.fallen);
      if (!state.fallen) {
        state.levels.forEach((row, level) => row.forEach((present, slot) => {
          if (!present) return;
          const spot = jengaBlock(bench, level, slot), [x, , z] = base({ x: spot.position[0], north: spot.position[1] });
          put(x, spot.height, z, spot.yaw);
        }));
      } else {
        // Fallen: each block lands where its own seeded throw sends it, mostly away from the
        // bench; those that stay within the drum lie on it, the rest on the paving.
        // A toppling pull leaves its block in the tower, so the tower's count is every block.
        const total = state.levels.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
        const salt = Math.imul(state.pulls + 1, 0x85ebca6b) ^ Math.imul(state.fallen.level * 3 + state.fallen.slot + 1, 0xc2b2ae35);
        for (let i = 0; i < total; i++) {
          const random = seededRandom((salt ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0), angle = Math.PI * (random() * 1.5 - 0.75), reach = 0.05 + random() * 0.75;
          const x = ox + Math.sin(angle) * reach, z = oz - Math.cos(angle) * reach, onDrum = Math.hypot(x - ox + JENGA.offset[0], z - oz - JENGA.offset[1]) < JENGA.drumRadius - 0.05;
          const lying = (onDrum ? JENGA.drumTop : 0) + JENGA.height / 2 + (onDrum && reach < 0.12 ? JENGA.height * Math.floor(random() * 3) : 0);
          put(x, lying, z, random() * Math.PI, random() < 0.3 ? Math.PI / 2 : 0);
        }
      }
      blocks.instanceMatrix.needsUpdate = true; if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true; blocks.computeBoundingSphere();
    };
    show();
    group.userData.jenga = {
      // A tower ({ levels, fallen } from jenga-rules.js), or null for the full tower.
      show,
      count: () => blocks.count,
      fallen: () => fallen,
      // Puts the tower away while the drum plays Yacht.
      setVisible(visible) { blocks.visible = visible; },
      visible: () => blocks.visible,
    };
  }
  // Yacht on the same drum: five dice where the tower stands, the rolled ones tumbled a
  // little (a seeded turn from their values), the kept ones lined up toward the bench.
  // Shown while Yacht is in play.
  {
    const { bench } = plan, [, y] = base(bench), size = 0.018, top = y + JENGA.drumTop + size / 2;
    const [ox, , oz] = base({ x: bench.x + JENGA.offset[0], north: bench.north + JENGA.offset[1] });
    const dice = ivoryDice(group, { size, count: 5, name: 'Yacht dice' });
    dice.visible = false;
    group.add(dice);
    const show = (values = null, held = []) => {
      dice.count = 0;
      (values ?? [1, 2, 3, 4, 5]).forEach((value, i) => {
        const kept = !values || held[i], random = seededRandom((Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(value * 7 + (values ? 1 : 0), 0x85ebca6b)) >>> 0);
        const x = ox + (i - 2) * size * 2.4 + (kept ? 0 : (random() - 0.5) * 0.03), z = oz - (kept ? 0.07 : 0) + (kept ? 0 : (random() - 0.5) * 0.05), [rx, , rz] = DIE_UP[value];
        dummy.position.set(x, top, z); dummy.rotation.set(rx, kept ? 0 : random() * Math.PI, rz, 'YXZ'); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dice.setMatrixAt(dice.count++, dummy.matrix);
        dummy.rotation.order = 'XYZ';
      });
      dice.instanceMatrix.needsUpdate = true; dice.computeBoundingSphere();
    };
    show();
    group.userData.yacht = {
      // The dice (values, or null before the first roll) and which are kept.
      show,
      dice: () => dice.count,
      setVisible(visible) { dice.visible = visible; },
      visible: () => dice.visible,
    };
  }
  // Wine pong: twelve wine glasses (clear bowls on stems, a pour of red in each) racked
  // at the table's two ends, standing glasses only, and the ball, shown in flight.
  {
    const table = plan.winePong, [, y] = base(table), top = y + PONG_TABLE.height;
    const profile = [[0, 0], [0.034, 0], [0.034, 0.004], [0.005, 0.008], [0.004, 0.085], [0.016, 0.092], [0.036, 0.11], [0.042, 0.135], [0.039, GLASS_HEIGHT], [0.0375, GLASS_HEIGHT]].map(([r, h]) => new THREE.Vector2(r, h));
    const bowl = new THREE.MeshStandardMaterial({ color: '#eef4f6', roughness: 0.06, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const glasses = new THREE.InstancedMesh(new THREE.LatheGeometry(profile, 20), bowl, 12);
    const wine = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.033, 0.02, 0.028, 18), new THREE.MeshStandardMaterial({ color: '#5a0f1c', roughness: 0.25 }), 12);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.4 }));
    Object.assign(glasses, { name: 'Wine pong glasses', count: 0, renderOrder: 2 });
    Object.assign(wine, { name: 'Wine pong wine', count: 0, castShadow: true });
    Object.assign(ball, { name: 'Wine pong ball', visible: false, castShadow: true });
    group.add(glasses, wine, ball);
    const scenePoint = ([u, v], height) => { const [east, north] = winePongPoint(table, [u, v]); const [x, , z] = base({ x: east, north }); return [x, y + height, z]; };
    const show = (game = null) => {
      const racks = game?.glasses ?? [Array(6).fill(true), Array(6).fill(true)];
      glasses.count = 0; wine.count = 0;
      racks.forEach((rack, side) => rack.forEach((standing, k) => {
        if (!standing) return;
        const [x, , z] = scenePoint(glassAt(side, k), 0);
        dummy.position.set(x, top, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); glasses.setMatrixAt(glasses.count++, dummy.matrix);
        dummy.position.set(x, top + 0.104, z); dummy.updateMatrix(); wine.setMatrixAt(wine.count++, dummy.matrix);
      }));
      for (const mesh of [glasses, wine]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    };
    show();
    group.userData.winePong = {
      // A game ({ glasses } from wine-pong-rules.js) or null for two full racks.
      show,
      // The ball at a point of its flight ([u, v, height above the paving] in the table's frame), or null to put it away.
      ball(point = null) { ball.visible = Boolean(point); if (point) ball.position.set(...scenePoint([point[0], point[1]], point[2])); },
      glasses: () => glasses.count,
      ballVisible: () => ball.visible,
      stand: side => winePongPoint(table, [side === 0 ? -WINE_PONG_STAND : WINE_PONG_STAND, 0]),
      // Puts the glasses away while the table plays shuffleboard.
      setVisible(visible) { glasses.visible = wine.visible = visible; },
      visible: () => glasses.visible,
    };
    // Shuffleboard on the same table: eight weighted pucks (red and blue), placed from the
    // throwing end in the rules' frame (u from that end, v across); shown while it is in play.
    const pucks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.029, 0.029, 0.016, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.35 }), 8);
    Object.assign(pucks, { name: 'Shuffleboard pucks', count: 0, castShadow: true, visible: false });
    group.add(pucks);
    const puckTint = [new THREE.Color('#b7342c'), new THREE.Color('#2f5fae')];
    group.userData.shuffleboard = {
      // Pucks ({ owner, u, v, out }) thrown from end `side` (0 west, 1 east); out ones are not shown.
      show(list = [], side = 0) {
        pucks.count = 0;
        for (const puck of list) {
          if (puck.out || pucks.count >= 8) continue;
          const forward = side === 0 ? 1 : -1, [x, , z] = scenePoint([-forward * PONG_TABLE.length / 2 + forward * puck.u, puck.v * forward], 0);
          dummy.position.set(x, top + 0.008, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          pucks.setColorAt(pucks.count, puckTint[puck.owner]); pucks.setMatrixAt(pucks.count++, dummy.matrix);
        }
        pucks.instanceMatrix.needsUpdate = true; if (pucks.instanceColor) pucks.instanceColor.needsUpdate = true; pucks.computeBoundingSphere();
      },
      count: () => pucks.count,
      setVisible(visible) { pucks.visible = visible; },
      visible: () => pucks.visible,
    };
  }
  // Mancala seeds: glass beads in a few colours, one InstancedMesh, heaped in their pits
  // on a little spiral so a pit's count reads at a glance. Idle, the opening stands.
  // The board (a carved teak slab with ebony cups) is its own group, put away while
  // the table plays Go.
  {
    const table = plan.grove, [tx, y, tz] = base(table), top = y + MANCALA.top + 0.008;
    const board = new THREE.Group(); board.name = 'Mancala board'; group.add(board);
    const slab = new THREE.Mesh(unit.box, material.teak); slab.position.set(tx, y + MANCALA.top - 0.012, tz); slab.scale.set(MANCALA.depth, 0.024, MANCALA.length); slab.castShadow = slab.receiveShadow = true;
    const cups = new THREE.InstancedMesh(unit.disc, material.ebony, 14);
    for (let index = 0; index < 14; index++) {
      const [east, north] = mancalaSpot(table, index, 0), [x, , z] = base({ x: east, north }), store = index === 6 || index === 13;
      dummy.position.set(x, y + MANCALA.top + 0.0005, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(...(store ? [0.075, 0.002, 0.11] : [0.058, 0.002, 0.058])); dummy.updateMatrix(); cups.setMatrixAt(index, dummy.matrix);
    }
    board.add(slab, cups);
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0075, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.05 }), 48);
    Object.assign(beads, { name: 'Mancala seeds', castShadow: true, count: 0 });
    group.add(beads);
    const tints = ['#2f7d6a', '#b8463a', '#d9a441', '#3f5fa8', '#e9e2d0'].map(colour => new THREE.Color(colour));
    const show = (game = null, sideZeroChair = 0) => {
      const board = (game ?? mancalaStart()).board;
      beads.count = 0;
      board.forEach((seeds, index) => {
        const [east, north] = mancalaSpot(table, index, sideZeroChair), store = index === 6 || index === 13;
        for (let k = 0; k < seeds && beads.count < 48; k++) {
          // A spiral heap: rings of six, rising a little each ring; stores spread along their length.
          const ring = Math.floor(k / 6), angle = k * 2.4, radius = k === 0 ? 0 : 0.008 + ring * 0.006;
          const [x, , z] = base({ x: east + Math.cos(angle) * radius, north: north + Math.sin(angle) * radius * (store ? 2.2 : 1) });
          dummy.position.set(x, top + ring * 0.006, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          beads.setColorAt(beads.count, tints[(index * 7 + k) % tints.length]); beads.setMatrixAt(beads.count++, dummy.matrix);
        }
      });
      beads.instanceMatrix.needsUpdate = true; if (beads.instanceColor) beads.instanceColor.needsUpdate = true; beads.computeBoundingSphere();
    };
    show();
    group.userData.mancala = {
      // A game ({ board } from mancala-rules.js) or null for the opening, and the chair side 0 sits in.
      show,
      count: () => beads.count,
      // Puts the board and beads away while the table plays something else.
      setVisible(visible) { board.visible = beads.visible = visible; },
      visible: () => board.visible,
    };
  }
  // Go on the grove table: a kaya goban with its grid and star points, and the stones
  // (black and white, one InstancedMesh), shown only while Go is the table's game.
  {
    const table = plan.grove, [tx, y, tz] = base(table), top = y + MANCALA.top - 0.012 + GO.thick;
    const goban = new THREE.Group(); goban.name = 'Goban'; goban.visible = false; group.add(goban);
    const wood = new THREE.Mesh(unit.box, new THREE.MeshStandardMaterial({ color: '#d9b26b', roughness: 0.6 }));
    wood.position.set(tx, top - GO.thick / 2, tz); wood.scale.set(GO.board, GO.thick, GO.board); wood.castShadow = wood.receiveShadow = true;
    const lines = new THREE.InstancedMesh(unit.box, new THREE.MeshStandardMaterial({ color: '#2b2116', roughness: 0.8 }), 18 + 5);
    const span = 8 * GO.spacing;
    for (let i = 0; i < 9; i++) {
      const offset = (i - 4) * GO.spacing;
      dummy.rotation.set(0, 0, 0); dummy.position.set(tx + offset, top + 0.0004, tz); dummy.scale.set(0.0012, 0.0008, span); dummy.updateMatrix(); lines.setMatrixAt(i, dummy.matrix);
      dummy.position.set(tx, top + 0.0004, tz + offset); dummy.scale.set(span, 0.0008, 0.0012); dummy.updateMatrix(); lines.setMatrixAt(9 + i, dummy.matrix);
    }
    [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]].forEach(([r, c], i) => { dummy.position.set(tx + (r - 4) * GO.spacing, top + 0.0005, tz + (c - 4) * GO.spacing); dummy.scale.set(0.006, 0.001, 0.006); dummy.updateMatrix(); lines.setMatrixAt(18 + i, dummy.matrix); });
    const stones = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 16, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), 81);
    Object.assign(stones, { name: 'Go stones', castShadow: true, count: 0 });
    goban.add(wood, lines, stones);
    const colour = { b: new THREE.Color('#151515'), w: new THREE.Color('#f2efe6') };
    group.userData.go = {
      // A game ({ board } from go-rules.js) and the chair black sits in; null clears the stones.
      show(game = null, blackChair = 0) {
        stones.count = 0;
        (game?.board ?? []).forEach((stone, index) => {
          if (!stone) return;
          const [east, north] = goSpot(table, index, blackChair), [x, , z] = base({ x: east, north });
          dummy.position.set(x, top + 0.007, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 0.42, 1); dummy.updateMatrix();
          stones.setColorAt(stones.count, colour[stone]); stones.setMatrixAt(stones.count++, dummy.matrix);
        });
        stones.instanceMatrix.needsUpdate = true; if (stones.instanceColor) stones.instanceColor.needsUpdate = true; stones.computeBoundingSphere();
      },
      count: () => stones.count,
      setVisible(visible) { goban.visible = visible; },
      visible: () => goban.visible,
    };
  }
  // Darts: a dark post backed against the wall, a round backboard, and the board itself,
  // painted from the rules' own geometry (darts-rules.js scoreAt), facing the throwing
  // line; the turn's darts stand in it where they landed.
  {
    const board = plan.darts, [x, y, z] = base(board), yaw = board.heading + Math.PI;
    const wood = new THREE.MeshStandardMaterial({ color: '#2a211b', roughness: 0.7 });
    const post = new THREE.Mesh(unit.box, wood); post.position.set(x, y + 1.0, z); post.scale.set(0.12, 2.0, 0.12); post.castShadow = post.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 40).rotateX(Math.PI / 2), wood);
    const face = dataTexture(256, (px, py, w, h) => {
      const r = DARTS.radius * 1000, mx = ((px + 0.5) / w * 2 - 1) * r, my = ((py + 0.5) / h * 2 - 1) * r, hit = scoreAt([mx, my]), dist = Math.hypot(mx, my);
      if (dist > 170) return dist > r ? [0, 0, 0, 0] : [24, 22, 21, 255];
      if (hit.number === 25) return hit.value === 50 ? [176, 32, 38, 255] : [32, 120, 64, 255];
      const dark = [20, 18, 13, 10, 2, 3, 7, 8, 14, 12].includes(hit.number);
      if (hit.multiplier === 1) return dark ? [28, 26, 24, 255] : [236, 222, 190, 255];
      return dark ? [176, 32, 38, 255] : [32, 120, 64, 255];
    }, { repeat: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(DARTS.radius, 64), new THREE.MeshStandardMaterial({ map: face, roughness: 0.85, alphaTest: 0.5 }));
    const holder = new THREE.Group(); holder.name = 'Dartboard'; holder.position.set(x, y + DARTS.bull, z); holder.rotation.y = yaw;
    back.position.set(0, 0, 0.015); disc.position.set(0, 0, 0.032);
    holder.add(back, disc);
    const darts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0035, 0.0018, 0.12, 8).rotateX(Math.PI / 2).translate(0, 0, 0.06), new THREE.MeshStandardMaterial({ color: '#d9c27a', metalness: 0.5, roughness: 0.4 }), 3);
    Object.assign(darts, { name: 'Darts in the board', count: 0, castShadow: true });
    { const holderTexture = new THREE.Object3D(); holderTexture.userData.texture = face; group.add(holderTexture); }
    group.add(post, holder, darts);
    group.userData.darts = {
      // The turn's darts ([x, y] in mm on the board), or none.
      show(points = []) {
        darts.count = 0;
        for (const point of points.slice(0, 3)) {
          const [east, north, height] = dartSpot(board, point), [px, , pz] = base({ x: east, north });
          dummy.position.set(px, y + height, pz); dummy.rotation.set(0, board.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); darts.setMatrixAt(darts.count++, dummy.matrix);
        }
        darts.instanceMatrix.needsUpdate = true; darts.computeBoundingSphere();
      },
      count: () => darts.count,
    };
  }
  // Liar's dice at the café table: a leather cup upside down before each player still in,
  // lifted when a call shows the dice; the dice are ivory cubes with painted pips, each
  // turned so its value faces up.
  {
    const table = plan.round, [tx, ty, tz] = base(table), top = ty + 0.77, size = 0.016;
    const dice = ivoryDice(group, { size, count: 20, name: 'Liar’s dice' });
    const cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.042, 0.052, 0.085, 24), new THREE.MeshStandardMaterial({ color: '#5a3a26', roughness: 0.7 }), 4);
    Object.assign(cups, { name: 'Dice cups', count: 0, castShadow: true });
    group.add(dice, cups);
    const at = (chair, out, along = 0) => { const angle = cafeChairAngle(chair); return [tx + Math.sin(angle) * out + Math.cos(angle) * along, tz + Math.cos(angle) * out - Math.sin(angle) * along, angle]; };
    group.userData.dice = {
      // Cups by chair ({ chair, dice: [values], open }); null clears the table.
      show(game = null) {
        dice.count = 0; cups.count = 0;
        for (const { chair, dice: values, open } of game?.cups ?? []) {
          if (!values.length) continue;
          const [cx, cz, angle] = at(chair, 0.3);
          if (!open) { dummy.position.set(cx, top + 0.0425, cz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); cups.setMatrixAt(cups.count++, dummy.matrix); continue; }
          values.forEach((value, i) => {
            const [x, z] = at(chair, 0.27 + (i % 2) * 0.022, (i - (values.length - 1) / 2) * 0.022);
            const [rx, ry, rz] = DIE_UP[value];
            dummy.position.set(x, top + size / 2, z); dummy.rotation.set(rx, ry + angle, rz, 'YXZ'); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dice.setMatrixAt(dice.count++, dummy.matrix);
          });
          dummy.rotation.order = 'XYZ';
        }
        for (const mesh of [dice, cups]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
      },
      count: () => ({ cups: cups.count, dice: dice.count }),
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
  // The bike rack: a bronze bar on two posts along the north footway, with a parked
  // bicycle on each slot while nobody has it out (plazaSalonRack). The bar joins the
  // instanced batches above; each bike is the road vehicle's own small group.
  const slots = plazaSalonRack(world), models = [];
  {
    const { rack } = plan, origin = base(rack), yaw = rack.heading, part = (geometry, m, local, scale) => add(geometry, m, at(origin, yaw, local), scale, yaw);
    part(unit.box, material.bronze, [0, 0.8, 0], [rack.length, 0.05, 0.05]);
    for (const lx of [-1, 1].map(side => side * (rack.length / 2 - 0.3))) {
      part(unit.post, material.bronze, [lx, 0.4, 0], [0.07, 0.8, 0.07]);
      part(unit.disc, material.bronze, [lx, 0.015, 0], [0.22, 0.03, 0.22]);
    }
    const bikes = new THREE.Group(); bikes.name = 'Parked bikes'; group.add(bikes);
    for (const slot of slots) {
      const model = createRoadVehicle('bicycle'), [x, y, z] = base(slot);
      // The vehicle mesh faces local -X; a heading (0 = south = scene +Z) is the yaw of a
      // model facing +Z, so the bike turns a further quarter (see parked-carriage pose).
      model.object.position.set(x, y, z); model.object.rotation.y = slot.heading + Math.PI / 2;
      bikes.add(model.object); models.push(model);
    }
  }
  const parked = slots.map(() => true);
  group.userData.rack = {
    slots: slots.length,
    parked: () => parked.slice(),
    // Hide the bikes whose slots are taken (slot ids from the cycling snapshot); true when anything changed.
    setTaken(taken) {
      const held = new Set(taken ?? []); let changed = false;
      slots.forEach((slot, i) => { const show = !held.has(slot.id); if (parked[i] !== show) { parked[i] = show; models[i].object.visible = show; changed = true; } });
      return changed;
    },
    dispose: () => models.forEach(model => model.dispose()),
  };
  group.userData.counts = { chairs: plan.chairs.length, chess: plan.chess.length, planters: plan.planters.length, lanterns: plan.lanterns.length, strands: plan.strands.length, rackSlots: slots.length };
  return group;
}
