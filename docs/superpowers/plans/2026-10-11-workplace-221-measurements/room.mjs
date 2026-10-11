// Graybox fixture: frame time (vsync off, three runs), JS heap and renderer memory
// across repeated entry (0, 20, 120, 320 cumulative), forced GC before each heap read.
import { startBrowserFixture } from '../../../../preview/e2e/fixture-server.js';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit']});
const fixture = await startBrowserFixture();
try {
  const page = await (await browser.newContext({viewport: {width: 1280, height: 800}})).newPage();
  await page.goto(`${fixture.origin}/e2e/fixtures/workplace.html`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {timeout: 60000});
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    return {jsHeapUsedMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners}; };
  const renderer = await page.evaluate(() => ({gpu: (() => { const gl = document.querySelector('canvas').getContext('webgl2'); const i = gl.getExtension('WEBGL_debug_renderer_info'); return i ? gl.getParameter(i.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()}));
  await page.evaluate(() => window.workplaceFixture.show('seated-working', 'CAM-01'));
  const frames = [];
  for (let i = 0; i < 3; i++) frames.push(await page.evaluate(() => window.workplaceFixture.frames(180)));
  const entries = [{entered: 0, ...await heap()}];
  let total = 0;
  for (const n of [20, 100, 200]) { const g = await page.evaluate(times => window.workplaceFixture.reenter(times), n); total += n; entries.push({entered: total, geometries: g, ...await heap()}); }
  console.log(JSON.stringify({renderer, viewport: [1280, 800], frames, entries}, null, 2));
} finally { await fixture.close?.();await browser.close(); }
