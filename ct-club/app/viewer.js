// CT Club walk-around viewer (temporary scratch build, Val 2026-11-04).
// Runs the real club interior from the repo (ct-club/src) with first-person
// walk controls and collision against the same obstacles the server walker uses.
import * as THREE from 'three';
import { planCtClub, refreshObstacles, addScreen, addProp } from '../src/ct-club-plan.js';
import { buildCtClubInterior } from '../src/ct-club-interior.js';
import { configureMaterials } from '../../preview/src/materials.js';
import { attachDesignPanel, mountDesignPanel } from './design-panel.js';
import { attachPlanPlanner } from './plan-editor.js';
import { attachWorldPlanner } from './world-plan.js';
import { surfaceReference } from './coordinates.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { createAudioEngine } from './audio-engine.js';
import { createAudioAnalyzer } from './audio-analyzer.js';
import { addDancers } from './dancers.js';

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
    let el;
    if (s.screen.viz) {
      // A live visualisation screen: a <canvas> we draw onto each frame from the audio.
      el = document.createElement('canvas');
      el.className = 'ct-screen';
      el.width = Math.max(2, Math.round(s.size.x * PPM));
      el.height = Math.max(2, Math.round(s.size.y * PPM));
    } else {
      el = document.createElement('div');
      el.className = 'ct-screen';
      el.style.width = `${s.size.x * PPM}px`;
      el.style.height = `${s.size.y * PPM}px`;
      el.innerHTML = s.screen.html;
    }
    const obj = new CSS3DObject(el);
    obj.position.copy(s.position);
    obj.rotation.set(s.rotX ?? 0, s.rotY ?? 0, 0);
    obj.scale.set(1 / PPM, 1 / PPM, 1 / PPM);
    if (s.screen.viz) { obj.userData.viz = s.screen.viz; obj.userData.vizStyle = s.screen.vizStyle; obj.userData.vizCtx = el.getContext('2d'); }
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

// ---- dancers on the dancefloor --------------------------------------------------
let dancers = null;                      // { dancers, tick, toggle } from addDancers
addDancers(scene, { count: 8 }).then(d => { dancers = d; window.clubFixture.dancers = d; }).catch(() => { });

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

// ---- overlay panel helpers ---------------------------------------------------
// The tool panels are fixed overlays; only one should be open at a time so they
// never overlap each other (design/info vs coords on the right, planner/world/audio
// in the centre). Opening any one closes the rest.
const PANEL_IDS = ['info', 'coords', 'planner', 'world', 'audio'];
const closePanels = () => { for (const id of PANEL_IDS) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } };

// ---- the design panel (press i): live colours, 8-colour cycling, save --------
{
  design = attachDesignPanel({ root: club });
  mountDesignPanel(document.querySelector('#info'), design);
  let panelOpen = false;
  const toggleInfo = () => {
    panelOpen = !panelOpen;
    if (panelOpen) closePanels();
    document.querySelector('#info').style.display = panelOpen ? 'block' : 'none';
  };
  window.clubFixture = { toggleInfo, room, club, player, show, nextView, designApi: design, closePanels };
}

// ---- audio: upload, playlist, continuous playback, reactive colour -------------
const audio = createAudioEngine();
window.clubFixture.audio = audio;

// ---- audio frequency analyser: 32 bands, 20 Hz – 15 kHz -----------------------
const analyzer = audio ? createAudioAnalyzer({ analyser: audio.analyser }) : null;
window.clubFixture.analyzer = analyzer;

// Small helper: make a fixed overlay panel draggable from its .drag-handle so it can
// be moved out of the way while placing a screen / dragging a fixture.
const makeDraggable = (el, handle) => {
  if (!el || !handle) return;
  handle.style.cursor = 'move';
  handle.addEventListener('pointerdown', e => {
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    const move = ev => {
      el.style.left = (ev.clientX - ox) + 'px';
      el.style.top = (ev.clientY - oy) + 'px';
      el.style.transform = 'none';
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    e.preventDefault();
  });
};
for (const h of document.querySelectorAll('.drag-handle')) {
  const panel = document.getElementById(h.dataset.panel);
  makeDraggable(panel, h);
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
document.getElementById('dancers-btn')?.addEventListener('click', () => { if (dancers) dancers.toggle(); });

// Exact surface coordinates (press C / the 📊 button): world xyz, size and facing
// normal for every wall, column, the bar, DJ, speakers, lounge, ball, fixtures
// and screens, so you can build on any surface precisely.
const coordsBox = document.getElementById('coords');
const toggleCoords = () => {
  const show = coordsBox.style.display !== 'block';
  if (show) closePanels();
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

// ---- audio panel ---------------------------------------------------------------
const audioBox = document.getElementById('audio');
const g = id => document.getElementById(id);
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const readReactive = () => ({
  on: g('audio-react-on')?.checked ?? false,
  band: g('audio-band')?.value ?? 'all',
  delay: Number(g('audio-delay')?.value) || 0,
  onset: Number(g('audio-onset')?.value) || 0.15,
  fade: Number(g('audio-fade')?.value) || 0.3,
  ignore: Number(g('audio-ignore')?.value) || 0.05,
  random: g('audio-random')?.checked ?? false,
  locked: g('audio-lock')?.checked ?? false,
  mode: g('visual-mode')?.value ?? 'palette',
  auto: g('visual-auto')?.checked ?? false,
  autoSeconds: Number(g('visual-auto-secs')?.value) || 8,
  exclude: [...(g('visual-exclude')?.querySelectorAll('input:checked') ?? [])].map(cb => cb.dataset.mode),
});
const renderPlaylist = () => {
  const st = audio ? audio.state() : { tracks: [], index: -1, current: null, time: 0, duration: 0 };
  const el = g('audio-playlist'); if (!el) return;
  el.innerHTML = st.tracks.length ? st.tracks.map((name, i) =>
    `<div class="audio-item${i === st.index ? ' current' : ''}" data-i="${i}"><button data-play="${i}">▶</button><span>${name}</span></div>`).join('')
    : '<span class="audio-empty">no tracks yet — upload some</span>';
  el.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => audio?.playIndex(Number(b.dataset.play))));
  const track = g('audio-track'); if (track) { const nameEl = track.querySelector('span'); if (nameEl) nameEl.textContent = st.current ? `${st.current}${st.playing ? ' · playing' : ''}` : 'no track'; }
  const playBtn = g('audio-play'); if (playBtn) playBtn.textContent = st.playing ? '⏸' : '▶';
  const seek = g('audio-seek'); if (seek && st.duration) seek.value = (st.time / st.duration).toFixed(4);
  const tm = g('audio-time'); if (tm) tm.textContent = `${fmt(st.time)} / ${fmt(st.duration)}`;
};
const updateAudioTransport = () => {
  if (!audio) return;
  const st = audio.state();
  const seek = g('audio-seek');
  if (seek && st.duration) seek.value = (st.time / st.duration).toFixed(4);
  const tm = g('audio-time');
  if (tm) tm.textContent = `${fmt(st.time)} / ${fmt(st.duration)}`;
};
const renderGroups = () => {
  const el = g('audio-groups'); if (!el || !design) return;
  const names = design.groups();
  el.innerHTML = names.map(n => {
    const cfg = design.sectionAudio.get(n) ?? {};
    const on = cfg.on ?? true;      // sections inherit the master unless switched off
    return `<div class="audio-g"><label><input type="checkbox" data-group="${n}"${on ? ' checked' : ''}> react ${n}</label></div>`;
  }).join('');
  el.querySelectorAll('[data-group]').forEach(cb => cb.addEventListener('change', () => design.setSectionAudio(cb.dataset.group, { on: cb.checked })));
};
const renderVisual = () => {
  if (!design) return;
  const modes = design.visualModes ?? [];
  const sel = g('visual-mode');
  if (sel && sel.options.length !== modes.length) sel.innerHTML = modes.map(m => `<option value="${m}">${m}</option>`).join('');
  const ex = g('visual-exclude');
  if (ex) {
    ex.innerHTML = modes.map(m => `<label><input type="checkbox" data-mode="${m}"${(design.audioReact.exclude ?? []).includes(m) ? ' checked' : ''}> ${m}</label>`).join('');
    ex.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      const exclude = [...ex.querySelectorAll('input:checked')].map(c => c.dataset.mode);
      design.setAudioReact({ exclude });
    }));
  }
};
const syncAudioUI = () => {
  if (!design) return;
  const a = design.audioReact;
  const set = (id, v) => { const el = g(id); if (el) { if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = v; } };
  set('audio-react-on', a.on);
  set('audio-band', a.band ?? 'all');
  set('audio-delay', a.delay ?? 0);
  set('audio-onset', a.onset ?? 0.15);
  set('audio-fade', a.fade ?? 0.3);
  set('audio-ignore', a.ignore ?? 0.05);
  set('audio-random', a.random);
  set('audio-lock', a.locked);
  set('visual-mode', a.mode ?? 'palette');
  set('visual-auto', a.auto ?? false);
  set('visual-auto-secs', a.autoSeconds ?? 8);
  renderVisual();
};
const toggleAudio = () => {
  if (!audioBox) return;
  const show = audioBox.style.display !== 'block';
  if (show) closePanels();
  audioBox.style.display = show ? 'block' : 'none';
  if (show) { syncAudioUI(); renderPlaylist(); renderGroups(); }
};
document.getElementById('audio-btn')?.addEventListener('click', toggleAudio);
g('audio-file')?.addEventListener('change', async e => {
  if (!audio || !e.target.files?.length) return;
  await audio.decode(e.target.files);
  renderPlaylist();
});
g('audio-play')?.addEventListener('click', () => { audio?.toggle(); renderPlaylist(); });
g('audio-prev')?.addEventListener('click', () => { audio?.prev(); renderPlaylist(); });
g('audio-next')?.addEventListener('click', () => { audio?.next(); renderPlaylist(); });
g('audio-vol')?.addEventListener('input', e => { audio?.setVolume(Number(e.target.value)); });
g('audio-seek')?.addEventListener('input', e => { audio?.seek(Number(e.target.value)); });
for (const id of ['audio-react-on', 'audio-band', 'audio-delay', 'audio-onset', 'audio-fade', 'audio-ignore', 'audio-random', 'audio-lock']) {
  g(id)?.addEventListener('change', () => design?.setAudioReact(readReactive()));
}
g('visual-mode')?.addEventListener('change', () => design?.setAudioReact({ mode: g('visual-mode').value }));
g('visual-auto')?.addEventListener('change', () => design?.setAudioReact({ auto: g('visual-auto').checked }));
g('visual-auto-secs')?.addEventListener('change', () => design?.setAudioReact({ autoSeconds: Number(g('visual-auto-secs').value) || 8 }));
window.addEventListener('ct-audio', renderPlaylist);
window.clubFixture.toggleAudio = toggleAudio;

// Bundled tracks (in the project's public/audio folder, copied to dist/audio on build).
// Load them as the default playlist so they're ready to play; the file input still
// adds more tracks on top.
const BUNDLED_TRACKS = [
  { file: 'Analog Circuit - Terminal Saturator - Treblo.mp3', name: 'Analog Circuit — Terminal Saturator' },
  { file: 'Techno - bend the rules  - Treblo.mp3', name: 'Techno — bend the rules' },
  { file: 'Techno - Hindsight - Treblo.mp3', name: 'Techno — Hindsight' },
];
if (audio) for (const t of BUNDLED_TRACKS) {
  audio.addUrl('audio/' + encodeURIComponent(t.file), t.name).then(ok => { if (ok) renderPlaylist(); });
}


// ---- input ----------------------------------------------------------------------
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); resetToEntry(); return; }
  keys.add(e.code);
  if (e.code === 'KeyN') { nextView(); }
  if (e.code === 'KeyI') { window.clubFixture.toggleInfo(); }
  if (e.code === 'KeyP') { planner.toggle(); }
  if (e.code === 'KeyF') { world.toggle(); }
  if (e.code === 'KeyC') { window.clubFixture.toggleCoords(); }
  if (e.code === 'KeyM') { window.clubFixture.toggleAudio(); }
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
// Draw live visualisation screens (equalizer / waveform) from the analyser. Called
// every frame; if there is no audio yet (or no viz screens), it does nothing.
// Styles: bars | peaks | mirror | ring | wave — 16-band real-time analysis.
const colFor = v => `hsl(${Math.round(120 * (1 - Math.max(0, Math.min(1, v))))}, 92%, 55%)`;
const drawEq = (ctx, W, H, style, audio, t) => {
  ctx.fillStyle = '#060810'; ctx.fillRect(0, 0, W, H);
  let bands = audio.getBands(16);
  // Idle mode: with no track playing the analyser is flat, so synthesize a gentle
  // animated pattern from the clock — the wall EQ is alive even in silence and
  // switches to the real analysis the moment music plays.
  if (bands.every(v => v < 0.012)) {
    bands = bands.map((_, i) => Math.max(0, Math.abs(Math.sin(t * 1.4 + i * 0.55)) * 0.6 * Math.max(0.12, 1 - i / 16)));
  }
  const pad = 4;
  const bw = (W - pad * 2) / 16;
  const maxH = H - pad * 2;
  if (style === 'wave') {
    const data = audio.getWave();
    // Idle mode: a flat line means silence — draw a slow travelling sine instead.
    if (data.every(v => Math.abs(v - 128) < 2)) {
      ctx.strokeStyle = '#7ee0ff'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 128; i++) {
        const x = (i / 128) * W, y = H / 2 + Math.sin(t * 2.2 + (i / 128) * Math.PI * 4) * H * 0.22;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = '#7ee0ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * W, y = H / 2 + ((data[i] - 128) / 128) * H * 0.4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  if (style === 'ring') {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 10;
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const len = Math.max(3, bands[i] * R);
      ctx.strokeStyle = colFor(bands[i]); ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * R * 0.4, cy + Math.sin(ang) * R * 0.4);
      ctx.lineTo(cx + Math.cos(ang) * (R * 0.4 + len), cy + Math.sin(ang) * (R * 0.4 + len));
      ctx.stroke();
    }
    return;
  }
  // bars / peaks / mirror
  const peaks = ctx.canvas.__peaks || (ctx.canvas.__peaks = new Array(16).fill(0));
  for (let i = 0; i < 16; i++) {
    const h = Math.max(2, bands[i] * maxH);
    peaks[i] = Math.max(peaks[i] * (style === 'peaks' ? 0.985 : 0), h);
    const x = pad + i * bw;
    if (style === 'mirror') {
      const half = maxH / 2, cy = H / 2;
      const g = Math.max(2, bands[i] * half);
      ctx.fillStyle = colFor(bands[i]);
      ctx.fillRect(x, cy - g, bw - 2, g);
      ctx.fillRect(x, cy, bw - 2, g);
    } else {
      ctx.fillStyle = colFor(bands[i]);
      ctx.fillRect(x, H - pad - h, bw - 2, h);
      if (style === 'peaks') { ctx.fillStyle = '#ffe142'; ctx.fillRect(x, H - pad - peaks[i] - 2, bw - 2, 2); }
    }
  }
};
let vizT = 0;
const drawBands = () => {
  const canvas = document.getElementById('band-viz');
  if (!canvas || !analyzer) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0b10';
  ctx.fillRect(0, 0, W, H);
  const st = analyzer.state();
  const bands = st.bands;
  const bw = W / 32;
  for (let i = 0; i < 32; i++) {
    const h = bands[i] * H * 0.9;
    const x = i * bw;
    // Color gradient: bass (red) → mid (green) → treble (blue)
    const hue = (i / 32) * 240; // 0=red, 120=green, 240=blue
    ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
    ctx.fillRect(x + 1, H - h, bw - 2, h);
  }
  // Update readout
  const readout = document.getElementById('band-readout');
  if (readout) {
    readout.textContent = `bass ${st.bass.toFixed(2)} · mid ${st.mid.toFixed(2)} · treble ${st.treble.toFixed(2)} · energy ${st.energy.toFixed(2)} · beat ${st.beat ? '●' : '○'}`;
  }
};
const drawViz = () => {
  if (!audio) return;
  vizT += 1 / 60;
  for (const obj of cssScene.children) {
    const kind = obj.userData.viz;
    if (!kind || !obj.userData.vizCtx) continue;
    const ctx = obj.userData.vizCtx, W = ctx.canvas.width, H = ctx.canvas.height;
    drawEq(ctx, W, H, obj.userData.vizStyle || (kind === 'wave' ? 'wave' : 'bars'), audio, vizT);
  }
};
const loop = now => {
  requestAnimationFrame(loop);
  clock.delta = (now - clock.last) / 1000; clock.last = now;
  if (clock.running) {
    clock.t += Math.min(1 / 20, clock.delta);
    if (dancers) {
      const st = analyzer ? analyzer.state() : null;
      // Only react to audio when the control panel's "colours to music" is ON.
      const reactOn = design?.audioReact?.on ?? false;
      if (st && reactOn) club.userData.setAudio(st);
      else club.userData.setAudio(null);               // clear → autonomous mode
      const scale = (st && reactOn) ? 0.5 + st.bass * 1.5 : 1;
      dancers.tick(clock.delta, scale);
    }
    if (!reducedMotion) club.userData.tick(clock.t);
  }
  if (design) design.cycle(now / 1000, audio);   // colour cycles + audio-reactive (owned by the host)
  updateAudioTransport();                       // keep the seek bar + time display live
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
  drawViz();                            // draw EQ / waveform screens from the audio
  drawBands();                          // draw 32-band audio frequency visualization
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

