// Standing and seated bounds for every current shared appearance (human-only
// catalog since #496), from the real rigs, for the #506 campus clearances.
// Run from the repo root under the browser lock:
//   node scripts/browser-lock.mjs campus-envelope -- node docs/design/garden-campus/measure-avatar-envelope.mjs > docs/design/garden-campus/avatar-envelope.json
// Method as docs/level-design/workplace-coworking-fixture/avatar-envelope.json:
// the appearance fixture's rest-pose Box3, then the game's seat path for 3 s.
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {captureProvenance} from '../../../scripts/character-fidelity-evidence.mjs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startBrowserFixture } from '../../../preview/e2e/fixture-server.js';
import { SHARED_APPEARANCES } from '../../../preview/src/shared-appearances.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const provenance = await captureProvenance(root);
const measurementSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const SEAT = 0.45;
const looks = SHARED_APPEARANCES.map(look => look.id);
let browser, fixture;
const out = {};
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  fixture = await startBrowserFixture();
  for (const look of looks) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
    const page = await context.newPage();
    await page.goto(`${fixture.origin}/e2e/fixtures/appearance.html?look=${look}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120000 });
    out[look] = await page.evaluate(async seat => {
      const { avatar } = window.lookFixture;
      const bounds = () => {
        const object = avatar.object; object.updateMatrixWorld(true);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        object.traverseVisible(node => {
          if (!node.isMesh) return;
          const position = node.geometry.attributes.position; if (!position) return;
          const v = node.position.clone();
          for (let i = 0; i < position.count; i++) {
            node.getVertexPosition(i, v).applyMatrix4(node.matrixWorld);
            for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v.getComponent(k)); max[k] = Math.max(max[k], v.getComponent(k)); }
          }
        });
        if (![...min, ...max].every(Number.isFinite)) throw new Error('Missing finite avatar bounds');
        return {min, max};
      };
      // Round outward so the receipt never hides a small clearance violation.
      const outward = value => Math.ceil(Math.max(0, value) * 1e6) / 1e6;
      const radius = ({min, max}) => outward(Math.hypot(Math.max(Math.abs(min[0]), Math.abs(max[0])), Math.max(Math.abs(min[2]), Math.abs(max[2]))));
      window.lookFixture.render('front');
      const standing = bounds();
      for (let t = 0; t <= 3; t += 1 / 30) avatar.update(t * 1000, 'continue', false, {speed:0, distance:0, riding:true, ridingKind:'seat', seatToFloor:seat}, () => 0);
      const seated = bounds();
      return {widthM:outward(standing.max[0]-standing.min[0]), heightM:outward(standing.max[1]-standing.min[1]), depthM:outward(standing.max[2]-standing.min[2]), turningRadiusM:radius(standing),
        seated:{footprintRadiusM:radius(seated), widthM:outward(seated.max[0]-seated.min[0]), depthM:outward(seated.max[2]-seated.min[2]),
          left:outward(-seated.min[0]), right:outward(seated.max[0]), front:outward(seated.max[2]), back:outward(-seated.min[2])}};
    }, SEAT);
    await context.close();
  }
  const top = (key, pick) => { const [look, value] = Object.entries(out).sort((a, b) => pick(b[1]) - pick(a[1]))[0];return { look, [key]: pick(value) }; };
  if ((await captureProvenance(root)).sha256 !== provenance.sha256) throw new Error('Source or assets changed during envelope measurement');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ provenance: {...provenance, measurementSha256}, measured: new Date().toISOString().slice(0, 10), revision, catalog: 'SHARED_APPEARANCES (human-only, #496)', seatHeightM: SEAT,
    method: "preview/e2e/fixtures/appearance.html?look=<id>: lookFixture.render('front') then visible morph-aware vertex bounds in metres; seated via the game's seat path for 3 s with millisecond clock, visible morph-aware skinned vertex bounds; Chromium with Metal ANGLE on macOS",
    limits: 'Standing and settled seated poses only; continuous walking/cloth swing is not included. Seated height is not measured. Avatar is unrotated: +X right, +Z front. Extents are rounded outward to one micrometre.',
    widestBody: top('widthM', v => v.widthM), widestTurning: top('radiusM', v => v.turningRadiusM), tallest: top('heightM', v => v.heightM), widestSeated: top('footprintRadiusM', v => v.seated.footprintRadiusM), looks: out }, null, 2));
} finally { await fixture?.close();await browser?.close(); }
