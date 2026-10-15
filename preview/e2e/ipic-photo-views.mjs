// IPIC runtime photo views (#364: T1–T3, the five photo-indexed views): node preview/e2e/ipic-photo-views.mjs
// The game itself with real materials on this machine's GPU (Metal ANGLE on macOS) and two
// loopback fixture accounts. alice holds a synthetic IPIC host grant, sits in a front-row
// recliner and starts the fixture film; owner stands at the Tuck Room bar. Each IPIC_CAMERAS
// pose (FOV 67, as preview/e2e/fixtures/ipic.js) is framed through the DEV-only render-audit
// camera from the page whose player is not the subject (a player's own avatar is hidden in
// first person): the auditorium from owner's page, so seated alice shows, and the rest from
// alice's, so owner shows at the bar; plus alice's own seated eye on the screen. The
// screening panel and HUD are hidden for the frames. Writes the frames and a receipt
// to docs/design/office-ipic/captures/. Not physical-device, human, final-art or final-media acceptance.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { IPIC_CAMERAS } from '../src/ipic-plan.js';

const OUT = 'docs/design/office-ipic/captures', FOV = 67, VIEWPORT = { width: 1440, height: 900 };
const IDS = { reception: 'T1-reception', mural: 'T2a-mural', lounge: 'T2b-lounge', bar: 'T2c-bar', auditorium: 'T3-auditorium' };
const SEAT = 'bench:ipic-recliner-1-1';
const release = await holdBrowserLock('IPIC runtime photo views');
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_SCREENING_HOSTS: 'ipic:alice' } });
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
  const [alice, owner] = [await open('alice'), await open('owner')];
  const { openHudSpace } = await import('./hud-navigation.js');
  const plan = await alice.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.interior === 'ipic-photo-v1');
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  const world = (a, d) => [plan.facade[0] + plan.right[0] * a + plan.inward[0] * d, plan.facade[1] + plan.right[1] * a + plan.inward[1] * d];
  // Room frame [a, h, d] (h above the street floor) to Three.js [east, up, -north].
  const three = ([a, h, d]) => { const [x, n] = world(a, d); return [x, plan.floor + h, -n]; };
  async function enter(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'osm-node-8172494964');
    await page.locator('#panel-toggle').click();
  }
  // The same keyboard walk as preview/e2e/ipic-visit.js.
  async function walk(page, path) {
    for (const [a, d] of path) {
      const target = world(a, d), deadline = Date.now() + 120000;
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
  await Promise.all([enter(alice), enter(owner)]);
  await Promise.all([
    walk(alice, [[-1.4, 4.8], [-1.4, 20.7], [-5.55, 20.7], [-5.55, 24.7], [-4.85, 24.7], [-4.85, 29.65], [-1.6, 29.65]]),
    walk(owner, [[1.4, 4.8], [1.4, 20.7], [2.3, 22.2]]),
  ]);
  await alice.locator('#nearby-seat').selectOption(`${SEAT}:0`);
  await alice.locator('#seat-sit').click();
  await alice.waitForFunction(seat => window.__riverCarriage().pose.sitting?.buildId === seat, SEAT);
  await alice.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  await alice.locator('#ipic-screening [data-control="host-start"]').click();
  await alice.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > 1, null, { timeout: 30000 });
  const hideUi = page => page.evaluate(() => { document.body.classList.add('clear-view'); const style = document.createElement('style'); style.id = 'photo-views-hide'; style.textContent = '#ipic-screening{visibility:hidden!important}'; document.head.append(style); });
  await Promise.all([alice, owner].map(hideUi));
  await owner.waitForFunction(() => window.__riverScreening?.()?.state === 'playing', null, { timeout: 30000 });

  const seat = await alice.evaluate(() => window.__riverCarriage().pose);
  const views = [
    ...['auditorium', 'bar', 'lounge', 'reception', 'mural'].map(name => { const c = IPIC_CAMERAS.find(item => item.name === name); return { id: IDS[name], camera: name, eye: c.eye, target: c.target, photo: `assets/ipic/references/${c.photo}`, page: name === 'auditorium' ? 'owner' : 'alice' }; }),
    // alice's own seated eye (cushion + 0.69 m, store-encounters.js) on the screen centre.
    { id: 'T3-seated', camera: 'recliner-1-1 seated eye', eye: [-.6, 6 + .53 + .69, 31], target: [.3, 6 + 2.5, 33.79], photo: 'assets/ipic/references/IMG_9767.jpg', page: 'alice' },
  ];
  const captures = [];
  for (const view of views) {
    const page = view.page === 'owner' ? owner : alice;
    await page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(view.eye), three(view.target), FOV]);
    await page.waitForTimeout(1500);
    await page.evaluate(() => new Promise(done => { let n = 0; const step = () => (++n > 10 ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }));
    const file = `${OUT}/${view.id}.png`, png = await page.screenshot({ path: file });
    await page.evaluate(() => window.__riverRenderAudit.release());
    const stats = await page.evaluate(() => { const g = window.__riverRenderAudit.graphics(); const s = window.__riverScreening(); return { calls: g.render.calls, triangles: g.render.triangles, film: { state: s.state, currentTime: +s.currentTime.toFixed(2), shared: s.sharedStatus } }; });
    captures.push({ ...view, file, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), ...stats });
  }
  await Promise.all([alice, owner].map(page => page.evaluate(() => { document.body.classList.remove('clear-view'); document.querySelector('#photo-views-hide')?.remove(); })));
  const graphics = await alice.evaluate(() => window.__riverRenderAudit.graphics());
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  const dirty = execFileSync('git', ['diff', 'HEAD', '--binary']);
  const receipt = {
    packet: 'office-ipic', runner: 'node preview/e2e/ipic-photo-views.mjs', capturedAt: new Date().toISOString(),
    sourceRevision: head, dirtyPatchSha256: dirty.length ? createHash('sha256').update(dirty).digest('hex') : null,
    browser: await browser.version(), renderer: graphics.renderer, viewport: [VIEWPORT.width, VIEWPORT.height], pixelRatio: 1, quality: 'sharp',
    fov: FOV, frame: 'eye and target are [a, h, d] in the IPIC room frame, h above the street floor (camera-manifest.json frame)',
    scene: { alice: `${SEAT}:0 seated, synthetic host, fixture film playing`, owner: 'standing at the Tuck Room bar', seatPose: seat.position, framedFrom: Object.fromEntries(views.map(view => [view.id, view.page])) },
    limits: 'Local macOS Chromium with Metal ANGLE under shared load; fixture film (fixture-v1), not the approved short (#365); not physical-device, human or final-art acceptance.',
    errors, captures,
  };
  await writeFile(`${OUT}/ipic-runtime-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify(captures.map(({ id, calls, triangles, film }) => ({ id, calls, triangles, film }))));
} finally { await browser?.close(); await fixture?.close(); release(); }
