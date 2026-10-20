// Attribute the phone run's draw calls on this Mac: the same district revision,
// office layout, 440×796 viewport and AO off as the iPhone Safari run, in local
// WebKit. Draw counts do not depend on render scale or GPU speed, so they map
// onto the phone's ~870 draws. Timings here are not phone timings.
import { writeFile, mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const out = process.argv[2] ?? '.runtime/ios-fit/draw-census-local.json';
const release = await holdBrowserLock('iOS fit draw census');
let fixture, browser;
const report = { scope: 'macOS WebKit, local fixture; draw attribution only, not phone timing', status: 'running' };
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_DISTRICT_REVISION: 'river-oaks-gardens-3', RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1' } });
  browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width: 440, height: 796 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'fixture_session', value: 'bob', url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(150000);
  await page.goto(`${fixture.origin}/?render-audit=1&motion-debug=1&ao=off`);
  await page.waitForFunction(() => {
    const host = document.querySelector('#canvas-host')?.dataset;
    const asset = document.querySelector('#viewport')?.dataset.assetProgress;
    return host?.playerReady === 'true' && host.multiplayer === 'joined' && host.storePeopleTotal === host.storePeopleReady
      && asset && JSON.parse(asset).done === true && document.querySelector('#loading')?.hidden;
  });
  await page.waitForTimeout(5000);
  Object.assign(report, await page.evaluate(async () => {
    const audit = globalThis.__riverRenderAudit, graphics = audit.graphics();
    const census = await audit.drawCensus();
    const source = await (await fetch('/src/render-pipeline.js')).text();
    const url = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]).find(value => value.includes('RenderPass'));
    const { RenderPass } = await import(url), original = RenderPass.prototype.render;
    const records = new Map(); let frames = 0;
    RenderPass.prototype.render = function (renderer, ...args) {
      const draw = renderer.renderBufferDirect;
      renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const names = []; for (let node = object; node; node = node.parent) if (node.name) names.push(node.name);
        const pass = scene === null ? 'shadow' : 'main';
        const key = `${pass} ${names.reverse().slice(0, 3).join('/') || object.type}`;
        const record = records.get(key) ?? { key, calls: 0, instanced: 0 };
        record.calls++; if (object.isInstancedMesh || object.isBatchedMesh) record.instanced++;
        records.set(key, record);
        return draw.call(this, camera, scene, geometry, material, object, group);
      };
      try { return original.call(this, renderer, ...args); } finally { renderer.renderBufferDirect = draw; frames++; }
    };
    try { for (let i = 0; i < 30; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }
    finally { RenderPass.prototype.render = original; }
    const categories = [...records.values()].map(record => ({ ...record, calls: record.calls / frames, instanced: record.instanced / frames }))
      .sort((a, b) => b.calls - a.calls);
    const byPass = categories.reduce((sum, record) => { const pass = record.key.split(' ')[0]; sum[pass] = (sum[pass] ?? 0) + record.calls; return sum; }, {});
    return { graphics: { quality: graphics.quality, pipeline: graphics.pipeline, render: graphics.render, viewport: graphics.viewport, buffer: graphics.buffer },
      census, frames, byPass, categories: categories.slice(0, 40) };
  }));
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close(); await fixture?.close(); release();
  await mkdir('.runtime/ios-fit', { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, error: report.error, calls: report.graphics?.render?.calls, byPass: report.byPass }));
}
