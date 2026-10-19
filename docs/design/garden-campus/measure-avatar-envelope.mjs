// Standing and seated bounds for every current shared appearance (human-only
// catalog since #496), from the real rigs, for the #506 campus clearances.
// Run from the repo root under the browser lock:
//   node scripts/browser-lock.mjs campus-envelope -- node docs/design/garden-campus/measure-avatar-envelope.mjs > docs/design/garden-campus/avatar-envelope.json
// Method as docs/level-design/workplace-coworking-fixture/avatar-envelope.json:
// the appearance fixture's rest-pose Box3, then the game's seat path for 3 s.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startBrowserFixture } from '../../../preview/e2e/fixture-server.js';
import { SHARED_APPEARANCES } from '../../../preview/src/shared-appearances.js';

const SEAT = 0.45;
const looks = SHARED_APPEARANCES.map(look => look.id);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const fixture = await startBrowserFixture();
const out = {};
try {
  for (const look of looks) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
    const page = await context.newPage();
    await page.goto(`${fixture.origin}/e2e/fixtures/appearance.html?look=${look}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120000 });
    out[look] = await page.evaluate(async seat => {
      const { avatar } = window.lookFixture;
      const standing = window.lookFixture.render('front').bounds;
      for (let t = 0; t <= 3; t += 1 / 30) avatar.update(t, 'continue', false, { speed: 0, distance: 0, riding: true, ridingKind: 'seat', seatToFloor: seat }, () => 0);
      const object = avatar.object;object.updateMatrixWorld(true);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      object.traverse(node => {
        if (!node.isMesh || !node.visible) return;
        const position = node.geometry.attributes.position;if (!position) return;
        const v = node.position.clone();
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i);
          if (node.isSkinnedMesh) node.applyBoneTransform(i, v);
          v.applyMatrix4(node.matrixWorld);
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v.getComponent(k));max[k] = Math.max(max[k], v.getComponent(k)); }
        }
      });
      return { widthM: standing[0], heightM: standing[1], depthM: standing[2], turningRadiusM: +Math.hypot(standing[0] / 2, standing[2] / 2).toFixed(3),
        seated: { footprintRadiusM: +Math.hypot(Math.max(Math.abs(min[0]), Math.abs(max[0])), Math.max(Math.abs(min[2]), Math.abs(max[2]))).toFixed(3), widthM: +(max[0] - min[0]).toFixed(2), depthM: +(max[2] - min[2]).toFixed(2) } };
    }, SEAT);
    await context.close();
  }
  const top = (key, pick) => { const [look, value] = Object.entries(out).sort((a, b) => pick(b[1]) - pick(a[1]))[0];return { look, [key]: pick(value) }; };
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ measured: new Date().toISOString().slice(0, 10), revision, catalog: 'SHARED_APPEARANCES (human-only, #496)', seatHeightM: SEAT,
    method: "preview/e2e/fixtures/appearance.html?look=<id>: lookFixture.render('front').bounds (rest-pose Box3, metres); seated via the game's seat path for 3 s, skinned vertex bounds; Chromium with Metal ANGLE on macOS",
    limits: 'Rest-pose static bounds; cloth and walking-cycle swing are not included. Seated height is not measured.',
    widestBody: top('widthM', v => v.widthM), widestTurning: top('radiusM', v => v.turningRadiusM), tallest: top('heightM', v => v.heightM), widestSeated: top('footprintRadiusM', v => v.seated.footprintRadiusM), looks: out }, null, 2));
} finally { await fixture.close();await browser.close(); }
