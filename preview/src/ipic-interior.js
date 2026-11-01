import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIpicMaterials, districtSignLayout } from './ipic-materials.js';

// Where the upper lounge's carpet meets the Tuck Room's boards, west of the bar stools (a = 3.4).
const TUCK_ROOM_EDGE = 2.65;
import { IPIC_BACK_BAR, IPIC_BAR, IPIC_CEILINGS, IPIC_COCOON, IPIC_COCOONS, IPIC_DARTS, IPIC_ESCALATOR, IPIC_FLIGHTS, IPIC_INTERIOR, IPIC_RUN_WALL, IPIC_PLANTERS, IPIC_AUDITORIUM_RISERS, IPIC_AUDITORIUM_ROWS, IPIC_AUDITORIUM_SEAT_D, IPIC_SCREEN, IPIC_SOFA_ARMS, IPIC_SOFA_D, IPIC_WING, RISER_RAMP, ipicFloor, ipicSeatForward } from './ipic-plan.js';
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
  function part(name, mat, a, y, d, w, h, l, { shape = cube, yaw = 0, pitch = 0, roll = 0, order = 'XYZ' } = {}) {
    const key = `${zone.uuid}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { zone, mat, geometries: [] });
    matrix.compose(new THREE.Vector3(a, y, -d), quaternion.setFromEuler(euler.set(pitch, yaw, roll, order)), new THREE.Vector3(w, h, l));
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
  // at the bottom where the lamp shines through. Centred on y; its size is IPIC_COCOON's, scaled.
  function cocoon(a, y, d, size = 1) {
    const height = IPIC_COCOON.height * size, radius = IPIC_COCOON.radius * size, at = t => radius * Math.sin(Math.PI * t) ** .75;
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
  // A recliner in its own frame (x to the sitter's right, z forward), turned to face its screen. Turned parts
  // pitch about their own axis (Euler YXZ), so the back still leans away from the footrest.
  function recliner(seat) {
    const y = ipicFloor(seat.d, seat.a), f = ipicSeatForward(seat), s = [f[1], -f[0]], turn = { yaw: seat.yaw, order: 'YXZ' };
    const put = (draw, mat, x, h, z, w, height, l, more = {}) => draw(mat, seat.a + s[0] * x + f[0] * z, y + h, seat.d + s[1] * x + f[1] * z, w, height, l, { ...turn, ...more });
    put(soft, m.black, 0, .18, 0, 1.15, .32, 1.4);
    put(soft, m.leather, 0, .52, 0, .83, .25, 1.02);
    put(soft, m.leather, 0, 1.01, -.47, .88, .95, .24, { pitch: -.13 });
    put(soft, m.leather, 0, 1.43, -.5, .65, .23, .26);
    for (const x of [-.54, .54]) {
      put(soft, m.leather, x, .68, 0, .22, .45, 1.05);
      put(box, m.black, x, .917, .3, .12, .018, .12, { shape: cylinder });
    }
    put(soft, m.leather, 0, .37, .72, .82, .17, .45, { pitch: -.18 });
    put(box, m.timber, .76, .8, .1, .23, .035, .44);
  }

  // Reception from IMG_9738 (photo review P3, P4, P6; Val, 2026-10-18).
  section('Reception'); floor(m.receptionStone, 0, 6, 0); ceiling(0, 6, IPIC_CEILINGS.reception, m.plaster);
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
  // The surround stands 8 cm behind the doors' faces, which fill the depth back to it.
  box(m.black, 5.3, 1.4, 5.895, 1.85, 2.8, .11);
  for (const a of [4.86, 5.74]) box(m.bronze, a, 1.4, 5.80125, .86, 2.7, .0775);
  // Walls close the side bays beside the first run at reception, up to its ceiling (Val, 2026-10-26): the opening
  // under the sign showed the street's ground and the next shop's shelves. The sign hangs on the west one, beside
  // the escalator, instead of across the head of its lane.
  const bayFront = [[room.aMin, -IPIC_RUN_WALL - .09, m.timber], [IPIC_RUN_WALL + .09, room.aMax, m.plaster]];
  for (const [a0, a1, mat] of bayFront) box(mat, (a0 + a1) / 2, IPIC_CEILINGS.reception / 2, 6.09, a1 - a0, IPIC_CEILINGS.reception, .18);
  // 8 cm off the timber, so the sign holds its depth order from across the lobby.
  label('IPIC & THE TUCK ROOM  ↗', (room.aMin - IPIC_RUN_WALL) / 2, 2.45, 5.92, 3.2, .42);

  section('Escalators');
  // One well from reception to the lounge, closed overhead at the lounge's ceiling (Val, 2026-10-26). The mural
  // landing's ceiling had run across both lanes at 6.7 m, 0.7 m above the lounge floor: a roof in the middle of the
  // escalator from the lounge, and the walking camera rose through it. Overhead the well stays closed, so the
  // district's sky never shows from the runs (docs/ipic-review/photo-review.md, P1). Above reception's ceiling a
  // header wall closes its front.
  // Stone under the well's ceiling slab stops at its underside (`soffit`) rather than sharing its end planes.
  const { upper } = IPIC_CEILINGS, soffit = upper - .09;
  box(m.plaster, 0, upper, 10, 2 * IPIC_RUN_WALL + .18, .18, 8);
  ceiling(14, 20, upper, m.plaster);
  box(m.stone, 0, (IPIC_CEILINGS.reception + soffit) / 2, 6.09, 2 * IPIC_RUN_WALL - .18, soffit - IPIC_CEILINGS.reception, .18);
  // Split-face stone from y0 to y1 along d0..d1, its horizontal joints standing proud of the face on the well's side.
  const stoneWall = (a, y0, y1, d0, d1) => {
    box(m.stone, a, (y0 + y1) / 2, (d0 + d1) / 2, .18, y1 - y0, d1 - d0);
    for (let y = y0 + .25; y < y1 - .1; y += .19) for (let d = d0; d < d1; d += .7) box(m.stone, a + (a < 0 ? .025 : -.025), y, d + .3, .21 + .025 * Math.sin((y - y0) * 29 + d), .16, .64);
  };
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
    // The run walls rise to the well's ceiling, with recessed candle niches.
    for (const a of [-IPIC_RUN_WALL, IPIC_RUN_WALL]) {
      stoneWall(a, f.base, soffit, f.start, f.end);
      for (const d of [f.start + 1.6, f.end - 1.1]) {
        const side = a < 0 ? 1 : -1;
        box(m.black, a + side * .15, f.base + (d - f.start) / 2 + 1.7, d, .03, .45, .3);
        box(m.glow, a + side * .18, f.base + (d - f.start) / 2 + 1.57, d, .04, .13, .07);
      }
    }
  }

  section('Mural landing'); floor(m.tile, 12, 14, 3);
  // The landing's side bays are walled in, front, back and at the room's edge, under their own ceiling: they had
  // opened onto the street and the sky (photo review P18; IMG_9771 shows a closed landing). Each wall stands
  // outside the walkable floor, inside the run walls' colliders or the room. Over the lanes the landing is open to
  // the well's ceiling, and stone fascias continue the run walls above the bays' ceilings.
  const bay = IPIC_CEILINGS.landingBays;
  for (const [inner, edge] of [[-IPIC_RUN_WALL, room.aMin], [IPIC_RUN_WALL, room.aMax]]) {
    const a = (inner + edge) / 2, w = Math.abs(edge - inner), side = Math.sign(edge);
    box(m.stone, a, (3 + bay) / 2, 11.91, w, bay - 3, .18);
    // The back wall rises to the ceiling: past it is the light well beside the second run.
    box(m.stone, a, (3 + soffit) / 2, 14.09, w, soffit - 3, .18);
    box(m.stone, edge + side * .09, (3 + bay) / 2, 13, .18, bay - 3, 2.36);
    // The bay's ceiling fits between its front and back walls.
    box(m.plaster, a, bay, 13, w, .18, 2);
    stoneWall(inner, bay, soffit, 12, 14);
  }
  const mural = room.fixtures.find(f => f.kind === 'ipic-mural-wall');
  // The backing's face stands 7 cm behind the photograph, inside the wall's collision block.
  box(m.black, mural.a, mural.y + mural.h / 2, mural.d + .0475, mural.w, mural.h, mural.l - .095);
  panel(finishes.photo('book-spine-mural', 'IMG_9771.jpg'), mural.a, mural.y + mural.h / 2, mural.d - .1, mural.w, mural.h, 0,
    [[.245, .298], [.875, .312], [.246, .70], [.86, .702]]);
  for (const a of [-2, .5]) downlight(a, upper - .12, 12.7);
  downlight(3.8, bay - .12, 12.7);
  // Beside the second run the side bays are light wells under the lounge's glass guardrails: a stone floor at the
  // landing's level, walls up to the ceiling and a tall planter, where the street's ground had shown at the bottom.
  for (const [inner, edge] of [[-IPIC_RUN_WALL, room.aMin], [IPIC_RUN_WALL, room.aMax]]) {
    const a = (inner + edge) / 2, w = Math.abs(edge - inner), side = Math.sign(edge);
    box(m.tile, a, 3 - .12, 17.09, w, .24, 5.82);
    box(m.stone, edge + side * .09, (3 + upper) / 2, 17.09, .18, upper - 3, 5.82);
    box(m.stone, a, (3 + 5.76) / 2, 19.91, w, 2.76, .18);
    planter(a, 3, 17.2, 2.6);
  }

  // The lounge is carpeted as far as the Tuck Room, whose bar stands on boards (IMG_9756; review P12).
  section('Upper lounge'); box(m.carpet, (room.aMin + TUCK_ROOM_EDGE) / 2, 6 - .12, 23, TUCK_ROOM_EDGE - room.aMin, .24, 6); ceiling(20, 26, IPIC_CEILINGS.upper);
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
  for (const [a, d, y, size] of IPIC_COCOONS) cocoon(a, y, d, size);
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
  // The burgundy wall stands 8 cm off the lounge's timber (its face at aMax - .075).
  box(m.red, room.aMax - .115, 7.9, 23, .08, 2.8, 4.8);
  const backA = (IPIC_BACK_BAR + room.aMax) / 2 + .005, backW = room.aMax - IPIC_BACK_BAR - .02;
  for (const d of [21.35, 24.65]) {
    // Each fridge door is 7 cm deep, set into its cabinet, so the glass stands clear of the cabinet's face.
    const cabinet = IPIC_BACK_BAR + .085;
    box(m.black, (cabinet + room.aMax - .005) / 2, 6.95, d, room.aMax - .005 - cabinet, 1.9, 1.4);
    box(m.fridge, IPIC_BACK_BAR + .05, 6.95, d, .07, 1.72, 1.24);
    for (let y = 6.3; y < 7.8; y += .2) box(m.black, IPIC_BACK_BAR + .01, y, d, .01, .012, 1.24);
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

  // The auditorium wing (Val, 2026-10-19; ipic-plan.js IPIC_WING): it runs along the building behind the shops
  // and faces the screen on its north end wall. The rows step down toward the screen on stadium platforms; across
  // the seats each riser is a closed face, and in the aisles along both walls the treads stand over the continuous
  // support (ipicFloor ramps across each riser), their nosings lit, like the escalator flights.
  section('Auditorium');
  const W = IPIC_WING, wingD = (W.d0 + W.d1) / 2, wingWidth = W.d1 - W.d0, low = 6 + IPIC_AUDITORIUM_RISERS[0].from - .2;
  const edges = [W.aMin, ...IPIC_AUDITORIUM_RISERS.map(r => r.a), W.aMax], levels = [IPIC_AUDITORIUM_RISERS[0].from, ...IPIC_AUDITORIUM_RISERS.map(r => r.to)];
  // Platforms run 5 cm into the walls and, across the seats, overlap 5 cm at each riser, so no flush seam leaks
  // light. In the aisles they meet the treads over each ramp with a 2 mm overlap, so the only surface under a
  // body is the one it stands on: the platform, or one tread a step above its ramp.
  const across = [IPIC_AUDITORIUM_SEAT_D[0] - .65, IPIC_AUDITORIUM_SEAT_D.at(-1) + .65];
  const aisles = [[W.d0 + .09, across[0]], [across[1], W.d1 - .08]];
  const bands = [[W.d0 - .05, across[0], RISER_RAMP], [across[0], across[1], 0], [across[1], W.d1 + .05, RISER_RAMP]];
  levels.forEach((level, i) => {
    for (const [d0, d1, ramp] of bands) {
      const overlap = ramp ? .002 : .05, a0 = edges[i] + (i ? ramp : 0) - overlap, a1 = edges[i + 1] - (i < levels.length - 1 ? ramp : 0) + overlap;
      box(m.confetti, (a0 + a1) / 2, 6 + level - .12, (d0 + d1) / 2, a1 - a0, .24, d1 - d0);
    }
  });
  for (const riser of IPIC_AUDITORIUM_RISERS) {
    // Treads rise at most 0.1 m above the ramp the server walks, as on the escalators.
    const rise = riser.to - riser.from, steps = Math.ceil(rise / .1 - 1e-9);
    box(m.black, riser.a, 6 + riser.from + rise / 2, (across[0] + across[1]) / 2, .04, rise, across[1] - across[0]);
    const run = 2 * RISER_RAMP / steps, base = 6 + riser.from - .24;
    for (let k = 0; k < steps; k++) {
      const a0 = riser.a - RISER_RAMP + k * run, top = 6 + riser.from + rise * (k + 1) / steps;
      for (const [d0, d1] of aisles) {
        box(m.confetti, a0 + run / 2 - .001, (base + top) / 2, (d0 + d1) / 2, run + .002, top - base, d1 - d0);
        box(m.glow, a0 + .015, top + .004, (d0 + d1) / 2, .03, .008, d1 - d0 - .1);
      }
    }
  }
  // The ceiling, and a hidden seal 0.36 m above it, both over the walls' outer faces; the walls rise to the seal.
  // A single-sided shell casts shadow from its back faces, so the sun's depth at the ceiling's edges is the
  // ceiling's own underside, and with the district culled a texel of sun leaked in along the back wall
  // (#428's pixel check). The seal's underside is the depth the sun now meets there.
  for (const y of [10.4, 10.85]) box(m.black, (W.aMin + W.aMax) / 2, y, (W.d0 - .09 + W.d1) / 2, W.aMax - W.aMin + .18, .18, wingWidth + .09);
  // Walls: the screen's north end, the south end behind the cross aisle (back of house beyond it, ipic-plan.js), the
  // long back wall and, west of the 13 m room, the long front wall that continues the cinema partition (drawn above,
  // with the doorway). Under the partition the floor is the back row's level, so it meets the floor; past the room
  // the front rows sit lower, and the long front wall reaches down to them.
  const wallTop = 10.94;
  box(m.black, W.aMin, (low + wallTop) / 2, wingD, .18, wallTop - low, wingWidth);
  box(m.black, W.aMax, (low + wallTop) / 2, wingD, .18, wallTop - low, wingWidth);
  box(m.black, (W.aMin + W.aMax) / 2, (low + wallTop) / 2, W.d1 - .08, W.aMax - W.aMin, wallTop - low, .16);
  box(m.black, (W.aMin + room.aMin) / 2, (low + wallTop) / 2, W.d0, room.aMin - W.aMin, wallTop - low, .18);
  // A plane faces +z (-d) unturned; the screen turns to face IPIC_SCREEN.facing.
  panel(m.screen, IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d, IPIC_SCREEN.width, IPIC_SCREEN.height, Math.atan2(IPIC_SCREEN.facing[0], -IPIC_SCREEN.facing[1]));
  for (const seat of room.ipicSeats.filter(s => s.key.startsWith('recliner'))) recliner(seat);

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
  // Where the screen is, in this root's frame, for a camera that frames the film (#500): its centre,
  // its right and up directions as the seats see it, its size, and the back row's distance from it (the furthest a
  // focused view steps back).
  // A seat looks against the screen's facing (a, d), so its right is facing x up in this frame: [-fd, 0, -fa].
  const [fa, fd] = IPIC_SCREEN.facing;
  root.userData.screenFrame = { center: [IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, -IPIC_SCREEN.d], right: [-fd || 0, 0, -fa || 0], up: [0, 1, 0], width: IPIC_SCREEN.width, height: IPIC_SCREEN.height,
    back: IPIC_AUDITORIUM_ROWS[0].distance };
  root.userData.ready = finishes.ready();
  // Loading failure remains observable by callers; attach a handler for callers
  // that only mount the production mesh, to avoid an unhandled rejection.
  root.userData.ready.catch(error => { root.userData.assetError = String(error); });
  // The Tuck Room board, so the shared darts (#359; server/darts-games.js) can show a match.
  root.userData.darts = darts;
  root.userData.dispose = () => { darts.dispose(); finishes.dispose(); geometry.forEach(g => g.dispose()); root.clear(); };
  return root;
}
