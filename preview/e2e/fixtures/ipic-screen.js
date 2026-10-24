// IPIC screen review (#498): the real auditorium interior and screen material, the real screening
// player and screen binding, and test-only films (preview/e2e/fixtures/screening). Driven by
// preview/e2e/ipic-screen.js; renders with the game's tone mapping (ACES, exposure 0.95) and the
// game's store lights (8 nearest, #ffd9ae, 10 × the house-light level). Uses the production
// render pipeline (GTAO, bloom, OutputPass); full-world sky lighting is separate evidence.
import * as THREE from 'three';
import { buildIpicInterior } from '../../src/ipic-interior.js';
import { planStoreRooms } from '../../src/store-rooms.js';
import { IPIC_AUDITORIUM_ROWS, IPIC_AUDITORIUM_SEAT_D, IPIC_SCREEN, IPIC_VIEWING } from '../../src/ipic-plan.js';
import { SCREENING_MEDIA } from '../../src/screening-contract.js';
import { createScreeningPlayer, createServerClock } from '../../src/ipic-screening.js';
import { createRenderPipeline } from '../../src/render-pipeline.js';
import { createScreenBinding } from '../../src/ipic-screening-screen.js';

const status = text => { document.querySelector('#status').textContent = text; };
const manifest = await fetch('./screening/manifest.json').then(r => r.json());
// The bundled films, the test-only ones, and a fallback film whose first "WebM" is not a film.
const catalog = { ...SCREENING_MEDIA };
for (const film of manifest.films) catalog[film.id] = Object.freeze({ id: film.id, venues: ['ipic'], durationMs: film.files[0].durationMs, label: film.id, fixture: true, sources: film.files.map(({ src, type }) => ({ src, type })), transcript: [] });
catalog['test-fallback'] = Object.freeze({ ...catalog['test-edge-4x3'], id: 'test-fallback', sources: [{ src: manifest.broken.src, type: manifest.broken.type }, ...catalog['test-edge-4x3'].sources] });
// Neither encoding is on the server: a download failure while online, not a decoder's.
catalog['test-missing'] = Object.freeze({ ...catalog['test-edge-4x3'], id: 'test-missing', sources: catalog['test-edge-4x3'].sources.map(({ src, type }) => ({ src: src.replace(/[^/]+$/, 'missing-film$&'), type })) });

const data = await fetch('/data/district.json').then(r => r.json());
const room = planStoreRooms(data).find(r => r.interior);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.08, 100);
const pipeline = createRenderPipeline(renderer, scene, camera);
pipeline.resize(innerWidth, innerHeight, 1);
const model = buildIpicInterior(room, { local: true }); scene.add(model);
const hemisphere = new THREE.HemisphereLight('#eee0c4', '#66584a', 0.6); scene.add(hemisphere);
const probeLight = new THREE.DirectionalLight('#ffffff', 0); scene.add(probeLight, probeLight.target);
let probeEnvironment, probeEnvironmentTarget;
const lights = Array.from({ length: 8 }, () => { const light = new THREE.PointLight('#ffd9ae', 0, 10, 2); scene.add(light); return light; });
await model.userData.ready;
const screen = { material: model.userData.screen, aspect: model.userData.screenAspect };
const p = ([a, h, d]) => new THREE.Vector3(a, h, -d);
// The screen faces IPIC_SCREEN.facing in (a, d); film right runs along `right`, a quarter turn from it.
const [fa, fd] = IPIC_SCREEN.facing, right = [-fd || 0, fa], centre = [IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d];
const ahead = metres => [IPIC_SCREEN.a + fa * metres, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d + fd * metres];
const middle = IPIC_AUDITORIUM_ROWS[1];
// Poses in the room frame [a, h, d] (h above the street floor; the upper floor is 6 m up). Square on, the
// screen spans the share of the frame the 12.1 m screen did from the old back wall (6.05 / 7.19 = 3.7 / 4.4).
const POSES = {
  square: { eye: ahead(4.4), target: centre },
  // recliner-1-1's seated eye (cushion + 0.69 m) in the middle row, as ipic-photo-views.mjs T3-seated.
  seated: { eye: [middle.a, 6 + middle.floor + IPIC_VIEWING.seatedEye, IPIC_AUDITORIUM_SEAT_D[1]], target: centre },
};
let houseLights = 1;
function pose(name) {
  const { eye, target } = POSES[name]; camera.position.copy(p(eye)); camera.lookAt(p(target)); camera.updateMatrixWorld();
  const picked = model.userData.lightPositions.map(item => [item.position.distanceToSquared(camera.position), item]).sort((a, b) => a[0] - b[0]);
  lights.forEach((light, i) => { const hit = picked[i]; light.position.copy(hit[1].position); light.intensity = 10 * (hit[1].house ? houseLights : 1); });
}

const video = document.createElement('video');
Object.assign(video, { muted: true, playsInline: true, preload: 'auto' }); video.setAttribute('playsinline', ''); video.hidden = true; document.body.append(video);
const clock = createServerClock(); clock.observeSync(performance.now(), performance.now(), performance.now());
const player = createScreeningPlayer({ media: video, clock, catalog });
const binding = createScreenBinding({ THREE });
const SHOWN = ['ready', 'playing', 'buffering', 'paused', 'ended', 'blocked'];
let revision = 0, current = 'square', frames = 0;
// The same per-frame order as ipic-screening-ui.js update(): tick the player, then bind the screen.
function frame() {
  player.tick();
  const stats = player.stats();
  const key = `${stats.generation}:${video.videoWidth}x${video.videoHeight}`, held = video.seeking && binding.inspect().key === key;
  binding.sync({ screen, video, key, show: SHOWN.includes(stats.state) && (video.readyState >= 2 || held) });
  pose(current); pipeline.render(1 / 60); frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const nextFrames = n => new Promise(done => { const until = frames + n; const wait = () => (frames >= until ? done() : requestAnimationFrame(wait)); wait(); });

const snapshotMaterial = () => {
  const m = screen.material, value = v => (v?.isColor ? v.getHex() : v);
  return JSON.stringify({ props: Object.fromEntries(Object.entries(m).filter(([key]) => key !== 'version').map(([key, v]) => [key, v?.isTexture ? v.uuid : typeof v === 'function' ? `fn:${v.toString().length}` : value(v)])),
    own: ['onBeforeCompile', 'customProgramCacheKey'].map(key => Object.hasOwn(m, key)), key: m.customProgramCacheKey() });
};
// The idle screen's material, and the textures resident once the interior has rendered (its own maps), before any film.
// Each pose renders first: square on, the screen hides the rows, whose maps upload when they first come into view.
for (const name of Object.keys(POSES)) { current = name; await nextFrames(3); }
current = 'square'; await nextFrames(3);
const idle = snapshotMaterial(), idleTextures = renderer.info.memory.textures;

// Screen pixels: project a point given in film or screen fractions (u right, v down) on the screen plane.
function screenPoint(s, t) {
  const across = (s - 0.5) * IPIC_SCREEN.width;
  const point = p([IPIC_SCREEN.a + right[0] * across + fa * 0.01, 6 + IPIC_SCREEN.y + (0.5 - t) * IPIC_SCREEN.height, IPIC_SCREEN.d + right[1] * across + fd * 0.01]).project(camera);
  return [Math.round((point.x + 1) / 2 * innerWidth), Math.round((1 - point.y) / 2 * innerHeight)];
}
function readPixel([x, y]) {
  const gl = renderer.getContext(), out = new Uint8Array(4);
  gl.readPixels(x, renderer.domElement.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return [...out.slice(0, 3)];
}
const direct = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function directPixel(u, v) {
  const { videoWidth: w, videoHeight: h } = video; direct.canvas.width = w; direct.canvas.height = h; direct.drawImage(video, 0, 0, w, h);
  return [...direct.getImageData(Math.min(w - 1, Math.floor(u * w)), Math.min(h - 1, Math.floor(v * h)), 1, 1).data.slice(0, 3)];
}

window.screenFixture = {
  ready: true, catalog: Object.keys(catalog),
  // Show a film paused at a time (or playing from it); resolves once its frame is on the screen.
  async show(id, { status: shared = 'paused', at = 1000, wait = true } = {}) {
    const film = catalog[id];
    player.apply({ venueId: 'ipic', screeningId: `screen-${revision + 1}`, mediaId: id, status: shared, revision: ++revision, epoch: 'fixture', positionMs: at, anchorServerTimeMs: clock.serverNow(), durationMs: film.durationMs, hostId: 'test' });
    if (!wait) return this.inspect();
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      await nextFrames(1);
      const stats = player.stats();
      if (['error', 'unsupported', 'blocked'].includes(stats.state)) break;
      if (binding.inspect().key && !video.seeking && (shared !== 'paused' || Math.abs(video.currentTime * 1000 - at) < 60)) break;
    }
    await nextFrames(3);
    status(`${id} · ${player.stats().state}`);
    return this.inspect();
  },
  stop() { player.apply({ venueId: 'ipic', screeningId: null, mediaId: null, status: 'stopped', revision: ++revision, epoch: 'fixture', positionMs: 0, anchorServerTimeMs: 0, durationMs: 0, hostId: null }); return nextFrames(3).then(() => this.inspect()); },
  retry() { player.retry(); },
  unmute() { video.muted = false; },
  unlock() { return player.unlock(); },
  async pose(name, level = 1) { current = name; houseLights = level; await nextFrames(3); },
  async lightingProbe(level) {
    if (!probeEnvironment && level !== null) {
      const faces = Array.from({ length: 6 }, () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff0d8'; ctx.fillRect(0, 0, 16, 16); return canvas; });
      const cube = new THREE.CubeTexture(faces); cube.colorSpace = THREE.SRGBColorSpace; cube.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      try { probeEnvironmentTarget = pmrem.fromCubemap(cube); probeEnvironment = probeEnvironmentTarget.texture; }
      finally { cube.dispose(); pmrem.dispose(); }
    }
    hemisphere.intensity = level === null ? 0.6 : level;
    probeLight.position.copy(camera.position); probeLight.target.position.copy(p(centre)); probeLight.intensity = level === null ? 0 : 4 * level;
    scene.environment = level === null ? null : probeEnvironment; scene.environmentIntensity = level === null ? 1 : level;
    if (level === null) { probeEnvironmentTarget?.dispose(); probeEnvironmentTarget = probeEnvironment = null; }
    await nextFrames(5);
    return { exposure: renderer.toneMappingExposure, level, environment: Boolean(scene.environment) };
  },
  // Rendered and direct-video colour at film points, plus the mattes just outside the film and midway.
  async sample(points = {}) {
    await nextFrames(2);
    const bound = binding.inspect(); if (!bound.key) return { bound };
    const [rx, ry] = bound.fit.repeat, left = (1 - 1 / rx) / 2, top = (1 - 1 / ry) / 2;
    const film = (u, v) => [left + u / rx, top + v / ry];
    const { videoWidth: w, videoHeight: h } = video, eu = 3 / w, ev = 3 / h;
    const named = { grey: [0.5, 0.15], white: [0.325, 0.5], black: [0.675, 0.5], edgeLeft: [eu, 0.5], edgeRight: [1 - eu, 0.5], edgeTop: [0.5, ev], edgeBottom: [0.5, 1 - ev], ...points };
    const out = { bound, pose: current, houseLights, film: {}, matte: {} };
    for (const [name, [u, v]] of Object.entries(named)) out.film[name] = { rendered: readPixel(screenPoint(...film(u, v))), direct: directPixel(u, v), at: screenPoint(...film(u, v)) };
    // A film within 1 % of the screen's aspect fills it (2.39:1 on the scope screen): no matte to sample.
    const mattes = rx > 1.01 ? { outsideLeft: [left - 0.004, 0.5], outsideRight: [1 - left + 0.004, 0.5], midLeft: [left / 2, 0.5], midRight: [1 - left / 2, 0.5] }
      : ry > 1.01 ? { outsideTop: [0.5, top - 0.01], outsideBottom: [0.5, 1 - top + 0.01], midTop: [0.5, top / 2], midBottom: [0.5, 1 - top / 2] } : {};
    for (const [name, st] of Object.entries(mattes)) out.matte[name] = { rendered: readPixel(screenPoint(...st)), at: screenPoint(...st) };
    return out;
  },
  // Force a drift seek during playback (the element jumps ahead; the player seeks back) and record what each
  // drawn frame showed: whether the film stayed bound, and the element's readiness while seeking.
  async seekProbe(frameCount = 40, jumpS = 2) {
    const created = binding.inspect().counts.created, trace = [];
    video.currentTime += jumpS;
    for (let i = 0; i < frameCount; i++) { await nextFrames(1); trace.push({ bound: Boolean(binding.inspect().key), readyState: video.readyState, seeking: video.seeking, state: player.stats().state, measuredDriftMs: player.stats().measuredDriftMs }); }
    return { trace, texturesCreated: binding.inspect().counts.created - created };
  },
  inspect: () => ({ ...player.stats(), screen: binding.inspect(), errorCode: video.error?.code ?? null, decoded: [video.videoWidth, video.videoHeight], currentTime: video.currentTime, readyState: video.readyState,
    pipeline: pipeline.stats, textures: renderer.info.memory.textures, idleTextures, materialRestored: snapshotMaterial() === idle, materialBound: snapshotMaterial() !== idle }),
};
// A real user gesture (the harness clicks the page) answers an autoplay refusal, as Play film does.
addEventListener('click', () => { void player.unlock(); });
status('Ready');
