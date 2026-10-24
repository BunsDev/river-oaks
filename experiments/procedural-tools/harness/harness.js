// Evaluation harness: render the same District block from the in-house runtime
// builder or from an offline-generated GLB, under identical lighting and cameras.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildDistrictBuildings } from '../../../preview/src/district.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb3c4');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;
scene.add(new THREE.HemisphereLight('#dfe8f0', '#5b5446', 1.2));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(-2600, 400, 1500);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 6000);
const VIEWS = {
  // District centre in render space: x east, y up, z = -north.
  overview: { position: [-2620, 190, 1120], target: [-2793, 10, 1312] },
  street: { position: [-2740, 19.9, 1365], target: [-2734, 24, 1405] },
  wide: { position: [-2300, 700, 700], target: [-2300, 0, 750] },
  // OSM2World output uses its own origin near the extract centre.
  o2w: { position: [173, 190, 192], target: [0, 10, 0] },
};

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { count: sorted.length, median: at(0.5), p95: at(0.95), max: sorted.at(-1) };
}

async function load(mode, src) {
  const started = performance.now();
  if (mode === 'inhouse') {
    const district = await (await fetch('/data/district.json')).json();
    const fetched = performance.now();
    const group = buildDistrictBuildings(district);
    return { object: group, fetchMs: fetched - started, buildMs: performance.now() - fetched, bytes: null };
  }
  const response = await fetch(src), buffer = await response.arrayBuffer(), fetched = performance.now();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buffer, '');
  return { object: gltf.scene, fetchMs: fetched - started, buildMs: performance.now() - fetched, bytes: buffer.byteLength };
}

window.measure = async ({ mode, src, view = 'overview', frames = 240 }) => {
  await MeshoptDecoder.ready;
  const loaded = await load(mode, src);
  scene.add(loaded.object);
  const v = VIEWS[view];
  camera.position.set(...v.position);
  camera.lookAt(...v.target);
  let t = performance.now();
  renderer.render(scene, camera);
  renderer.getContext().finish();
  const firstRenderMs = performance.now() - t;
  const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  const samples = [];
  let last = performance.now();
  await new Promise(resolve => {
    const tick = () => {
      const now = performance.now(), begin = performance.now();
      renderer.render(scene, camera);
      samples.push({ intervalMs: now - last, cpuMs: performance.now() - begin });
      last = now;
      if (samples.length < frames) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  samples.shift();
  return {
    mode, src: src ?? null, view, bytes: loaded.bytes,
    fetchMs: loaded.fetchMs, buildOrParseMs: loaded.buildMs, firstRenderMs, ...info,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? null,
    frame: distribution(samples.map(s => s.intervalMs)), cpu: distribution(samples.map(s => s.cpuMs)),
    heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    renderer: renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? 0x1F01),
  };
};
// Bake the in-house District to GLB with three.js GLTFExporter (no external tool) and
// record what the export cannot carry: shader patches, hidden objects, export warnings.
window.bake = async ({ maxTextureSize = 2048, stripUserData = true } = {}) => {
  const district = await (await fetch('/data/district.json')).json();
  const started = performance.now();
  const group = buildDistrictBuildings(district);
  const buildMs = performance.now() - started;
  const materials = new Set(), textures = new Set();
  let meshes = 0, instancedMeshes = 0, instances = 0, otherRenderables = 0, hidden = 0;
  group.traverse(object => {
    if (!object.visible) hidden++;
    if (object.isInstancedMesh) { instancedMeshes++; instances += object.count; }
    if (object.isMesh) meshes++; else if (object.isLine || object.isPoints || object.isSprite) otherRenderables++;
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  // Texture images load asynchronously; export only once every image has decoded.
  const deadline = performance.now() + 60000;
  while ([...textures].some(t => !(t.image?.width > 0)) && performance.now() < deadline) await new Promise(r => setTimeout(r, 100));
  const patched = [...materials].filter(m => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile);
  // glTF has no equivalent of these flags, so the exporter would draw such surfaces.
  const undrawn = [...materials].filter(m => !m.visible || !m.colorWrite);
  // Runtime metadata (rooms, interiors) would otherwise be serialised into glTF extras.
  let userDataBytes = 0;
  const strip = owner => {
    try { userDataBytes += JSON.stringify(owner.userData).length; } catch { /* non-JSON runtime state */ }
    owner.userData = {};
  };
  if (stripUserData) { group.traverse(strip); materials.forEach(strip); }
  const warnings = [], warn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(' ').slice(0, 200)); warn(...args); };
  const exportStarted = performance.now();
  let buffer;
  try { buffer = await new GLTFExporter().parseAsync(group, { binary: true, maxTextureSize }); } finally { console.warn = warn; }
  const exportMs = performance.now() - exportStarted;
  await fetch('/bake-upload', { method: 'POST', body: buffer });
  return {
    buildMs, exportMs, bytes: buffer.byteLength, meshes, instancedMeshes, instances, otherRenderables, hiddenObjects: hidden,
    materials: materials.size, materialTypes: [...new Set([...materials].map(m => m.type))],
    shaderPatchedMaterials: patched.length, undrawnMaterials: undrawn.length, strippedUserDataBytes: userDataBytes,
    textures: textures.size,
    texturesUnloaded: [...textures].filter(t => !(t.image?.width > 0)).length,
    warnings: [...new Set(warnings)], warningCount: warnings.length,
  };
};
window.harnessReady = true;
