import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { AXE_LANES, AXE_ROOM_DARTS, AXE_ROOM_INTERIOR } from './axe-room-plan.js';
import { BOARD, KILLSHOTS, KILLSHOT_RADIUS, RINGS } from './axe-rules.js';
import { dartboardPixel } from './dartboard-texture.js';

// The axe-and-darts room (Val, 2026-10-15): a fictional game room built whole, shell
// included, like the IPIC interior. Local +X = a across the frontage, +Y up, -Z = d into
// the room. Two caged lanes on maple planks run to plank targets painted from the axe
// rules' own geometry; a dart cabinet, a counter with an axe rack and benches. Everything
// that blocks a body sits inside the collision boxes in axe-room-plan.js. No canvas, so
// it builds in node tests too.

// One RGBA pixel of the target face, `size` px for the 800 mm board.
function targetPixel(px, py, size) {
  const x = ((px + .5) / size * 2 - 1) * BOARD, y = ((py + .5) / size * 2 - 1) * BOARD, r = Math.hypot(x, y);
  if (KILLSHOTS.some(([kx, ky]) => Math.hypot(x - kx, y - ky) <= KILLSHOT_RADIUS)) return [40, 96, 196, 255];
  const ring = RINGS.findIndex(item => r <= item.radius);
  if (ring === 0) return [196, 34, 40, 255];
  if (ring > 0 && Math.abs(r - RINGS[ring - 1].radius) < 5) return [24, 22, 20, 255];
  if (ring > 0) return ring % 2 ? [236, 228, 210, 255] : [40, 92, 160, 255];
  // Bare planks: pale spruce with a joint every 10 cm.
  return Math.abs(((y + BOARD) % 100) - 50) > 47 ? [120, 92, 62, 255] : [214, 184, 140, 255];
}
const dataTexture = (size, pixel) => {
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) pixels.set(pixel(px, py, size), (py * size + px) * 4);
  const texture = new THREE.DataTexture(pixels, size, size); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
};

export function buildAxeRoomInterior(room, options = {}) {
  if (room?.interior !== AXE_ROOM_INTERIOR) throw new Error('An axe-and-darts room plan is required');
  const root = new THREE.Group(); root.name = 'Axe & Darts';
  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const material = (name, props) => { const m = new THREE.MeshStandardMaterial({ name, ...props }); owned.materials.add(m); return m; };
  const m = {
    floor: material('axe-rubber-floor', { color: '#2b2a29', roughness: .95 }),
    maple: material('axe-maple-planks', { color: '#c79a62', roughness: .7 }),
    brick: material('axe-brick', { color: '#6e3b2c', roughness: .9 }),
    plaster: material('axe-plaster', { color: '#d9d2c4', roughness: .9 }),
    ceiling: material('axe-ceiling', { color: '#1d1d1f', roughness: .9 }),
    steel: material('axe-steel', { color: '#5d6166', metalness: .7, roughness: .45 }),
    mesh: material('axe-chain-link', { color: '#8f959b', metalness: .6, roughness: .5, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false }),
    yellow: material('axe-throw-line', { color: '#e8c12a', roughness: .6 }),
    timber: material('axe-dark-timber', { color: '#3b2a1e', roughness: .75 }),
    neon: material('axe-neon', { color: '#ff7a3d', emissive: '#ff6a2a', emissiveIntensity: 2.2 }),
    glow: material('axe-glow', { color: '#fff1d6', emissive: '#ffe6bf', emissiveIntensity: 1.6 }),
    leather: material('axe-bench-leather', { color: '#5a2d1f', roughness: .65 }),
    black: material('axe-black', { color: '#141414', roughness: .8 }),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1); owned.geometries.add(cube);
  const batches = new Map(), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const box = (mat, a, y, d, w, h, l, { yaw = 0, pitch = 0, roll = 0 } = {}) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(cube.clone().applyMatrix4(matrix.compose(new THREE.Vector3(a, y, -d), q.setFromEuler(e.set(pitch, yaw, roll)), new THREE.Vector3(w, h, l))));
  };
  const { aMin, aMax, depth: D, height: H } = room, W = aMax - aMin, c = (aMin + aMax) / 2;

  // Shell: rubber floor, plaster sides, a brick back wall, the street wall with its door.
  box(m.floor, c, -.05, D / 2, W, .1, D);
  box(m.ceiling, c, H + .05, D / 2, W, .1, D);
  for (const a of [aMin, aMax]) box(m.plaster, a, H / 2, D / 2, .15, H, D);
  box(m.brick, c, H / 2, D, W, H, .2);
  for (const [a0, a1] of [[aMin, -.85], [.85, aMax]]) box(m.plaster, (a0 + a1) / 2, H / 2, 0, a1 - a0, H, .2);
  box(m.plaster, 0, (3.2 + H) / 2, 0, 1.7, H - 3.2, .2);
  for (const d of [2.5, 5, 7.5]) box(m.timber, c, H - .12, d, W, .22, .3);

  // Lanes: maple planks, chain-link cages open at the front, a yellow throwing line.
  const fences = [AXE_LANES[0].a - AXE_LANES[0].width / 2, (AXE_LANES[0].a + AXE_LANES[1].a) / 2, Math.min(AXE_LANES[1].a + AXE_LANES[1].width / 2, aMax - .04)];
  const cage = AXE_LANES[0].cage, cageLength = D - cage;
  for (const lane of AXE_LANES) {
    box(m.maple, lane.a, .005, (cage + D) / 2, lane.width - .1, .01, cageLength);
    box(m.yellow, lane.a, .012, lane.line, lane.width - .2, .006, .06);
    box(m.timber, lane.a, 1.2, lane.target + .08, 1.2, 2.4, .12);
  }
  for (const a of fences) {
    box(m.mesh, a, 1.3, cage + cageLength / 2, .02, 2.6, cageLength);
    for (let d = cage; d <= D + .01; d += cageLength / 3) box(m.steel, a, 1.3, Math.min(d, D - .03), .05, 2.6, .05);
    box(m.steel, a, 2.6, cage + cageLength / 2, .05, .05, cageLength);
  }
  box(m.mesh, (fences[0] + fences[2]) / 2, 2.62, cage + cageLength / 2, fences[2] - fences[0], .02, cageLength);

  // The dart cabinet against the back wall, as in the IPIC Tuck Room.
  { const { a, face: d, bull } = AXE_ROOM_DARTS;
    box(m.timber, a, bull, d + .2, .95, 1.1, .1);
    for (const dy of [-.53, .53]) box(m.timber, a, bull + dy, d + .1, .95, .04, .14);
    for (const side of [-1, 1]) box(m.timber, a + side * .455, bull, d + .1, .04, 1.1, .14);
    box(m.yellow, a, .012, AXE_ROOM_DARTS.line, 1, .006, .04); }

  // Counter and axe rack inside the door, benches along the left wall, a neon strip.
  box(m.timber, -3.9, .52, 2.2, 2.2, 1.04, .7);
  box(m.maple, -3.9, 1.07, 2.2, 2.3, .05, .8);
  box(m.timber, aMin + .1, 1.6, 2.2, .06, .9, 2.0);
  for (let i = 0; i < 6; i++) {
    const d = 1.45 + i * .3;
    box(m.maple, aMin + .2, 1.6, d, .04, .55, .04);
    box(m.steel, aMin + .2, 1.9, d, .03, .1, .12);
  }
  for (const d of [4.6, 6.6]) { box(m.timber, aMin + .35, .22, d, .5, .44, 1.6); box(m.leather, aMin + .35, .46, d, .48, .06, 1.56); }
  box(m.neon, (fences[0] + fences[2]) / 2, 3.2, D - .12, 3.6, .08, .04);
  for (const a of [-3, 0, 3]) for (const d of [2, 4.5, 7, 9]) box(m.glow, a, H - .03, d, .5, .03, .14);

  for (const [mat, list] of batches) {
    const merged = mergeVertices(mergeGeometries(list)); list.forEach(g => g.dispose()); owned.geometries.add(merged);
    const mesh = new THREE.Mesh(merged, mat); mesh.name = `Axe & Darts: ${mat.name}`;
    mesh.castShadow = mat !== m.glow && mat !== m.mesh && mat !== m.neon; mesh.receiveShadow = true;
    root.add(mesh);
  }

  // Target faces, painted from the axe rules, and the axes stuck in them.
  const targetTexture = dataTexture(256, targetPixel); owned.textures.add(targetTexture);
  const targetMaterial = material('axe-target', { map: targetTexture, roughness: .85 }), targetGeometry = new THREE.PlaneGeometry(BOARD * 2 / 1000, BOARD * 2 / 1000);
  owned.geometries.add(targetGeometry);
  const axeGeometry = mergeGeometries([new THREE.BoxGeometry(.035, .035, .42).translate(0, 0, .21), new THREE.BoxGeometry(.012, .14, .1).translate(0, .04, .02)]);
  owned.geometries.add(axeGeometry);
  const axeMaterial = material('axe-axes', { color: '#7a5636', roughness: .6 });
  const place = new THREE.Object3D(), lanes = {};
  for (const lane of AXE_LANES) {
    const board = new THREE.Mesh(targetGeometry, targetMaterial); board.name = `Target ${lane.id}`;
    board.position.set(lane.a, lane.bull, -lane.target); root.add(board);
    const axes = new THREE.InstancedMesh(axeGeometry, axeMaterial, 10); Object.assign(axes, { name: `Axes in ${lane.id}`, count: 0 }); root.add(axes);
    lanes[lane.id] = {
      // The axes stuck in the board ([{ point: [x, y] mm, stuck }]); dropped ones are not shown.
      show(throws = []) {
        axes.count = 0;
        for (const { point: [x, y], stuck } of throws.slice(-10)) {
          if (!stuck) continue;
          place.position.set(lane.a + x / 1000, lane.bull + y / 1000, -lane.target); place.rotation.set(.35, 0, 0); place.updateMatrix();
          axes.setMatrixAt(axes.count++, place.matrix);
        }
        axes.instanceMatrix.needsUpdate = true; axes.computeBoundingSphere();
      },
      count: () => axes.count,
    };
  }

  // The dartboard in its cabinet and the darts in it, as the Tuck Room shows them.
  const boardTexture = dataTexture(256, (px, py, size) => dartboardPixel(px, py, size, size)); owned.textures.add(boardTexture);
  const dartboard = new THREE.Mesh(new THREE.CircleGeometry(.2255, 64), material('axe-dartboard', { map: boardTexture, roughness: .85, alphaTest: .5 }));
  owned.geometries.add(dartboard.geometry); dartboard.name = 'Dartboard';
  dartboard.position.set(AXE_ROOM_DARTS.a, AXE_ROOM_DARTS.bull, -AXE_ROOM_DARTS.face); root.add(dartboard);
  const thrown = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0035, .0018, .12, 8).rotateX(Math.PI / 2).translate(0, 0, .06), material('axe-darts', { color: '#d9c27a', metalness: .5, roughness: .4 }), 3);
  owned.geometries.add(thrown.geometry); Object.assign(thrown, { name: 'Darts in the board', count: 0 }); root.add(thrown);
  const darts = {
    show(points = []) {
      thrown.count = 0;
      for (const [x, y] of points.slice(-3)) { place.position.set(AXE_ROOM_DARTS.a + x / 1000, AXE_ROOM_DARTS.bull + y / 1000, -AXE_ROOM_DARTS.face); place.rotation.set(0, 0, 0); place.updateMatrix(); thrown.setMatrixAt(thrown.count++, place.matrix); }
      thrown.instanceMatrix.needsUpdate = true; thrown.computeBoundingSphere();
    },
    count: () => thrown.count,
  };

  if (!options.local) {
    root.position.set(room.facade[0], room.floor, -room.facade[1]);
    root.rotation.y = Math.atan2(room.outward[0], -room.outward[1]);
  }
  root.userData.lightPositions = room.lights.map(light => { const [x, north] = room.toWorld(light.a, light.d); return { room, position: new THREE.Vector3(x, room.floor + light.y, -north) }; });
  root.userData.axeLanes = lanes;
  root.userData.venueDarts = darts;
  root.userData.ready = Promise.resolve();
  root.userData.dispose = () => {
    root.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
    owned.geometries.forEach(g => g.dispose()); owned.materials.forEach(mat => mat.dispose()); owned.textures.forEach(t => t.dispose());
    root.clear();
  };
  return root;
}
