// The second short's capture (#501, "Two Seats, One Screen"). Its output stays outside the repository until
// Val approves the cut; second-cut.mjs makes the delivery files. Records a third page (the owner fixture,
// standing in the lounge, out of shot) on real-GPU headless Chromium (Metal ANGLE) while two
// synthetic fixture accounts sit side by side in the middle row: alice in recliner 1-1 (Maya), bob in recliner 1-0 (Theo).
// Both are seated from the same spot in the row's legroom, one after the other (the gaps between seats are narrower than a body).
// Shots are framed with the DEV-only render-audit camera, as preview/e2e/ipic-photo-views.mjs does. alice
// holds a synthetic IPIC host grant and starts the venue's default film for the "dim" shot.
//   node scripts/ipic-short/second-capture.mjs <worktree> <out-dir>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { takeProblems } from './shot-health.mjs';

const [worktree, outDir] = process.argv.slice(2).map(p => resolve(p));
const load = path => import(pathToFileURL(join(worktree, path)).href);
const { chromium } = await import(pathToFileURL(join(worktree, 'node_modules/playwright/index.mjs')).href);
const { startBrowserFixture } = await load('preview/e2e/fixture-server.js');
const { holdBrowserLock } = await load('scripts/browser-lock.mjs');
const { openHudSpace } = await load('preview/e2e/hud-navigation.js');
const { IPIC_AUDITORIUM_ROWS, IPIC_AUDITORIUM_SEAT_D, IPIC_CAMERAS, IPIC_SCREEN } = await load('preview/src/ipic-plan.js');
const script = JSON.parse(await readFile(join(worktree, 'scripts/ipic-short/second-short.json'), 'utf8'));
const IPIC = 'osm-node-8172494964';
const HIDE = '#ipic-screening,.hardware-acceleration-warning,.visit-tools,#panel-toggle,#people-toggle,#settings-toggle,.commands-toggle,.town-chat-dock,.walking-console,.walking-title,'
  + '.hud-launcher,.multiplayer-roster,.nearby-greetings,.community-dialogue,.asset-progress,.remote-player-labels,.store-intro{visibility:hidden!important}';
// Room-frame cameras [a, h, d] (h above the street floor; the upper floor is at 6 m). The friends sit side by side
// in the middle row (1-0 and 1-1); the close shots are set in the pair's own frame, [x to their right, h over their
// row's floor, z towards the screen], so they follow the room plan. Their offsets are the 2026-10-18 framings from
// the old auditorium, which faced along d; re-probe them in the wing before a new take.
const auditorium = IPIC_CAMERAS.find(item => item.name === 'auditorium'), row = IPIC_AUDITORIUM_ROWS[1];
const forward = IPIC_SCREEN.facing.map(v => -v || 0), right = [forward[1], -forward[0] || 0], centre = (IPIC_AUDITORIUM_SEAT_D[0] + IPIC_AUDITORIUM_SEAT_D[1]) / 2;
const pair = ([x, h, z]) => [row.a + right[0] * x + forward[0] * z, 6 + row.floor + h, centre + right[1] * x + forward[1] * z];
const CAMERAS = {
  auditorium: { eye: auditorium.eye, target: auditorium.target, fov: 62 },
  // From the sitters' right: the wing is 8 m deep, so the old two-shot from their left would stand outside its wall.
  'two-shot': { eye: pair([3.4, 1.35, 1.3]), target: pair([0, 1.0, 0]), fov: 46 },
  'over-shoulder': { eye: pair([0, 1.65, -1.6]), target: [IPIC_SCREEN.a, 6 + IPIC_SCREEN.y - 0.2, IPIC_SCREEN.d], fov: 58 },
  // From in front of the pair, tilted down (in the old room this kept the back wall's lettering out of shot).
  faces: { eye: pair([-0.5, 1.35, 2.25]), target: pair([0, 0.9, 0]), fov: 38 },
};

await mkdir(outDir, { recursive: true });
process.chdir(worktree);
const release = await holdBrowserLock('IPIC second short capture (#501)');
let fixture, browser;
const shots = [], errors = [];
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_SCREENING_HOSTS: 'ipic:alice' } });
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const open = async (identity, record) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...(record ? { recordVideo: { dir: outDir, size: { width: 1280, height: 720 } } } : {}) });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(`${identity}: ${error.message}`));
    return page;
  };
  const [maya, theo, camera] = [await open('alice', false), await open('bob', false), await open('owner', true)];
  const started = Date.now();
  for (const page of [maya, theo, camera]) {
    await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && document.querySelectorAll('#destination option').length > 1, null, { timeout: 300000 });
    await page.evaluate(() => document.querySelector('[data-quality="sharp"]')?.click());
  }
  const plan = await maya.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.interior === 'ipic-photo-v1');
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  const world = (a, d) => [plan.facade[0] + plan.right[0] * a + plan.inward[0] * d, plan.facade[1] + plan.right[1] * a + plan.inward[1] * d];
  const three = ([a, h, d]) => { const [x, n] = world(a, d); return [x, plan.floor + h, -n]; };
  async function enter(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside === id, IPIC);
    await page.locator('#panel-toggle').click();
    await page.evaluate(() => document.querySelector('.store-intro[open] button')?.click());
  }
  // The keyboard walk of preview/e2e/ipic-photo-views.mjs.
  async function walk(page, path) {
    for (const [a, d] of path) {
      const target = world(a, d), deadline = Date.now() + 180000;
      await page.locator('#canvas-host').focus();
      let distance = Infinity;
      while (Date.now() < deadline) {
        // A first visit plays the store intro, which holds the walking camera: dismiss it.
        const p = await page.evaluate(() => { document.querySelector('.store-intro[open] button')?.click(); return window.__riverCarriage().pose; });
        distance = Math.hypot(p.position[0] - target[0], -p.position[2] - target[1]);
        if (distance <= .16) break;
        await page.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), target);
        await page.keyboard.down('KeyW'); await page.waitForTimeout(Math.min(120, Math.max(20, distance * 100))); await page.keyboard.up('KeyW');
      }
      if (distance > .16) throw new Error(`could not reach ${a}, ${d}`);
    }
  }
  async function sit(page, seat) {
    await page.locator('#nearby-seat').selectOption(`${seat}:0`); await page.locator('#seat-sit').click();
    await page.waitForFunction(id => window.__riverCarriage().pose.sitting?.buildId === id, seat);
  }
  // Through the doorway, along the cross-aisle and down the side aisle into the middle row's legroom.
  const lounge = [[-1.4, 4.8], [-1.4, 20.7], [-1.4, 24.5], [-4.85, 24.5]], entry = [...lounge, [-4.85, 26.7], [-11.25, 26.7]], legroom = [-11.25, 29];
  // Theo wears Rowan, a committed character, chosen in the in-game character picker as any player can; the account,
  // its name and its seat are unchanged. Maya keeps the default guest look (Sable). Val approves both likenesses.
  if (!await theo.locator('.visit-tools').evaluate(node => node.open)) await theo.locator('.visit-tools-toggle').click();
  await theo.locator(`input[name=player-character][value=${script.characters.Theo.character}]`).check();
  await theo.waitForFunction(async id => { const { sharedAppearance } = await import('/src/shared-appearances.js'); const host = document.querySelector('#canvas-host');
    return host.dataset.playerReady === 'true' && sharedAppearance(host.dataset.playerAppearance)?.character === id; }, script.characters.Theo.character, { timeout: 60000 });
  if (await theo.locator('.visit-tools').evaluate(node => node.open)) await theo.locator('.visit-tools-toggle').click();
  await Promise.all([enter(maya), enter(theo), enter(camera)]);
  // The camera page's own player stays in the lounge, behind the cinema wall and out of every shot.
  await Promise.all([walk(maya, [...entry, legroom]), walk(theo, entry), walk(camera, lounge)]);
  await sit(maya, 'bench:ipic-recliner-1-1');
  await walk(theo, [legroom]);
  await sit(theo, 'bench:ipic-recliner-1-0');
  await camera.waitForFunction(() => (window.__riverMultiplayer().snapshot.players ?? []).filter(p => p.sitting).length >= 2);
  await camera.evaluate(([css]) => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); document.body.classList.add('clear-view'); }, [HIDE]);
  // Each shot's health, sampled in the camera page (shot-health.mjs): the longest wait between two animation frames,
  // and, every 200 ms, whether the town was offline or fewer than two friends sat.
  const watch = () => camera.evaluate(() => {
    const w = window.__shotHealth = { samples: 0, maxGapMs: 0, offline: 0, unseated: 0, done: false };
    let last = performance.now();
    const tick = at => { w.maxGapMs = Math.max(w.maxGapMs, at - last); last = at; if (!w.done) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    w.timer = setInterval(() => { const town = window.__riverMultiplayer?.(); w.samples++; if (!town?.connected) w.offline++; if ((town?.snapshot?.players ?? []).filter(p => p.sitting).length < 2) w.unseated++; }, 200);
  });
  const health = () => camera.evaluate(() => { const w = window.__shotHealth; w.done = true; clearInterval(w.timer); return { samples: w.samples, maxGapMs: Math.round(w.maxGapMs), offline: w.offline, unseated: w.unseated }; });
  const frame = name => { const c = CAMERAS[name]; return camera.evaluate(([position, target, fov]) => window.__riverRenderAudit.view({ position, target, fov }), [three(c.eye), three(c.target), c.fov]); };
  // Each shot holds its camera for its length plus a lead-in the cut trims away.
  for (const shot of script.shots) {
    await frame(shot.camera);
    await camera.waitForTimeout(1500);
    if (shot.id === 'dim') {
      await maya.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
      await watch();
      const start = (Date.now() - started) / 1000;
      await maya.locator('#ipic-screening [data-control="host-start"]').click();
      await camera.waitForTimeout(shot.seconds * 1000 + 800);
      shots.push({ ...shot, start, end: (Date.now() - started) / 1000, health: await health() });
      continue;
    }
    await watch();
    const start = (Date.now() - started) / 1000;
    await camera.waitForTimeout(shot.seconds * 1000 + 800);
    shots.push({ ...shot, start, end: (Date.now() - started) / 1000, health: await health() });
  }
  const graphics = await camera.evaluate(() => window.__riverRenderAudit.graphics());
  const video = camera.video();
  await camera.context().close(); await maya.context().close(); await theo.context().close();
  const raw = await video.path();
  execFileSync('mv', [raw, join(outDir, 'raw.webm')]);
  const head = execFileSync('git', ['-C', worktree, 'rev-parse', 'HEAD']).toString().trim();
  await writeFile(join(outDir, 'shots.json'), JSON.stringify({ shots, errors, browser: await browser.version(), renderer: graphics.renderer, recordedAt: new Date(started).toISOString(), sourceRevision: head, cameras: CAMERAS }, null, 2));
  // A take that dropped, lost a seated friend or stalled is refused rather than cut: take it again on a quieter machine.
  const problems = takeProblems(shots);
  if (problems.length) throw new Error(`retake: ${problems.join('; ')}`);
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify({ shots: shots.map(s => [s.id, +(s.end - s.start).toFixed(1)]) }));
} finally { await browser?.close(); await fixture?.close(); release(); }
