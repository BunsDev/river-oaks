// Directional seated and standing extents for every shared look, from the real rigs.
// Run from the repo root under the browser lock:
//   node scripts/browser-lock.mjs 'seated extents' -- node docs/superpowers/plans/2026-10-15-ipic-route-evidence/measure-seated-extents.mjs
// The 2026-10-11 envelope (docs/level-design/workplace-coworking-fixture) kept only
// width, depth and a radius. A row of seats needs to know which way the depth goes:
// legs reach forward, tails reach back. Same fixture and seat path as that script
// (riding, ridingKind 'seat', seatToFloor 0.45, 3 s of animation); the avatar is
// unrotated, so local +Z is its front (preview/src/shared-seating.js).
import { readFile } from 'node:fs/promises';
import { startBrowserFixture } from '../../../../preview/e2e/fixture-server.js';
import { chromium } from 'playwright';
const SEAT = 0.45;
const { SHARED_APPEARANCES } = await import('../../../../preview/src/shared-appearances.js');
const looks = SHARED_APPEARANCES.map(item => item.id);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const fixture = await startBrowserFixture();
const out = {};
try {
  for (const look of looks) {
    const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
    await page.goto(`${fixture.origin}/e2e/fixtures/appearance.html?look=${look}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120000 });
    out[look] = await page.evaluate(async seat => {
      const { avatar } = window.lookFixture;
      const bounds = () => {
        const object = avatar.object; object.updateMatrixWorld(true);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        object.traverse(node => {
          if (!node.isMesh || !node.visible) return;
          const position = node.geometry.attributes.position; if (!position) return;
          const v = node.position.clone();
          for (let i = 0; i < position.count; i++) {
            v.fromBufferAttribute(position, i);
            if (node.isSkinnedMesh) node.applyBoneTransform(i, v);
            v.applyMatrix4(node.matrixWorld);
            for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v.getComponent(k)); max[k] = Math.max(max[k], v.getComponent(k)); }
          }
        });
        const r = n => +n.toFixed(3);
        return { left: r(-min[0]), right: r(max[0]), back: r(-min[2]), front: r(max[2]), top: r(max[1]), bottom: r(min[1]) };
      };
      window.lookFixture.render('front');
      const rotation = avatar.object.rotation.y;
      const standing = bounds();
      for (let t = 0; t <= 3; t += 1 / 30) avatar.update(t, 'continue', false, { speed: 0, distance: 0, riding: true, ridingKind: 'seat', seatToFloor: seat }, () => 0);
      return { rotation, standing, seated: bounds() };
    }, SEAT);
    await page.context().close();
  }
  const max = (pose, key) => Object.entries(out).reduce((best, [look, value]) => value[pose][key] > best.value ? { look, value: value[pose][key] } : best, { look: null, value: -Infinity });
  console.log(JSON.stringify({
    measured: new Date().toISOString(), seatToFloorM: SEAT, renderer: await browser.version(),
    frame: 'avatar local metres, unrotated: +X right, +Z front, +Y up; extents are distances from the avatar origin (the seat origin when seated)',
    looks: out,
    worst: Object.fromEntries(['standing', 'seated'].map(pose => [pose, Object.fromEntries(['left', 'right', 'back', 'front', 'top'].map(key => [key, max(pose, key)]))])),
  }, null, 2));
} finally { await fixture.close(); await browser.close(); }
