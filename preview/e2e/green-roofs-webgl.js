import { createHash } from 'node:crypto';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
// Real district geometry, controlled comparison fixture. This does not replace
// the shared-town indoor/terrace journey or establish target-device acceptance.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../output/playwright/green-roofs-composed/', import.meta.url));
const release = await holdBrowserLock('Green roofs controlled comparison');
let vite, browser;
try {
  await mkdir(output, { recursive: true });
  vite = await createServer({ configFile: false, root, cacheDir: `${root}../.runtime/green-roofs-vite`, server: { host: '127.0.0.1', port: 0 } });
  const sourceFiles = ['green-roofs.js','roof-grasses.js','roof-field-mesh.js','roof-field-boundaries.js','hermes-roof-surface.js'];
  const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, createHash('sha256').update(await readFile(`${root}src/${name}`)).digest('hex')])));
  await vite.listen(); browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/roof-test.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}</style><title>Green roof district comparison</title>' }));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/roof-test.html`);
  await page.evaluate(async () => {
    const { buildDistrictBuildings } = await import('/src/district.js');
    const url = performance.getEntriesByType('resource').map(entry => entry.name).find(url => /\/three\.js\?/.test(url));
    const THREE = await import(url), world = await (await fetch('/data/district.json')).json();
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1200, 800); renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(), buildings = buildDistrictBuildings(world); scene.add(buildings);
    const ambient = new THREE.HemisphereLight('#dceeff', '#776e4a', 2), sun = new THREE.DirectionalLight('#ffefcf', 3);
    sun.position.set(-2800, 150, 1380); scene.add(ambient, sun);
    const camera = new THREE.PerspectiveCamera(58, 1.5, .1, 2000);
    const roofs = buildings.getObjectByName('Authored green roof gardens');
    const debug = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
    window.fixture = { renderer, scene, camera, roofs, ambient, sun, THREE, device: debug ? renderer.getContext().getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
  });
  const reports = [];
  for (const time of ['daylight', 'dusk']) for (const station of ['street', 'provisional-elevated', 'wing-provisional-elevated']) for (const mode of ['before', 'after']) {
    const report = await page.evaluate(async ({ time, station, mode }) => {
      const { renderer, scene, camera, roofs, ambient, sun, THREE, device } = window.fixture;
      roofs.visible = mode === 'after';
      scene.background = new THREE.Color(time === 'daylight' ? '#b7ccd5' : '#706a85');
      ambient.intensity = time === 'daylight' ? 2 : .8; sun.intensity = time === 'daylight' ? 3 : 1;
      sun.color.set(time === 'daylight' ? '#ffefcf' : '#ffc293');
      camera.position.set(-2760, station === 'street' ? 20 : 49, 1378);
      camera.lookAt(-2740, station === 'street' ? 32 : 33, 1250);
      if (station === 'wing-provisional-elevated') { camera.position.set(-2786, 38, 1428); camera.lookAt(-2766,29,1403); }
      for (let i = 0; i < 8; i++) { renderer.render(scene, camera); await new Promise(requestAnimationFrame); }
      const samples = [], frameIntervals = []; let previousFrame = performance.now();
      for (let i = 0; i < 40; i++) { const start = performance.now(); renderer.render(scene, camera); samples.push(performance.now() - start); await new Promise(requestAnimationFrame); const frameEnd = performance.now(); frameIntervals.push(frameEnd - previousFrame); previousFrame = frameEnd; }
      samples.sort((a,b) => a-b); frameIntervals.sort((a,b) => a-b);
      return { time, station, mode, device, settings: { viewport: [1200,800], pixelRatio: 1, fov: 58, shadows: false }, camera: camera.position.toArray(), target: station === 'wing-provisional-elevated' ? [-2766,29,1403] : [-2740, station === 'street' ? 32 : 33, 1250], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, memory: { ...renderer.info.memory }, frameIntervalMedianMs: frameIntervals[20], frameIntervalP95Ms: frameIntervals[38], cpuSubmitMedianMs: samples[20], cpuSubmitP95Ms: samples[38], webglError: renderer.getContext().getError() };
    }, { time, station, mode });
    await page.screenshot({ path: `${output}${station}-${time}-${mode}.png` }); reports.push(report);
    assert.equal(report.webglError, 0);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}comparison.json`, JSON.stringify({ sources, scope: 'Controlled real-district geometry fixture; CPU submission timing, not GPU frame time; memory counts are allocations shared by both modes.', reports }, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser?.close(); await vite?.close(); release(); }
