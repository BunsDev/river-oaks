// CT Club walk-around viewer (temporary scratch build, Val 2026-11-04).
// Runs the real club interior from the repo (preview/src) with first-person
// walk controls and collision against the same obstacles the server walker uses.
import * as THREE from 'three';
import { planCtClub } from '../../preview/src/ct-club-plan.js';
import { buildCtClubInterior } from '../../preview/src/ct-club-interior.js';
import { configureMaterials } from '../../preview/src/materials.js';
import { attachDesignPanel, mountDesignPanel } from './design-panel.js';

const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const room = planCtClub();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
configureMaterials(renderer);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05060a');
// The interior self-lights (ten ambient + thirteen spotlights); keep only a
// faint harness wash + key light, matching the design fixture.
const wash = new THREE.AmbientLight('#8a7fb8', 0.15);
const key = new THREE.DirectionalLight('#ffd9b8', 0.3); key.position.set(-6, 8, 2);
scene.add(wash, key);
const club = buildCtClubInterior(room, { local: true, reducedMotion });
scene.add(club);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';

// ---- first-person walking ------------------------------------------------------
const player = { x: 1.2, y: 1.6, z: -6, yaw: 0, pitch: 0 };   // (x=a, z=-d), near the bar
const WALK = 4.2, RADIUS = 0.42, EYE = 1.6;
const keys = new Set();
let looking = false;

const collides = (a, d, r = RADIUS) => {
  if (a < -8 + r || a > 8 - r || d < r || d > 40 - r) return true;   // buried shell walls
  for (const o of room.obstacles) {                                   // the plan's walk obstacles
    if (a + r > o.a0 && a - r < o.a1 && d + r > o.d0 && d - r < o.d1) return true;
  }
  return false;
};

const stepPlayer = () => {
  let fwd = 0, strafe = 0;
  if (keys.has('KeyW')) fwd += 1;
  if (keys.has('KeyS')) fwd -= 1;
  if (keys.has('KeyA')) strafe -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (!fwd && !strafe) return;
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const move = right.multiplyScalar(strafe).add(forward.multiplyScalar(fwd)).normalize();
  const dt = Math.min(clock.delta, 1 / 20);
  let a = player.x + move.x * WALK * dt;
  let d = -player.z - move.z * WALK * dt;
  if (!collides(a, -player.z)) player.x = a;                 // resolve axis-by-axis
  if (!collides(player.x, d)) player.z = -d;
};
const resetToEntry = () => {
  player.x = 1.2; player.z = -6; player.y = EYE; player.yaw = Math.PI; player.pitch = 0;
};

// Tour views (same frames as the design fixture); N snaps the camera there.
const VIEWS = {
  entry: { at: [0, 1.7, 3.2], look: [0, 1.7, -12] },
  bar: { at: [-4.5, 1.7, -9], look: [-6.2, 1.35, -15] },
  dancefloor: { at: [0, 1.7, -18], look: [0, 1.4, -28] },
  ball: { at: [0, 1.6, -26], look: [0, 4.4, -24] },
  lounge: { at: [2.6, 1.7, -13.5], look: [6.2, 1.2, -15] },
  dj: { at: [0, 1.7, -30], look: [0, 1.6, -34] },
};
const names = Object.keys(VIEWS);
let current = -1;
const show = name => {
  const view = VIEWS[name] ?? VIEWS[names[0]];
  player.x = view.at[0]; player.z = view.at[2]; player.y = view.at[1];
  const dir = new THREE.Vector3().subVectors(
    new THREE.Vector3(...view.look), new THREE.Vector3(...view.at)).normalize();
  player.yaw = Math.atan2(-dir.x, -dir.z);
  player.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  current = names.indexOf(name);
  label();
};
const nextView = () => show(names[(current + 1) % names.length]);
const label = () => {
  const name = current >= 0 ? names[current] : 'walking';
  document.querySelector('#hud').innerHTML =
    `CT CLUB — <b>WASD</b> walk · <b>click</b> to look · <b>N</b> next tour view · <b>i</b> info · <b>Space</b> entry · view <b>${name}</b>`;
};
const syncCamera = () => {
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
};

// ---- the design panel (press i): live colours, 8-colour cycling, save --------
{
  const design = attachDesignPanel({ root: club });
  mountDesignPanel(document.querySelector('#info'), design);
  let panelOpen = false;
  const toggleInfo = () => {
    panelOpen = !panelOpen;
    document.querySelector('#info').style.display = panelOpen ? 'block' : 'none';
  };
  window.clubFixture = { toggleInfo, room, club, player, show, nextView, designApi: design };
}


// ---- input ----------------------------------------------------------------------
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); resetToEntry(); return; }
  keys.add(e.code);
  if (e.code === 'KeyN') { nextView(); }
  if (e.code === 'KeyI') { window.clubFixture.toggleInfo(); }
});
addEventListener('keyup', e => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => {
  if (!looking) renderer.domElement.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  looking = document.pointerLockElement === renderer.domElement;
  document.body.style.cursor = looking ? 'none' : 'crosshair';
});
document.addEventListener('mousemove', e => {
  if (!looking) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0022));
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- render loop -----------------------------------------------------------------
const clock = { last: performance.now(), delta: 0, t: 0, running: true };
let sampleEvery = 0;
const loop = now => {
  requestAnimationFrame(loop);
  clock.delta = (now - clock.last) / 1000; clock.last = now;
  if (clock.running) {
    clock.t += Math.min(1 / 20, clock.delta);
    if (!reducedMotion) club.userData.tick(clock.t);
  }
  stepPlayer();
  syncCamera();
  renderer.render(scene, camera);
  if (sampleEvery++ % 60 === 0) {
    const stats = renderer.info;
    if (stats.render.triangles > 0) window.dispatchEvent(new CustomEvent('club-stats', { detail: { calls: stats.render.calls, triangles: stats.render.triangles } }));
  }
};
window.clubFixture.sample = () => {
  const cpu = [];
  for (let s = 0; s < 90; s++) {
    const start = performance.now();
    if (!reducedMotion) club.userData.tick(clock.t + s / 60);
    syncCamera();
    renderer.render(scene, camera);
    cpu.push(performance.now() - start);
  }
  cpu.sort((a, b) => a - b);
  return { frames: cpu.length, cpu_median_ms: cpu[45], cpu_p95_ms: cpu[85], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
};
window.clubFixture.animate = on => { clock.running = Boolean(on); };

resetToEntry();
label();
requestAnimationFrame(loop);

