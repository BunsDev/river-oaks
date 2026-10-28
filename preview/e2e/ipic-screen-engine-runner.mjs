// Which encoding each engine tries first (#502): node preview/e2e/ipic-screen-engine-runner.mjs [webkit|chromium]
// Opens preview/e2e/fixtures/ipic-screen.html in Playwright's WebKit (Safari's engine on macOS; not a Safari or
// iOS device) or Chromium, shows the approved second film, and records which bundled source decoded, the
// attempts, and that the film's own frames advance. Sound is not measured here. Takes the shared browser lock.
// Writes output/playwright/ipic-screen-engine/<engine>.json.
import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const engine = process.argv[2] ?? 'webkit';
if (!['webkit', 'chromium'].includes(engine)) throw new Error(`unknown engine ${engine}`);
const FILM = 'ipic-two-seats-v1';
const OUT = 'output/playwright/ipic-screen-engine';
const release = await holdBrowserLock(`IPIC screen engine check (${engine})`);
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture();
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.setDefaultTimeout(60000);
  const receipt = { runner: `node preview/e2e/ipic-screen-engine-runner.mjs ${engine}`, at: new Date().toISOString(), engine, browser: await browser.version(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), dirty: execFileSync('git', ['status', '--porcelain']).toString().trim().split('\n').filter(Boolean) };
  try {
    await page.goto(`${fixture.origin}/e2e/fixtures/ipic-screen.html`);
    await page.waitForFunction(() => window.screenFixture?.ready, null, { timeout: 120000 });
    receipt.navigator = await page.evaluate(() => ({ vendor: navigator.vendor, userAgent: navigator.userAgent }));
    receipt.canPlay = await page.evaluate(() => { const v = document.createElement('video'); return { webm: v.canPlayType('video/webm; codecs="vp9, opus"'), mp4: v.canPlayType('video/mp4; codecs="avc1.4D401F, mp4a.40.2"') }; });
    const shown = await page.evaluate(id => window.screenFixture.show(id, { status: 'playing', at: 9000 }), FILM);
    const first = await page.evaluate(() => window.screenFixture.inspect());
    await page.waitForTimeout(2000);
    const later = await page.evaluate(() => window.screenFixture.inspect());
    const kind = type => type?.split(';')[0] ?? null;
    receipt.result = { state: later.state, source: kind(later.source?.type), attempts: later.attempts.map(a => ({ type: kind(a.type), result: a.result })),
      decoded: later.decoded, readyState: later.readyState, currentTime: [first.currentTime, later.currentTime], bound: Boolean(later.screen?.key), shownState: shown.state };
    const expected = engine === 'webkit' ? 'video/mp4' : 'video/webm';
    const checks = [
      [receipt.result.source === expected, `${engine} tried ${expected} first (got ${receipt.result.source})`],
      [receipt.result.attempts.length === 1 && receipt.result.attempts[0].result === 'decoded', `one attempt, decoded: ${JSON.stringify(receipt.result.attempts)}`],
      [later.currentTime > first.currentTime + 1, `the film advances (${first.currentTime.toFixed(2)} → ${later.currentTime.toFixed(2)} s)`],
      [later.decoded[0] === 1280 && later.decoded[1] === 720, `decoded at 1280×720 (${later.decoded})`],
      [receipt.result.bound, 'the film is bound to the screen'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, text]) => text);
    receipt.checks = checks.map(([ok, text]) => `${ok ? 'pass' : 'FAIL'}: ${text}`);
    await writeFile(`${OUT}/${engine}.json`, JSON.stringify({ status: failed.length ? 'failed' : 'passed', ...receipt }, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    if (failed.length) throw new Error(`engine check failed: ${failed.join('; ')}`);
  } catch (error) {
    await page.screenshot({ path: `${OUT}/${engine}-failure.png` }).catch(() => {});
    if (!receipt.checks) await writeFile(`${OUT}/${engine}.json`, JSON.stringify({ status: 'failed', ...receipt, error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
