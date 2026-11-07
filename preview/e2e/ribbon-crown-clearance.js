// Pixel proof that no street-tree fragment is drawn in the main Ribbon spine's corridor (#740). The
// clearance works in the fragment shader, so a raycast cannot see it and a source check proves
// nothing. An orthographic camera looks along the walk through a box exactly as wide as the canopy
// and as high as its top: every pixel it draws is a tree in the corridor. It runs at each tree level
// of detail, in Chromium and WebKit, and the same trees without the clearance are the control.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ configFile: false, root, cacheDir: `${root}../.runtime/ribbon-crowns-vite`, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
const engines = (process.env.RIVER_OAKS_ENGINES ?? 'chromium,webkit').split(',');
let failed = false;
try {
  await vite.listen();
  for (const name of engines) {
    const browser = await ({ chromium, webkit })[name].launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 400 } }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/crowns-test.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Ribbon crowns</title><div id="canvas-host"></div>' }));
      await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/crowns-test.html`);
      const report = await page.evaluate(async () => {
        const { buildMatureTrees, matureTreePlacements } = await import('/src/landscape-models.js');
        const { validateVegetation } = await import('/src/vegetation.js');
        const { ribbonCrownClearance } = await import('/src/ribbon-crown-clearance.js');
        const { groundSurfaceHeight } = await import('/src/world-surface.js');
        const url = performance.getEntriesByType('resource').map(entry => entry.name).find(item => /\/three\.js\?/.test(item));
        const THREE = await import(url);
        const load = path => fetch(path).then(response => response.json());
        const district = await load('/data/district.json'), vegetation = await load('/data/district-vegetation.json');
        const world = { ...district, vegetation: validateVegetation(district, vegetation) }, clearance = ribbonCrownClearance(world);
        const placements = matureTreePlacements(world);
        const cleared = buildMatureTrees(world), control = buildMatureTrees({ ...world, scene: 'control' }, placements);
        await Promise.all([cleared.userData.ready, control.userData.ready]);
        if (!cleared.children.length || !control.children.length) throw new Error('Tree assets did not load');
        const renderer = new THREE.WebGLRenderer({ antialias: false }), target = new THREE.WebGLRenderTarget(180, 250);
        renderer.setClearColor(0x000000, 0);
        const pixels = new Uint8Array(180 * 250 * 4), STEP = 6, BACK = 8, half = 1.2 + 0.24;
        const drawn = (group, camera) => {
          const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight('#ffffff', 2));
          const parent = group.parent; scene.add(group);
          renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
          renderer.readRenderTargetPixels(target, 0, 0, 180, 250, pixels); renderer.setRenderTarget(null);
          if (parent) parent.add(group);
          let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
          return count;
        };
        const totals = { cleared: [0, 0, 0], control: [0, 0, 0], above: 0, aboveControl: 0, aboveByRun: [], aboveMismatch: [], beside: 0, boxes: 0, offenders: [] };
        const points = clearance.points;
        for (let r = 1; r < points.length; r++) {
          const from = points[r - 1], to = points[r], length = Math.hypot(to[0] - from[0], to[1] - from[1]), dir = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
          for (let at = 0; at < length; at += STEP) {
            const start = [from[0] + dir[0] * at, from[1] + dir[1] * at], end = at + STEP < length ? STEP : length - at, mid = [start[0] + dir[0] * end / 2, start[1] + dir[1] * end / 2];
            const ground = groundSurfaceHeight(world, mid[0], -mid[1]);
            const box = (bottom, top, width = half) => {
              const camera = new THREE.OrthographicCamera(-width, width, (top - bottom) / 2, -(top - bottom) / 2, BACK, BACK + end);
              camera.position.set(start[0] - dir[0] * BACK, ground + (top + bottom) / 2, -(start[1] - dir[1] * BACK));
              camera.lookAt(start[0], ground + (top + bottom) / 2, -start[1]); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
              return camera;
            };
            // The walk's ground varies, so stop just under the volume's fixed top.
            const walk = box(0.05, Math.min(4, clearance.top - ground - 0.01));
            totals.boxes++;
            // Near, middle and far levels: every tile near this box picks the same level from each.
            [0, 40, 100].forEach((off, level) => {
              const viewer = new THREE.Vector3(mid[0] - dir[1] * off, ground, -(mid[1] + dir[0] * off));
              cleared.userData.update(viewer); control.userData.update(viewer);
              const seen = drawn(cleared, walk);
              totals.cleared[level] += seen; totals.control[level] += drawn(control, walk);
              if (seen) totals.offenders.push({ start, level, seen });
            });
            cleared.userData.update(new THREE.Vector3(mid[0], ground, -mid[1]));
            // The clearance takes only the corridor: the crowns above it and the trees beside it stay.
            // Above the volume the clearance must take nothing at all, box by box, on every run.
            const overhead = box(clearance.top - ground + 0.02, clearance.top - ground + 3);
            control.userData.update(new THREE.Vector3(mid[0], ground, -mid[1]));
            const above = drawn(cleared, overhead), aboveControl = drawn(control, overhead);
            totals.above += above; totals.aboveControl += aboveControl;
            totals.aboveByRun[r - 1] = (totals.aboveByRun[r - 1] ?? 0) + above;
            if (above !== aboveControl) totals.aboveMismatch.push({ run: r - 1, start, above, aboveControl });
            totals.beside += drawn(cleared, box(0.05, 3, 4));
          }
        }
        return { top: clearance.top, halfWidth: clearance.halfWidth, renderer: renderer.getContext().getParameter(renderer.getContext().VERSION), ...totals };
      });
      assert.deepEqual(errors, []);
      console.log(name, JSON.stringify(report));
      assert.deepEqual(report.cleared, [0, 0, 0], `${name}: tree fragments in the corridor at a level of detail`);
      report.control.forEach((count, level) => assert.ok(count > 500, `${name}: control sees the trees at level ${level}: ${count} px`));
      assert.deepEqual(report.aboveMismatch, [], `${name}: the clearance took crown above the canopy top`);
      report.aboveByRun.forEach((count, run) => assert.ok(count > 500, `${name}: crowns above the canopy on run ${run}: ${count} px`));
      assert.ok(report.beside > 500, `${name}: trees beside the walk remain`);
      console.log(`✓ ${name}: 0 tree pixels in ${report.boxes} corridor boxes at all 3 levels; control ${report.control.join('/')} px`);
    } finally { await browser.close(); }
  }
} catch (error) { failed = true; console.error(error); } finally { await vite.close(); }
process.exit(failed ? 1 : 0);
