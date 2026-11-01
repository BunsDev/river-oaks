// Penthouse asset preview and export (#362). Authenticated local fixture only. It renders the
// furnished office from its JS master under the fixture's own lights, labelled an asset preview:
// runtime captures come from the game (preview/e2e/office-penthouse-review.mjs). It also exports
// the asset package's GLBs and reimports them, for scripts/export-office-penthouse.mjs.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPenthouseOffice } from '../../src/office-penthouse-graybox.js';
import { buildPenthouseAssetModel, buildPenthouseFurnishings, createPenthouseFinishes, drawPenthouseSurfaces, PENTHOUSE_ASSETS, PENTHOUSE_SURFACES, penthouseSurfaceCanvas } from '../../src/office-penthouse-furnishings.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout } from '../../src/office-layouts.js';
import { atmosphereFor } from '../../src/atmosphere.js';
import { officeKitFinishName } from '../../src/office-kit-finish.js';

const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
// Review cameras, [x, height, d] in the office frame (docs/design/office-ipic/camera-manifest.json).
export const VIEWS = {
  O1: { label: 'Arrival', eye: [0, 1.68, 1.5], target: [-3, 1.25, 11], fov: 62 },
  O2: { label: 'Hosting and work', eye: [-13.4, 1.68, 2.2], target: [-2.5, 1.0, 11.5], fov: 62 },
  O3: { label: 'Workstation, seated', eye: [3.65, 1.2, 5.6], target: [3.65, 0.95, 9.5], fov: 62 },
  O4: { label: 'Mezzanine library from the stair head', eye: [11.8, 5.48, 15.2], target: [0, 5.0, 15.6], fov: 62 },
  'O4-terrace': { label: 'Terrace retreat', eye: [-15.6, 1.68, 1.2], target: [-21, 0.8, 12], fov: 62 },
  plan: { label: 'Overview', eye: [13.6, 6.4, 1.2], target: [-6, 1, 12], fov: 62 },
};
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);
const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;
// Build time on this page (the arrival pays it once per visit): the shell, every furnishing and the swatches.
// ?finish=pink-jet-age renders the kit finish (office-kit-finish.js); anything else is classic.
const finish = officeKitFinishName(new URLSearchParams(location.search).get('finish'));
const buildStarted = performance.now(), office = buildPenthouseOffice(THREE, layout, { finish }), buildMs = performance.now() - buildStarted; scene.add(office.object);
const hemisphere = new THREE.HemisphereLight('#f3efe8', '#8a7c6c', 0.4); scene.add(hemisphere);
const sun = new THREE.DirectionalLight('#fff4ea', 3); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004;
sun.target.position.set(-4, 0, -10); scene.add(sun, sun.target);
drawPenthouseSurfaces();
let hour = 12;
function setHour(value) {
  hour = value;
  const atmosphere = atmosphereFor(hour, 'clear');
  // Sun from the street side, its height from the clock; the office frame faces the street at d 0.
  const height = Math.max(0.12, Math.sin(atmosphere.angle)), across = Math.cos(atmosphere.angle);
  sun.position.set(-4 + across * 40, height * 45, -10 + 38); sun.color.copy(atmosphere.sunColor); sun.intensity = atmosphere.sunIntensity;
  hemisphere.intensity = atmosphere.ambientIntensity * 1.2;
  scene.background = atmosphere.horizon.clone().multiplyScalar(atmosphere.backgroundIntensity);
  scene.environmentIntensity = atmosphere.environmentIntensity;
  renderer.toneMappingExposure = atmosphere.exposure;
  office.relight(atmosphere, environment);
}
const controls = new OrbitControls(camera, renderer.domElement);
const point = ([x, h, d]) => new THREE.Vector3(x, h, -d);
function view(name) {
  const v = VIEWS[name]; if (!v) throw new Error(`Unknown view ${name}`);
  camera.fov = v.fov; camera.position.copy(point(v.eye)); controls.target.copy(point(v.target)); controls.update(); camera.updateProjectionMatrix();
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round(hour % 1 * 60)).padStart(2, '0')}`;
  document.querySelector('#status').textContent = `${name} · ${v.label} · ${clock} · ${finish} · asset preview, fixture lighting`;
  renderer.render(scene, camera);
}
for (const name of Object.keys(VIEWS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => view(name); document.querySelector('#views').append(b); }
setHour(12); view('O1');
controls.addEventListener('change', () => renderer.render(scene, camera));

const exportFinishes = createPenthouseFinishes({ defer: false });
async function glb(object) {
  const buffer = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: false, maxTextureSize: 512 });
  let text = ''; const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
const clean = object => { object.traverse(node => { node.userData = {}; }); return object; };
// Exports carry indexed geometry: a vertex shared by triangles is written once. Triangles, normals
// and UVs are unchanged; the runtime keeps the flat arrays it batches.
function indexed(object) {
  const made = new Map();
  object.traverse(node => {
    if (!node.isMesh) return;
    if (!made.has(node.geometry)) made.set(node.geometry, mergeVertices(node.geometry));
    node.geometry = made.get(node.geometry);
  });
  return [...made.values()];
}
// The shell's instanced batches (the curtain wall) become plain meshes of the same name, so every
// DCC tool imports them without an instancing extension.
function bakeInstances(object) {
  const made = [];
  object.traverse(node => { if (node.isInstancedMesh) made.push(node); });
  return made.map(node => {
    const matrix = new THREE.Matrix4(), parts = Array.from({ length: node.count }, (_, i) => { node.getMatrixAt(i, matrix); return node.geometry.clone().applyMatrix4(matrix); });
    const mesh = new THREE.Mesh(mergeGeometries(parts), node.material); parts.forEach(part => part.dispose());
    mesh.name = node.name; mesh.position.copy(node.position); mesh.quaternion.copy(node.quaternion); mesh.scale.copy(node.scale);
    node.parent.add(mesh); node.parent.remove(node);
    return mesh.geometry;
  });
}
window.penthouseReview = {
  ready: true, views: VIEWS, view, setHour,
  stats: () => ({ buildMs: Math.round(buildMs), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, error: renderer.getContext().getError() }),
  assets: () => PENTHOUSE_ASSETS.map(asset => asset.id),
  // The shared surfaces as JPEG data URLs (the GLBs embed the same images).
  surfaces: () => Object.fromEntries(PENTHOUSE_SURFACES.map(name => [name, penthouseSurfaceCanvas(name).toDataURL('image/jpeg', 0.92)])),
  // One asset in its own frame: LOD0, LOD1, COL_<id> and its anchors.
  async exportAsset(id) {
    const model = buildPenthouseAssetModel(id, exportFinishes), merged = indexed(model.object);
    try { return await glb(clean(model.object)); } finally { model.dispose(); merged.forEach(g => g.dispose()); }
  },
  // The placed office: the shell and every furnishing as its own named node, collision proxies and anchors.
  async exportScene() {
    const shell = buildPenthouseOffice(THREE, layout), furnishings = buildPenthouseFurnishings(layout, { finishes: exportFinishes, lights: shell.lights, instancing: false });
    const root = new THREE.Group(); root.name = 'office-penthouse';
    const runtime = shell.object.getObjectByName('office-furnishings'); shell.object.remove(runtime);
    shell.object.name = 'shell'; // the lamps stay in the shell, exported as punctual lights
    root.add(shell.object, furnishings.object);
    const baked = bakeInstances(shell.object), merged = indexed(root);
    try { return await glb(clean(root)); } finally { furnishings.dispose(); shell.dispose(); [...baked, ...merged].forEach(g => g.dispose()); }
  },
  // Reimports an exported GLB and reports what came back, textures decoded.
  async reimport(base64) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
    const meshes = [], nodes = [], materials = new Map(), images = new Set();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      nodes.push(node.name);
      if (!node.isMesh) return;
      meshes.push(node);
      for (const material of [node.material].flat()) {
        materials.set(material.name, material);
        if (material.map?.image) images.add(material.map.image);
      }
    });
    const box = new THREE.Box3(); for (const mesh of meshes.filter(m => !m.name.startsWith('COL_'))) box.expandByObject(mesh);
    const triangles = meshes.filter(m => !m.name.startsWith('COL_')).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
    return {
      nodes, meshes: meshes.length, triangles, materials: [...materials.keys()].sort(),
      textures: [...images].map(image => [image.width, image.height]), bounds: [box.min.toArray(), box.max.toArray()],
      missingTextures: [...materials.values()].filter(m => m.map && !(m.map.image?.width > 1)).map(m => m.name),
    };
  },
};
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('pagehide', () => { controls.dispose(); office.dispose(); exportFinishes.dispose(); pmrem.dispose(); renderer.dispose(); });
