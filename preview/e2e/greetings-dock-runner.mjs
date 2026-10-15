// Phone HUD layering with another resident nearby: node preview/e2e/greetings-dock-runner.mjs
// Two pages share a loopback town, so alice sees the nearby greetings card. At each width the
// runner hit-tests the Play & rides toggle and every greetings control at its centre, then taps
// the toggle as a person would. UI layout only; software rendering, not device proof.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const OUT = 'output/playwright/greetings-dock';
const SIZES = [[320, 640], [390, 844], [600, 900], [700, 900], [768, 1024], [800, 900], [844, 390], [1024, 768], [1280, 800]];
// HUD controls that must stay tappable whatever the greetings card does.
const HUD = ['#panel-toggle', '#people-toggle', '#settings-toggle', '.commands-toggle', '.visit-tools-toggle', '.town-chat-dock > summary'];
const release = await holdBrowserLock('Greetings card and Play & rides toggle layering');
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1' } });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    await page.goto(`${fixture.origin}/?motion-debug=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 120000 });
    return page;
  };
  const [page, bob] = [await open('alice'), await open('bob')];
  const errors = []; for (const tab of [page, bob]) tab.on('pageerror', error => errors.push(error.message));
  for (const tab of [page, bob]) {
    if (await tab.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await tab.locator('#panel-toggle').click();
    // SwiftShader raises the software-rendering banner; a person dismisses it, and it is not the layering under test.
    const banner = tab.locator('.hardware-acceleration-warning button');
    if (await banner.isVisible().catch(() => false)) await banner.click();
  }
  await page.waitForFunction(() => { const card = document.querySelector('.nearby-greetings'); return card && !card.hidden; }, null, { timeout: 60000 });

  const measure = () => page.evaluate(selectors => {
    const shown = el => !!el && !el.hidden && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
    const hit = el => {
      const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const reachable = !!top && (top === el || el.contains(top));
      return { reachable, rect: [r.left, r.top, r.width, r.height].map(Math.round), ...(reachable ? {} : { coveredBy: top ? top.closest('[class]')?.className || top.id || top.tagName : null }) };
    };
    const card = document.querySelector('.nearby-greetings'), dock = document.querySelector('.visit-tools'), toggle = document.querySelector('.visit-tools-toggle');
    const hud = selectors.map(selector => [selector, document.querySelector(selector)]).filter(([, el]) => shown(el)).map(([selector, el]) => ({ name: selector, ...hit(el) }));
    const controls = (root, selector) => shown(root) ? [...root.querySelectorAll(selector)].filter(shown).map(el => ({ name: (el.textContent || el.id).trim().slice(0, 24), ...hit(el) })) : [];
    return {
      card: shown(card), cardRect: shown(card) ? [card.getBoundingClientRect()].map(r => [r.left, r.top, r.width, r.height].map(Math.round))[0] : null,
      dockOpen: !!dock?.open, toggle: shown(toggle) ? hit(toggle) : null,
      cardControls: controls(card, 'button, select'), dockControls: dock?.open ? controls(dock, '.play-rail-nav button') : [], hud,
    };
  }, HUD);

  const results = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { const dock = document.querySelector('.visit-tools'); if (dock) dock.open = false; });
    await page.waitForTimeout(400);
    const closed = await measure();
    await page.screenshot({ path: `${OUT}/hud-${width}x${height}.png` });
    let tap = 'opened', opened = null;
    try { await page.locator('.visit-tools-toggle').click({ timeout: 10000 }); } catch (error) { tap = error.message.replace(/\u001b\[\d+m/g, '').split('\n').map(line => line.trim()).filter(line => /intercepts|stable|visible|viewport|Timeout|scroll/.test(line)).slice(-4).join(' | '); }
    if (tap === 'opened') { await page.waitForTimeout(300); opened = await measure(); if (!opened.dockOpen) tap = 'tap did not open the dock'; }
    if (opened?.dockOpen) await page.screenshot({ path: `${OUT}/hud-${width}x${height}-open.png` });
    await page.evaluate(() => { const dock = document.querySelector('.visit-tools'); if (dock) dock.open = false; });
    results.push({ width, height, closed, tap, opened });
  }

  // An invitation does not yield to an open dock: on a phone with the dock open, alice can still
  // accept or decline (and close the dock). Once it is declined, the idle card yields again.
  const card = tab => tab.getByRole('region', { name: 'Nearby greetings' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.querySelector('.visit-tools').open = true; });
  await card(bob).getByRole('button', { name: 'Dance together', exact: true }).click();
  await card(page).getByRole('button', { name: 'Decline', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);
  const invited = await measure();
  await page.screenshot({ path: `${OUT}/hud-390x844-invited.png` });
  let declined = 'declined';
  try { await card(page).getByRole('button', { name: 'Decline', exact: true }).click({ timeout: 10000 }); } catch (error) { declined = error.message.split('\n')[0]; }
  if (declined === 'declined') await page.waitForFunction(() => window.__riverMultiplayer().snapshot.interactions.length === 0, null, { timeout: 15000 }).catch(() => { declined = 'the invitation was not cleared'; });
  await page.waitForTimeout(400);
  const after = await measure();
  const invitation = { invited, declined, idleCardShownAfter: after.card, dockOpenAfter: after.dockOpen };

  const problems = [];
  for (const { width, closed, tap, opened } of results) {
    if (!closed.card) problems.push(`${width}: the greetings card was not showing, so this width proves nothing`);
    if (!closed.toggle?.reachable) problems.push(`${width}: toggle covered by ${closed.toggle?.coveredBy ?? 'nothing visible'}`);
    if (tap !== 'opened') problems.push(`${width}: tapping Play & rides failed: ${tap}`);
    for (const control of closed.hud) if (!control.reachable && control.name !== '.visit-tools-toggle') problems.push(`${width}: ${control.name} covered by ${control.coveredBy}`);
    for (const control of closed.cardControls) if (!control.reachable) problems.push(`${width}: greetings ${control.name} covered by ${control.coveredBy}`);
    for (const control of opened?.dockControls ?? []) if (!control.reachable) problems.push(`${width}: open dock ${control.name} covered by ${control.coveredBy}`);
    for (const control of opened?.cardControls ?? []) if (!control.reachable) problems.push(`${width}: with the dock open, greetings ${control.name} covered by ${control.coveredBy}`);
  }
  if (!invited.dockOpen || !invited.card) problems.push(`invitation: dock open ${invited.dockOpen}, card shown ${invited.card}`);
  for (const name of ['Accept', 'Decline']) if (!invited.cardControls.some(control => control.name === name && control.reachable)) problems.push(`invitation: ${name} not reachable with the dock open: ${JSON.stringify(invited.cardControls)}`);
  if (!invited.toggle?.reachable) problems.push(`invitation: Play & rides covered by ${invited.toggle?.coveredBy}`);
  if (declined !== 'declined') problems.push(`invitation: declining failed: ${declined}`);
  if (after.card || !after.dockOpen) problems.push(`after declining, the idle card should yield to the open dock: card ${after.card}, dock ${after.dockOpen}`);
  const receipt = { status: problems.length || errors.length ? 'failed' : 'passed', browser: await browser.version(), problems, errors, results, invitation };
  await writeFile(`${OUT}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, problems, errors }, null, 1));
  if (receipt.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await fixture?.close(); release(); }
