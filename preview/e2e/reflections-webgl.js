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
        mesh.castShadow = true; mesh.receiveShadow = true;
        const world = new THREE.Group(); world.add(mesh); scene.add(world);
        const pane = new THREE.MeshStandardMaterial(), position = new THREE.Vector3(0, 1, 3);
        const probe = createStorefrontReflections({ renderer, scene, materials: [pane],
          getExclusions: () => scene.children.filter(root => root !== world && !root.isLight) });
        const run = { errors: [], beforeShadow: Boolean(light.shadow.map), cubeDraws: 0, coldDraws: 0, excludedInEveryCapture: true };
        const render = renderer.render.bind(renderer);
        renderer.render = (subject, view) => {
          const capture = subject === scene && renderer.getRenderTarget()?.isWebGLCubeRenderTarget;
          const before = renderer.info.programs.length;
          if (capture && admitted) run.excludedInEveryCapture &&= !lateActor.visible && !lateGlass.visible;
          render(subject, view);
          if (capture) { run.cubeDraws++; if (renderer.info.programs.length !== before) run.coldDraws++; }
        };
        const lateMaterial = new THREE.MeshStandardMaterial({ flatShading: true, vertexColors: true });
        const lateGeometry = new THREE.BoxGeometry();
        lateGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(lateGeometry.attributes.position.count * 3).fill(.7), 3));
        const lateMesh = new THREE.Mesh(lateGeometry, lateMaterial), lateKind = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
        lateMesh.position.set(2, 0, 0); lateKind.position.set(-2, 0, 0);
        const lateActor = new THREE.Group(), actorMaterial = new THREE.MeshNormalMaterial({ wireframe: true });
        lateActor.add(new THREE.Mesh(mesh.geometry, actorMaterial));
        const glassMaterial = new THREE.MeshPhysicalMaterial({ transmission: .8 }), lateGlass = new THREE.Mesh(mesh.geometry, glassMaterial);
        let admitted = false;
        try {
          for (let face = 0; face < 6; face++) {
            probe.update(face * 17, position); run.errors.push(gl.getError());
          }
          run.earlyCaptures = probe.stats.captures;
          renderer.render(scene, camera); run.errors.push(gl.getError());
          run.afterShadow = Boolean(light.shadow.map?.depthTexture);
          // Shader preparation yields while the driver compiles. Drive the
          // same frame updates until the complete six-face cube is published.
          const deadline = performance.now() + 5000;
          while (!probe.stats.captures && !probe.stats.failed && performance.now() < deadline) {
            probe.update(performance.now(), position); run.errors.push(gl.getError());
            if (!admitted && run.cubeDraws === 1) {
              // Admit a new material and a new kind sharing the old material
              // after a face exists, without an explicit lighting invalidation.
              world.add(lateMesh, lateKind, lateGlass); scene.add(lateActor); admitted = true;
            }
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
          Object.assign(run, { captures: probe.stats.captures, failed: probe.stats.failed, published: Boolean(pane.envMap), admitted,
            actorCompiled: Boolean(renderer.properties.get(actorMaterial).programs?.size), glassCompiled: Boolean(renderer.properties.get(glassMaterial).programs?.size),
            actorRestored: lateActor.visible, glassRestored: lateGlass.visible });
          runs.push(run);
        } finally {
          renderer.render = render;
          probe.dispose(); pane.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); light.dispose();
          lateGeometry.dispose(); lateMaterial.dispose(); lateKind.dispose();
          actorMaterial.dispose(); glassMaterial.dispose();
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
    assert.equal(run.admitted, true); assert.equal(run.cubeDraws, 7, 'Late variants discard the first face and publish six fresh faces');
    assert.equal(run.coldDraws, 0, 'The real driver must receive every capture program before its draw');
    assert.equal(run.excludedInEveryCapture, true); assert.equal(run.actorCompiled, false); assert.equal(run.glassCompiled, false);
    assert.equal(run.actorRestored, true); assert.equal(run.glassRestored, true);
  }
  console.log('Reflection startup, late static variants and live actor/glass exclusions: real PCF shadows, complete captures, prepared draw programs, restored main visibility and no WebGL errors.');
} finally { await browser?.close(); await vite.close(); }
