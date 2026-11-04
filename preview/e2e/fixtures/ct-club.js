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
// The interior now carries its own ten named ambient lights (userData.lights),
// so the harness keeps only a faint wash plus a few real pools near the hot spots
// (the live world draws the same from its shared light pool).
const ambient = new THREE.AmbientLight('#8a7fb8', 0.15);
const key = new THREE.DirectionalLight('#ffd9b8', 0.3); key.position.set(-6, 8, 2);
const pools = room.lights.slice(0, 8).map(light => {
  const point = new THREE.PointLight('#ffb26b', 0.55, 15, 1.7);
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
// ---- the I info overlay --------------------------------------------------------
// Press `i` for a readable inventory of everything this room is supposed to
// show: shell, furnishings, fixtures, the ten named ambient lights, and room
// facts. Counts for instanced assets are read from the actual built meshes.
{
  const counts = new Map();
  club.traverse(node => { if (node.isInstancedMesh) counts.set(node.material.name, (counts.get(node.material.name) ?? 0) + node.count); });
  const count = name => counts.get(name) ?? 0;
  const INFO = [
    { zone: 'Shell · the room', items: [
      ['floor slab (16 × 40 m)', 1], ['ceiling slab (6.0 m clearance)', 1], ['back wall', 1],
      ['side walls', 2], ['front wall with 2.3 m door gap', 1], ['door lintel', 1], ['brass door jambs', 2],
      ['entry mat with edge-glow border', 1], ['concrete columns', 8], ['steel truss rails', 4],
    ] },
    { zone: 'Edge-glow bar (left, d 4–24)', items: [
      ['timber counter with serving overhang', 1], ['edge glow along serving edge', 1], ['under-lip glow', 1],
      ['back bar case', 1], ['back-glow trough', 1], ['base kick glow', 1], ['glass shelves', 3],
      ['bottles (instanced)', count('club-bottle-glass')], ['copper chai urn (amber glow)', 1],
      ['stools (leather + brass rings)', 7],
    ] },
    { zone: 'Lounge (right, d 8–26)', items: [
      ['edge-glow couches', 2], ['armchairs', 2], ['glow coffee tables', 2],
    ] },
    { zone: 'Dancefloor (13 × 17 m, d 16–33)', items: [
      ['1 m LED tiles', 221], ['unlit edge rings (instanced strips)', count('club-tile-edge')], ['glass apron', 1],
    ] },
    { zone: 'Stage & speaker wall (d 33–39.4)', items: [
      ['DJ booth + glowing desk edge', 1], ['mixer deck + channel LEDs', 3],
      ['subwoofer bank behind the DJ', 1], ['subwoofer driver cones', 10],
      ['corner speaker stacks', 2], ['stack driver cones', 12], ['bass port rings', 3],
      ['pendant spot bar over the DJ', 3],
    ] },
    { zone: 'Disco ball & lasers (d 24)', items: [
      ['mount pipe + mirror ring', 1], ['mirrored ball (r 0.55 m)', 1], ['light haze beam', 1],
      ['RGB lasers (burst 2 s / 9 s)', 3],
    ] },
    { zone: 'Corner fixtures', items: [
      ['entry mat', 1], ['strobes (rare, <1% duty)', 4], ['RGB corner spots', 4],
    ] },
  ];
  window.clubFixture.info = () => {
    const sections = INFO.map(({ zone, items }) => {
      const rows = items.map(([label, n]) => `<li><b>${label}</b>${n != null && n !== 1 ? ` ×${n}` : ''}</li>`).join('');
      return `<h2>${zone}</h2><ul>${rows}</ul>`;
    }).join('');
    const lights = club.userData.lights.list.map(light =>
      `<li><b>${light.name}</b> · ${light.userData.zone} · #${light.color.getHexString()} · ${light.intensity.toFixed(2)}</li>`).join('');
    document.querySelector('#info').innerHTML =
      `<h1>CT CLUB — everything visible in this room</h1>${sections}` +
      `<h2>Outline key (near-black fixtures get a visible frame)</h2><ul>` +
      `<li><b>1px yellow</b> — bar, entry mat, dancefloor tile grid</li>` +
      `<li><b>bright green</b> — DJ booth, mixer, speaker wall</li>` +
      `<li><b>purple</b> — lounge couches, chairs, tables + violet spill glow</li></ul>` +
      `<h2>Shell walls (each brightened/tinted)</h2><ul>` +
      `<li><b>back</b> warm amber · <b>left</b> violet-blue · <b>right</b> green-teal · <b>front</b> amber · <b>ceiling</b> bright neutral</li></ul>` +
      `<h2>Named ambient lights (automation-ready)</h2><ul>${lights}</ul>` +
      `<h2>Room facts</h2><ul><li><b>Size</b> 40 m × 16 m × 6 m</li>` +
      `<li><b>Position</b> pending — planCtClub({ east, north, yaw })</li>` +
      `<li><b>People</b> none — no staff/guests alter resident counts</li></ul>`;
    return document.querySelector('#info').innerHTML;
  };
}
const toggleInfo = () => {
  const box = document.querySelector('#info');
  const showing = box.style.display === 'block';
  if (!showing) window.clubFixture.info();
  box.style.display = showing ? 'none' : 'block';
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
  else if (event.key === 'i' || event.key === 'I') { toggleInfo(); }
});