// In-engine preview of any neighborhood recipe (scripts/destination.mjs preview):
// /e2e/fixtures/city-kit.html?recipe=<id>&seed=<n>&view=<name>&finish=<finish>. Lighting, tone
// mapping, sky and PBR maps match the town (preview/src/main.js).
import * as THREE from 'three';
import { assembleNeighborhood } from '../../../shared/city-kit/assemble.js';
import { configureMaterials, loadEnvironment } from '../../src/materials.js';
import { buildCityKit } from '../../src/city-kit/render.js';

const recipes = import.meta.glob('../../../config/destinations/*.json', { eager: true, import: 'default' });
const params = new URLSearchParams(location.search), id = params.get('recipe') ?? 'bayou-market-commons';
const recipe = Object.values(recipes).find(item => item.id === id);
if (!recipe) throw new Error(`Unknown recipe ${id}`);
const seed = params.has('seed') ? Number(params.get('seed')) : recipe.seed;
const plan = assembleNeighborhood(recipe, { seed });

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
configureMaterials(renderer); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bcd3d8'); scene.fog = new THREE.Fog('#c9d8d6', 140, 420);
const sun = new THREE.DirectionalLight('#fff2d8', 2.5), [w, s, e, n] = plan.site, cx = (w + e) / 2, cy = (s + n) / 2;
sun.position.set(cx - 60, 90, -cy - 40); sun.target.position.set(cx, 0, -cy); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, far: 300 }); sun.shadow.bias = -.0002; sun.shadow.normalBias = .02;
scene.add(sun, sun.target, new THREE.HemisphereLight('#eef4eb', '#73806c', 2.3));
const environment = await loadEnvironment(renderer, scene).catch(() => null);
// `finish` (catalog.js KIT_FINISHES) recolours the kit for matched before/after review.
const finish = params.get('finish') ?? 'classic';
const ground = 0, kit = buildCityKit(plan, { groundAt: () => ground, ground, finish });
scene.add(kit);
await Promise.allSettled(kit.children.map(child => child.userData.ready).filter(Boolean));
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 900);
// Pedestrian views at 1.68 m eye height, plus an overview.
const firstStreet = recipe.streets?.[0], sy = firstStreet?.from[1] ?? cy, sx = firstStreet?.from[0] ?? w;
const views = {
  overview: [[cx - 70, 70, -(s - 40)], [cx, 0, -cy]],
  street: [[sx + 2, 1.68, -(sy - 1.5)], [sx + 40, 3, -(sy + .5)]],
  frontage: [[sx + 18, 1.68, -(sy - 2.5)], [sx + 24, 4, -(sy + 9)]],
  ...(id === 'bayou-market-commons' ? { landmark: [[60, 1.68, -(-6)], [106, 14, 0]], court: [[24, 1.68, -(-4)], [24, 3, -(-16)]], blades: [[6, 1.68, -(-4.2)], [30, 3.2, -(-7.6)]], plaza: [[50, 1.68, -(-2)], [93, 3, -20]] } : {}),
  ...(id === 'nineteenth-and-yale' ? { intersection: [[44, 1.68, -61], [62, 3, -66]], court: [[58, 1.68, -24], [70, 4, -25.5]] } : {}),
};
function render(view = params.get('view') ?? 'overview') {
  const [position, target] = views[view] ?? views.overview;
  camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld();
  kit.userData.update(camera.position);
  renderer.render(scene, camera);
  return { view, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}
const lit = new Set(plan.lanterns.slice(0, 3).map(item => item.id));
kit.userData.setLanterns(lit, false);
window.cityKit = { render, finish, views: Object.keys(views), plan: { id: plan.id, seed: plan.seed, hash: plan.hash, stats: plan.stats }, stats: () => kit.userData.stats(), environment: Boolean(environment), setLanterns: (ids, done) => kit.userData.setLanterns(new Set(ids), done) };
render(); document.body.dataset.ready = 'true';
