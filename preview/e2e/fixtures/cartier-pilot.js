import * as THREE from 'three';
import { planStoreRooms } from '../../src/store-rooms.js';
import { buildStoreInteriors } from '../../src/store-interiors.js';
import { configureMaterials, loadEnvironment } from '../../src/materials.js';
import { atmosphereFor } from '../../src/atmosphere.js';

// Isolated, source-matched material comparison. This does not simulate town traffic.
const world = await fetch('/data/district.json').then(response => response.json());
const room = planStoreRooms(world).find(item => item.storeId === 'osm-node-8172494965');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(1600, 1000);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
configureMaterials(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1.6, 0.05, 100);
const environment = await loadEnvironment(renderer, scene);
const ambient = new THREE.AmbientLight('#ffffff', 0.35), sun = new THREE.DirectionalLight('#fff4f9', 3.2);
scene.add(ambient, sun, sun.target);
let group;
const position = (a, d, y) => {
  const [east, north] = room.toWorld(a, d);
  return new THREE.Vector3(east, room.floor + y, -north);
};
const views = { entrance: [0, 0.8, 1.65, room.center, 5, 1.35], display: [room.center + 0.4, 2.2, 1.5, room.aMin + 0.5, 4.5, 1.35] };
window.cartierReview = {
  async show({ pilot = true, view = 'entrance', hour = 15 } = {}) {
    if (group) { scene.remove(group); group.userData.dispose(); }
    group = buildStoreInteriors([room], { cartierPilot: pilot }); scene.add(group);
    const [a, d, y, ta, td, ty] = views[view];
    camera.position.copy(position(a, d, y)); camera.lookAt(position(ta, td, ty));
    const atmosphere = atmosphereFor(hour, 'clear');
    scene.background = atmosphere.horizon;
    scene.environmentIntensity = atmosphere.environmentIntensity;
    renderer.toneMappingExposure = atmosphere.exposure;
    ambient.intensity = atmosphere.ambientIntensity;
    sun.color.copy(atmosphere.sunColor); sun.intensity = atmosphere.sunIntensity;
    sun.position.copy(position(-5, 1, 8)); sun.target.position.copy(position(0, 5, 1));
    // Wait for all deferred procedural surfaces to receive their final images.
    await new Promise(resolve => {
      const settle = () => {
        const pending = group.children.some(item => item.material?.map?.image?.width === 1);
        if (pending) requestAnimationFrame(settle); else resolve();
      }; settle();
    });
    for (let frame = 0; frame < 30; frame++) { await new Promise(requestAnimationFrame); renderer.render(scene, camera); }
    const names = [...new Set(group.children.map(item => item.material?.name).filter(Boolean))];
    document.querySelector('#label').textContent = `${pilot ? 'CARTIER PILOT' : 'GENERIC BASELINE'} · ${view.toUpperCase()} · ${hour}:00 CLEAR`;
    return { pilot, view, hour, camera: camera.position.toArray(), target: position(ta, td, ty).toArray(), names, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, buffer: [renderer.domElement.width, renderer.domElement.height], glError: renderer.getContext().getError() };
  },
  async sample() {
    const samples = [], cpu = []; let previous;
    for (let frame = 0; frame < 120; frame++) {
      const now = await new Promise(requestAnimationFrame);
      if (previous !== undefined) samples.push(now - previous); previous = now;
      const start = performance.now(); renderer.render(scene, camera); cpu.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b); cpu.sort((a, b) => a - b);
    return { samples: samples.length, median_ms: samples[Math.floor(samples.length * 0.5)], p95_ms: samples[Math.floor(samples.length * 0.95)], cpu_submit_p95_ms: cpu[114], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  },
  dispose() { group?.userData.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
};
