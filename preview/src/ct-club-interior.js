import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLUB, CLUB_INTERIOR, CLUB_LASERS, CLUB_AMBIENTS, DISCO_BALL } from './ct-club-plan.js';

// The CT Club interior (Val, 2026-11-04): the underground techno club
// built whole, like the IPIC and axe rooms. Local +X = a across the door, +Y up,
// -Z = d into the room. Every glow is an emitter (emissive or unlit Basic material)
// — the only moving light source is the mirrored ball's slow spin — so the lasers,
// the RGB corner spots and the rare strobes stay cheap: a few material tweaks per
// tick from userData.tick(t), and nothing else moves.
//
// No canvas work, so the whole room builds under node tests too.
export function buildCtClubInterior(room, options = {}) {
  if (room?.interior !== CLUB_INTERIOR) throw new Error('A CT Club room plan is required');
  const reducedMotion = Boolean(options.reducedMotion);
  const root = new THREE.Group(); root.name = 'CT Club';
  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const material = (name, props) => { const m = new THREE.MeshStandardMaterial({ name, ...props }); owned.materials.add(m); return m; };
  const basic = (name, props) => { const m = new THREE.MeshBasicMaterial({ name, ...props }); owned.materials.add(m); return m; };
  const m = {
    // The shell walls are individually brightened and colour-lifted so a human
    // eye can tell every wall apart (Val, 2026-11-04): warm back, violet-blue
    // left, green-teal right, amber front; the floor keeps neutral concrete and
    // the ceiling a brighter neutral.
    concrete: material('club-concrete', { color: '#41454b', roughness: .96 }),
    concreteBack: material('club-concrete-back', { color: '#5c4a41', roughness: .94 }),
    concreteLeft: material('club-concrete-left', { color: '#484a67', roughness: .94 }),
    concreteRight: material('club-concrete-right', { color: '#465950', roughness: .94 }),
    concreteFront: material('club-concrete-front', { color: '#5a523b', roughness: .94 }),
    concreteCeil: material('club-concrete-ceil', { color: '#4a4d55', roughness: .94 }),
    dark: material('club-black', { color: '#0e0f11', roughness: .92 }),
    steel: material('club-steel', { color: '#565b62', metalness: .65, roughness: .45 }),
    brass: material('club-brass', { color: '#8a6a2e', metalness: .8, roughness: .35 }),
    copper: material('club-copper', { color: '#b87333', metalness: .85, roughness: .3 }),
    timber: material('club-bar-timber', { color: '#261b10', roughness: .8 }),
    leather: material('club-stool-leather', { color: '#221b17', roughness: .9 }),
    upholstery: material('club-upholstery', { color: '#211c20', roughness: .96 }),
    glass: material('club-bottle-glass', { color: '#a9bcc6', metalness: .15, roughness: .12, transparent: true, opacity: .85, depthWrite: false }),
    shelf: material('club-shelf-glass', { color: '#8fa3ad', metalness: .3, roughness: .1, transparent: true, opacity: .3, depthWrite: false }),
    grille: material('club-speaker-grille', { color: '#131417', roughness: .85 }),
    cone: material('club-speaker-cone', { color: '#38312a', roughness: .9 }),
    mirror: material('club-mirror', { color: '#cfd6d9', metalness: .95, roughness: .06 }),
    // Emissive glows: warm for the bar, cool for the seating, white for details.
    edgeGlow: material('club-bar-edge-glow', { color: '#ffffff', emissive: '#ff8b4d', emissiveIntensity: 2.4, roughness: .4 }),
    backGlow: material('club-bar-back-glow', { color: '#ffffff', emissive: '#ff9b58', emissiveIntensity: 2.0, roughness: .5 }),
    seatGlow: material('club-seat-edge-glow', { color: '#ffffff', emissive: '#7a4dff', emissiveIntensity: 3.2, roughness: .5 }),
    edgeCool: material('club-modern-edge-glow', { color: '#ffffff', emissive: '#7a4dff', emissiveIntensity: 2.8, roughness: .5 }),
    // Soft violet light-spill under the lounge seating (unlit, additive).
    spill: basic('club-seat-spill', { color: '#a06bff', transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    djGlow: material('club-dj-glow', { color: '#ffffff', emissive: '#41c8ff', emissiveIntensity: 2.2, roughness: .4 }),
    bassRing: material('club-bass-port-glow', { color: '#ffffff', emissive: '#7020c9', emissiveIntensity: 2, roughness: .6 }),
    doorGlow: material('club-door-glow', { color: '#ffffff', emissive: '#c92a4f', emissiveIntensity: 2.1, roughness: .4 }),
  };
  const box = new THREE.BoxGeometry(1, 1, 1); owned.geometries.add(box);
  // Instancing by (geometry, material): every batch flushes as one InstancedMesh,
  // with aligned per-instance colors for the unlit strips and bottle glass.
  const batches = new Map();
  const batch = (geometry, mat, matrix, tint = null) => {
    owned.geometries.add(geometry);
    if (!batches.has(mat)) batches.set(mat, new Map());
    const byGeo = batches.get(mat);
    if (!byGeo.has(geometry)) byGeo.set(geometry, { matrices: [], colors: [] });
    const entry = byGeo.get(geometry);
    // `matrix` is a shared temp rewritten by every instance() call, so the batch
    // must own a copy; two instances that share a (geometry, material) otherwise
    // end up pinned to the last composed matrix (one pile instead of a room).
    entry.matrices.push(matrix.clone());
    entry.colors.push(tint !== null ? color.set(tint).clone() : new THREE.Color(1, 1, 1));
  };
  const pos = new THREE.Vector3(), euler = new THREE.Euler(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), matrix = new THREE.Matrix4(), color = new THREE.Color();
  const instance = (geometry, mat, a, y, d, sx = 1, sy = 1, sz = 1, rotate = null, tint = null) => {
    pos.set(a, y, -d);
    euler.set(rotate?.x ?? 0, rotate?.y ?? 0, rotate?.z ?? 0);
    quat.setFromEuler(euler);
    scale.set(sx, sy, sz);
    matrix.compose(pos, quat, scale);
    batch(geometry, mat, matrix, tint);
  };
  const flush = () => {
    for (const [mat, byGeo] of batches) {
      for (const [geometry, entry] of byGeo) {
        const mesh = new THREE.InstancedMesh(geometry, mat, entry.matrices.length);
        mesh.name = `club-instances:${mat.name}`;
        entry.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        entry.colors.forEach((tint, index) => mesh.setColorAt(index, tint));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        root.add(mesh);
      }
    }
    batches.clear();
  };

  // ---- thin bright edge outlines for near-black fixtures (Val, 2026-11-04) ---
  // Anything dark enough to vanish against the floor gets a 1 px wire frame so an
  // onlooker always sees it: yellow (bar, entry, dancefloor), bright green
  // (stage, speakers), purple (lounge seating). Furniture gets a full 3D edge
  // cage drawn just outside its body (×1.02, so it can never z-fight); flat
  // floor items get a 1 px top rectangle lifted just above their glow strips.
  const OUTLINE = { yellow: '#ffe142', green: '#3dff85', purple: '#b26bff' };
  const edgeCache = new Map();
  const outlineSegments = new Map();  // color -> { seg: [x,y,z, ...] }
  const addOutline = (geometry, color, a, y, d, sx = 1, sy = 1, sz = 1, rotate = null) => {
    let edges = edgeCache.get(geometry);
    if (!edges) {
      edges = new THREE.EdgesGeometry(geometry, 0.7);
      edgeCache.set(geometry, edges);
      owned.geometries.add(edges);
    }
    pos.set(a, y, -d);
    euler.set(rotate?.x ?? 0, rotate?.y ?? 0, rotate?.z ?? 0);
    quat.setFromEuler(euler);
    scale.set(sx * 1.02, sy * 1.02, sz * 1.02);
    matrix.compose(pos, quat, scale);
    let list = outlineSegments.get(color);
    if (!list) { list = { seg: [] }; outlineSegments.set(color, list); }
    const attribute = edges.attributes.position;
    const world = new THREE.Vector3();
    for (let i = 0; i < attribute.count; i++) {
      world.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
      list.seg.push(world.x, world.y, world.z);
    }
  };
  const addOutlineRect = (w, l, color, a, y, d) => {
    let list = outlineSegments.get(color);
    if (!list) { list = { seg: [] }; outlineSegments.set(color, list); }
    const cw = w / 2, cl = l / 2;
    const corners = [[-cw, -cl], [cw, -cl], [cw, cl], [-cw, cl]].map(([ca, cd]) => [a + ca, y, -(d + cd)]);
    for (let i = 0; i < 4; i++) {
      const p = corners[i], q = corners[(i + 1) % 4];
      list.seg.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    }
  };
  const createOutlines = () => {
    for (const [color, list] of outlineSegments) {
      if (list.seg.length === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(list.seg, 3));
      owned.geometries.add(geometry);
      const lines = new THREE.LineSegments(geometry, basic(`club-outline-${color}`, { color, toneMapped: false }));
      lines.name = `club-outlines:${color}`;
      root.add(lines);
    }
    outlineSegments.clear();
  };

  const W = CLUB.width, D = CLUB.depth, H = CLUB.height;

  // ---- shell ----------------------------------------------------------------
  // A buried concrete box: no windows, a heavy slab overhead, and a door gap in
  // the front wall where the future stair throat meets the club.
  instance(box, m.concrete, 0, -0.25, D / 2, W, 0.5, D);                              // floor slab (neutral concrete)
  instance(box, m.concreteCeil, 0, H + 0.16, D / 2, W + 0.4, 0.32, D + 0.4);           // ceiling slab (brighter)
  instance(box, m.concreteBack, 0, H / 2, D - 0.1, W, H, 0.2);                         // back wall (warm)
  instance(box, m.concreteLeft, -W / 2 + 0.1, H / 2, D / 2, 0.2, H, D);                // left wall (violet-blue)
  instance(box, m.concreteRight, W / 2 - 0.1, H / 2, D / 2, 0.2, H, D);                // right wall (green-teal)
  // Front wall with the 2.3 m door gap, and its red entry glow above the door.
  for (const [c, w] of [[-4.575, 6.85], [4.575, 6.85]]) instance(box, m.concreteFront, c, H / 2, -0.1, w, H, 0.2); // front wall (amber)
  instance(box, m.concreteFront, 0, 4.15, -0.1, 2.3, 3.7, 0.2);                       // lintel over the door
  instance(box, m.doorGlow, 0, 2.34, -0.06, 2.1, 0.05, 0.06);                        // door glow strip
  instance(box, m.brass, -1.12, 1.15, -0.08, 0.08, 2.3, 0.14);                         // door jambs
  instance(box, m.brass, 1.12, 1.15, -0.08, 0.08, 2.3, 0.14);
  // Entry threshold mat (fixture 'entry-mat'): dark plate with a lit border and a
  // 1 px yellow outline so the dark plate reads against the floor.
  instance(box, m.dark, 0, 0.016, 1.4, 1.7, 0.032, 1.3);
  addOutlineRect(1.74, 1.34, OUTLINE.yellow, 0, 0.045, 1.4);
  for (const a of [-0.83, 0.83]) instance(box, m.edgeCool, a, 0.04, 1.4, 0.06, 0.02, 1.16);
  for (const d of [0.8, 2.0]) instance(box, m.edgeCool, 0, 0.04, d, 1.6, 0.02, 0.06);

  // ---- structure -------------------------------------------------------------
  // Columns flush with the side walls and ceiling truss rails, so the buried hall
  // reads as weight above, not a room.
  for (const d of [8, 16, 24, 32]) {
    for (const a of [-7.3, 7.3]) {
      instance(box, m.concrete, a, 3, d, 0.7, H, 0.7);
      instance(box, m.dark, a, 0.06, d, 1.05, 0.12, 1.05);
      addOutline(box, OUTLINE.yellow, a, 0.06, d, 1.05, 0.12, 1.05);          // dark base strip: yellow cage
    }
  }
  for (const a of [-3.15, 3.15]) instance(box, m.steel, a, 5.9, D / 2, 0.12, 0.12, D);
  for (let d = 6; d < D; d += 4) instance(box, m.steel, 0, 5.92, d, 11.6, 0.08, 0.08);

  // ---- the edge-lit dancefloor -------------------------------------------------
  // 1 m tiles over the 13 × 17 m floor, each ringed by a thin unlit Basic strip:
  // per-instance colors, so the whole grid costs two instanced strips.
  const tileSize = 1.0, gap = 0.03, tileEdgeA = 0.014;
  const floorA0 = -6.5, floorA1 = 6.5, floorD0 = 16, floorD1 = 33;
  const stripA = new THREE.BoxGeometry(tileSize - gap, tileEdgeA, 0.9); owned.geometries.add(stripA);  // runs along a
  const stripB = new THREE.BoxGeometry(0.9, tileEdgeA, tileSize - gap); owned.geometries.add(stripB);  // runs along d
  const tileEdge = basic('club-tile-edge', { color: '#ffffff', toneMapped: false });
  const hsv = (h, s, v) => new THREE.Color().setHSL(h, s, v);
  let seeded = 12345;
  const random = () => (seeded = (seeded * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < Math.round((floorA1 - floorA0) / tileSize); i++) {
    for (let j = 0; j < Math.round((floorD1 - floorD0) / tileSize); j++) {
      const a = floorA0 + tileSize * (i + 0.5), d = floorD0 + tileSize * (j + 0.5);
      const hue = (0.58 + 0.22 * Math.sin(i * 0.9 + j * 0.55)) % 1;
      const jitter = 0.75 + 0.25 * random();
      const tint = hsv(hue, 0.75, 0.5 * jitter);
      const y = 0.05;
      instance(box, m.dark, a, 0.022, d, tileSize - gap, 0.044, tileSize - gap);
      instance(stripA, tileEdge, a + 0.5 - gap / 2, y, d, 1, 1, 1, null, tint);
      instance(stripA, tileEdge, a - 0.5 + gap / 2, y, d, 1, 1, 1, null, tint);
      instance(stripB, tileEdge, a, y, d + 0.5 - gap / 2, 1, 1, 1, null, tint);
      instance(stripB, tileEdge, a, y, d - 0.5 + gap / 2, 1, 1, 1, null, tint);
      addOutlineRect(tileSize - gap, tileSize - gap, OUTLINE.yellow, a, 0.062, d);   // 1 px yellow tile grid
    }
  }
  // A dark glass apron around the floor that receives the glow, with its own
  // 1 px yellow outline so the whole dancefloor plate reads.
  instance(box, m.dark, 0, 0.01, (floorD1 + floorD0) / 2, W, 0.02, 12.5);
  addOutlineRect(W, 12.5, OUTLINE.yellow, 0, 0.034, (floorD1 + floorD0) / 2);

// ---- the edge-glow / back-glow bar ------------------------------------------
  // A 20 m counter along the left wall. Edge glow runs along its serving edge and
  // under its lip (washing the floor); back glow fills the trough behind the
  // bottles, so the whole bar reads as a lit strip from the door to the DJ booth.
  instance(box, m.timber, -7.15, 0.56, 14, 1.5, 1.12, 20);                    // counter body
  instance(box, m.timber, -7.0, 1.145, 14, 1.7, 0.06, 20.2);                  // counter top (serving overhang)
  addOutline(box, OUTLINE.yellow, -7.15, 0.56, 14, 1.5, 1.12, 20);           // dark timber: yellow cage
  addOutline(box, OUTLINE.yellow, -7.0, 1.145, 14, 1.7, 0.06, 20.2);
  instance(box, m.edgeGlow, -6.3, 1.176, 14, 0.035, 0.02, 19.6);              // edge glow: along the serving edge
  instance(box, m.edgeGlow, -6.1, 0.52, 14, 0.025, 0.018, 19.4);              // edge glow: under the lip
  instance(box, m.dark, -7.82, 1.5, 14, 0.42, 3.0, 20.2);                     // back bar case
  addOutline(box, OUTLINE.yellow, -7.82, 1.5, 14, 0.42, 3.0, 20.2);          // near-black case: yellow cage
  instance(box, m.backGlow, -7.9, 2.02, 14, 0.05, 2.55, 19.8);                // back glow trough
  instance(box, m.backGlow, -7.66, 0.18, 14, 0.03, 0.05, 19.8);               // base kick glow
  for (const y of [1.35, 1.85, 2.35]) instance(box, m.shelf, -7.7, y, 14, 0.5, 0.02, 19.6); // glass shelves
  // Bottles across the two lower shelves, one merged shape per bottle, instanced
  // with per-instance colors so a single draw call serves the whole back bar.
  const bottleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.028, 0.028, 0.16, 10).translate(0, 0.08, 0),
    new THREE.CylinderGeometry(0.01, 0.01, 0.05).translate(0, 0.175, 0),
  ]);
  owned.geometries.add(bottleGeo);
  const bottleColor = new THREE.Color();
  let bottleSeed = 777;
  const bottleRandom = () => (bottleSeed = (bottleSeed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let d = 4.6; d <= 23.4; d += 1) {
    for (const y of [1.38, 1.88]) {
      const a = -7.7 + (bottleRandom() - 0.5) * 0.3;
      const pick = bottleRandom();
      bottleColor.set(pick < 0.45 ? '#c98a3b' : pick < 0.75 ? '#3f7a4d' : '#3f6f9a');
      instance(bottleGeo, m.glass, a, y + 0.09, d, 1, 1, 1, null, bottleColor.clone());
    }
  }
  // The club's chai urn on the counter (fixture 'chai-urn'): copper kettle under an
  // amber glow, a tiny steam head standing still above it.
  instance(box, m.copper, -7.3, 1.19, 5.6, 0.2, 0.05, 0.2);                   // drip tray
  instance(new THREE.CylinderGeometry(0.13, 0.17, 0.3, 14), m.copper, -7.3, 1.44, 5.6); // body
  instance(new THREE.CylinderGeometry(0.045, 0.06, 0.1, 10), m.brass, -7.3, 1.65, 5.6); // lid
  instance(box, m.edgeGlow, -7.3, 1.86, 5.6, 0.3, 0.02, 0.3);                 // amber glow behind it
  const steam = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), material('club-chai-steam', { color: '#ffffff', transparent: true, opacity: 0.18, roughness: 1, depthWrite: false }));
  owned.geometries.add(steam.geometry); steam.scale.set(1, 1.7, 1); steam.position.set(-7.3, 1.78, -5.6); root.add(steam);
  // Bar stools: instanced leather seats, brass foot rings and a violet under-glow
  // ring (the chairs are edge-lit too, as Val asked).
  const seatGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 18); owned.geometries.add(seatGeo);
  const legGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.66, 8); owned.geometries.add(legGeo);
  const glowGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.03, 18); owned.geometries.add(glowGeo);
  const stoolRingGeo = new THREE.TorusGeometry(0.16, 0.012, 8, 20); owned.geometries.add(stoolRingGeo);
  for (const d of [5, 8, 11, 14, 17, 20, 23]) {
    instance(legGeo, m.steel, -5.6, 0.33, d, 1, 1, 1);
    instance(seatGeo, m.leather, -5.6, 0.725, d, 1, 1, 1);
    instance(glowGeo, m.seatGlow, -5.6, 0.66, d, 1, 1, 1);
    instance(stoolRingGeo, m.brass, -5.6, 0.52, d, 1, 1, 1, { x: Math.PI / 2 });
    addOutline(seatGeo, OUTLINE.yellow, -5.6, 0.725, d, 1, 1, 1);            // near-black seats: yellow rim
  }
// ---- the lounge: couches, chairs and tables, edge-lit -------------------------
  // Two couches against the right wall face the dancefloor; each carries a violet
  // glow along its seat edge and a low base strip, and glows at the floor.
  const couch = (aCentre, dCentre) => {
    const a1 = aCentre + 1.3, down = dCentre - 1.1, up = dCentre + 1.1;
    instance(box, m.spill, aCentre, 0.04, dCentre, 2.9, 0.05, 2.5);                       // violet light-spill under the couch
    instance(box, m.upholstery, aCentre, 0.24, dCentre, 2.6, 0.48, 2.2);                       // seat
    addOutline(box, OUTLINE.purple, aCentre, 0.24, dCentre, 2.6, 0.48, 2.2);                  // near-black upholstery: purple cage
    instance(box, m.upholstery, a1 - 0.06, 0.62, dCentre, 0.14, 0.78, 2.2);                    // back (faces the hall)
    addOutline(box, OUTLINE.purple, a1 - 0.06, 0.62, dCentre, 0.14, 0.78, 2.2);
    instance(box, m.upholstery, a1 - 0.14, 0.34, down + 0.15, 0.16, 0.46, 0.18);               // arms
    instance(box, m.upholstery, a1 - 0.14, 0.34, up - 0.15, 0.16, 0.46, 0.18);
    addOutline(box, OUTLINE.purple, a1 - 0.14, 0.34, down + 0.15, 0.16, 0.46, 0.18);
    addOutline(box, OUTLINE.purple, a1 - 0.14, 0.34, up - 0.15, 0.16, 0.46, 0.18);
    for (const d of [down + 0.35, up - 0.35]) instance(box, m.upholstery, aCentre - 0.1, 0.32, d, 1.5, 0.14, 1.5); // cushions
    instance(box, m.seatGlow, a1 - 0.155, 0.47, dCentre, 0.035, 0.02, 2.1);                    // edge glow along the seat edge
    instance(box, m.seatGlow, a1 - 0.06, 0.06, dCentre, 2.55, 0.025, 2.15);                    // base glow at the floor
    instance(box, m.steel, a1 - 0.14, 0.03, down + 0.2, 0.14, 0.06, 0.14);                     // feet
    instance(box, m.steel, a1 - 0.14, 0.03, up - 0.2, 0.14, 0.06, 0.14);
  };
  couch(6.6, 10.5);
  couch(6.6, 16.5);
  // Armchairs: smaller, a glow under the seat and a lit base ring.
  const chair = (aCentre, dCentre) => {
    instance(box, m.spill, aCentre, 0.04, dCentre, 1.2, 0.05, 1.2);                         // violet light-spill under the chair
    instance(box, m.upholstery, aCentre, 0.3, dCentre, 0.9, 0.6, 0.9);
    addOutline(box, OUTLINE.purple, aCentre, 0.3, dCentre, 0.9, 0.6, 0.9);
    instance(box, m.upholstery, aCentre + 0.42, 0.66, dCentre, 0.1, 0.72, 0.9);
    addOutline(box, OUTLINE.purple, aCentre + 0.42, 0.66, dCentre, 0.1, 0.72, 0.9);
    instance(box, m.seatGlow, aCentre + 0.415, 0.6, dCentre, 0.25, 0.02, 0.85);
    instance(box, m.seatGlow, aCentre + 0.2, 0.06, dCentre, 0.7, 0.025, 0.7);
  };
  chair(3.55, 13.6);
  chair(3.55, 19.6);
  // Coffee tables with a recessed glow panel on each top.
  for (const d of [12.4, 18.4]) {
    instance(box, m.spill, 4.55, 0.04, d, 1.4, 0.05, 1.8);                         // violet light-spill under the table
    instance(box, m.timber, 4.55, 0.21, d, 1.0, 0.42, 1.4);
    addOutline(box, OUTLINE.purple, 4.55, 0.21, d, 1.0, 0.42, 1.4);                // dark timber: purple cage
    instance(box, m.seatGlow, 4.55, 0.425, d, 0.5, 0.018, 0.8);
  }
// ---- the DJ booth and the big speaker wall ------------------------------------
  instance(box, m.timber, 0, 0.55, 33.7, 5.2, 1.1, 1.4);                        // booth body behind the dancefloor
  instance(box, m.djGlow, 0, 1.14, 33.0, 4.4, 0.03, 0.05);                      // glowing desk edge on the house side
  instance(box, m.dark, 0, 1.18, 33.1, 1.2, 0.05, 0.5);                         // mixer deck
  const djGlow = material('club-mixer-glow', { color: '#ffffff', emissive: '#41c8ff', emissiveIntensity: 2.6, roughness: .3 });
  for (const a of [-0.4, 0, 0.4]) instance(box, djGlow, a, 1.205, 33.1, 0.06, 0.012, 0.02); // channel LEDs
  // Three massive speaker faces: the central subwoofer bank and the two corner
  // stacks. Each face is an enclosure with instanced driver cones; the ports glow.
  const driver = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 22); owned.geometries.add(driver);
  const smallDriver = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20); owned.geometries.add(smallDriver);
  const portRing = new THREE.TorusGeometry(0.3, 0.05, 8, 22); owned.geometries.add(portRing);
  const face = (dc, dd, w, h, depth) => {
    instance(box, m.grille, dc, h / 2, dd, w, h, depth);                          // enclosure rests on the floor
    return { dc, front: dd - depth / 2 + 0.04, h };
  };
  const bank = face(0, 37.0, 6.8, 2.5, 4.6);                                    // the subs behind the DJ
  for (const a of [-2.4, -1.2, 0, 1.2, 2.4]) {
    instance(driver, m.cone, a, bank.h * 0.3, bank.front, 1, 1, 1, { x: Math.PI / 2 });
    instance(driver, m.cone, a, bank.h * 0.7, bank.front, 1, 1, 1, { x: Math.PI / 2 });
  }
  instance(portRing, m.bassRing, 0, 0.42, bank.front, 1, 1, 1, { x: Math.PI / 2 });
  for (const sign of [-1, 1]) {
    const stack = face(sign * 5.8, 36.8, 4.2, 3.3, 4.6);                        // the two big corner stacks
    for (const a of [-6.9, -4.7].map(x => sign * x)) {
      for (const frac of [0.21, 0.45, 0.7]) instance(smallDriver, m.cone, a, stack.h * frac, stack.front, 1, 1, 1, { x: Math.PI / 2 });
    }
    instance(portRing, m.bassRing, sign * 5.8, 0.42, stack.front, 1, 1, 1, { x: Math.PI / 2 });
  }
  // Pendant spot bar over the DJ, like a mini truss.
  for (const a of [-1.6, 0, 1.6]) {
    instance(box, m.steel, a, 5.7, 33.3, 0.06, 0.5, 0.06);
    instance(box, djGlow, a, 5.42, 33.3, 0.16, 0.03, 0.16);
  }
// ---- the disco ball and its occasional RGB lasers ---------------------------------
  // The mirrored ball hangs dead centre; the laser beams it "throws" are thin
  // unlit cones that mostly stay dark — a few material writes per tick, never a
  // real light, so the mirror room stays cheap.
  const ball = new THREE.Group(); ball.name = 'Disco ball';
  ball.position.set(DISCO_BALL.a, DISCO_BALL.y, -DISCO_BALL.d); root.add(ball);
  instance(box, m.steel, 0, 5.75, 24, 0.05, 0.5, 0.05);                          // mount pipe
  const ringMat = basic('club-ball-ring', { color: '#41e0ff', toneMapped: false });
  const ringGeo = new THREE.TorusGeometry(0.5, 0.02, 8, 32); owned.geometries.add(ringGeo);
  instance(ringGeo, ringMat, 0, 5.9, 24, 1, 1, 1, { x: Math.PI / 2 });
  const ballGeo = new THREE.IcosahedronGeometry(DISCO_BALL.radius, 2); owned.geometries.add(ballGeo);
  const ballMesh = new THREE.Mesh(ballGeo, m.mirror); ballMesh.name = 'Discoball mirror facets'; ball.add(ballMesh);
  const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 1.1, 3.4, 14, 1, true).translate(0, -1.7, 0),
    basic('club-ball-haze', { color: '#6b4dff', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }));
  owned.geometries.add(beamMesh.geometry); ball.add(beamMesh);
  // The lasers: each is a single tapered cone that fades in only during a burst.
  const laserGroups = [], laserMats = [];
  for (const laser of CLUB_LASERS) {
    const geo = new THREE.CylinderGeometry(0.008, 0.05, laser.length, 6, 1, true).translate(0, 0, -laser.length / 2);
    owned.geometries.add(geo);
    const mat = basic('club-laser', { color: '#ff2d6f', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const group = new THREE.Group();
    group.position.copy(ball.position);
    group.rotation.set(-laser.pitch, -laser.yaw, 0);
    group.add(new THREE.Mesh(geo, mat));
    root.add(group);
    laserGroups.push(group); laserMats.push(mat);
  }

  // ---- the four corner strobes (rare) and the RGB corner spots --------------------
  const strobeMats = [], spotMats = [];
  for (const strobe of room.fixtures.filter(f => f.kind === 'club-strobe')) {
    instance(box, m.steel, strobe.a, strobe.y, strobe.d, 0.3, 0.18, 0.3);         // housing
    const lens = basic('club-strobe-lens', { color: '#ffffff', transparent: true, opacity: 0.06, toneMapped: false, depthWrite: false });
    strobeMats.push(lens);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), lens);
    owned.geometries.add(quad.geometry);
    quad.position.set(strobe.a, strobe.y - 0.1, -strobe.d);
    quad.rotation.x = -Math.PI / 2;                                               // fires down into the room
    root.add(quad);
  }
  for (const spot of room.fixtures.filter(f => f.kind === 'club-spot-rgb')) {
    instance(box, m.dark, spot.a, spot.y, spot.d, 0.24, 0.12, 0.24);
    const mat = basic('club-spot-rgb', { color: '#ff4d6f', toneMapped: false });
    spotMats.push(mat);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mat);
    owned.geometries.add(quad.geometry);
    quad.position.set(spot.a, spot.y - 0.07, -spot.d);
    quad.rotation.x = -Math.PI / 2;
    root.add(quad);
  }
  flush();
  // ---- the ten named ambient lights -----------------------------------------
  // The room carries its own base lighting so the buried hall is never pitch
  // black: ten AmbientLights spread down the 40 m axis (entry, bar ×2, lounge ×2,
  // dancefloor ×3, stage, speakers), each anchored at its zone so a later swap to
  // a point/rect light keeps the same spot. Hosts and automations find them on
  // `userData.lights` ({ group, list, byName }); the world's shared pool
  // positions stay on the plan (room.lights / lightPositions) as before.
  const lightsGroup = new THREE.Group(); lightsGroup.name = 'CT Club lights';
  const lightList = [], lightByName = {};
  for (const spec of CLUB_AMBIENTS) {
    const light = new THREE.AmbientLight(spec.color, spec.intensity);
    light.name = `light.ambient.${spec.key}`;
    light.userData = { kind: 'ambient', zone: spec.zone, role: spec.key, baseColor: spec.color, baseIntensity: spec.intensity };
    light.position.set(spec.a, spec.y, -spec.d);
    lightsGroup.add(light);
    lightList.push(light);
    lightByName[light.name] = light;
  }
  root.add(lightsGroup);
  root.userData.lights = { group: lightsGroup, list: lightList, byName: lightByName };
  if (!options.local) {
    root.position.set(room.facade[0], room.floor, -room.facade[1]);
    root.rotation.y = Math.atan2(room.outward[0], -room.outward[1]);
  }

  // A cheap per-frame step: the mirror ball turns, the four RGB spots slowly cycle,
  // the lasers burst for ~2 s of every 9 s and the corner strobes fire well under
  // 1 % of the time, each flash 60 ms or shorter. Nothing here touches a real
  // light or rebuilds geometry; a host calls it from its render loop only when the
  // club is on screen, and reduced-motion preferences keep the room still.
  root.userData.tick = t => {
    if (reducedMotion) return;
    ball.rotation.y = t * 0.55;
    ball.rotation.x = Math.sin(t * 0.21) * 0.4;
    for (let i = 0; i < spotMats.length; i++) spotMats[i].color.setHSL((t * 0.045 + i * 0.25) % 1, 0.75, 0.5);
    ringMat.color.setHSL((t * 0.05) % 1, 0.9, 0.55);
    const cycle = t % 9, burst = cycle < 2;
    if (burst) {
      const glow = Math.min(1, 2 * cycle * (2 - cycle));
      for (let i = 0; i < laserGroups.length; i++) {
        const base = CLUB_LASERS[i].yaw;
        laserGroups[i].rotation.set(-CLUB_LASERS[i].pitch, -(base + Math.sin(t * 0.85 + i * 2.1) * 0.3 * (i % 2 ? -1 : 1)), 0);
        laserMats[i].color.setHSL((t * 0.8 + i * 0.33) % 1, 1, 0.6);
        laserMats[i].opacity = (Math.sin(t * 22 + i) > -0.3 ? 0.85 : 0.3) * glow;
      }
    } else {
      for (const mat of laserMats) mat.opacity = 0;
    }
    for (let i = 0; i < strobeMats.length; i++) {
      const phase = (t + i * 0.37) % 41;
      strobeMats[i].opacity = phase < 0.8 ? (Math.sin(t * 160) > 0 ? 1 : 0.1) : 0.06;
    }
  };

  // The shared pool's light positions for the interior renderer.
  root.userData.lightPositions = room.lights.map(light => {
    const [x, north] = room.toWorld(light.a, light.d);
    return { room, position: new THREE.Vector3(x, room.floor + light.y, -north) };
  });
  root.userData.room = room;
  root.userData.reducedMotion = reducedMotion;
  root.userData.ready = Promise.resolve();
  root.userData.dispose = () => {
    root.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
    owned.geometries.forEach(g => g.dispose());
    owned.materials.forEach(mat => mat.dispose());
    owned.textures.forEach(texture => texture.dispose());
    for (const light of lightList) light.dispose();
    lightsGroup.clear();
    root.clear();
  };
  return root;
}