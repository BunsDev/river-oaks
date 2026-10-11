// Standing and seated bounds for every shared look, from the real rigs.
// Run from the repo root: node docs/superpowers/plans/2026-10-11-workplace-room-envelope/measure-envelope.mjs
// Seated uses the game's own seat path (riding, ridingKind 'seat') at the
// graybox seat height and lets the pose settle for 3 s of animation time.
import { readFile } from 'node:fs/promises';
import { startBrowserFixture } from '../../../../preview/e2e/fixture-server.js';
import { chromium } from 'playwright';
const SEAT = 0.45;
const looks = Object.keys(JSON.parse(await readFile(new URL('../../../level-design/workplace-coworking-fixture/avatar-envelope.json', import.meta.url))).looks);
const browser = await chromium.launch({headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist']});
const fixture = await startBrowserFixture();
const out = {};
try {
  for (const look of looks) {
    const page = await (await browser.newContext({viewport: {width: 800, height: 600}})).newPage();
    await page.goto(`${fixture.origin}/e2e/fixtures/appearance.html?look=${look}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {timeout: 120000});
    out[look] = await page.evaluate(async seat => {
      const {avatar} = window.lookFixture;
      // Standing size comes from the fixture's own Box3 of the rest pose.
      const standing = window.lookFixture.render('front').bounds;
      // Seat: drive the rig through the game's seated path until the pose settles.
      for (let t = 0; t <= 3; t += 1 / 30) avatar.update(t, 'continue', false, {speed: 0, distance: 0, riding: true, ridingKind: 'seat', seatToFloor: seat}, () => 0);
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
      const reach = Math.hypot(Math.max(Math.abs(min[0]), Math.abs(max[0])), Math.max(Math.abs(min[2]), Math.abs(max[2])));
      return {standing: {widthM: standing[0], heightM: standing[1], depthM: standing[2]},
        seated: {widthM: +(max[0] - min[0]).toFixed(2), heightM: +(max[1] - min[1]).toFixed(2), depthM: +(max[2] - min[2]).toFixed(2),
          frontM: +Math.max(Math.abs(min[2]), Math.abs(max[2])).toFixed(2), footprintRadiusM: +reach.toFixed(3)}};
    }, SEAT);
    await page.context().close();
  }
  const seated = Object.entries(out).sort((a, b) => b[1].seated.footprintRadiusM - a[1].seated.footprintRadiusM);
  const tallest = Object.entries(out).sort((a, b) => b[1].standing.heightM - a[1].standing.heightM)[0];
  console.log(JSON.stringify({measured: new Date().toISOString().slice(0, 10), seatHeightM: SEAT, looks: out,
    widestSeated: {look: seated[0][0], footprintRadiusM: seated[0][1].seated.footprintRadiusM}, tallest: {look: tallest[0], heightM: tallest[1].standing.heightM}}, null, 2));
} finally { await fixture.close();await browser.close(); }
