import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIpicMaterials, districtSignLayout } from './ipic-materials.js';

// Where the upper lounge's carpet meets the Tuck Room's boards, west of the bar stools (a = 3.4).
const TUCK_ROOM_EDGE = 2.65;
import { IPIC_BACK_BAR, IPIC_BAR, IPIC_DARTS, IPIC_ESCALATOR, IPIC_FLIGHTS, IPIC_INTERIOR, IPIC_PLANTERS, IPIC_RISER, IPIC_SCREEN, IPIC_SOFA_ARMS, IPIC_SOFA_D, ipicFloor } from './ipic-plan.js';
import { dartboardPixel } from './dartboard-texture.js';

// Editable metre-scale scene. Local +X=across frontage, -Z=into the venue,
// +Y=up. Furniture shares geometry; static parts merge per zone/material.

export function buildIpicInterior(room, options = {}) {
  if (room?.interior !== IPIC_INTERIOR) throw new Error('An IPIC room plan is required');
  const root = new THREE.Group(); root.name = 'IPIC River Oaks'; root.userData.interior = IPIC_INTERIOR;
  const finishes = createIpicMaterials(options), { m } = finishes;
  const geometry = new Set(), batches = new Map();
  const keep = g => { geometry.add(g); return g; };
  const cube = keep(new THREE.BoxGeometry(1, 1, 1));
  const rounded = keep(new RoundedBoxGeometry(1, 1, 1, 3, .1));
  const cylinder = keep(new THREE.CylinderGeometry(.5, .5, 1, 16));
  const sphere = keep(new THREE.SphereGeometry(.5, 12, 8));
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  // A barrel tub chair's shell (photo review P10, IMG_9758): it wraps three quarters of the way round and
  // opens towards -d at yaw 0.
  // A pothos leaf, pointed at its tip, and an upright wine glass with its foot at the origin.
  const leafCard = keep(new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).quadraticCurveTo(.07, .025, 0, .11).quadraticCurveTo(-.07, .025, 0, 0), 3));
  const stemGlass = keep(new THREE.LatheGeometry([[0,0],[.035,0],[.035,.005],[.004,.01],[.004,.09],[.02,.1],[.045,.15],[.04,.21],[.036,.215]].map(p => new THREE.Vector2(...p)), 10));
  // Seeded, so every export places the leaves the same way.
  let seed = 9757;
  const random = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const barrelShell = keep(new THREE.LatheGeometry([[.34,.28],[.39,.46],[.41,.8],[.385,.9],[.33,.9],[.3,.78],[.28,.46]].map(p => new THREE.Vector2(...p)), 36, Math.PI / 4, Math.PI * 1.5));
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  let zone;
  const section = name => { zone = new THREE.Group(); zone.name = name; root.add(zone); };
  function part(name, mat, a, y, d, w, h, l, { shape = cube, yaw = 0, pitch = 0, roll = 0 } = {}) {
    const key = `${zone.uuid}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { zone, mat, geometries: [] });
    matrix.compose(new THREE.Vector3(a, y, -d), quaternion.setFromEuler(euler.set(pitch, yaw, roll)), new THREE.Vector3(w, h, l));
    // Merged static meshes keep zone-level culling and a bounded draw-call count.
    const g = shape.clone().applyMatrix4(matrix); g.userData.role = name;
    batches.get(key).geometries.push(g);
  }
  const box = (mat, a, y, d, w, h, l, more) => part(mat.name, mat, a, y, d, w, h, l, more);
  const soft = (mat, a, y, d, w, h, l, more = {}) => box(mat, a, y, d, w, h, l, { shape: rounded, ...more });
  const rod = (mat, from, to, radius = .02) => {
    const p = new THREE.Vector3(from[0], from[1], -from[2]), q = new THREE.Vector3(to[0], to[1], -to[2]);
    const delta = q.clone().sub(p), length = delta.length();
    const mesh = new THREE.Mesh(cylinder, mat); mesh.position.copy(p.add(q).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); mesh.scale.set(radius * 2, length, radius * 2);
    mesh.updateMatrix(); const g = cylinder.clone().applyMatrix4(mesh.matrix);
    const key = `${zone.uuid}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { zone, mat, geometries: [] });
    batches.get(key).geometries.push(g);
  };
  function panel(mat, a, y, d, w, h, yaw = 0, uv) {
    const g = plane.clone();
    if (uv) { const coords = g.attributes.uv; uv.forEach(([u, v], i) => coords.setXY(i, u, 1 - v)); }
    keep(g); box(mat, a, y, d, w, h, 1, { shape: g, yaw });
  }
  const label = (text, a, y, d, w, h, more = {}) => panel(finishes.label(text, Array.isArray(text) ? text : [text], more), a, y, d, w, h, more.yaw ?? 0);
  const floor = (mat, d0, d1, y) => box(mat, room.center, y - .12, (d0 + d1) / 2, room.width, .24, d1 - d0);
  const ceiling = (d0, d1, y, material = m.timber) => box(material, room.center, y, (d0 + d1) / 2, room.width, .18, d1 - d0);
  function downlight(a, y, d) {
    box(m.bronze, a, y, d, .16, .045, .16, { shape: cylinder });
    box(m.glow, a, y - .035, d, .11, .025, .11, { shape: cylinder });
  }
  function planter(a, y, d, height = 1.5) {
    box(m.bronze, a, y + .28, d, .48, .56, .48, { shape: cylinder });
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.4, top = y + .5 + height * (.65 + .3 * Math.sin(i));
      rod(m.timber, [a, y + .4, d], [a + Math.cos(angle) * .22, top, d + Math.sin(angle) * .22], .01);
      // Broad leaves along the upper half of each stem (photo review P14 named the slab leaves these replace).
      for (let k = 0; k < 4; k++) {
        const t = .5 + .16 * k, x = a + Math.cos(angle) * .2 * t, z = d + Math.sin(angle) * .2 * t, h = y + .4 + (top - y - .4) * t;
        box(m.leaf, x, h, z, 2.4, 2.4, 2.4, { shape: leafCard, yaw: angle + (k % 2 ? .8 : -.8), pitch: -.35 - .2 * Math.sin(i * 3 + k), roll: .4 * Math.sin(i + k) });
      }
    }
  }
  // An elongated woven cocoon (photo review P8, IMG_9758): a closed rattan shell ribbed by its weave, open
  // at the bottom where the lamp shines through. Centred on y, it is 1.15 m tall at size 1.
  function cocoon(a, y, d, size = 1) {
    const height = 1.15 * size, radius = .24 * size, at = t => radius * Math.sin(Math.PI * t) ** .75;
    const profile = scale => Array.from({ length: 19 }, (_, i) => { const t = .1 + .9 * i / 18; return new THREE.Vector2(at(t) * scale, (t - .5) * height); });
    box(m.rattan, a, y, d, 1, 1, 1, { shape: keep(new THREE.LatheGeometry(profile(1), 24)) });
    const ribs = profile(1.03);
    for (let k = 0; k < 14; k++) box(m.timber, a, y, d, 1, 1, 1, { shape: keep(new THREE.LatheGeometry(ribs, 1, k * Math.PI / 7, .07)) });
    rod(m.black, [a, y + height / 2, d], [a, 10.25, d], .01);
    box(m.glow, a, y - .32 * height, d, .16, .16, .16, { shape: sphere });
  }
  function tub(a, y, d, yaw) {
    box(m.black, a, y + .14, d, .56, .28, .56, { shape: cylinder });
    box(m.leather, a, y + .42, d, .6, .2, .6, { shape: cylinder });
    box(m.leather, a, y, d, 1, 1, 1, { shape: barrelShell, yaw });
  }
  function recliner(seat) {
    const { a, d } = seat, y = ipicFloor(d);
    soft(m.black, a, y + .18, d, 1.15, .32, 1.4);
    soft(m.leather, a, y + .52, d, .83, .25, 1.02);
    soft(m.leather, a, y + 1.01, d - .47, .88, .95, .24, { pitch: -.13 });
    soft(m.leather, a, y + 1.43, d - .5, .65, .23, .26);
    for (const side of [-1, 1]) {
      soft(m.leather, a + side * .54, y + .68, d, .22, .45, 1.05);
      box(m.black, a + side * .54, y + .917, d + .3, .12, .018, .12, { shape: cylinder });
    }
    soft(m.leather, a, y + .37, d + .72, .82, .17, .45, { pitch: -.18 });
    box(m.timber, a + .76, y + .8, d + .1, .23, .035, .44);
  }

  // Reception from IMG_9738 (photo review P3, P4, P6; Val, 2026-10-18).
  section('Reception'); floor(m.receptionStone, 0, 6, 0); ceiling(0, 6, 3.9, m.plaster);
  for (const a of [room.aMin, room.aMax]) box(a === room.aMin ? m.timber : m.plaster, a, 1.95, 3, .15, 3.9, 6);
  // Large-format stone, its joints a shade darker than the stone rather than dark grout.
  for (let d = 0; d < 6; d += 1.2) box(m.stoneJoint, room.center, .006, d, room.width, .008, .008);
  for (let a = room.aMin; a < room.aMax; a += 1.2) box(m.stoneJoint, a, .006, 3, .008, .008, 6);
  // A coffered ceiling: a dropped perimeter band, its inner edge lit as a cove.
  for (const a of [room.aMin + .35, room.aMax - .35]) box(m.plaster, a, 3.7, 3, .7, .18, 6);
  for (const d of [.35, 5.65]) box(m.plaster, room.center, 3.7, d, room.width, .18, .7);
  for (const a of [room.aMin + .72, room.aMax - .72]) box(m.glow, a, 3.62, 3, .03, .02, 4.5);
  // The desk steps down to a lower counter at its west end, inside the same footprint (and collider).
  soft(m.bronze, 3.4, .12, 3.5, 3.55, .24, .82);
  soft(m.marble, 3.85, .58, 3.5, 2.7, .96, .85);
  soft(m.marble, 2.05, .38, 3.5, .9, .76, .85);
  // Close light-oak flutes behind the desk, lit along the top. They start east of the right
  // escalator lane (0.545-2.255), which the old backing and sign had hung across.
  for (let a = 2.45; a < 5.8; a += .06) box(m.lightOak, a, 1.8, 5.65, .045, 3.6, .1);
  box(m.glow, 4.125, 3.57, 5.56, 3.35, .02, .04);
  label('RIVER OAKS DISTRICT', 4.1, 2.1, 5.56, 3, .46, { layout: districtSignLayout, background: '#141210', color: '#ece5d6' });
  // A low linear pendant over the desk: horizontal lamps on a bronze bar, hung from the ceiling.
  rod(m.bronze, [1.9, 2.95, 3.5], [4.9, 2.95, 3.5], .018);
  for (const a of [2.1, 4.7]) rod(m.bronze, [a, 2.95, 3.5], [a, 3.81, 3.5], .006);
  for (let k = 0; k < 5; k++) box(m.glow, 2.15 + k * .625, 2.9, 3.5, .07, .26, .07, { shape: cylinder, roll: Math.PI / 2 });
  for (const p of IPIC_PLANTERS.filter(p => p[1] === 0)) planter(...p);
  label('TaxFree Shopping', room.aMin + .12, 1.9, 2.5, 1.8, .45, { yaw: Math.PI / 2 });
  for (let d = 1; d < 6; d += 2) for (const a of [-2.5, 1]) downlight(a, 3.77, d);
  // Brass lift doors visible in the ground lobby. They are architecture, not an
  // unimplemented interaction: the continuous escalator path is the public route.
  box(m.black, 5.3, 1.4, 5.88, 1.85, 2.8, .14);
  for (const a of [4.86, 5.74]) box(m.bronze, a, 1.4, 5.79, .86, 2.7, .055);
  label('IPIC & THE TUCK ROOM  ↗', -3.3, 2.45, 5.92, 3.8, .5);

  section('Escalators');
  // The runs share the ceilings of the floors they rise to (the mural landing's, then the upper
  // lounge's), so the atrium is closed overhead: from the landing the district's sky showed through
  // both runs (docs/ipic-review/photo-review.md, P1; IMG_9771 shows a closed ceiling).
  ceiling(6, 12, 6.7, m.plaster); ceiling(14, 20, 10.3, m.plaster);
  for (const f of IPIC_FLIGHTS) {
    const length = f.end - f.start, pitch = Math.atan2(3, length);
    for (const a of IPIC_ESCALATOR.lanes) {
      // Static treads at 10 cm rises; invisible continuous support is ipicFloor.
      for (let step = 0; step < 30; step++) {
        const d = f.start + (step + .5) * length / 30, y = f.base + (step + 1) * .1;
        box(m.steel, a, y - .08, d, IPIC_ESCALATOR.treadWidth, .16, length / 30);
        box(m.yellow, a, y + .003, d - .085, 1.48, .012, .016);
        for (let k = -6; k <= 6; k++) box(m.black, a + k * .095, y + .005, d, .012, .01, .17);
      }
      for (const side of [-1, 1]) {
        const edge = a + side * IPIC_ESCALATOR.railOffset;
        box(m.glass, edge, f.base + 2.03, (f.start + f.end) / 2, .06, 1, Math.hypot(length, 3), { pitch });
        rod(m.black, [edge, f.base + 1.02, f.start], [edge, f.base + 4.02, f.end], IPIC_ESCALATOR.railWidth / 2);
        rod(m.steel, [edge, f.base + .15, f.start], [edge, f.base + 3.15, f.end], .045);
      }
    }
    // Steel decks close the runs between the lanes and beside them, so the street's ground no longer
    // shows through under either flight (photo review P18). They sit at the treads' own slope.
    for (const [a0, a1] of [[-.65, .65], [-2.63, -2.15], [2.15, 2.63]]) {
      box(m.steel, (a0 + a1) / 2, f.base + 1.53, (f.start + f.end) / 2, a1 - a0, .04, Math.hypot(length, 3), { pitch });
    }
    for (const a of [-2.72, 2.72]) {
      box(m.stone, a, f.base + 3, (f.start + f.end) / 2, .18, 6, length);
      // Horizontal split-face stone joints and recessed candle niches.
      for (let y = .25; y < 5.9; y += .19) for (let d = f.start; d < f.end; d += .7) box(m.stone, a + (a < 0 ? .025 : -.025), f.base + y, d + .3, .21 + .025 * Math.sin(y * 29 + d), .16, .64);
      for (const d of [f.start + 1.6, f.end - 1.1]) {
        const side = a < 0 ? 1 : -1;
        box(m.black, a + side * .15, f.base + (d - f.start) / 2 + 1.7, d, .03, .45, .3);
        box(m.glow, a + side * .18, f.base + (d - f.start) / 2 + 1.57, d, .04, .13, .07);
      }
    }
  }

  section('Mural landing'); floor(m.tile, 12, 14, 3); ceiling(12, 14, 6.7, m.plaster);
  // The landing's side bays are walled in, front, back and at the room's edge, from the landing to its
  // ceiling: they had opened onto the street and the sky (photo review P18; IMG_9771 shows a closed
  // landing). Each wall stands outside the walkable floor, inside the run walls' colliders or the room.
  for (const [inner, edge] of [[-2.72, room.aMin], [2.72, room.aMax]]) {
    const a = (inner + edge) / 2, w = Math.abs(edge - inner), side = Math.sign(edge);
    for (const d of [11.91, 14.09]) box(m.stone, a, 3 + 1.85, d, w, 3.7, .18);
    box(m.stone, edge + side * .09, 3 + 1.85, 13, .18, 3.7, 2.36);
  }
  const mural = room.fixtures.find(f => f.kind === 'ipic-mural-wall');
  box(m.black, mural.a, mural.y + mural.h / 2, mural.d, mural.w, mural.h, mural.l);
  panel(finishes.photo('book-spine-mural', 'IMG_9771.jpg'), mural.a, mural.y + mural.h / 2, mural.d - .1, mural.w, mural.h, 0,
    [[.245, .298], [.875, .312], [.246, .70], [.86, .702]]);
  for (const a of [-2, .5, 3.8]) downlight(a, 6.58, 12.7);

  // The lounge is carpeted as far as the Tuck Room, whose bar stands on boards (IMG_9756; review P12).
  section('Upper lounge'); box(m.carpet, (room.aMin + TUCK_ROOM_EDGE) / 2, 6 - .12, 23, TUCK_ROOM_EDGE - room.aMin, .24, 6); ceiling(20, 26, 10.3);
  for (const a of [room.aMin, room.aMax]) box(m.timber, a, 8.15, 23, .15, 4.3, 6);
  for (const d of [20.2, 25.7]) box(m.timber, room.center, 9.9, d, room.width, .52, .42);
  // The sofa group as in IMG_9758 (P11): the sofa backs onto the glass over the escalators and faces into
  // the lounge, with the oval table in front of it and two barrel chairs across the table.
  const sofaA = (IPIC_SOFA_ARMS[0] + IPIC_SOFA_ARMS[1]) / 2, D = IPIC_SOFA_D;
  soft(m.sofa, sofaA, 6.4, D, 2.6, .36, .95);
  soft(m.sofa, sofaA, 6.9, D - .4, 2.6, .96, .18);
  for (const a of IPIC_SOFA_ARMS) soft(m.sofa, a, 6.67, D, .19, .66, .95);
  for (const a of [sofaA - .88, sofaA + .87]) soft(m.pillow, a, 6.94, D - .25, .58, .52, .13, { roll: a < sofaA ? -.12 : .13 });
  soft(m.leather, sofaA, 6.78, D - .25, .58, .25, .13);
  box(m.sunburst, sofaA, 6.4, 22.1, 1.5, .075, .9, { shape: cylinder });
  for (const a of [sofaA - .5, sofaA + .5]) rod(m.black, [a, 6, 22.1], [a, 6.38, 22.1], .025);
  tub(-4.75, 6, 23.2, .3); tub(-3.45, 6, 23.2, -.3);
  for (const [a, d, y, size] of [[-4.5, 21.9, 8.8, 1.15], [-3.3, 22.8, 9.05, .9], [-5.3, 24.2, 9, .85], [-1.8, 21.5, 9.1, .8], [-1.4, 24, 8.85, 1.05], [.6, 22.3, 9.05, .8]]) cocoon(a, y, d, size);
  label(["I'm Busy for the rest of my Life.", "I'm Busy for the rest of my Life.", "I'm Busy for the rest of my Life."], room.aMin + .13, 8.4, 23.6, 3.8, 1.45, { yaw: Math.PI / 2, font: 'cursive', color: '#ccb68c', height: 512 });
  // Glass arrival guardrails stop at the two escalator openings.
  for (const a of [-4.5, 4.7]) {
    box(m.glass, a, 6.56, 20, 3.4, 1.1, .05);
    rod(m.bronze, [a - 1.7, 7.12, 20], [a + 1.7, 7.12, 20]);
  }
  for (const p of IPIC_PLANTERS.filter(p => p[1] === 6)) planter(...p);

  section('Tuck Room');
  box(m.barFloor, (TUCK_ROOM_EDGE + room.aMax) / 2, 6 - .12, 23, room.aMax - TUCK_ROOM_EDGE, .24, 6);
  // The island bar (P13, IMG_9756): a counter ringing a lower service well, open at its south-east corner
  // for the bartender, with an aisle behind it to the back bar.
  const bar = IPIC_BAR, rim = .5, west = bar.a - bar.w / 2 + .05, east = bar.a + bar.w / 2 - .05;
  const north = bar.d - bar.l / 2 + .05, south = bar.d + bar.l / 2 - .05;
  const runs = [[west + rim / 2, bar.d, rim, south - north], [east - rim / 2, bar.d - .3, rim, south - north - .6],
    [bar.a, north + rim / 2, east - west - 2 * rim, rim], [bar.a, south - rim / 2, east - west - 2 * rim, rim]];
  for (const [a, d, w, l] of runs) {
    box(m.timber, a, 6.51, d, w, 1.02, l);
    box(m.marble, a, 7.08, d, w + (a === bar.a ? 0 : .1), .1, l + (a === bar.a ? .1 : 0));
  }
  box(m.black, bar.a, 6.03, bar.d, east - west - 2 * rim, .06, south - north - 2 * rim);
  // The back bar: two wine fridges with shelves of bottles between and above them, on a burgundy wall.
  box(m.red, room.aMax - .05, 7.9, 23, .1, 2.8, 4.8);
  const backA = (IPIC_BACK_BAR + room.aMax) / 2 + .005, backW = room.aMax - IPIC_BACK_BAR - .02;
  for (const d of [21.35, 24.65]) {
    box(m.black, backA, 6.95, d, backW, 1.9, 1.4);
    box(m.fridge, IPIC_BACK_BAR + .015, 6.95, d, .01, 1.72, 1.24);
    for (let y = 6.3; y < 7.8; y += .2) box(m.black, IPIC_BACK_BAR + .022, y, d, .01, .012, 1.24);
  }
  for (const y of [7.2, 8, 8.8]) box(m.timber, backA, y, 23, backW, .06, y > 8.5 ? 4.7 : 1.85);
  for (let i = 0; i < 30; i++) {
    const d = 22.2 + (i % 10) * .18, y = [7.4, 8.2, 9][Math.floor(i / 10)];
    box(i % 3 ? m.leaf : m.bronze, IPIC_BACK_BAR + .2, y, d, .07, .3 + (i % 3) * .04, .07, { shape: cylinder });
  }
  // The rack over the island (P13): two tiers of black steel hung from the ceiling, wine glasses hanging
  // upside down from the lower tier and troughs of plants on the upper one.
  const rails = [bar.a - .45, bar.a + .45], ends = [bar.d - 1.6, bar.d + 1.6];
  for (const y of [8.85, 9.15]) {
    for (const a of rails) box(m.steel, a, y, bar.d, .05, .05, ends[1] - ends[0]);
    for (let d = ends[0]; d <= ends[1] + 1e-9; d += (ends[1] - ends[0]) / 3) box(m.steel, bar.a, y, d, .95, .04, .05);
  }
  for (const a of rails) for (const d of ends) rod(m.steel, [a, 8.85, d], [a, 10.3, d], .012);
  for (const a of [bar.a - .35, bar.a + .35]) for (let k = 0; k < 31; k++) {
    const d = ends[0] + .1 + k * .1;
    box(m.steel, a, 8.84, d, .04, .02, .1);
    box(m.stemware, a, 8.825, d, 1, 1, 1, { shape: stemGlass, pitch: Math.PI });
  }
  for (let d = ends[0] + .4; d < ends[1]; d += .8) {
    box(m.steel, bar.a, 9.23, d, .7, .12, .62);
    for (let k = 0; k < 60; k++) {
      const t = random() * Math.PI * 2, r = .38 * Math.sqrt(random());
      box(m.pothos, bar.a + Math.cos(t) * r, 9.3 + .14 * random(), d + Math.sin(t) * r, 1.5, 1.5, 1.5,
        { shape: leafCard, pitch: -1.57 + .9 * (random() - .5), roll: random() * 6.28 });
    }
  }
  for (const d of [21.5, 22.7, 23.9]) {
    soft(m.leather, 3.4, 6.78, d, .5, .13, .5); soft(m.leather, 3.13, 7.12, d, .12, .6, .5);
    rod(m.black, [3.4, 6, d], [3.4, 6.74, d], .035);
    box(m.black, 3.4, 6.02, d, .4, .04, .4, { shape: cylinder });
  }
  // Trailing pothos (P14, IMG_9757): timber beams across the room under a dense canopy, strands hanging
  // from each, and a string of lamps along every beam. No leaf over the floor hangs below 2.45 m, the
  // tallest accepted body; over the island the strands stop above the rack's plants.
  const beams = [20.5, 21.6, 22.7, 23.8, 24.9], top = 9.95, lowest = 6 + 2.45;
  for (const d of beams) {
    box(m.timber, (TUCK_ROOM_EDGE + room.aMax) / 2, top, d, room.aMax - TUCK_ROOM_EDGE - .1, .25, .22);
    rod(m.black, [TUCK_ROOM_EDGE + .1, 9.8, d + .13], [room.aMax - .1, 9.8, d + .13], .006);
    for (let a = TUCK_ROOM_EDGE + .3; a < room.aMax - .1; a += .5) box(m.glow, a, 9.76, d + .13, .07, .07, .07, { shape: sphere });
  }
  for (const a of [TUCK_ROOM_EDGE + .2, room.aMax - .25]) box(m.timber, a, top + .02, 22.7, .2, .22, 5.3);
  for (let i = 0; i < 1600; i++) {
    const a = TUCK_ROOM_EDGE + .1 + random() * (room.aMax - TUCK_ROOM_EDGE - .2), d = 20.2 + random() * 5.5;
    // Turned within its own plane (roll) before it is tipped, so it lies nearly flat whichever way it points.
    box(m.pothos, a, 9.78 + .1 * random(), d, 1.3, 1.3, 1.3, { shape: leafCard, pitch: -1.57 + .7 * (random() - .5), roll: random() * 6.28 });
  }
  for (const d of beams) for (let a = TUCK_ROOM_EDGE + .15; a < room.aMax - .1; a += .13) {
    const overBar = Math.abs(a - bar.a) < bar.w / 2 + .3 && Math.abs(d - bar.d) < bar.l / 2 + .3;
    const base = top - .14, end = Math.max(overBar ? 9.45 : lowest + .03, base - .35 - 1.1 * random()), sway = .25 * (random() - .5);
    for (let y = base, k = 0; y > end; y -= .07, k++) {
      const t = (base - y) / (base - end + 1e-9);
      box(m.pothos, a + .03 * Math.sin(k * 2.1), y, d + (k % 2 ? .05 : -.05) + sway * t, 1, 1, 1,
        { shape: leafCard, yaw: random() * 6.28, pitch: -.4 - .7 * random(), roll: (random() - .5) * .8 });
    }
  }
  label('THE TUCK ROOM', 4.9, 9, 25.65, 2.5, .43);
  // The dart cabinet (Val, 2026-10-15): a freestanding pub cabinet in front of the
  // cinema wall, its board 1.73 m up and facing the lounge, and a brass throwing line
  // on the carpet. Everything but the darts stays inside its collider (ipic-plan.js).
  const darts = (() => {
    const { a, face: d, bull, line } = IPIC_DARTS, y = 6;
    box(m.timber, a, y + .03, d + .11, .95, .06, .32);
    for (const side of [-1, 1]) box(m.timber, a + side * .38, y + .62, d + .2, .08, 1.12, .08);
    box(m.timber, a, y + bull, d + .2, .95, 1.1, .1);
    for (const dy of [-.53, .53]) box(m.timber, a, y + bull + dy, d + .1, .95, .04, .14);
    for (const side of [-1, 1]) box(m.timber, a + side * .455, y + bull, d + .1, .04, 1.1, .14);
    for (const side of [-1, 1]) box(m.black, a + side * .345, y + bull, d + .148, .17, .72, .01);
    box(m.bronze, a, y + .003, line, 1, .006, .04);
    const size = 256, pixels = new Uint8Array(size * size * 4);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) pixels.set(dartboardPixel(px, py, size, size), (py * size + px) * 4);
    const texture = new THREE.DataTexture(pixels, size, size); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
    const board = new THREE.Mesh(keep(new THREE.CircleGeometry(.2255, 64)), new THREE.MeshStandardMaterial({ name: 'ipic-dartboard', map: texture, roughness: .85, alphaTest: .5 }));
    const backing = new THREE.Mesh(keep(new THREE.CircleGeometry(.29, 48)), m.black);
    board.name = 'Dartboard'; backing.name = 'Dartboard surround';
    board.position.set(a, y + bull, -d); backing.position.set(a, y + bull, -(d + .01));
    const thrown = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(.0035, .0018, .12, 8).rotateX(Math.PI / 2).translate(0, 0, .06)),
      new THREE.MeshStandardMaterial({ name: 'ipic-darts', color: '#d9c27a', metalness: .5, roughness: .4 }), 3);
    Object.assign(thrown, { name: 'Darts in the board', count: 0 });
    zone.add(backing, board, thrown);
    const place = new THREE.Object3D();
    return {
      // Up to three darts as [x, y] in mm on the board (+x to a thrower's right, +y up).
      show(points = []) {
        thrown.count = 0;
        for (const [x, py] of points.slice(-3)) {
          place.position.set(a + x / 1000, y + bull + py / 1000, -d); place.updateMatrix();
          thrown.setMatrixAt(thrown.count++, place.matrix);
        }
        thrown.instanceMatrix.needsUpdate = true; thrown.computeBoundingSphere();
      },
      count: () => thrown.count,
      dispose() { texture.dispose(); board.material.dispose(); thrown.material.dispose(); thrown.dispose(); },
    };
  })();

  section('Cinema corridor');
  for (const f of room.fixtures.filter(f => f.kind === 'ipic-cinema-wall')) box(m.timber, f.a, 8.2, f.d, f.w, 4.4, f.l);
  // Original floral artwork sampled from the photographed wall.
  panel(finishes.photo('floral-wall', 'IMG_9761.jpg'), .6, 8.5, 25.88, 6.2, 1.8, 0, [[.02, .26], [.55, .30], [.02, .74], [.55, .74]]);
  box(m.bronze, -4.7, 8.3, 26, 1.9, .12, .24);
  label('THEATER 1', -4.7, 8.55, 25.86, 1.6, .36);
  label('IPIC EXPRESS', 5.4, 8.2, 25.86, 1.4, .28);
  box(m.black, 5.4, 7.5, 25.86, 1.35, .85, .05);
  box(m.marble, 5.4, 7.06, 25.62, 1.5, .055, .45);

  // Stadium risers as in IMG_9767 (P15): the back row's platform stands IPIC_RISER.rise above the front
  // row's floor, with steps up just inside the doorway across the room and down the side aisle. Treads rise
  // 10 cm over the continuous support (ipicFloor), as on the escalators; the aisle's nosings are lit.
  section('Auditorium');
  const { rise, up: [u0, u1], down: [w0, w1], wall: [r0, r1] } = IPIC_RISER, steps = Math.round(rise / .1);
  floor(m.confetti, 26, u0, 6); floor(m.confetti, u1, w0, 6 + rise); floor(m.confetti, w1, 34, 6);
  // Under the front row the floor starts at the riser; in the aisles the treads are the floor until w1. Seams
  // overlap by 5 cm inside solid geometry (into the walls, under the treads), so no sunlight leaks through a
  // flush joint when the district is drawn (#367's exterior-culling check found one at a = r1).
  box(m.confetti, (r0 + r1) / 2, 6 - .12, (w0 + w1) / 2, r1 - r0 + .1, .24, w1 - w0);
  ceiling(26, 34, 10.4, m.black);
  const aisles = [[room.aMin, r0 + .05], [r1 - .05, room.aMax]], lit = [[-5.5, r0], [r1, room.aMax - .15]];
  for (let k = 0; k < steps; k++) {
    const upDepth = (u1 - u0) / steps, upTop = 6 + (k + 1) * .1, downDepth = (w1 - w0) / steps, downTop = 6 + rise - k * .1;
    box(m.confetti, room.center, (6 + upTop) / 2, u0 + (k + .5) * upDepth, room.width, upTop - 6, upDepth);
    for (const [a0, a1] of aisles) box(m.confetti, (a0 + a1) / 2, (6 + downTop) / 2, w0 + (k + .5) * downDepth, a1 - a0, downTop - 6, downDepth);
    for (const [a0, a1] of lit) {
      box(m.glow, (a0 + a1) / 2, upTop + .004, u0 + k * upDepth + .025, a1 - a0, .008, .03);
      box(m.glow, (a0 + a1) / 2, downTop + .004, w0 + (k + 1) * downDepth - .025, a1 - a0, .008, .03);
    }
  }
  // The riser wall across the seats, under the front row's backs.
  box(m.black, (r0 + r1) / 2, 6 + rise / 2, w0 + .02, r1 - r0 + .1, rise, .04);
  for (const a of [room.aMin, room.aMax]) box(m.black, a, 8.2, 30, .18, 4.4, 8);
  box(m.black, room.center, 8.2, 33.92, room.width, 4.4, .16);
  panel(m.screen, IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d, IPIC_SCREEN.width, IPIC_SCREEN.height);
  for (const seat of room.ipicSeats.filter(s => s.key.startsWith('recliner'))) recliner(seat);
  // The aisle handrail follows the steps, 0.92 m over the floor.
  const railAt = [27, u1, w0, w1, 33];
  for (let i = 1; i < railAt.length; i++) rod(m.steel, [-5.55, ipicFloor(railAt[i - 1]) + .92, railAt[i - 1]], [-5.55, ipicFloor(railAt[i]) + .92, railAt[i]], .023);
  for (const d of [27, 29, 31, 33]) rod(m.steel, [-5.55, ipicFloor(d), d], [-5.55, ipicFloor(d) + .92, d], .02);

  for (const batch of batches.values()) {
    const flat = batch.geometries.map(g => g.index ? g.toNonIndexed() : g);
    const unindexed = mergeGeometries(flat), merged = keep(mergeVertices(unindexed));
    unindexed.dispose();
    flat.forEach((g, i) => { if (g !== batch.geometries[i]) g.dispose(); });
    batch.geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, batch.mat); mesh.name = `${batch.zone.name}: ${batch.mat.name}`;
    mesh.castShadow = batch.mat !== m.glow && batch.mat !== m.glass; mesh.receiveShadow = true;
    batch.zone.add(mesh);
  }
  if (!options.local) {
    root.position.set(room.facade[0], room.floor, -room.facade[1]);
    root.rotation.y = Math.atan2(room.outward[0], -room.outward[1]);
  }
  root.userData.source = 'User reference photographs; inferred dimensions';
  // The auditorium's downlights (past d 27) are its house lights: they dim while a film plays.
  root.userData.lightPositions = room.lights.map(l => {
    const [x, north] = room.toWorld(l.a, l.d);
    return { room, position: new THREE.Vector3(x, room.floor + l.y, -north), house: l.d > 27 };
  });
  // The screen's own material, so a screening (#367) can show a film on it and restore it.
  root.userData.screen = m.screen;
  root.userData.screenAspect = IPIC_SCREEN.width / IPIC_SCREEN.height;
  root.userData.ready = finishes.ready();
  // Loading failure remains observable by callers; attach a handler for callers
  // that only mount the production mesh, to avoid an unhandled rejection.
  root.userData.ready.catch(error => { root.userData.assetError = String(error); });
  // The Tuck Room board, so the shared darts (#359; server/darts-games.js) can show a match.
  root.userData.darts = darts;
  root.userData.dispose = () => { darts.dispose(); finishes.dispose(); geometry.forEach(g => g.dispose()); root.clear(); };
  return root;
}
