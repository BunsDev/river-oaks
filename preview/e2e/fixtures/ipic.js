import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildIpicInterior } from '../../src/ipic-interior.js';
import { planStoreRooms } from '../../src/store-rooms.js';
import { IPIC_CAMERAS } from '../../src/ipic-plan.js';
const data = await fetch('/data/district.json').then(r => r.json());
const room = planStoreRooms(data).find(r => r.interior);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor('#181613');
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, .08, 100);
const model = buildIpicInterior(room, { local: true }); scene.add(model);
scene.add(new THREE.HemisphereLight('#eee0c4', '#66584a', 2.1));
for (const [a, d, y, intensity] of [[0,3,3.2,40],[-1.4,9,4,25],[1,13,6,25],[0,17,7,25],[-2,23,9.5,40],[4,23,9.5,38],[0,32,9.5,6]]) {
  const light = new THREE.PointLight('#ffd2a0', intensity, 12, 2); light.position.set(a,y,-d);scene.add(light);
}
const controls = new OrbitControls(camera, renderer.domElement); controls.minDistance = .1;controls.maxDistance = 60;
const point = p => new THREE.Vector3(p[0],p[1],-p[2]);
function view(name) {
  const v = IPIC_CAMERAS.find(v => v.name === name); if (!v) throw new Error('Unknown view');
  camera.position.copy(point(v.eye)); controls.target.copy(point(v.target)); controls.update();
  document.querySelector('#status').textContent = `${v.name} · reference ${v.photo} · inferred dimensions; not a surveyed floor plan`;
  renderer.render(scene,camera);
}
for (const v of IPIC_CAMERAS) { const b = document.createElement('button'); b.textContent = v.name;b.onclick = () => view(v.name);document.querySelector('#views').append(b); }
await model.userData.ready; view('lounge');
controls.addEventListener('change', () => renderer.render(scene,camera));
window.ipicReview = { ready: true, view, stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, error: renderer.getContext().getError(), textures: renderer.info.memory.textures }),
  async exportGLB() {
    const exported = model.clone(true); exported.traverse(o => { o.userData = {}; });
    const buffer = await new GLTFExporter().parseAsync(exported, { binary: true, onlyVisible: false, maxTextureSize: 1536 });
    let text = ''; const bytes = new Uint8Array(buffer);
    for (let i=0;i<bytes.length;i+=32768) text += String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(text);
  } };
addEventListener('resize', () => {camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide', () => { renderer.setAnimationLoop(null); controls.dispose();model.userData.dispose();renderer.dispose(); });
