import * as THREE from 'three';
import { buildDistrictBuildings, buildDistrictDetail } from '../../src/district.js';
import { buildDistrictFantasy } from '../../src/district-fantasy.js';
import { buildRoads } from '../../src/street-roads.js';
import { atmosphereFor } from '../../src/atmosphere.js';
import { configureMaterials, loadEnvironment } from '../../src/materials.js';

// The district's buildings alone, framed from the street positions of the
// reference photographs, so facade changes can be compared side by side.
const world = await (await fetch('/data/district.json')).json();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1600, 1000); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
configureMaterials(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1.6, 0.1, 2000);
const atmosphere = atmosphereFor(15, 'clear');
await loadEnvironment(renderer, scene).catch(() => { scene.background = atmosphere.horizon; });
scene.environmentIntensity = atmosphere.environmentIntensity; renderer.toneMappingExposure = atmosphere.exposure;
scene.add(new THREE.AmbientLight('#ffffff', atmosphere.ambientIntensity));
const sun = new THREE.DirectionalLight(atmosphere.sunColor, atmosphere.sunIntensity);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004;
Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 9000 });
scene.add(sun, sun.target);

const terrain = world.terrain, positions = [], indices = [];
for (let row = 0; row < terrain.height; row++) for (let column = 0; column < terrain.width; column++) {
  positions.push(terrain.grid_origin_m[0] + column * terrain.spacing_m[0], terrain.heights_m[row * terrain.width + column], -(terrain.grid_origin_m[1] + row * terrain.spacing_m[1]));
  if (row < terrain.height - 1 && column < terrain.width - 1) { const a = row * terrain.width + column, c = a + terrain.width; indices.push(a, a + 1, c, a + 1, c + 1, c); }
}
const groundGeometry = new THREE.BufferGeometry(); groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); groundGeometry.setIndex(indices); groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.9 })); ground.receiveShadow = true;
const buildings = buildDistrictBuildings(world), fantasy = buildDistrictFantasy(world);
scene.add(ground, buildRoads(world), buildings, buildings.userData.interiors, buildDistrictDetail(world));
buildings.add(fantasy);

// Street-level stations matching each reference photograph: [camera, target], east/north/height above the frontage.
const base = world.stores.find(store => store.name === 'Hermès').facade[2];
const views = {
  hermes: { label: 'HERMÈS · WEST FRONTAGE', camera: [-2772, -1305.5, 2.0], target: [-2757.5, -1318, 8.0] },
  corner: { label: 'HERMÈS · NORTH-WEST CORNER', camera: [-2776, -1287, 2.0], target: [-2750, -1311, 7.0] },
  ipic: { label: 'IPIC THEATERS · WEST FRONTAGE', camera: [-2773, -1223, 2.0], target: [-2755.5, -1232, 8.5] },
  street: { label: 'IPIC / BELLA RINOVA · LOOKING SOUTH', camera: [-2769, -1186, 2.2], target: [-2764, -1236, 5.5] },
  bella: { label: 'BELLA RINOVA · NORTH FRONTAGE', camera: [-2797, -1170, 1.8], target: [-2806, -1209, 5.0] },
  overview: { label: 'OVERVIEW · FROM THE NORTH-WEST', camera: [-2840, -1150, 55], target: [-2765, -1270, 0] },
};
function view(name, { hour = 15, fantasyVisible = true } = {}) {
  const { label, camera: [cx, cn, ch], target: [tx, tn, th] } = views[name];
  const sky = atmosphereFor(hour, 'clear');
  sun.position.set(tx + Math.cos(sky.angle) * 450, base + Math.max(30, Math.sin(sky.angle) * 550), -tn + 190); sun.target.position.set(tx, base, -tn);
  sun.intensity = sky.sunIntensity; sun.color.copy(sky.sunColor);
  fantasy.visible = fantasyVisible;
  camera.position.set(cx, base + ch, -cn); camera.lookAt(tx, base + th, -tn); camera.updateMatrixWorld();
  buildings.userData.updateDoors?.([], 0.016);
  renderer.render(scene, camera);
  document.querySelector('#label').textContent = label;
  return { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
window.facadeFixture = { view, views, world, scene, camera, renderer };
view('hermes');
document.body.dataset.ready = 'true';
