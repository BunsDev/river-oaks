import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIpicMaterials, districtSignLayout } from './ipic-materials.js';

// Where the upper lounge's carpet meets the Tuck Room's boards, west of the bar stools (a = 3.4).
const TUCK_ROOM_EDGE = 2.65;
import { IPIC_DARTS, IPIC_ESCALATOR, IPIC_FLIGHTS, IPIC_INTERIOR, IPIC_PLANTERS, IPIC_SCREEN, IPIC_SOFA_ARMS } from './ipic-plan.js';
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
  const tubShell = keep(new THREE.LatheGeometry([[.38,.3],[.43,.48],[.46,.82],[.43,.94],[.37,.94],[.34,.8],[.32,.48]].map(p => new THREE.Vector2(...p)), 24, Math.PI / 2, Math.PI));
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
      soft(m.leaf, a + Math.cos(angle) * .25, top - .1, d + Math.sin(angle) * .25, .16, .65, .07, { roll: Math.cos(angle) * .6, yaw: angle });
    }
  }
  function pendant(a, y, d, size = 1) {
    rod(m.black, [a, y + 1.4, d], [a, y, d], .012);
    for (let i = 0; i < 14; i++) {
      const t = i / 13, radius = (.18 + .16 * Math.sin(t * Math.PI)) * size;
      const g = keep(new THREE.TorusGeometry(radius, .014 * size, 4, 18));
      box(m.timber, a, y + (t - .5) * size, d, 1, 1, 1, { shape: g, pitch: Math.PI / 2 + .08 * Math.sin(i) });
    }
    box(m.glow, a, y, d, .12, .3 * size, .12, { shape: sphere });
  }
  function tub(a, y, d, yaw) {
    soft(m.leather, a, y + .42, d, .88, .2, .86, { yaw });
    box(m.leather, a, y, d, 1, 1, 1, { shape: tubShell, yaw });
    for (const offset of [-.3, .3]) box(m.timber, a + offset, y + .15, d, .06, .3, .65);
  }
  function recliner(seat) {
    const { a, d } = seat, y = 6;
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
  soft(m.sofa, -2.82, 6.4, 24.8, 3, .36, .95);
  soft(m.sofa, -2.82, 6.9, 25.2, 3, .96, .18);
  for (const a of IPIC_SOFA_ARMS) soft(m.sofa, a, 6.67, 24.8, .19, .66, .95);
  for (const a of [-3.7, -1.95]) soft(m.pillow, a, 6.94, 25.05, .58, .52, .13, { roll: a < -3 ? -.12 : .13 });
  soft(m.leather, -2.82, 6.78, 25.05, .58, .25, .13);
  box(m.sunburst, -2.8, 6.4, 23.3, 1.5, .075, .9, { shape: cylinder });
  for (const a of [-3.3, -2.3]) rod(m.black, [a, 6, 23.3], [a, 6.38, 23.3], .025);
  tub(-4.3, 6, 22.4, -.6); tub(-1.05, 6, 22.6, .6);
  for (const [a, d, size] of [[-3, 22, 1.1], [-1, 23, .8], [-4.6, 24, .9], [1, 21, .7]]) pendant(a, 8.85, d, size);
  label(["I'm Busy for the rest of my Life.", "I'm Busy for the rest of my Life.", "I'm Busy for the rest of my Life."], room.aMin + .13, 8.4, 23.6, 3.8, 1.45, { yaw: Math.PI / 2, font: 'cursive', color: '#ccb68c', height: 512 });
  // Glass arrival guardrails stop at the two escalator openings.
  for (const a of [-4.5, 4.7]) {
    box(m.glass, a, 6.56, 20, 3.4, 1.1, .05);
    rod(m.bronze, [a - 1.7, 7.12, 20], [a + 1.7, 7.12, 20]);
  }
  for (const p of IPIC_PLANTERS.filter(p => p[1] === 6)) planter(...p);

  section('Tuck Room');
  box(m.barFloor, (TUCK_ROOM_EDGE + room.aMax) / 2, 6 - .12, 23, room.aMax - TUCK_ROOM_EDGE, .24, 6);
  box(m.timber, 4.45, 6.51, 23, 1.1, 1.02, 4.2);
  box(m.marble, 4.45, 7.08, 23, 1.2, .1, 4.25);
  box(m.red, 6.1, 7.9, 23, .1, 2.8, 4.8);
  for (const y of [7.2, 8, 8.8]) box(m.timber, 5.95, y, 23, .55, .1, 4.7);
  for (let i = 0; i < 26; i++) {
    const d = 20.95 + (i % 13) * .33, y = i < 13 ? 7.4 : 8.25;
    box(i % 3 ? m.leaf : m.bronze, 5.84, y, d, .08, .32 + (i % 3) * .04, .08, { shape: cylinder });
  }
  for (const d of [21.5, 22.7, 23.9]) {
    soft(m.leather, 3.4, 6.78, d, .5, .13, .5); soft(m.leather, 3.13, 7.12, d, .12, .6, .5);
    rod(m.black, [3.4, 6, d], [3.4, 6.74, d], .035);
    box(m.black, 3.4, 6.02, d, .4, .04, .4, { shape: cylinder });
  }
  for (const a of [3.5, 5.3]) rod(m.black, [a, 9.8, 20.8], [a, 9.8, 25.2], .035);
  for (let d = 20.9; d < 25.1; d += .35) {
    soft(m.leaf, 4.5 + .6 * Math.sin(d * 12), 9.7, d, .8, .2, .5);
    rod(m.bronze, [4.6, 9.45, d], [4.6, 9.1, d], .015);
    box(m.glass, 4.6, 9.08, d, .14, .18, .14, { shape: sphere });
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

  section('Auditorium'); floor(m.confetti, 26, 34, 6); ceiling(26, 34, 10.4, m.black);
  for (const a of [room.aMin, room.aMax]) box(m.black, a, 8.2, 30, .18, 4.4, 8);
  box(m.black, room.center, 8.2, 33.92, room.width, 4.4, .16);
  panel(m.screen, IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d, IPIC_SCREEN.width, IPIC_SCREEN.height);
  for (const seat of room.ipicSeats.filter(s => s.key.startsWith('recliner'))) recliner(seat);
  for (const d of [27, 28.5, 30, 31.5, 33]) box(m.glow, -5.4, 6.05, d, .18, .025, .035);
  rod(m.steel, [-5.55, 6.9, 27], [-5.55, 6.9, 33], .023);
  for (const d of [27, 29, 31, 33]) rod(m.steel, [-5.55, 6, d], [-5.55, 6.9, d], .02);

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
