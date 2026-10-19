// Players stay connected (connection continuity): node preview/e2e/connection-continuity.mjs
// Two residents on a loopback town whose sockets are retired every 15 s after a 5 s notice,
// as the hosted town retires them every 270 s (the host's request limit). Checks, in order:
//   1. rotations: the page moves to fresh sockets with no gate, no "connection lost", the
//      other resident never vanishing, and every command sent across them confirmed;
//   2. a socket that stays open but goes quiet is replaced (the watchdog);
//   3. coming back online retries at once instead of waiting out a long backoff;
//   4. an update says the world is improving, and a new version offers a refresh.
// Software rendering; not device, Safari or live-voice proof (voice is unit-tested).
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const OUT = 'output/playwright/connection-continuity', LIFETIME = 15_000, NOTICE = 5_000, WATCH_MS = 45_000;
const release = await holdBrowserLock('Connection continuity journey');
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1', RIVER_OAKS_TEST_CONNECTION_LIFETIME_MS: String(LIFETIME), RIVER_OAKS_TEST_ROTATE_NOTICE_MS: String(NOTICE) } });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], checks = [];
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(90_000);
    page.on('pageerror', error => errors.push(`${identity}: ${error.message}`));
    await page.goto(`${fixture.origin}/?motion-debug=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && window.__riverConnection && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 180_000 });
    return page;
  };
  const [alice, bob] = [await open('alice'), await open('bob')];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const state = page => page.evaluate(() => window.__riverConnection.state());
  // Wait on the page's own state, polled on a timer: software rendering makes frames slow.
  const waitFor = async (page, label, fn, arg, timeout) => {
    const begun = Date.now();
    try { await page.waitForFunction(fn, arg, { timeout, polling: 250 }); }
    catch (error) { throw new Error(`${label} after ${Date.now() - begun} ms: ${JSON.stringify(await state(page).catch(() => null))}`, { cause: error }); }
  };

  // 1. Rotations under way: sample the page and keep commands flowing through them.
  await alice.waitForFunction(() => window.__riverMultiplayer().snapshot?.players.some(player => player.id === 'bob'), null, { timeout: 30_000 });
  const startRotations = (await state(alice)).rotations, samples = [], results = [];
  const started = Date.now();
  let lastChat = 0;
  while (Date.now() - started < WATCH_MS) {
    const sample = await alice.evaluate(() => {
      const m = window.__riverMultiplayer(), c = window.__riverConnection.state();
      return { at: Date.now(), connected: m.connected, gate: c.gate, status: c.status, rotating: c.rotating, rotations: c.rotations,
        bobInTown: Boolean(m.snapshot?.players.some(player => player.id === 'bob')), bobShown: Boolean(m.remotes?.some?.(entry => entry.id === 'bob')) };
    });
    samples.push(sample);
    if (Date.now() - lastChat > 1500) {
      lastChat = Date.now();
      results.push(await alice.evaluate(text => window.__riverMultiplayerCommand({ type: 'chat', text }).then(result => ({ ok: result.ok, message: result.message ?? null }), error => ({ ok: false, message: error.message })), `still here ${results.length}`));
    }
    await alice.waitForTimeout(100);
  }
  const rotations = samples.at(-1).rotations - startRotations;
  const bobRotations = (await state(bob)).rotations;
  await writeFile(`${OUT}/rotation-samples.json`, JSON.stringify({ samples, results }, null, 2));
  check(samples.every(sample => sample.connected && !sample.gate), `the gate never appeared: ${JSON.stringify(samples.find(sample => !sample.connected || sample.gate) ?? null)}`);
  check(samples.every(sample => sample.bobInTown && sample.bobShown), `bob never left alice's town or view: ${JSON.stringify(samples.find(sample => !sample.bobInTown || !sample.bobShown) ?? null)}`);
  check(rotations >= 2, `alice moved to a fresh socket ${rotations} times in ${WATCH_MS / 1000} s (bob ${bobRotations})`);
  // Each hand-over finishes between two samples taken at most 300 ms either side of it.
  const handovers = (await state(alice)).rotatedAt.filter(at => at > started + 300 && at < samples.at(-1).at - 300);
  check(handovers.length >= 2 && handovers.every(at => samples.some(sample => sample.at <= at && at - sample.at <= 300) && samples.some(sample => sample.at >= at && sample.at - at <= 300)),
    `every hand-over in the window is bracketed by samples: ${handovers.map(at => at - started).join(', ')} ms`);
  check(results.length >= 20 && results.every(result => result.ok), `all ${results.length} chat commands across the hand-overs were confirmed: ${JSON.stringify(results.filter(result => !result.ok))}`);

  // 2. A socket that stays open but goes quiet: the watchdog replaces it. Deafen a socket
  // that was just handed over, so the town's own planned close is 15 s away, not sooner.
  const handed = (await state(alice)).rotations;
  await waitFor(alice, 'no fresh hand-over', count => window.__riverConnection.state().rotations > count, handed, 30_000);
  const quiet = Date.now();
  await alice.evaluate(() => window.__riverConnection.deafen());
  await waitFor(alice, 'the quiet socket was never dropped', () => !window.__riverConnection.state().connected, null, 20_000);
  const noticed = Date.now() - quiet, quietStatus = (await state(alice)).status;
  await waitFor(alice, 'no reconnect after the quiet socket', () => window.__riverConnection.state().connected, null, 30_000);
  const recovered = Date.now() - quiet;
  check(noticed >= 7_000 && noticed < 14_000, `a quiet socket was noticed after ${noticed} ms (8 s without a snapshot)`);
  check(quietStatus === 'The town went quiet. Rejoining…', `the page said why: ${quietStatus}`);
  check(recovered < 25_000, `and was replaced ${recovered} ms after it went quiet`);

  // 3. Back online: retry at once instead of after a 15–30 s backoff.
  await alice.evaluate(() => window.__riverConnection.drop({ attempt: 5 }));
  const dropped = await state(alice);
  check(!dropped.connected && dropped.retryScheduled, 'a drop after many failures waits on a long backoff');
  const online = Date.now();
  await alice.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(alice, 'no reconnect after going online', () => window.__riverConnection.state().connected, null, 10_000);
  check(Date.now() - online < 8_000, `going online reconnected in ${Date.now() - online} ms`);

  // 4. Updates: the world is improving, not a lost connection; a new version offers a refresh.
  await alice.evaluate(() => window.__riverConnection.drop({ code: 1012, reason: 'River Oaks is updating.' }));
  const updating = await state(alice);
  await alice.screenshot({ path: `${OUT}/updating.png` });
  check(updating.gate && updating.title === 'River Oaks is improving' && updating.status === 'Updating the world…', `an update says the world is improving: ${JSON.stringify(updating)}`);
  check(!/lost|disconnect/i.test(`${updating.title} ${updating.status}`), 'and never that the player was disconnected');
  await waitFor(alice, 'no rejoin after the update', () => window.__riverConnection.state().connected, null, 20_000);
  const back = await state(alice);
  check(!back.gate && back.title === 'Your district is just ahead', 'the page rejoined on its own and reset its welcome');
  await alice.evaluate(() => window.__riverConnection.drop({ code: 4000, reason: 'World version changed' }));
  const improved = await state(alice);
  const button = await alice.locator('.multiplayer-welcome button').filter({ hasText: 'Refresh' }).isVisible();
  await alice.screenshot({ path: `${OUT}/improved.png` });
  check(improved.title === 'River Oaks has been improved' && improved.halted && !improved.retryScheduled && button, `a new version offers a refresh: ${JSON.stringify(improved)}`);

  check(!errors.length, `no page errors: ${errors.join('; ')}`);
  const receipt = { status: 'passed', browser: await browser.version(), lifetimeMs: LIFETIME, noticeMs: NOTICE, rotations, bobRotations, chats: results.length,
    watchdog: { noticedMs: noticed, recoveredMs: recovered }, checks };
  await writeFile(`${OUT}/receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 1));
} catch (error) {
  await writeFile(`${OUT}/receipt.json`, JSON.stringify({ status: 'failed', error: error.stack }, null, 2));
  throw error;
} finally { await browser?.close(); await fixture?.close(); release(); }
