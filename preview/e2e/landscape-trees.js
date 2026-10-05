import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../output/playwright/', import.meta.url));
await mkdir(output, { recursive: true });
const vite = await createServer({ configFile: false, root, cacheDir: `${root}../.runtime/tree-check-vite`, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const reports = {};
  for (const mode of process.env.RIVER_OAKS_TREE_BASELINE === 'true' ? ['before', 'after'] : ['after']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/tree-test.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}</style><title>Tree visual regression</title>' }));
    if (mode === 'before') await page.route('**/src/landscape-models.js', async route => {
      const transformed = await (await route.fetch()).text();
      let body = await readFile(`${output}tree-baseline/landscape-models.js`, 'utf8');
      // Use Vite's resolved imports when serving the preserved baseline module.
      const imports = [...transformed.matchAll(/from ["']([^"']+)["']/g)].map(match => match[1]);
      body = body.replace("'three'", JSON.stringify(imports.find(url => /\/three\.js\?/.test(url))))
        .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(imports.find(url => /GLTFLoader/.test(url))));
      await route.fulfill({ contentType: 'application/javascript', body });
    });
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/tree-test.html`);
    await page.evaluate(async () => {
      const { buildMatureTrees, castShadowsFromProxies } = await import('/src/landscape-models.js');
      const url = performance.getEntriesByType('resource').map(entry => entry.name).find(url => /\/three\.js\?/.test(url));
      const THREE = await import(url);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1000, 800); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#a8c2cf');
      scene.add(new THREE.HemisphereLight('#dceeff', '#776e4a', 2));
      const sun = new THREE.DirectionalLight('#ffefcf', 3); sun.position.set(-15, 30, 20); sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 });
      sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#9b9f78', roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      const world = { vegetation: { voxels: [], branch_supports: [-9, 0, 9].map(x => ({ position: [x, 0], height_m: 13, radius_m: 3.5 })) } };
      const trees = buildMatureTrees(world); await trees.userData.ready; scene.add(trees);
      if (trees.children.length === 0) throw new Error('Tree assets did not load');
      const shadows = castShadowsFromProxies(sun, () => trees.userData.shadowProxies);
      const camera = new THREE.PerspectiveCamera(42, 1.25, 0.1, 200); camera.position.set(17, 10, 31); camera.lookAt(0, 6, 0);
      window.treeFixture = { THREE, renderer, scene, camera, trees, shadows };
    });
    const levels = [];
    for (const distance of [0, 40, 100]) {
      const stats = await page.evaluate(distance => {
        const { THREE, renderer, scene, camera, trees, shadows } = window.treeFixture;
        trees.userData.update(new THREE.Vector3(0, 0, distance)); shadows.hide(); renderer.render(scene, camera); shadows.hide();
        const visible = trees.children.filter(mesh => mesh.visible);
        return { treeCount: trees.userData.treeCount, visibleMeshes: visible.length,
          geometryTriangles: visible.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0),
          shadowsHidden: trees.userData.shadowProxies.every(mesh => !mesh.visible),
          webglError: renderer.getContext().getError(), calls: renderer.info.render.calls };
      }, distance);
      levels.push(stats);
      await page.screenshot({ path: `${output}trees-${mode}-${distance}.png` });
    }
    assert.deepEqual(errors, []);
    for (const level of levels) {
      assert.equal(level.treeCount, 3); assert.equal(level.visibleMeshes, mode === 'before' ? 6 : 4);
      assert.equal(level.shadowsHidden, true); assert.equal(level.webglError, 0);
    }
    assert.ok(levels[0].geometryTriangles > levels[1].geometryTriangles && levels[1].geometryTriangles > levels[2].geometryTriangles);
    reports[mode] = levels; await page.close();
  }
  if (reports.before) for (let index = 0; index < 3; index++) assert.ok(reports.after[index].geometryTriangles < reports.before[index].geometryTriangles);
  await writeFile(`${output}tree-render-check.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser?.close(); await vite.close(); }
