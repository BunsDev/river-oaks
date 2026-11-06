// Coworking studio (fixture): the #218 plan with a stand-in companion, rendered
// as the finished office (default, `?finish=classic`), the same office under the
// Pink Jet-Age kit finish (`?finish=pink-jet-age`, #738/#744) or the graybox
// (`?finish=graybox`). It is a
// labeled fixture site, never placed in the district. The companion's
// pose comes only from companionPresentation(presence, task): idle life never
// reads as work. window.workplaceFixture.show(state, camera) renders a state;
// frames(n) samples frame time; dispose() checks the room releases cleanly.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { planWorkplaceRoom, buildWorkplaceGraybox, findRoute, AVATAR_ENVELOPE } from '../../src/workplace-room.js';
import { buildWorkplaceOffice, OFFICE_VIEWS } from '../../src/workplace-office.js';
import { companionPresentation } from '../../src/workplace-contract.js';
import { workplaceKitFinish, workplaceKitFinishName } from '../../src/workplace-kit-finish.js';

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth, innerHeight);renderer.shadowMap.enabled = true;renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();scene.background = new THREE.Color('#e9e4de');
const pmrem = new THREE.PMREMGenerator(renderer), environment = new RoomEnvironment();
scene.environment = pmrem.fromScene(environment).texture;scene.environmentIntensity = 0.35;environment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#fff6ee', '#6b6158', 0.6));
const sun = new THREE.DirectionalLight('#fff1e4', 1.8);sun.position.set(3, 6, 2);sun.castShadow = true;sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -6, right: 6, top: 6, bottom: -6});scene.add(sun);
const outside = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({color: '#77706a', roughness: 0.95}));
outside.rotation.x = -Math.PI / 2;outside.position.y = -0.06;outside.receiveShadow = true;scene.add(outside);
const room = planWorkplaceRoom();
// The graybox is the measured blockout; any other value is a kit finish name, and an
// unknown one is classic (workplace-kit-finish.js), as readFinishPreference treats the town.
const requested = new URLSearchParams(location.search).get('finish');
const finish = requested === 'graybox' ? 'graybox' : workplaceKitFinishName(requested);
const finishLabel = finish === 'graybox' ? 'Graybox' : workplaceKitFinish(finish).label;
const build = finish === 'graybox' ? buildWorkplaceGraybox : (THREE, room) => buildWorkplaceOffice(THREE, room, { finish });
let graybox = build(THREE, room);scene.add(graybox.object);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 80);
const world = ([x, d], y = 0) => new THREE.Vector3(x, y, -d);

// A stand-in body sized to the measured envelope, not a rig.
function standIn(color) {
  const group = new THREE.Group(), material = new THREE.MeshStandardMaterial({color, roughness: 0.6});
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 6, 12), material);body.position.y = 0.75;body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), material);head.position.y = 1.5;head.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(AVATAR_ENVELOPE.bodyHalfWidth - 0.02, AVATAR_ENVELOPE.bodyHalfWidth, 40), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
  ring.rotation.x = -Math.PI / 2;ring.position.y = 0.01;
  group.add(body, head, ring);group.userData = {body, head};return group;
}
const companion = standIn('#f486a1'), player = standIn('#6f8fb8');scene.add(companion, player);
const label = document.querySelector('#label');
const station = room.stations[0];
const path = findRoute(room, room.outside, station.approach);

function pose(figure, at, {seated = false, facing = 0, working = false, time = 0} = {}) {
  figure.visible = true;figure.position.copy(world(at));figure.rotation.y = facing;
  const {body, head} = figure.userData;
  // Seated: the torso rests on the 0.45 m seat instead of sinking through it.
  body.position.y = seated ? 0.84 : 0.75;body.scale.y = seated ? 0.55 : 1;
  head.position.y = seated ? 1.32 : 1.5;
  // Only a recorded running task may lean in to "type"; idle stays still.
  head.position.z = working ? -0.08 - 0.02 * Math.sin(time * 6) : 0;
}
const states = {
  arriving: () => ({presence: {mode: 'accompanying', stationId: null}, task: null, at: room.entrance}),
  walking: progress => ({presence: {mode: 'accompanying', stationId: null}, task: {status: 'queued'}, at: path[Math.min(path.length - 1, Math.floor(progress * (path.length - 1)))]}),
  'seated-working': () => ({presence: {mode: 'stationed', stationId: station.id}, task: {status: 'running'}, at: station.seat}),
  'seated-waiting': () => ({presence: {mode: 'stationed', stationId: station.id}, task: {status: 'completed'}, at: station.seat}),
  'seated-stopped': () => ({presence: {mode: 'stationed', stationId: station.id}, task: {status: 'running'}, health: 'stale', at: station.seat}),
  offstage: () => ({presence: {mode: 'offstage', stationId: null}, task: {status: 'running'}, at: null}),
};
let current = {state: 'arriving', camera: 'CAM-01', presentation: null};
function show(state = 'arriving', cameraName = 'CAM-01', {progress = 1, time = 0} = {}) {
  const spec = states[state](progress), presentation = companionPresentation(spec.presence, spec.task, spec.health ?? 'ok');
  if (presentation.pose === 'offstage') companion.visible = false;
  else pose(companion, spec.at, {seated: presentation.pose.startsWith('seated'), facing: presentation.pose.startsWith('seated') ? station.facing : 0, working: presentation.working, time});
  pose(player, state.startsWith('seated') ? room.review.socket : [room.entrance[0] + 0.8, room.entrance[1] + 0.4], {facing: state.startsWith('seated') ? Math.PI / 2 : 0});
  const view = room.cameras[cameraName] ?? OFFICE_VIEWS[cameraName];
  camera.position.set(...view.position.map((value, index) => index === 2 ? -value : value));camera.lookAt(view.target[0], view.target[1], -view.target[2]);
  camera.aspect = innerWidth / innerHeight;camera.updateProjectionMatrix();
  label.textContent = `${room.site.label} · ${finishLabel} · ${view.label} · ${presentation.label}`;
  graybox.update?.(time);
  renderer.render(scene, camera);
  current = {state, camera: cameraName, presentation};
  return {state, camera: cameraName, presentation, companionVisible: companion.visible, position: companion.visible ? spec.at : null};
}
window.workplaceFixture = {
  room, path, show, finish,
  frames(count = 120) {
    const samples = [];
    for (let i = 0; i < count; i++) { const start = performance.now();show(current.state, current.camera, {time: i / 60});renderer.getContext().finish();samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b);
    return {count, p50: samples[Math.floor(count * 0.5)], p95: samples[Math.floor(count * 0.95)], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles};
  },
  reenter(times = 10) {
    const before = renderer.info.memory.geometries;
    for (let i = 0; i < times; i++) { graybox.dispose();graybox = build(THREE, room);scene.add(graybox.object);show(current.state, current.camera); }
    return {before, after: renderer.info.memory.geometries};
  },
};
show();
document.body.dataset.ready = 'true';
