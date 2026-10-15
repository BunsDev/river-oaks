// Axe & Darts views for design review: node preview/e2e/axe-venue-views.mjs
// The game itself with real materials on this machine's GPU (Metal ANGLE on macOS). alice
// steps into the venue, practises in lane 1 so axes stick in its target, and bob waits in
// lane 2. alice's page frames four poses through the DEV-only render-audit camera: the new
// storefront from the street, the room from its door, down the lanes, and the darts
// corner. Writes docs/design/axe-and-darts/V*.png and receipt.json. Not physical-device,
// human or final-art acceptance.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const OUT = 'docs/design/axe-and-darts', FOV = 62, VIEWPORT = { width: 1440, height: 900 };
// [a, h, d] in the venue's room frame, h above its floor.
const VIEWS = [
  { id: 'V1-storefront', eye: [-1.2, 1.7, -4], target: [0, 2.4, 1], page: 'bob' },
  { id: 'V2-from-the-door', eye: [-.2, 1.65, .6], target: [.8, 1.4, 9.6], page: 'bob' },
  { id: 'V3-lanes', eye: [3.55, 1.75, 3.6], target: [3.4, 1.4, 9.7], page: 'bob' },
  { id: 'V4-darts-corner', eye: [-1.2, 1.65, 5.2], target: [-2.6, 1.7, 9.6], page: 'bob' },
];
const release = await holdBrowserLock('Axe and darts venue GPU views');
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture();
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : [] });
  const errors = [];
  const open = async identity => {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(`${identity}: ${error.message}`));
    await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 120000 });
    await page.evaluate(() => document.querySelector('[data-quality="sharp"]').click());
    return page;
  };
  const pages = { alice: await open('alice'), bob: await open('bob') };
  const { openHudSpace } = await import('./hud-navigation.js');
  const room = await pages.alice.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.storeId === 'venue:axe-and-darts');
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  const world = (a, d) => [room.facade[0] + room.right[0] * a + room.inward[0] * d, room.facade[1] + room.right[1] * a + room.inward[1] * d];
  const three = ([a, h, d]) => { const [x, n] = world(a, d); return [x, room.floor + h, -n]; };
  async function enter(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'Axe & Darts' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'venue:axe-and-darts');
    await page.locator('#panel-toggle').click();
  }
  async function walk(page, path) {
    for (const [a, d] of path) {
      const target = world(a, d), deadline = Date.now() + 90000;
      await page.locator('#canvas-host').focus();
      let distance = Infinity;
      while (Date.now() < deadline) {
        const p = await page.evaluate(() => window.__riverCarriage().pose);
        distance = Math.hypot(p.position[0] - target[0], -p.position[2] - target[1]);
        if (distance <= .16) break;
        await page.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), target);
        await page.keyboard.down('KeyW'); await page.waitForTimeout(Math.min(120, Math.max(20, distance * 100))); await page.keyboard.up('KeyW');
      }
      if (distance > .16) throw new Error(`could not reach ${a}, ${d}`);
    }
  }
  await Promise.all([enter(pages.alice), enter(pages.bob)]);
  await Promise.all([walk(pages.alice, [[2.55, 3.6], [2.55, 5.4]]), walk(pages.bob, [[4.55, 3.6], [4.3, 5.0]])]);
  await pages.alice.locator('#canvas-host').focus(); await pages.alice.keyboard.press('KeyX');
  await pages.alice.waitForFunction(() => window.__riverAxes()?.open);
  await pages.alice.locator('#axe-panel [data-axe-shared="practice"]').click();
  for (const [x, y] of [[0, 0], [120, -60], [-90, 140]]) {
    const before = await pages.alice.evaluate(() => window.__riverAxes().lane?.throws.length ?? 0);
    await pages.alice.evaluate(mm => window.__riverAxes().holdAt(mm), x); await pages.alice.locator('#axe-panel [data-axe-action="throw"]').click();
    await pages.alice.evaluate(mm => window.__riverAxes().holdAt(mm), y); await pages.alice.locator('#axe-panel [data-axe-action="throw"]').click();
    await pages.alice.waitForFunction(n => (window.__riverAxes().lane?.throws.length ?? 0) > n, before);
  }
  await pages.alice.keyboard.press('Escape');
  for (const page of Object.values(pages)) await page.evaluate(() => { document.body.classList.add('clear-view'); const style = document.createElement('style'); style.textContent = '#axe-panel,.darts-panel,.nearby-greetings{visibility:hidden!important}'; document.head.append(style); });
  const captures = [];
  for (const view of VIEWS) {
    const page = pages[view.page];
    await page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(view.eye), three(view.target), FOV]);
    await page.waitForTimeout(1500);
    await page.evaluate(() => new Promise(done => { let n = 0; const step = () => (++n > 10 ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }));
    const file = `${OUT}/${view.id}.png`, png = await page.screenshot({ path: file });
    await page.evaluate(() => window.__riverRenderAudit.release());
    const stats = await page.evaluate(() => { const g = window.__riverRenderAudit.graphics(); const a = window.__riverAxes(); return { calls: g.render.calls, triangles: g.render.triangles, stuck: a.stuck }; });
    captures.push({ ...view, file, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), ...stats });
  }
  const graphics = await pages.bob.evaluate(() => window.__riverRenderAudit.graphics());
  const dirty = execFileSync('git', ['diff', 'HEAD', '--binary']);
  const receipt = {
    venue: 'venue:axe-and-darts', runner: 'node preview/e2e/axe-venue-views.mjs', capturedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), dirtyPatchSha256: dirty.length ? createHash('sha256').update(dirty).digest('hex') : null,
    browser: await browser.version(), renderer: graphics.renderer, viewport: [VIEWPORT.width, VIEWPORT.height], pixelRatio: 1, quality: 'sharp', fov: FOV,
    frame: 'eye and target are [a, h, d] in the venue room frame (a across from the door, d inward), h above its floor',
    scene: { alice: 'practised three axes in lane 1 against the house', bob: 'standing in lane 2; frames are from his page so alice shows' },
    limits: 'Local macOS Chromium with Metal ANGLE under shared load; graybox-level fictional venue art; not physical-device, human or final-art acceptance.',
    errors, captures,
  };
  await writeFile(`${OUT}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify(captures.map(({ id, calls, triangles, stuck }) => ({ id, calls, triangles, stuck }))));
} finally { await browser?.close(); await fixture?.close(); release(); }
