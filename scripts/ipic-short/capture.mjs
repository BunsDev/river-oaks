// The #365 short's capture (candidate 1 was approved as cut by Val on 2026-10-15). Its output stays
// outside the repository; cut.mjs makes the delivery files, and a new cut needs approval again.
// Records the owner page on real-GPU headless Chromium (Metal ANGLE) with real materials while a
// scripted visit runs. Each shot's window is logged on the recording clock; cut.mjs turns the log
// into the delivery formats. Camera framing in IPIC uses the DEV-only render-audit camera, as
// preview/e2e/ipic-photo-views.mjs does. Synthetic fixture identities; the default office layout.
//   node <this file> <worktree> <out-dir>
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const [worktree, outDir] = process.argv.slice(2).map(p => resolve(p));
const load = path => import(pathToFileURL(join(worktree, path)).href);
const { chromium } = await import(pathToFileURL(join(worktree, 'node_modules/playwright/index.mjs')).href);
const { startBrowserFixture } = await load('preview/e2e/fixture-server.js');
const { holdBrowserLock } = await load('scripts/browser-lock.mjs');
const { openHudSpace } = await load('preview/e2e/hud-navigation.js');
const { IPIC_CAMERAS } = await load('preview/src/ipic-plan.js');
const SEAT = 'bench:ipic-recliner-1-1', FOV = 67, IPIC = 'osm-node-8172494964';
const HIDE = '#ipic-screening,.hardware-acceleration-warning,.office-visit>header,.office-help,.office-pad,#office-seat,#office-level,#office-desk-nearby,.office-journey,'
  + '.visit-tools,#panel-toggle,#people-toggle,#settings-toggle,.commands-toggle,.town-chat-dock,.walking-console,.walking-title,.hud-launcher,.multiplayer-roster,.nearby-greetings,.community-dialogue,.asset-progress,#office-nearby,.remote-player-labels{visibility:hidden!important}';

await mkdir(outDir, { recursive: true });
process.chdir(worktree);
const release = await holdBrowserLock('IPIC short candidate capture (#365)');
let fixture, browser;
const shots = [], errors = [];
let lookTarget = null, exitPose = null;
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_SCREENING_HOSTS: 'ipic:alice' } });
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const open = async (identity, record) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...(record ? { recordVideo: { dir: outDir, size: { width: 1280, height: 720 } } } : {}) });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(`${identity}: ${error.message}`));
    return page;
  };
  const owner = await open('owner', true), started = Date.now(), alice = await open('alice', false);
  const shot = async (id, caption, run) => { const start = (Date.now() - started) / 1000; await run(); shots.push({ id, caption, start, end: (Date.now() - started) / 1000 }); };
  const hide = (page, on) => page.evaluate(([css, on]) => {
    let style = document.querySelector('#short-hide'); if (!style) { style = document.createElement('style'); style.id = 'short-hide'; style.textContent = css; document.head.append(style); }
    style.disabled = !on; document.body.classList.toggle('clear-view', on);
  }, [HIDE, on]);
  for (const page of [owner, alice]) {
    await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && document.querySelectorAll('#destination option').length > 1, null, { timeout: 300000 });
    await page.evaluate(() => document.querySelector('[data-quality="sharp"]')?.click());
  }
  // Room frame [a, h, d] to Three.js, as preview/e2e/ipic-photo-views.mjs.
  const plan = await alice.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.interior === 'ipic-photo-v1');
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  const world = (a, d) => [plan.facade[0] + plan.right[0] * a + plan.inward[0] * d, plan.facade[1] + plan.right[1] * a + plan.inward[1] * d];
  const three = ([a, h, d]) => { const [x, n] = world(a, d); return [x, plan.floor + h, -n]; };
  const frame = (page, name) => { const c = IPIC_CAMERAS.find(item => item.name === name); return page.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(c.eye), three(c.target), FOV]); };
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
  async function enterIpic(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside === id, IPIC);
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  }

  // Alice goes ahead to the middle row's centre recliner; the screen stays idle (no fixture on screen).
  await enterIpic(alice);
  await walk(alice, [[-1.4, 4.8], [-1.4, 20.7], [-1.4, 24.5], [-4.85, 24.5], [-4.85, 26.7], [-11.25, 26.7], [-11.25, 29]]);
  await alice.locator('#nearby-seat').selectOption(`${SEAT}:0`); await alice.locator('#seat-sit').click();
  await alice.waitForFunction(seat => window.__riverCarriage().pose.sitting?.buildId === seat, SEAT);

  await owner.locator('#office-lobby').evaluate(button => button.click());
  await owner.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false, null, { timeout: 180000 });
  await hide(owner, true); await owner.waitForTimeout(2500);
  await shot('street', 'Westheimer Road, River Oaks.', () => owner.waitForTimeout(6000));
  await shot('arrival', 'Jevica’s office, by invitation.', async () => {
    await owner.locator('#canvas-host').focus(); await owner.keyboard.press('KeyF');
    await owner.waitForFunction(() => document.querySelector('#office-visit')?.dataset.phase === 'office', null, { timeout: 180000 });
    await owner.waitForTimeout(1500);
  });
  // Drag-to-look (0.004 rad a pixel): a quick turn to the window, then a slow pan across to the desks.
  await shot('office', 'Room for good work.', async () => {
    let x = 640;
    const drag = async (px, ms) => { const steps = Math.max(1, Math.round(ms / 40)), from = x; for (let i = 1; i <= steps; i++) { x = from + px * i / steps; await owner.mouse.move(x, 360); await owner.waitForTimeout(ms / steps); } };
    lookTarget = await owner.evaluate(() => { const e = document.elementFromPoint(640, 360); return `${e?.tagName}#${e?.id}.${e?.className}`; });
    await owner.mouse.move(x, 360); await owner.mouse.down();
    await drag(214, 300); await owner.waitForTimeout(1200); await drag(-560, 5000); await owner.waitForTimeout(1500);
    await owner.mouse.up();
  });
  await shot('desk', 'A scene idea, saved privately.', async () => {
    await owner.locator('#office-desk-open').evaluate(button => button.click()); await owner.locator('#desk-loading').waitFor({ state: 'hidden' });
    await owner.locator('#desk-scene').click();
    await owner.locator('#desk-notes').pressSequentially('Two friends meet at the theatre.\nThe lights go down.\nThey watch the same film together.', { delay: 30 });
    await owner.waitForFunction(() => document.querySelector('#desk-save-status')?.textContent === 'All changes saved', null, { timeout: 30000 });
    await owner.waitForTimeout(1500);
  });
  await owner.locator('#desk-close').click();
  await owner.locator('#office-exit').evaluate(button => button.click());
  await owner.waitForFunction(() => !document.querySelector('#office-visit').open);
  await hide(owner, false); await enterIpic(owner); await hide(owner, true);
  await shot('reception', 'Then out, to meet a friend at IPIC.', async () => { await frame(owner, 'reception'); await owner.waitForTimeout(6000); });
  await shot('lounge', 'Past the lounge.', async () => { await frame(owner, 'lounge'); await owner.waitForTimeout(5000); });
  await shot('auditorium', 'Two seats, one screen.', async () => { await frame(owner, 'auditorium'); await owner.waitForTimeout(6500); });
  await owner.evaluate(() => window.__riverRenderAudit.release());
  await shot('return', 'Then back to the street.', async () => {
    await owner.locator('#canvas-host').focus(); await owner.keyboard.press('KeyF');
    await owner.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside !== id, IPIC, { timeout: 30000 });
    // Walk away from the IPIC door, out toward the street.
    exitPose = await owner.evaluate(() => window.__riverCarriage().pose.position);
    await owner.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), [exitPose[0] - plan.inward[0] * 20, -exitPose[2] - plan.inward[1] * 20]);
    await owner.waitForTimeout(1000); await owner.locator('#canvas-host').focus();
    await owner.keyboard.down('KeyW'); await owner.waitForTimeout(3500); await owner.keyboard.up('KeyW'); await owner.waitForTimeout(2000);
  });
  const renderer = await owner.evaluate(() => window.__riverRenderAudit.graphics().renderer);
  const video = owner.video();
  await owner.context().close();
  await video.saveAs(join(outDir, 'raw.webm'));
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  await writeFile(join(outDir, 'shots.json'), JSON.stringify({ shots, errors, lookTarget, exitPose, sourceCommit: head, browser: await browser.version(), renderer, recordedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ shots: shots.map(s => [s.id, (s.end - s.start).toFixed(1)]), errors }));
} finally { await browser?.close(); await fixture?.close(); release(); }
