import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Exercise the real PCF shadow sampler, including a probe before the first
// main-view render. Renderer mocks cannot detect texture/sampler mismatches.
const root = fileURLToPath(new URL('../', import.meta.url));
const cacheDir = fileURLToPath(new URL('../../.runtime/reflections-vite/', import.meta.url));
const vite = await createServer({ configFile: false, root, cacheDir, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/reflection-test.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Reflection WebGL regression</title>' }));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/reflection-test.html`);
  const result = await page.evaluate(async () => {
    const { createStorefrontReflections } = await import('/src/reflections.js');
    const threeUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => /\/three\.js\?/.test(url));
    if (!threeUrl) throw new Error('The running Vite Three.js module was not observed');
    const THREE = await import(threeUrl);
    const renderer = new THREE.WebGLRenderer(); renderer.setSize(128, 128);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 2, 5); camera.lookAt(0, 0, 0);
    const gl = renderer.getContext(), runs = [];
    try {
      // Reuse the renderer with fresh scene resources, as a district reload does.
      for (let reload = 0; reload < 2; reload++) {
        const scene = new THREE.Scene(), light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(1, 3, 2); light.castShadow = true; scene.add(light);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
        mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
        const pane = new THREE.MeshStandardMaterial(), position = new THREE.Vector3(0, 1, 3);
        const probe = createStorefrontReflections({ renderer, scene, materials: [pane], excluded: [] });
        const run = { errors: [], beforeShadow: Boolean(light.shadow.map) };
        try {
          for (let face = 0; face < 6; face++) {
            probe.update(face * 17, position); run.errors.push(gl.getError());
          }
          run.earlyCaptures = probe.stats.captures;
          renderer.render(scene, camera); run.errors.push(gl.getError());
          run.afterShadow = Boolean(light.shadow.map?.depthTexture);
          for (let face = 0; face < 6; face++) {
            probe.update(100 + face * 17, position); run.errors.push(gl.getError());
          }
          Object.assign(run, { captures: probe.stats.captures, failed: probe.stats.failed, published: Boolean(pane.envMap) });
          runs.push(run);
        } finally {
          probe.dispose(); pane.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); light.dispose();
        }
      }
      return runs;
    } finally { renderer.dispose(); renderer.forceContextLoss(); }
  });
  assert.deepEqual(errors, []);
  for (const run of result) {
    assert.ok(run.errors.every(error => error === 0), `WebGL errors: ${run.errors}`);
    assert.equal(run.beforeShadow, false); assert.equal(run.earlyCaptures, 0);
    assert.equal(run.afterShadow, true); assert.equal(run.captures, 1);
    assert.equal(run.failed, false); assert.equal(run.published, true);
  }
  console.log('Reflection startup and scene reload: real PCF shadows, complete captures, no WebGL errors.');
} finally { await browser?.close(); await vite.close(); }
