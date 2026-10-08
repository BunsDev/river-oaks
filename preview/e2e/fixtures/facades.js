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
  cartier: { label: 'CARTIER · SOUTH-WEST CORNER', camera: [-2770, -1300, 1.8], target: [-2749, -1281, 6.2] },
  'cartier-entry': { label: 'CARTIER · MAPPED SOUTH ENTRANCE', camera: [-2746, -1301, 1.8], target: [-2746, -1284.8, 6] },
  hermes: { label: 'HERMÈS · WEST FRONTAGE', camera: [-2772, -1305.5, 2.0], target: [-2757.5, -1318, 8.0] },
  corner: { label: 'HERMÈS · NORTH-WEST CORNER', camera: [-2776, -1287, 2.0], target: [-2750, -1311, 7.0] },
  ipic: { label: 'IPIC THEATERS · WEST FRONTAGE', camera: [-2773, -1223, 2.0], target: [-2755.5, -1232, 8.5] },
  street: { label: 'IPIC / BELLA RINOVA · LOOKING SOUTH', camera: [-2769, -1186, 2.2], target: [-2764, -1236, 5.5] },
  bella: { label: 'BELLA RINOVA · NORTH FRONTAGE', camera: [-2797, -1170, 1.8], target: [-2806, -1209, 5.0] },
  overview: { label: 'OVERVIEW · FROM THE NORTH-WEST', camera: [-2840, -1150, 55], target: [-2765, -1270, 0] },
  equinox: { label: 'EQUINOX · KETTERING DRIVE CORNER', camera: [-2790, -1371, 1.8], target: [-2758, -1398, 12] },
  kettering: { label: 'EQUINOX · FROM WESTHEIMER AND KETTERING', camera: [-2796, -1446, 1.8], target: [-2768, -1408, 10] },
  etro: { label: 'ETRO / BRUNELLO CUCINELLI · SOUTH-WEST CORNER', camera: [-2823, -1381, 1.8], target: [-2802, -1355, 4.5] },
  brunello: { label: 'ETRO / BRUNELLO CUCINELLI · SOUTH FRONTAGE', camera: [-2797, -1386, 1.8], target: [-2793, -1366, 4.8] },
  diptyque: { label: 'DIPTYQUE TO ETRO · WEST FRONTAGE', camera: [-2827, -1340, 1.8], target: [-2809, -1338, 4.8] },
  vince: { label: 'VINCE · ALICE + OLIVIA · ZADIG & VOLTAIRE', camera: [-2812, -1362, 1.8], target: [-2828, -1362, 6.5] },
  baccarat: { label: 'BACCARAT AND BARI · LOOKING UP', camera: [-2814, -1318, 1.6], target: [-2828, -1316, 11] },
  bari: { label: 'BARI · ALONG THE LAWN', camera: [-2814, -1295, 1.8], target: [-2862, -1302, 9] },
  dolce: { label: 'DOLCE & GABBANA · LAWN CORNER', camera: [-2818, -1299, 1.8], target: [-2842, -1286, 7] },
  ojo: { label: 'VERONICA BEARD · OJO DE AGUA', camera: [-2812, -1243, 1.8], target: [-2828, -1238, 5.5] },
  hopdoddy: { label: 'HOPDODDY BURGER BAR', camera: [-2797, -1238, 1.8], target: [-2801, -1222, 4.5] },
  podium: { label: 'LOUVRED PODIUM BESIDE VINCE', camera: [-2803, -1374, 1.8], target: [-2818, -1382, 7] },
  residences: { label: 'KETTERING DRIVE · RESIDENCES CORNER', camera: [-2784, -1416, 1.8], target: [-2801, -1398, 8] },
  moreau: { label: 'BRUNELLO CUCINELLI TO LAURA RATHE · EAST FRONTAGE', camera: [-2765, -1352, 1.8], target: [-2777, -1335, 5] },
  'equinox-east': { label: 'EQUINOX · SAINT BERNARD CORNER', camera: [-2683, -1373, 1.8], target: [-2700, -1395, 11] },
  dior: { label: 'DIOR · ALONG THE WALKWAY', camera: [-2769, -1296, 1.8], target: [-2800, -1293, 6] },
  toulouse: { label: 'TOULOUSE · FROM THE PLAZA CORNER', camera: [-2818, -1297, 1.8], target: [-2806, -1272, 5] },
  loveshack: { label: 'LOVESHACKFANCY · PLAZA FRONTAGE', camera: [-2814, -1289, 1.8], target: [-2796, -1305, 4] },
  amorino: { label: 'VENUS ET FLEUR · AMORINO · COS BAR', camera: [-2769, -1219, 1.8], target: [-2755, -1218, 5.5] },
  vilebrequin: { label: 'VILEBREQUIN · NORTH FRONTAGE', camera: [-2784, -1229, 1.8], target: [-2791, -1241, 5] },
  'jo-malone': { label: 'JO MALONE LONDON UNDER DIOR · EAST FRONTAGE', camera: [-2765, -1250, 1.8], target: [-2777, -1272, 6] },
  steak: { label: 'STEAK 48 · WESTHEIMER CORNER', camera: [-2872, -1434, 1.8], target: [-2885, -1420, 6] },
  'grey-house': { label: 'GREY HOUSE · FROM WESTHEIMER', camera: [-2812, -1452, 1.8], target: [-2860, -1418, 9] },
  west: { label: 'OVERVIEW · FROM THE SOUTH-EAST', camera: [-2735, -1460, 60], target: [-2820, -1320, 0] },
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
window.facadeFixture = { THREE, view, views, world, scene, camera, renderer };
view('hermes');
document.body.dataset.ready = 'true';
