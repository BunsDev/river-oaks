import * as THREE from 'three';
import { buildRoads } from '../../src/street-roads.js';
import { buildDesignatedSidewalks } from '../../src/sidewalks.js';
import { createPedestrianNetwork } from '../../src/pedestrian-network.js';
import { STREET } from '../../src/street-profile.js';
import { atmosphereFor } from '../../src/atmosphere.js';
import { configureMaterials, loadEnvironment, paverSurface } from '../../src/materials.js';

// The district's street surfaces alone, framed at every junction corner, so
// curb returns and paving can be compared before and after a change.
const world = await (await fetch('/data/district.json')).json();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1400, 900); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
configureMaterials(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1400 / 900, 0.1, 2000);
const atmosphere = atmosphereFor(15, 'clear');
await loadEnvironment(renderer, scene).catch(() => { scene.background = atmosphere.horizon; });
scene.environmentIntensity = atmosphere.environmentIntensity; renderer.toneMappingExposure = atmosphere.exposure;
scene.add(new THREE.AmbientLight('#ffffff', atmosphere.ambientIntensity));
const sun = new THREE.DirectionalLight(atmosphere.sunColor, atmosphere.sunIntensity);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 2000 });
scene.add(sun, sun.target);

// Plaza ground as the game lays it: terrain-following pavers in world metres.
const terrain = world.terrain, positions = [], uvs = [], indices = [];
for (let row = 0; row < terrain.height; row++) for (let column = 0; column < terrain.width; column++) {
  const x = terrain.grid_origin_m[0] + column * terrain.spacing_m[0], y = terrain.grid_origin_m[1] + row * terrain.spacing_m[1];
  positions.push(x, terrain.heights_m[row * terrain.width + column], -y); uvs.push(x, -y);
  if (row < terrain.height - 1 && column < terrain.width - 1) { const a = row * terrain.width + column, c = a + terrain.width; indices.push(a, a + 1, c, a + 1, c + 1, c); }
}
const groundGeometry = new THREE.BufferGeometry();
groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
groundGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
groundGeometry.setIndex(indices); groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(groundGeometry, paverSurface()); ground.position.y = STREET.plazaOffset; ground.receiveShadow = true;
scene.add(ground, buildRoads(world), buildDesignatedSidewalks(world));

// Every corner between two adjacent arms of a junction with three or more arms.
const network = createPedestrianNetwork(world), nodes = new Map();
for (const segment of network.segments) {
  if (segment.walkway) continue;
  for (const [point, other] of [[segment.a, segment.b], [segment.b, segment.a]]) {
    const key = point.join(), length = Math.hypot(other[0] - point[0], other[1] - point[1]);
    if (!nodes.has(key)) nodes.set(key, { point, arms: [] });
    nodes.get(key).arms.push([(other[0] - point[0]) / length, (other[1] - point[1]) / length]);
  }
}
const corners = [];
for (const { point, arms } of nodes.values()) {
  if (arms.length < 3) continue;
  arms.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  arms.forEach((a, i) => {
    const b = arms[(i + 1) % arms.length];
    let theta = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]); if (theta <= 0) theta += Math.PI * 2;
    if (theta >= Math.PI * 0.85) return;
    const bisector = [a[0] + b[0], a[1] + b[1]], length = Math.hypot(...bisector);
    corners.push({ node: point, bisector: bisector.map(v => v / length) });
  });
}
const height = (x, north) => {
  const column = Math.round((x - terrain.grid_origin_m[0]) / terrain.spacing_m[0]), row = Math.round((north - terrain.grid_origin_m[1]) / terrain.spacing_m[1]);
  return terrain.heights_m[Math.max(0, Math.min(terrain.height - 1, row)) * terrain.width + Math.max(0, Math.min(terrain.width - 1, column))];
};

// mode 'street': from the far side of the junction at eye height; 'plan': steep overhead.
function view(index, mode = 'street') {
  const { node, bisector } = corners[index], target = [node[0] + bisector[0] * 6.5, node[1] + bisector[1] * 6.5];
  const base = height(...target), eye = mode === 'plan' ? [target[0] - bisector[0] * 2, target[1] - bisector[1] * 2, 17] : [node[0] - bisector[0] * 4, node[1] - bisector[1] * 4, 3.2];
  camera.position.set(eye[0], base + eye[2], -eye[1]); camera.lookAt(target[0], base, -target[1]); camera.updateMatrixWorld();
  sun.position.set(target[0] + 60, base + 120, -target[1] + 40); sun.target.position.set(target[0], base, -target[1]);
  renderer.render(scene, camera);
  document.querySelector('#label').textContent = `CORNER ${index + 1}/${corners.length} · ${mode.toUpperCase()} · ${node.map(v => v.toFixed(1)).join(', ')}`;
  return { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
window.cornerFixture = { THREE, view, corners, world, scene, camera, renderer };
const params = new URLSearchParams(location.search);
view(Number(params.get('corner') ?? 0), params.get('mode') ?? 'street');
document.body.dataset.ready = 'true';
