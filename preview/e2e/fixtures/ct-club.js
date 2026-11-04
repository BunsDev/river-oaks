import * as THREE from 'three';
import { planCtClub } from '../../src/ct-club-plan.js';
import { buildCtClubInterior } from '../../src/ct-club-interior.js';
import { configureMaterials } from '../../src/materials.js';

// Isolated preview of the underground techno club at its pending position (0,0,0).
// This is a design harness only; it does not simulate the town or the shared pool.
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const room = planCtClub();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(1600, 1000);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
configureMaterials(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05060a');
const camera = new THREE.PerspectiveCamera(62, 1.6, 0.05, 200);
// The dark room needs a low wash plus a few real pools near the hot spots (the
// live world draws the same from its shared light pool).
const ambient = new THREE.AmbientLight('#8a7fb8', 0.55);
const key = new THREE.DirectionalLight('#ffd9b8', 0.5); key.position.set(-6, 8, 2);
const pools = room.lights.slice(0, 8).map(light => {
  const point = new THREE.PointLight('#ffb26b', 0, 15, 1.7);
  point.position.set(light.a, room.floor + light.y, -light.d);
  scene.add(point);
  return point;
});
scene.add(ambient, key);
const club = buildCtClubInterior(room, { local: true, reducedMotion });
scene.add(club);

// Local frame: (a, y, -d). Views step down the 40 m axis.
const VIEWS = {
  entry: { at: [0, 1.7, 3.2], look: [0, 1.7, -12] },
  bar: { at: [-4.5, 1.7, -9], look: [-6.2, 1.35, -15] },
  dancefloor: { at: [0, 1.7, -18], look: [0, 1.4, -28] },
  ball: { at: [0, 1.6, -26], look: [0, 4.4, -24] },
  lounge: { at: [2.6, 1.7, -13.5], look: [6.2, 1.2, -15] },
  dj: { at: [0, 1.7, -30], look: [0, 1.6, -34] },
};
const names = Object.keys(VIEWS);
let current = 0;
const frame = view => {
  const [x, y, z] = VIEWS[view].at, [lx, ly, lz] = VIEWS[view].look;
  camera.position.set(x, y, z); camera.lookAt(lx, ly, lz);
};
const label = () => {
  const name = names[current], burst = reducedMotion ? 'reduced motion: static' : 'animated';
  document.querySelector('#label').textContent = `CT CLUB · ${name.toUpperCase()} · ${burst}`;
};
const show = view => {
  const index = names.indexOf(view);
  if (index >= 0) current = index;
  frame(names[current]); label();
};
frame(names[current]); label();

// A bounded rAF loop: a handful of material updates per frame, then one render.
let clock = 0, last = performance.now(), running = true, sampleEvery = 0;
window.clubFixture = {
  room, club,
  names,
  show,
  next() { current = (current + 1) % names.length; this.show(names[current]); },
  clock() { return clock; },
  animate(on) { running = Boolean(on); },
  sample() {
    const samples = [], cpu = [];
    for (let s = 0; s < 90; s++) {
      const start = performance.now();
      if (!reducedMotion) club.userData.tick(clock + s * 1 / 60);
      renderer.render(scene, camera);
      cpu.push(performance.now() - start);
    }
    cpu.sort((a, b) => a - b);
    return { frames: cpu.length, cpu_median_ms: cpu[45], cpu_p95_ms: cpu[85], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  },
  dispose() {
    running = false;
    club.userData.dispose();
    pools.forEach(point => point.dispose());
    ambient.dispose(); key.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  },
};
function loop(now) {
  if (running) {
    clock += Math.min(1 / 20, (now - last) / 1000); last = now;
    if (!reducedMotion) club.userData.tick(clock);
    renderer.render(scene, camera);
    if (sampleEvery++ % 60 === 0) {
      const stats = renderer.info, heaviest = stats.render.triangles;
      if (heaviest > 0) window.dispatchEvent(new CustomEvent('club-stats', { detail: { calls: stats.render.calls, triangles: heaviest } }));
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'j' || event.key === 'J') { window.clubFixture.next(); }
  else if (event.key === 'ArrowLeft' || event.key === 'k' || event.key === 'K') {
    current = (current - 1 + names.length) % names.length; window.clubFixture.show(names[current]);
  } else if (event.key === 'n' || event.key === 'N') { window.clubFixture.next(); }
});