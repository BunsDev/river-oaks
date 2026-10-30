// Ribbonwing canonical-view fixture (#777). Frozen renderer, exposure, lights,
// background and occupants; cameras come from the caller's manifest
// (docs/design/ribbonwing/camera-manifest.json). Jevica pilots from the left
// seat and Jev rides on the right, at their own proportions. `?avatars=0`
// renders the empty craft for silhouette work.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRibbonwing } from '../../src/ribbonwing.js';
import { bodyAt, canopyHeightAt, SEATS } from '../../src/ribbonwing-design.js';
import { VEHICLES } from '../../src/vehicle-config.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { createJevicaCostume } from '../../src/jevica-costume.js';
import { createPrinceCostume, loadPrinceSkinTexture } from '../../src/prince-costume.js';
import { createDrivingHands } from '../../src/driving-hands.js';

// `?mask=1` renders on a transparent background, so a capture's alpha is the craft's exact silhouette.
const params = new URLSearchParams(location.search), withAvatars = params.get('avatars') !== '0', withGround = params.get('ground') !== '0', mask = params.get('mask') === '1';
const width = Number(params.get('w')) || 1200, height = Number(params.get('h')) || 800;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: mask });
renderer.setSize(width, height);renderer.setPixelRatio(1);renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1;renderer.shadowMap.enabled = true;renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), background = new THREE.Color('#fbf8f2');scene.background = mask ? null : background;if (mask) { renderer.setClearColor(0x000000, 0);document.documentElement.style.background = document.body.style.background = 'transparent'; }
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();scene.environment = pmrem.fromScene(room).texture;room.dispose();pmrem.dispose();scene.environmentIntensity = .55;
scene.add(new THREE.HemisphereLight('#ffffff', '#9a948c', .7));
const key = new THREE.DirectionalLight('#fff8ef', 2.2);key.position.set(-4, 9, 6);key.castShadow = true;key.shadow.mapSize.set(2048, 2048);Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });key.shadow.radius = 6;scene.add(key);
const fill = new THREE.DirectionalLight('#eef3ff', .6);fill.position.set(6, 3, -5);scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .18 }));ground.rotation.x = -Math.PI / 2;ground.receiveShadow = true;scene.add(ground);

const craft = createRibbonwing();scene.add(craft.object);
let pilot = null, passenger = null, pilotHands = null, dress = null, suit = null;
if (withAvatars) {
  pilot = await loadResidentAvatar(4, 'player', 'jevica');passenger = await loadResidentAvatar(1, 'ribbonwing-fixture-passenger', 'prince-jev', { folk: false });
  dress = createJevicaCostume(pilot);suit = createPrinceCostume(passenger, { skinTexture: await loadPrinceSkinTexture() });
  pilotHands = createDrivingHands(pilot.rig.model, pilot.object);
  craft.object.add(pilot.object, passenger.object);
}
const seatAvatars = () => {
  if (!withAvatars) return;
  pilot.object.visible = passenger.object.visible = state.occupied !== false;
  for (const [avatar, seat, driver] of [[pilot, SEATS.pilot, true], [passenger, SEATS.passenger, false]]) {
    const [x, y, z] = seat.root;avatar.object.position.set(x, y - avatar.rig.hipHeight + .025, z);avatar.object.rotation.set(0, -Math.PI / 2, 0);
    avatar.update(0, 'continue', false, { speed: 0, riding: true, ridingKind: 'hover', ridingDriver: driver, ridingSpeed: 0, seatToFloor: y - seat.floor });
  }
  craft.object.updateMatrixWorld(true);pilotHands(craft.object, VEHICLES.hover);dress.update(false, 0, true);suit.update({ carrying: false });
};
let camera = new THREE.PerspectiveCamera(30, width / height, .05, 200);
const setCamera = view => {
  const aspect = width / height;
  if (view.projection === 'orthographic') { const h = view.height / 2;camera = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, .05, 200); }
  else camera = new THREE.PerspectiveCamera(view.fov, aspect, .02, 200);
  camera.up.fromArray(view.up ?? [0, 1, 0]);camera.position.fromArray(view.position);camera.lookAt(new THREE.Vector3(...view.target));camera.updateProjectionMatrix();
};
const state = { phase: 'parked', altitude: 0, occupied: withAvatars, boarding: false, tuck: 0, turn: 0, speed: 0 };
/** Pose the craft: mechanisms settle at the state's targets (or `mechanisms` overrides). */
function pose(next = {}, mechanisms = null) {
  Object.assign(state, next);craft.setFlightState(state);craft.settle();
  if (mechanisms) { craft.rig.settle({ ...craft.rig.value, ...mechanisms });craft.animate(0); }
  craft.object.position.set(0, state.altitude ?? 0, 0);craft.object.rotation.set(state.pitch ?? 0, 0, state.roll ?? 0, 'YXZ');
  ground.visible = withGround && ((state.altitude ?? 0) < .1 || Boolean(next.shadow));seatAvatars();return craft.rig.value;
}
function render(view, { lod = 'near' } = {}) {
  setCamera(view);craft.setLod(lod);renderer.render(scene, camera);
  return { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 };
}
// Occupant fit, from each avatar's rendered skinned vertices in the craft
// frame: canopy headroom over the head and shoulders, the lowest point
// against the floor and belly, and shared 5 cm voxels between the occupants.
function fit() {
  if (!withAvatars) return null;
  renderer.render(scene, camera);craft.object.updateMatrixWorld(true);
  const result = {}, cells = {}, inverse = craft.object.matrixWorld.clone().invert(), point = new THREE.Vector3();
  const shown = object => { for (let o = object; o; o = o.parent) if (!o.visible) return false;return true; };
  for (const [name, avatar, seat] of [['pilot', pilot, SEATS.pilot], ['passenger', passenger, SEATS.passenger]]) {
    const box = new THREE.Box3();let headroom = Infinity, lowest = Infinity, belly = Infinity;cells[name] = new Set();
    avatar.object.traverse(mesh => {
      if (!mesh.isMesh || !shown(mesh)) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, point);else point.fromBufferAttribute(p, i);
        point.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);box.expandByPoint(point);
        const canopy = canopyHeightAt(point.x, point.z);if (canopy !== null && point.y > seat.root[1] + .55) headroom = Math.min(headroom, canopy - point.y);
        lowest = Math.min(lowest, point.y);belly = Math.min(belly, point.y - bodyAt(point.x).bottom);
        cells[name].add(`${Math.floor(point.x / .05)},${Math.floor(point.y / .05)},${Math.floor(point.z / .05)}`);
      }
    });
    result[name] = { min: box.min.toArray().map(v => +v.toFixed(3)), max: box.max.toArray().map(v => +v.toFixed(3)), headroom: +headroom.toFixed(3), lowest: +lowest.toFixed(3), aboveBelly: +belly.toFixed(3), floor: seat.floor };
  }
  result.sharedVoxels = [...cells.pilot].filter(cell => cells.passenger.has(cell)).length;
  return result;
}
pose({});
window.ribbonwingFixture = { THREE, renderer, scene, craft, pose, render, fit, get camera() { return camera; }, get state() { return { ...state }; }, stats: () => craft.stats(), withAvatars };
document.body.dataset.ready = 'true';
