// Real loopback revision disable at the same browser origin, with existing fixture auth.
// node preview/e2e/garden-campus-revision-lifecycle.mjs
// The server restarts with fresh fixture state: Redis checkpoint migration is covered
// separately. No manifest/snapshot is forged, and no production switch is performed.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
import { startBrowserFixture } from './fixture-server.js';
import { launch, openDistrict } from './garden-campus-render-common.mjs';

const output = 'output/playwright/campus-challenge-revision-lifecycle';
await mkdir(output, { recursive: true });
const paths = ['preview/src/main.js', 'preview/src/district-ui.js', 'preview/src/garden-campus-ui.js',
  'preview/src/garden-campus-district.js', 'preview/src/garden-campus.js', 'preview/src/multiplayer-client.js'];
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async path =>
  [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const sources = await hashes(), observations = [];
const release = await holdBrowserLock('Campus real revision disable');
let fixture, browser, session;
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_DISTRICT_REVISION: 'river-oaks-gardens-3' } });
  const origin = fixture.origin, port = new URL(origin).port;
  browser = await launch();
  session = await openDistrict(browser, fixture, 'gardens');
  const { page } = session;
  const observe = () => page.evaluate(() => ({
    destinations: [...document.querySelectorAll('#destination option')].map(option => option.value),
    selected: document.querySelector('#destination')?.value,
    campusHidden: document.querySelector('#campus-panel')?.hidden,
    campusRoot: Boolean(globalThis.__gardenCampusRoot),
    ready: document.querySelector('#canvas-host')?.dataset.playerReady,
  }));
  const initial = await observe();
  assert.equal(initial.destinations.filter(id => id.startsWith('campus:')).length, 4);
  assert.equal(initial.campusHidden, false);
  // The legacy directory is hidden in the current Places UI. Reuse the existing
  // traversal harness's real select/change contract; this is state teardown proof,
  // not an assertion that this legacy control is visible or user-accessible.
  await page.locator('#destination').evaluate(select => {
    select.value = 'campus:T1-F1-hall';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal((await observe()).selected, 'campus:T1-F1-hall');
  observations.push({ phase: 'campus-selected', ...await observe() });
  // Existing Reload exercises same-document world disposal before server disable.
  await page.locator('#reload').evaluate(button => button.click());
  await page.waitForFunction(() => !document.querySelector('#reload').disabled && document.querySelector('#loading').hidden);
  const rebuilt = await observe();
  assert.equal(rebuilt.destinations.filter(id => id.startsWith('campus:')).length, 4);
  assert.equal(new Set(rebuilt.destinations).size, rebuilt.destinations.length);
  observations.push({ phase: 'campus-rebuilt', ...rebuilt });
  // The legacy directory is hidden in the current Places UI. Reuse the existing
  // traversal harness's real select/change contract; this is state teardown proof,
  // not an assertion that this legacy control is visible or user-accessible.
  await page.locator('#destination').evaluate(select => {
    select.value = 'campus:T1-F1-hall';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal((await observe()).selected, 'campus:T1-F1-hall');
  await page.screenshot({ path: `${output}/campus.png` });
  await fixture.close();
  // startBrowserFixture accepts fixture env overrides. Its generated origin is not
  // used here: the actual web port is explicitly retained for this restart.
  fixture = await startBrowserFixture({ env: {
    RIVER_OAKS_TEST_WEB_PORT: port, RIVER_OAKS_DISTRICT_REVISION: 'river-oaks-garage-1',
  } });
  const response = await page.request.get(`${origin}/api/world-data?world=river-oaks`);
  // Without a catalog or districtRevision, server/app.js has no manifest route.
  // main.js defaultWorldManifest intentionally falls back to the garage on 404.
  assert.equal(response.status(), 404, 'legacy garage fixture has no revision manifest');
  // Reconnection's revision fence (or Vite's server-restart reload) must replace
  // this page with the server-selected garage. Do not manually hide/reset the UI.
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
    && document.querySelector('#loading')?.hidden
    && document.querySelector('#campus-panel')?.hidden === true
    && ![...document.querySelectorAll('#destination option')].some(option => option.value.startsWith('campus:')),
  null, { timeout: 300000 });
  const disabled = await observe();
  assert.equal(disabled.campusRoot, false);
  assert.ok(!disabled.selected.startsWith('campus:'));
  assert.ok(disabled.destinations.length > 0, 'ordinary district destinations remain');
  observations.push({ phase: 'garage-restored', ...disabled });
  await page.screenshot({ path: `${output}/garage.png` });
  assert.deepEqual(await hashes(), sources);
  await writeFile(`${output}/result.json`, JSON.stringify({ status: 'passed', sources, observations,
    limits: 'Local Chromium and fixture identities. Same-origin fixture restart with fresh server state; automatic reload may come from revision fencing or Vite restart. Redis migration, GPU resource growth and physical-device behavior require separate evidence.' }, null, 2));
} catch (error) {
  await session?.page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify({ status: 'failed', sources, observations, error: error.stack }, null, 2));
  throw error;
} finally {
  await session?.context.close();
  await browser?.close();
  await fixture?.close();
  release();
}
