// ?look=<shared appearance id> renders a playable look on its rig, with
// window.lookFixture.render(view) for 'front', 'back', 'profile' and 'portrait'.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadResidentAvatar } from '../../src/avatars.js';
import { sharedAppearance } from '../../src/shared-appearances.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#c8c1bc');
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room).texture; scene.environmentIntensity = 0.4; room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f4f3ff', '#aea092', 0.5));
const sun = new THREE.DirectionalLight('#fff1e4', 2.4); sun.position.set(2, 4, 5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.015; Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2.6, bottom: -.2 }); scene.add(sun);
const fill = new THREE.DirectionalLight('#dbe9ff', 1.2); fill.position.set(-3, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#c8c1bc', roughness: .85 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .01, 100);
const look = sharedAppearance(new URLSearchParams(location.search).get('look') ?? 'jevica');
const avatar = await loadResidentAvatar(0, 'player', look.rig ?? look.id, { folk: false, appearanceId: look.id });
scene.add(avatar.object);
window.lookFixture = {
  look: look.id, avatar,
  render(view = 'front') {
    avatar.object.rotation.y = view === 'back' ? Math.PI : view === 'profile' ? -Math.PI / 2 : 0;
    avatar.update(0, 'continue', false, { speed: 0, distance: 0 }, () => 0);
    if (view === 'portrait') { camera.position.set(0, 1.62, 1.25); camera.lookAt(0, 1.5, 0); }
    else { camera.position.set(0, 1.05, 4.6); camera.lookAt(0, .95, 0); }
    renderer.render(scene, camera);
    return { bounds: new THREE.Box3().setFromObject(avatar.object).getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(2)) };
  },
};
document.body.dataset.ready = 'true';
