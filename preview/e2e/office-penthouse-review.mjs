// Penthouse runtime review (#362): node preview/e2e/office-penthouse-review.mjs [label]
// Runtime captures of the furnished penthouse in the game, on the loopback fixture with the live
// district outlook and hardware (Metal) rendering on this Mac. Jevica (owner) and an approved
// resident (bob) arrive through the two-account journey's own permission and arrival steps
// (office-ipic-journey.js sections 1-2). The resident then sits at creative desk 01, so every
// capture shows an occupied room. At noon and at dusk (the time-of-day clock), with the office
// chrome hidden:
//   O1  the owner standing at the arrival, first person;
//   O2  the Main floor view (hosting and work), the resident seated in it;
//   O3  the resident seated at creative desk 01, first person; the Workstations view; and the
//       owner seated at the executive desk, first person;
//   O4  the Library and Terrace views; plus the Overview.
// Not device, Safari or human visual acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const label = process.argv[2] ?? 'runtime';
const output = process.env.PENTHOUSE_REVIEW_OUT ?? `output/playwright/penthouse-review/${label}`;
const HOURS = { day: 12, evening: 18.75 };
const sourceNames = ['office-penthouse-furnishings.js', 'office-penthouse-graybox.js', 'office-world-scene.js', 'office-layouts.js', 'atmosphere.js', 'main.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceNames.map(async name => [name, createHash('sha256').update(await readFile(`preview/src/${name}`)).digest('hex')])));
const sources = await sourceHashes();
await mkdir(output, { recursive: true });
const release = await holdBrowserLock('Penthouse runtime review');
let fixture, browser;
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1', VITE_SHARED_SOFTWARE_RENDERING: '0' } });
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : [] });
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    await context.addInitScript(() => localStorage.setItem('river-oaks-graphics', 'sharp'));
    const page = await context.newPage(); page.setDefaultTimeout(180000); return page;
  };
  const [owner, resident] = [await open('owner'), await open('bob')];
  const source = await readFile('preview/e2e/office-ipic-journey.js', 'utf8');
  const prefix = source.slice(0, source.indexOf('  // 3. Private work')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  assert.ok(prefix.includes('async function walkTo') && prefix.includes('both arrived on the penthouse main floor'), 'the journey still ends its arrival before its private-work step');
  const review = prefix + `
  const out = ${JSON.stringify(output)}, hours = ${JSON.stringify(HOURS)}, shots = [];
  const settle = (page, frames = 40) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame); }, frames);
  const setHour = (page, hour) => page.locator('#sun-hour').evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, hour);
  async function capture(page, who, name, time, hour) {
    const chrome = await page.addStyleTag({ content: '#office-visit > * { visibility: hidden !important; } .hardware-acceleration-warning, .store-intro { display: none !important; }' });
    await settle(page);
    const file = out + '/' + name + '-' + time + '.jpg';
    await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
    await chrome.evaluate(node => node.remove());
    const state = await page.evaluate(() => ({ office: window.__riverOffice(), visit: (() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office ?? null; })() }));
    shots.push({ name, who, time, hour, file, position: state.visit?.position, levelId: state.visit?.levelId, seat: state.visit?.seat?.id ?? null, camera: state.office?.camera ?? null, view: state.office?.view ?? null, skyline: state.office?.skyline?.state ?? null });
  }
  for (const page of [owner, resident]) await page.waitForFunction(() => window.__riverOffice()?.skyline?.state === 'live', null, { timeout: 300000 });
  check(true, 'both visitors see the live district outlook through the glass');

  // The resident sits at creative desk 01: the room is occupied for every capture.
  await walkTo(resident, [3.65, 3.55], 'the resident at creative desk 01');
  const sat = await command(resident, { type: 'office', action: 'sit', officeId: OFFICE, seatId: 'desk-a1-chair', layout: LAYOUT });
  check(sat.ok, 'the resident sits at creative desk 01: ' + JSON.stringify(sat));
  await owner.waitForFunction(peer => window.__riverMultiplayer().snapshot.players.find(p => p.id === peer)?.office?.seat?.id === 'desk-a1-chair', residentId);
  check(true, 'Jevica sees the resident seated');

  for (const [time, hour] of Object.entries(hours)) {
    await setHour(owner, hour); await setHour(resident, hour);
    await capture(owner, 'owner', 'O1-arrival-standing', time, hour);
    await capture(resident, 'resident', 'O3-workstation-seated', time, hour);
  }
  // Fixed views move only the owner's camera; the owner stays at the arrival.
  const views = await owner.locator('#office-view option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
  check(['overview', 'main-floor', 'workstations', 'library', 'terrace'].every(id => views.includes(id)), 'the fixed views: ' + views.join());
  const NAMES = { 'main-floor': 'O2-main-floor-view', workstations: 'O3-workstations-view', library: 'O4-library-view', terrace: 'O4-terrace-view', overview: 'overview' };
  for (const [time, hour] of Object.entries(hours)) {
    await setHour(owner, hour);
    for (const id of Object.keys(NAMES)) {
      await owner.locator('#office-view').selectOption(id);
      check(await owner.locator('#office-view').inputValue() === id, 'selected the ' + id + ' view');
      await capture(owner, 'owner', NAMES[id], time, hour);
    }
  }
  await owner.locator('#office-visit').focus(); await owner.keyboard.press('Escape');
  check(await owner.locator('#office-view').inputValue() === '', 'Escape returns to walking');
  walkers.delete(owner);

  // The owner sits at the executive desk: seated first person over the three displays.
  await walkTo(owner, [-3, 4.5], 'Jevica at the executive desk');
  await owner.waitForFunction(() => !document.querySelector('#office-seat')?.hidden);
  await owner.locator('#office-visit').focus(); await owner.keyboard.press('KeyZ');
  await owner.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office?.seat?.id === 'desk-executive-chair'; });
  check(true, 'Jevica sits at the executive desk');
  for (const [time, hour] of Object.entries(hours)) { await setHour(owner, hour); await capture(owner, 'owner', 'O3-executive-seated', time, hour); }
  await owner.locator('#office-visit').focus(); await owner.keyboard.press('KeyZ');
  await owner.waitForFunction(() => { const m = window.__riverMultiplayer(); const o = m.snapshot.players.find(p => p.id === m.selfId)?.office; return o && !o.seat; });
  check(true, 'Jevica stands up');
  check(!errors.length, errors.join('; '));
  return { checks, errors, reloads, shots };
}`;
  const started = Date.now();
  const result = await eval(`(${review})`)(owner, resident);
  assert.deepEqual(await sourceHashes(), sources, 'scene sources stayed fixed during the run');
  const receipt = { status: 'passed', label, kind: 'runtime capture (game, live outlook, Metal ANGLE)', browser: await browser.version(), loadAverage: loadavg().map(n => Number(n.toFixed(1))), durationMs: Date.now() - started, settings: { viewport: [1440, 900], deviceScaleFactor: 1, graphics: 'sharp', hours: HOURS, weather: 'default' }, sources, ...result };
  await writeFile(`${output}/result.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ label, checks: result.checks.length, shots: result.shots.length, loadAverage: receipt.loadAverage }));
} catch (error) {
  await writeFile(`${output}/result.json`, JSON.stringify({ status: 'failed', label, loadAverage: loadavg(), error: error.stack }, null, 2));
  throw error;
} finally { await browser?.close(); await fixture?.close(); release(); }
