// CT Club walk-around viewer (temporary scratch build, Val 2026-11-04).
// Runs the real club interior from the repo (preview/src) with first-person
// walk controls and collision against the same obstacles the server walker uses.
import * as THREE from 'three';
import { planCtClub, refreshObstacles, addScreen, addProp } from '../../preview/src/ct-club-plan.js';
import { buildCtClubInterior } from '../../preview/src/ct-club-interior.js';
import { configureMaterials } from '../../preview/src/materials.js';
import { attachDesignPanel, mountDesignPanel } from './design-panel.js';
import { attachPlanPlanner } from './plan-editor.js';
import { attachWorldPlanner } from './world-plan.js';
import { surfaceReference } from './coordinates.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const room = planCtClub();

// ---- layout versions ----------------------------------------------------------
// Positions are saved as versions: a live copy in localStorage (survives reload)
// and a numbered club_layout_01.json / 02 / … on every layout change. Loads them
// back on start so you never lose a layout.
const LAYOUT_LS = 'ct-club-layout.v1';
const LAYOUT_NEXT = 'ct-club-layout.next';
const layoutNext = () => {
  const n = parseInt(localStorage.getItem(LAYOUT_NEXT) ?? '1', 10);
  return { n, name: `club_layout_${String(n).padStart(2, '0')}.json` };
};
const layoutSnapshot = () => ({
  schemaVersion: 1, room: 'ct-club', savedAt: new Date().toISOString(),
  fixtures: room.fixtures.map((fix, i) => ({
    kind: fix.kind, index: room.fixtures.slice(0, i).filter(f => f.kind === fix.kind).length, a: fix.a, d: fix.d,
  })),
  screens: room.screens.map(s => ({ ...s })),
  props: room.props.map(p => ({ ...p })),
});
const saveLayout = ({ exportFile = false } = {}) => {
  const payload = layoutSnapshot();
  try { localStorage.setItem(LAYOUT_LS, JSON.stringify(payload)); } catch { }
  if (exportFile) {
    const { n, name } = layoutNext();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    localStorage.setItem(LAYOUT_NEXT, String(n + 1));
    const el = document.getElementById('layout-next'); if (el) el.textContent = layoutNext().name;
    return name;
  }
  return payload;
};
try {
  const saved = JSON.parse(localStorage.getItem(LAYOUT_LS) ?? 'null');
  if (saved?.fixtures) {
    for (const f of saved.fixtures) {
      const matches = room.fixtures.filter(x => x.kind === f.kind);
      const fix = matches[Math.max(0, Math.min(f.index ?? 0, matches.length - 1))];
      if (fix) { fix.a = f.a; fix.d = f.d; }
    }
    refreshObstacles(room);
  }
  if (Array.isArray(saved?.screens)) room.screens = saved.screens.map(s => ({ ...s }));
  if (Array.isArray(saved?.props)) room.props = saved.props.map(p => ({ ...p }));
} catch { }
if (room.screens.length === 0) {
  const s = addScreen(room, { x: 0, y: 3.0, z: -(40 - 0.22), nx: 0, ny: 0, nz: 1, w: 3.2, h: 1.8, html: '<div class="ct-screen"><b>CT CLUB</b><div class="pulse">● LIVE</div></div>', surface: 'wall back' });
  s.u = 0.5; s.v = 0.5;
}


const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
configureMaterials(renderer);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05060a');

// Live HTML/CSS/JS screens on the walls (CSS3D overlay above the WebGL canvas).
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
cssRenderer.domElement.style.position = 'fixed';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.left = '0';
cssRenderer.domElement.style.pointerEvents = 'none';
cssRenderer.domElement.style.zIndex = '1';
document.body.append(cssRenderer.domElement);
const cssScene = new THREE.Scene();
const PPM = 100;   // pixels-per-metre for screen content, scaled back to metres
function refreshScreens() {
  cssScene.children.slice().forEach(o => cssScene.remove(o));
  for (const s of club.userData.screens) {
    const el = document.createElement('div');
    el.className = 'ct-screen';
    el.style.width = `${s.size.x * PPM}px`;
    el.style.height = `${s.size.y * PPM}px`;
    el.innerHTML = s.screen.html;
    const obj = new CSS3DObject(el);
    obj.position.copy(s.position);
    obj.rotation.y = s.rotY;
    obj.scale.set(1 / PPM, 1 / PPM, 1 / PPM);
    cssScene.add(obj);
  }
}
// The interior self-lights (ten ambient + thirteen spotlights); keep only a
// faint harness wash + key light, matching the design fixture.
const wash = new THREE.AmbientLight('#8a7fb8', 0.15);
const key = new THREE.DirectionalLight('#ffd9b8', 0.3); key.position.set(-6, 8, 2);
scene.add(wash, key);
let club = buildCtClubInterior(room, { local: true, reducedMotion });
let design = null;                       // design-panel state (re-attached on rebuild)
scene.add(club);
refreshScreens();                        // place any wall screens as live CSS3D content

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
  player.x = 1.2; player.z = -6; player.y = EYE; player.yaw = 0; player.pitch = 0;   // face the back wall (default screen)
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
  design = attachDesignPanel({ root: club });
  mountDesignPanel(document.querySelector('#info'), design);
  let panelOpen = false;
  const toggleInfo = () => {
    panelOpen = !panelOpen;
    document.querySelector('#info').style.display = panelOpen ? 'block' : 'none';
  };
  window.clubFixture = { toggleInfo, room, club, player, show, nextView, designApi: design };
}

// ---- the floorplanner (press P / the 📐 button): drag assets, room follows ------
function rebuildRoom() {
  if (design) design.saveNow();                 // persist colours/cycles/intensity
  saveLayout({ exportFile: true });             // save a NEW layout version (club_layout_NN.json)
  club.userData.dispose();
  scene.remove(club);
  club = buildCtClubInterior(room, { local: true, reducedMotion });
  scene.add(club);
  design = attachDesignPanel({ root: club });   // re-attaches and restores the design
  mountDesignPanel(document.querySelector('#info'), design);
  window.clubFixture.club = club;
  window.clubFixture.designApi = design;
  refreshScreens();                     // re-place wall screens after a layout change
}
const planner = attachPlanPlanner({ room, onApply: rebuildRoom });
window.clubFixture.planner = planner;
window.clubFixture.saveLayout = saveLayout;
const world = attachWorldPlanner({ room, onApply: rebuildRoom });
window.clubFixture.world = world;
document.getElementById('plan-btn')?.addEventListener('click', () => planner.toggle());
document.getElementById('layout-save')?.addEventListener('click', () => saveLayout({ exportFile: true }));
document.getElementById('world-btn')?.addEventListener('click', () => world.toggle());

// Exact surface coordinates (press C / the 📊 button): world xyz, size and facing
// normal for every wall, column, the bar, DJ, speakers, lounge, ball, fixtures
// and screens, so you can build on any surface precisely.
const coordsBox = document.getElementById('coords');
const toggleCoords = () => {
  const show = coordsBox.style.display !== 'block';
  coordsBox.style.display = show ? 'block' : 'none';
  if (show) {
    coordsBox.innerHTML = '<h1>CT CLUB — exact surface coordinates (x, y, z)</h1>' +
      surfaceReference(room).map(s =>
        `<div class="coord-row"><b>${s.name}</b><span>c ${s.center.map(n => n.toFixed(2)).join(', ')}</span>` +
        `<span>size ${s.size.map(n => n.toFixed(2)).join('×')}</span><span>normal ${s.normal.map(n => n.toFixed(2)).join(', ')}</span>` +
        `${s.top ? `<span>top ${s.top.map(n => n.toFixed(2)).join(', ')}</span>` : ''}</div>`).join('') +
      `<div class="prop-form"><b>Place a prop at exact xyz:</b>
        <input id="prop-x" placeholder="x" value="0"><input id="prop-y" placeholder="y" value="1.25"><input id="prop-z" placeholder="z" value="-33.4">
        <input id="prop-w" placeholder="w" value="0.5"><input id="prop-h" placeholder="h" value="0.4"><input id="prop-d" placeholder="d" value="0.5">
        <input id="prop-color" type="color" value="#41e0ff"><button id="prop-add">place</button></div>`;
    document.getElementById('prop-add')?.addEventListener('click', () => {
      const g = id => Number(document.getElementById(id)?.value) || 0;
      addProp(room, {
        x: g('prop-x'), y: g('prop-y'), z: g('prop-z'),
        w: g('prop-w') || 0.5, h: g('prop-h') || 0.4, d: g('prop-d') || 0.5,
        color: document.getElementById('prop-color')?.value,
      });
      rebuildRoom();
    });
  }
};
window.clubFixture.toggleCoords = toggleCoords;
document.getElementById('coords-btn')?.addEventListener('click', toggleCoords);


// ---- input ----------------------------------------------------------------------
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); resetToEntry(); return; }
  keys.add(e.code);
  if (e.code === 'KeyN') { nextView(); }
  if (e.code === 'KeyI') { window.clubFixture.toggleInfo(); }
  if (e.code === 'KeyP') { planner.toggle(); }
  if (e.code === 'KeyF') { world.toggle(); }
  if (e.code === 'KeyC') { window.clubFixture.toggleCoords(); }
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
const _camDir = new THREE.Vector3(), _camTo = new THREE.Vector3();
let sampleEvery = 0;
const loop = now => {
  requestAnimationFrame(loop);
  clock.delta = (now - clock.last) / 1000; clock.last = now;
  if (clock.running) {
    clock.t += Math.min(1 / 20, clock.delta);
    if (!reducedMotion) club.userData.tick(clock.t);
  }
  if (design) design.cycle(now / 1000);   // colour cycles (owned by the host, not the panel)
  stepPlayer();
  syncCamera();
  // Hide any screen that is behind the camera, so CSS3D never draws a flipped one.
  camera.getWorldDirection(_camDir);
  for (const obj of cssScene.children) {
    const v = _camTo.set(obj.position.x - camera.position.x, obj.position.y - camera.position.y, obj.position.z - camera.position.z);
    obj.element.style.display = v.dot(_camDir) > 0.4 ? '' : 'none';
  }
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);   // live wall-screen HTML/CSS/JS
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

