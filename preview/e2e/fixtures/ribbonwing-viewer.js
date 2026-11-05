// Interactive orbit viewer around the Ribbonwing acceptance fixture. Reuses the
// fixture scene and craft so it shows exactly the same model, lights and paint.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './ribbonwing.js';

await new Promise(resolve => {
  const check = () => document.body.dataset.ready === 'true' ? resolve() : setTimeout(check, 50);
  check();
});

const fixture = window.ribbonwingFixture;
const { renderer, scene } = fixture;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(-7.4, 4.1, 7.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4.5;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

fixture.pose({ phase: 'parked', altitude: 0, occupied: true, boarding: false, tuck: 0 });

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
