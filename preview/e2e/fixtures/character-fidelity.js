import {releaseTransmissionTargets} from '../../src/transmission-targets.js';
import {createQualityControl} from '../../src/render-quality.js';
import {characterFidelityContract} from '../../src/character-fidelity-contract.js';
import {applyCharacterRealism, loadCharacterRealismTextures, REALISM_COMPONENTS, REALISM_TIERS} from '../../src/character-realism.js';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createCharacterHero, CHARACTER_HERO_PRESET} from '../../src/character-hero.js';
import {characterPortraitPNG, portraitPixels, CHARACTER_PORTRAIT_SIZE} from '../../src/character-portrait.js';
import {customizedCharacterDefinition} from '../../src/character-customization.js';
import {AVATAR_PROFILES, loadResidentAvatar} from '../../src/avatars.js';
import {createPlayerCostume} from '../../src/player-costume.js';
import {createCharacterMaterials} from '../../src/character-studio-materials.js';
import {sharedAppearance} from '../../src/shared-appearances.js';
import {defaultAppearanceRealism} from '../../src/default-appearance-realism.js';
import {JEVICA_ACCOUNT_IDS} from '../../src/jevica-accounts.js';
import {compareCharacterImages} from '../../audit/character-image-comparison.js';
import {distributionOf, sceneCensus, rendererMemory, memoryDelta} from '../../src/character-fidelity-metrics.js';

// #517 measurement fixture: shipped characters through the shipped load, look
// and portrait paths, on one pinned stage. Nothing here changes runtime code.
export const CLOSE_UP_PRESET = 'face-closeup-v1';
const VIEWPORT = {width: 1920, height: 1080};
const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
renderer.setPixelRatio(1); renderer.setSize(VIEWPORT.width, VIEWPORT.height);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');

// Jevica's look is permitted only to her accounts; this local render borrows the
// permission check, not a session.
const ownerFor = appearanceId => appearanceId === 'jevica' ? JEVICA_ACCOUNT_IDS[0] : 'fidelity-fixture';
const definitionFor = appearanceId => customizedCharacterDefinition(ownerFor(appearanceId), appearanceId);
const dataURL = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
async function decode(url) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', {colorSpace: 'srgb'}); context.drawImage(bitmap, 0, 0);
    return {width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data};
  } finally { bitmap.close(); }
}
const frame = () => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { cancelAnimationFrame(handle); reject(new Error('Frame sampling timed out')); }, 30000);
  const handle = requestAnimationFrame(now => { clearTimeout(timeout); resolve(now); });
});
const figureRoot = scene => scene.children.find(child => child.getObjectByName?.('head'));

// Head-and-shoulders framing from the rig's own head bone, so rigs of different
// heights frame the same way.
export function closeUpCamera(scene) {
  const head = scene.getObjectByName('head');
  if (!head) throw new Error('Character has no head bone');
  scene.updateMatrixWorld(true);
  const target = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .02, .03));
  const camera = new THREE.PerspectiveCamera(24, 16 / 9, .02, 20);
  camera.position.copy(target).add(new THREE.Vector3(0, .015, 1)); camera.lookAt(target); camera.updateMatrixWorld(true);
  return camera;
}

// The same rig, look and costume steps as createCharacterHero, without its
// single-figure stage, so a crowd can share one scene and animate.
// Without `components`, named defaults take their trial parts as in the world.
async function loadFigure(appearanceId, index, realism = 'off', components) {
  const definition = definitionFor(appearanceId), look = sharedAppearance(definition.appearanceId);
  components ??= defaultAppearanceRealism(definition.appearanceId) ?? undefined;
  const avatar = await loadResidentAvatar(Math.max(0, AVATAR_PROFILES.indexOf(definition.rig)), `remote-fidelity-${index}`, definition.rig,
    {folk: false, appearanceId: definition.appearanceId, faceRecipe: {}, realism: 'off'});
  const costume = look.costume === 'jevica' ? createPlayerCostume(avatar, 'jevica') : null;
  const colors = createCharacterMaterials(avatar.object); colors.apply(definition);
  let effect;
  try { if (realism !== 'off') effect = applyCharacterRealism(avatar.rig, {tier: realism, textures: await loadCharacterRealismTextures(), components}); }
  catch (error) { colors.dispose(); costume?.dispose(); avatar.dispose(); throw error; }
  return {avatar, costume, dispose() { effect?.dispose(); colors.dispose(); costume?.dispose(); avatar.object.removeFromParent(); avatar.dispose(); }};
}

// Fixed alternatives to the hero's garden-front-v1 daylight stage (#517 trial):
// the same figure, camera and pose under low warm dusk light, and under a warm
// interior with a room environment standing in for the town's reflections.
const LIGHTING = {
  daylight: null,
  dusk: {background: '#2d3245', key: ['#ffad78', 1.5, [3.6, 1.3, 2.4]], fill: ['#55649a', '#2a221f', .85], rim: ['#9db3ff', 1.9], environment: 0},
  interior: {background: '#4b4139', key: ['#ffe0bb', 2.1, [.8, 3.2, 2.2]], fill: ['#fff0dc', '#5b4a3b', 1.25], rim: ['#ffd7ad', .55], environment: .35},
};
function applyLighting(scene, name) {
  if (!Object.hasOwn(LIGHTING, name)) throw new TypeError(`Unknown lighting ${name}`);
  const preset = LIGHTING[name];
  if (!preset) return () => {};
  const lights = scene.children.filter(child => child.isLight), key = lights.find(light => light.castShadow);
  const rim = lights.find(light => light.isDirectionalLight && light !== key), fill = lights.find(light => light.isHemisphereLight);
  key.color.set(preset.key[0]); key.intensity = preset.key[1]; key.position.set(...preset.key[2]);
  fill.color.set(preset.fill[0]); fill.groundColor.set(preset.fill[1]); fill.intensity = preset.fill[2];
  rim.color.set(preset.rim[0]); rim.intensity = preset.rim[1]; scene.background = new THREE.Color(preset.background);
  let target = null;
  if (preset.environment) {
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    target = pmrem.fromScene(room, .04); room.dispose(); pmrem.dispose();
    scene.environment = target.texture; scene.environmentIntensity = preset.environment;
  }
  return () => { scene.environment = null; target?.dispose(); };
}

// Which pixels a part of the figure covers, found by rendering again without
// it: hair, brows/lashes and skin use the realism layer's own selectors. The
// mask is bit-packed per 8x8 cell (set when most of the cell is covered).
const materialNamed = (mesh, pattern) => [mesh.material].flat().some(material => pattern.test(material.name ?? ''));
const REGIONS = {
  hair: mesh => /^(afro|bob|braid|long|ponytail|short)\d+/i.test(mesh.name) || materialNamed(mesh, /^(afro|bob|braid|long|ponytail|short)\d+/i),
  brows: mesh => /(eyebrow|eyelashes)\d+(?:_\d+)?$/i.test(mesh.name) || materialNamed(mesh, /brows$/i),
  skin: mesh => [mesh.material].flat().some(material => /^(young|middleage|old)_[a-z]+_(male|female)\d*$/i.test(material.name ?? '')),
};
const CELL = 8;
function regionStats(scene, camera, samples) {
  const full = portraitPixels({renderer, scene, camera, samples}), {width, height} = full, result = {};
  for (const [region, matches] of Object.entries(REGIONS)) {
    const hidden = [];
    scene.traverse(object => { if (object.isMesh && object.visible && matches(object)) { object.visible = false; hidden.push(object); } });
    if (!hidden.length) { result[region] = null; continue; }
    let without;
    try { without = portraitPixels({renderer, scene, camera, samples}).pixels; } finally { for (const object of hidden) object.visible = true; }
    const columns = Math.ceil(width / CELL), rows = Math.ceil(height / CELL), cells = new Uint16Array(columns * rows), sum = [0, 0, 0];
    let pixels = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.max(Math.abs(full.pixels[i] - without[i]), Math.abs(full.pixels[i + 1] - without[i + 1]), Math.abs(full.pixels[i + 2] - without[i + 2])) <= 6) continue;
      pixels++; sum[0] += full.pixels[i]; sum[1] += full.pixels[i + 1]; sum[2] += full.pixels[i + 2];
      cells[Math.floor(y / CELL) * columns + Math.floor(x / CELL)]++;
    }
    const bits = new Uint8Array(Math.ceil(cells.length / 8));
    cells.forEach((count, cell) => { if (count * 2 >= CELL * CELL) bits[cell >> 3] |= 1 << (cell & 7); });
    let binary = ''; for (const byte of bits) binary += String.fromCharCode(byte);
    result[region] = {meshes: hidden.map(object => object.name), pixels, meanSRGB: pixels ? sum.map(value => +(value / pixels).toFixed(3)) : null,
      mask: {cell: CELL, columns, rows, bits: btoa(binary)}};
  }
  return result;
}

function crowdStage(count) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#cbd8d1');
  const key = new THREE.DirectionalLight('#fff0df', 3.1), fill = new THREE.HemisphereLight('#f2f6ff', '#64766d', 2), rim = new THREE.DirectionalLight('#c5e6e5', 2.2);
  key.position.set(3, 4, 4); rim.position.set(-3, 3, -2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 20}); key.shadow.normalBias = .012; key.shadow.bias = -.0001;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({color: '#a8bdb2', roughness: .87}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(key, fill, rim, ground);
  const camera = count === 1 ? new THREE.PerspectiveCamera(30, 16 / 9, .05, 30) : new THREE.PerspectiveCamera(40, 16 / 9, .05, 40);
  if (count === 1) { camera.position.set(0, 1.08, 3.8); camera.lookAt(0, .9, 0); }
  else { camera.position.set(0, 1.7, 7.5); camera.lookAt(0, .9, -1.5); }
  return {scene, camera, dispose() { ground.geometry.dispose(); ground.material.dispose(); key.shadow.dispose(); }};
}
const slot = (index, count) => {
  if (count === 1) return [0, 0];
  const columns = Math.ceil(Math.sqrt(count * 1.6)), row = Math.floor(index / columns), column = index % columns;
  return [(column - (columns - 1) / 2) * .95, -row * 1.3];
};

// `seconds`, when set, records for that long after warmup instead of `samples` frames.
async function sample({scene, camera, figures, warmup, samples, seconds}) {
  const intervals = [], cpu = [], queries = [];
  let previous = null, recorded = 0;
  const step = now => {
    const start = performance.now();
    for (const {avatar, costume} of figures) {
      avatar.update(now, 'idle', false, {speed: 0, distance: 0, gestureTime: now / 1000}, () => 0);
      costume?.update(false, now);
    }
    const query = timer && recorded % 4 === 0 && previous !== null ? gl.createQuery() : null;
    if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    renderer.render(scene, camera);
    if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query); }
    return performance.now() - start;
  };
  for (let i = 0; i < warmup; i++) step(await frame());
  const until = seconds ? performance.now() + seconds * 1000 : Infinity;
  while (seconds ? performance.now() < until : recorded < samples) {
    const now = await frame(), elapsed = step(now);
    if (previous !== null) { intervals.push(now - previous); cpu.push(elapsed); recorded++; }
    previous = now;
  }
  for (let i = 0; i < 60 && queries.some(query => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)); i++) await frame();
  const disjoint = timer ? gl.getParameter(timer.GPU_DISJOINT_EXT) : null, gpu = [];
  for (const query of queries) {
    if (!disjoint && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(query);
  }
  return {frameIntervalMs: distributionOf(intervals), cpuMs: distributionOf(cpu), gpuMs: timer ? distributionOf(gpu) : null, gpuDisjoint: disjoint,
    render: {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles}};
}

window.fidelityFixture = {
  environment: {realismTiers: Object.keys(REALISM_TIERS), gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    gpuVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null, webglVersion: gl.getParameter(gl.VERSION),
    gpuTimer: Boolean(timer), threeRevision: THREE.REVISION, pixelRatio: renderer.getPixelRatio(), colorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, viewport: VIEWPORT,
    presets: {full: CHARACTER_HERO_PRESET, closeUp: CLOSE_UP_PRESET}, capture: {...CHARACTER_PORTRAIT_SIZE, samples: 4},
    components: REALISM_COMPONENTS, lighting: Object.keys(LIGHTING), regions: Object.keys(REGIONS)},

  // Cold load through the shipped loader, then the first render (shader compile).
  async load(appearanceId, {realism = 'off'} = {}) {
    const start = performance.now(), figure = await loadFigure(appearanceId, 0, realism), loaded = performance.now();
    const {scene, camera, dispose} = crowdStage(1); scene.add(figure.avatar.object);
    try {
    renderer.render(scene, camera); gl.finish();
    const firstFrame = performance.now();
    const assets = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/assets/characters/'))
      .map(entry => ({path: new URL(entry.name).pathname, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize, durationMs: Math.round(entry.duration)}));
    return {loadMs: Math.round(loaded - start), firstFrameMs: Math.round(firstFrame - loaded), assets};
    } finally { releaseTransmissionTargets(renderer, scene); figure.dispose(); dispose(); }
  },

  async capture(appearanceId, {realism = 'off', expressions = false, components, lighting = 'daylight', regions = false, samples = 4} = {}) {
    const definition = definitionFor(appearanceId);
    const hero = await createCharacterHero({definition, ownerId: definition.ownerId, realism, components});
    const restoreLighting = applyLighting(hero.scene, lighting);
    try {
      const census = sceneCensus(figureRoot(hero.scene));
      const views = {};
      for (const [view, camera] of [['full', hero.camera], ['closeUp', closeUpCamera(hero.scene)]]) {
        const {blob} = await characterPortraitPNG({renderer, scene: hero.scene, camera, samples});
        views[view] = {png: await dataURL(blob), camera: {position: camera.position.toArray(), fov: camera.fov,
          direction: camera.getWorldDirection(new THREE.Vector3()).toArray()}};
        if (regions) views[view].regions = regionStats(hero.scene, camera, samples);
      }
      if (expressions) for (const name of hero.supportedExpressions.filter(name => name !== 'neutral')) {
        hero.setExpression(name, .65);
        const camera = closeUpCamera(hero.scene), {blob} = await characterPortraitPNG({renderer, scene:hero.scene, camera});
        views[`expression-${name}`] = {png:await dataURL(blob), camera:{position:camera.position.toArray(), fov:camera.fov, direction:camera.getWorldDirection(new THREE.Vector3()).toArray()}};
      }
      return {definition, census, views, supportedExpressions:hero.supportedExpressions, realism: hero.realismReport, lighting, samples};
    } finally { restoreLighting(); hero.dispose(renderer); }
  },

  async frames(appearanceId, {count = 1, warmup = 60, samples = 240, seconds, realism = 'off', components} = {}) {
    const stage = crowdStage(count), figures = [];
    try {
      for (let index = 0; index < count; index++) {
        const figure = await loadFigure(appearanceId, index, realism, components), [x, z] = slot(index, count);
        figure.avatar.object.position.set(x, 0, z); stage.scene.add(figure.avatar.object); figures.push(figure);
      }
      const census = sceneCensus(stage.scene);
      return {count, census: {drawCalls: census.drawCalls, triangles: census.triangles, skeletons: census.skeletons, textureBytes: census.textureBytes},
        ...await sample({scene: stage.scene, camera: stage.camera, figures, warmup, samples, seconds})};
    } finally { releaseTransmissionTargets(renderer, stage.scene); for (const figure of figures) figure.dispose(); stage.dispose(); }
  },

  async timingCycles(appearanceId, count = 3, {realism = 'off', crowd = [1, 8, 24]} = {}) {
    const once = async () => {
      await this.load(appearanceId, {realism});
      for (const count of crowd) await this.frames(appearanceId, {count, realism, warmup:0, samples:2});
      await frame();
    };
    await once(); const before = rendererMemory(renderer);
    for (let index = 0; index < count; index++) await once();
    const after = rendererMemory(renderer);
    return {count, crowd, mode:'cold-load-and-crowds', before, after, delta:memoryDelta(before, after)};
  },

  // Load, show and dispose repeatedly; GPU resources must return to the level
  // after the first (warm) cycle. The cached template is shared and expected.
  async cycles(appearanceId, count = 10, {portrait = false, realism = 'off', components} = {}) {
    const once = async () => {
      const definition = definitionFor(appearanceId), hero = await createCharacterHero({definition, ownerId: definition.ownerId, realism, components});
      try {
        if (portrait) {
          for (const camera of [hero.camera, closeUpCamera(hero.scene)]) portraitPixels({renderer, scene: hero.scene, camera});
        } else renderer.render(hero.scene, hero.camera);
      } finally { hero.dispose(renderer); }
      await frame();
    };
    await once();
    const before = rendererMemory(renderer);
    for (let i = 0; i < count; i++) await once();
    const after = rendererMemory(renderer);
    return {count, mode: portrait ? 'native-4k-two-cameras' : 'viewport', before, after, delta: memoryDelta(before, after)};
  },

  async qualityCycles(appearanceId, count = 5) {
    const definition = definitionFor(appearanceId), contract = characterFidelityContract(definition.rig);
    if (!contract) throw new Error('Quality fixture requires a realistic human rig');
    const control = createQualityControl({apply() {}, storage:{getItem:()=>'sharp'}});
    const avatar = await loadResidentAvatar(0, 'remote-quality-fixture', definition.rig, {folk:false, appearanceId, faceRecipe:{}});
    const stage = crowdStage(1); stage.scene.add(avatar.object);
    const checks = [];
    const once = async record => {
      for (const [mode,tier] of [['sharp','high'],['smooth','standard'],['auto','low']]) {
        control.select(mode);
        if (mode === 'auto') for (let i = 0; i < 45 * 16; i++) control.sample(40);
        for (let i = 0; i < 120 && avatar.realismReport.tier !== tier; i++) await frame();
        const report = avatar.realismReport;
        if (report.tier !== tier || report.fallback) throw new Error(`Quality transition failed: ${mode} ${JSON.stringify(report)}`);
        renderer.render(stage.scene, stage.camera);
        if (record) checks.push({mode, tier:report.tier, profile:avatar.profile, passed:avatar.profile === definition.rig});
      }
    };
    try {
      await once(false);
      // Compare the rendered result after a quality switch with a fresh rig
      // at that tier. A correct report alone cannot prove cached shader state.
      for (const tier of ['high', 'standard']) {
        await avatar.setRealismTier(tier);
        const changed = portraitPixels({renderer, scene:stage.scene, camera:stage.camera}).pixels;
        const reference = await loadResidentAvatar(0, 'remote-quality-reference', definition.rig, {folk:false, appearanceId, faceRecipe:{}, realism:tier});
        let expected;
        try {
          stage.scene.remove(avatar.object); stage.scene.add(reference.object);
          expected = portraitPixels({renderer, scene:stage.scene, camera:stage.camera}).pixels;
        } finally { reference.object.removeFromParent(); reference.dispose(); stage.scene.add(avatar.object); }
        let maximum = 0, differences = 0;
        for (let i = 0; i < changed.length; i++) { const delta = Math.abs(changed[i] - expected[i]); maximum = Math.max(maximum, delta); if (delta > 2) differences++; }
        if (maximum > 2 || differences) throw new Error(`Rendered tier differs from fresh ${tier}: max channel ${maximum}, channels over tolerance ${differences}`);
        checks.push({check:'rendered-transition',tier,maximum,passed:true});
      }
      await once(false);
      const before = rendererMemory(renderer);
      for (let i = 0; i < count; i++) await once(i === 0);
      const after = rendererMemory(renderer);
      return {count, before, after, delta:memoryDelta(before,after), checks, asset:definition.assets[0], method:'Actual avatar and graphics control; synthetic 40ms governor inputs test transitions, not performance'};
    } finally { avatar.dispose(); stage.dispose(); control.select('auto'); }
  },

  async compare({reference, current, limits}) {
    return compareCharacterImages(await decode(reference), await decode(current), limits);
  },
  dispose() { renderer.dispose(); renderer.forceContextLoss(); },
};
document.body.dataset.ready = 'true';
