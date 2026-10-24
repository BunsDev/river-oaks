// Matched browser observations, not physical-device or visual-quality acceptance.
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const label = process.argv[2] ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple artifact label');
const output = `output/playwright/apple-polish-${label}`;
await mkdir(output, { recursive: true });
const release = await holdBrowserLock('human Studio Apple baseline');
const sourceFiles=['preview/src/character-studio.js','preview/src/character-studio.css','preview/src/character-studio-preview.js','preview/src/romance-look.js','preview/src/character-bodice-fit.js'];
const sourceHash=createHash('sha256');
for(const file of sourceFiles)sourceHash.update(file).update(existsSync(file)?readFileSync(file):'absent');
const report = { sourceFiles, sourceDigest:sourceHash.digest('hex'), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  label, platform: `${os.platform()} ${os.release()} ${os.arch()}`, createdAt: new Date().toISOString(),
  scope: 'Automated local browsers. Phone viewport is emulation on this Mac, not iOS hardware. RAF intervals are responsiveness, not GPU execution time. Renderer resources are counts, not GPU bytes.', results: [] };
let fixture;
try {
  fixture = await startBrowserFixture();
  const cases = [
    { name: 'chromium-desktop', engine: chromium, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { name: 'webkit-desktop', engine: webkit, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { name: 'webkit-phone', engine: webkit, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ].filter(item => !process.env.RIVER_OAKS_APPLE_CASE || item.name === process.env.RIVER_OAKS_APPLE_CASE);
  if(!cases.length)throw new Error('Unknown Apple baseline browser case');
  for (const { name, engine, ...options } of cases) {
    let browser, context, page;
    const result = { name, options, observations: [], errors: [] };
    report.results.push(result);
    try {
      browser = await engine.launch({ headless: true, ...(engine === chromium && process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {}) });
      result.browserVersion = browser.version();
      context = await browser.newContext(options);
      await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
      page = await context.newPage(); page.setDefaultTimeout(90000);
      if (process.env.RIVER_OAKS_APPLE_MEASURE_VISIBILITY === '1') await page.addInitScript(() => {
        window.__applePreviewDraws = 0;
        for (const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
          const original = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function(...args) {
            if (this.canvas?.closest('.cs-preview')) window.__applePreviewDraws++;
            return original.apply(this,args);
          };
        }
      });
      page.on('pageerror', error => result.errors.push(error.message));
      console.log(`${name}: navigating to fixture`);
      const started = Date.now();
      await page.goto(fixture.origin, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
      result.readyMs = Date.now() - started;
      if (!await page.locator('.visit-tools').evaluate(n => n.open)) await page.locator('.visit-tools-toggle').click();
      if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
      console.log(`${name}: town ready in ${result.readyMs} ms`);
      const opened = Date.now();
      await page.getByRole('button', { name: 'Open character studio', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.character-studio[open] .cs-preview')?.dataset.ready === 'true');
      result.studioReadyMs = Date.now() - opened;
      const studio = page.locator('.character-studio[open]');
      const available = await studio.locator('[data-character]').evaluateAll(nodes => nodes.map(n => n.dataset.character));
      result.availableCharacters = available;
      const characters=process.env.RIVER_OAKS_APPLE_CHARACTERS?.split(',') ?? ['sable','jevica','silvan'];
      if(characters.some(id=>!available.includes(id)))throw new Error('Requested character is unavailable');
      for (const character of characters) {
        console.log(`${name}: selecting ${character}`);
        await studio.locator(`[data-character="${character}"]`).click();
        const appearance=await studio.getAttribute('data-appearance');
        await page.waitForFunction(id => {
          const n = document.querySelector('.character-studio[open] .cs-preview');
          return n?.dataset.ready === 'true' && n.dataset.appearance === id;
        }, appearance);
        // Fixed warmup then fixed sample size for matched reruns.
        await page.evaluate(() => new Promise(resolve => { let n = 0; const step = () => ++n >= 60 ? resolve() : requestAnimationFrame(step); requestAnimationFrame(step); }));
        const measurement = await page.evaluate(() => new Promise(resolve => {
          const frames = []; let previous,frame;
          const timeout = setTimeout(() => {cancelAnimationFrame(frame);resolve({ incomplete: true, reason: 'RAF sampling exceeded 30 seconds', samples: frames.length });}, 30000);
          const step = now => {
            if (previous !== undefined) frames.push(now - previous); previous = now;
            if (frames.length < 180) { frame=requestAnimationFrame(step); return; }
            clearTimeout(timeout); frames.sort((a, b) => a - b);
            const modal = document.querySelector('.character-studio[open]');
            const sizes = selector => { const n = modal.querySelector(selector); return n && { width: n.clientWidth, height: n.clientHeight, scrollWidth: n.scrollWidth, scrollHeight: n.scrollHeight }; };
            const canvas = modal.querySelector('canvas'), gl = canvas?.getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
            resolve({ rafMs: { p50: frames[89], p95: frames[170], max: frames.at(-1), samples: frames.length },
              renderer: gl && gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
              canvas: canvas && { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight },
              viewport: [innerWidth, innerHeight, devicePixelRatio], modal: { width: modal.clientWidth, scrollWidth: modal.scrollWidth },
              workspace: sizes('.cs-workspace'), controls: sizes('.cs-controls'),
              previewToolsOverlap: modal.querySelector('.cs-preview').getBoundingClientRect().bottom > modal.querySelector('.cs-view-tools').getBoundingClientRect().top + 1,
              touchTargets: [...modal.querySelectorAll('button,input,select')].filter(n => n.getClientRects().length).map(n => {const r=n.getBoundingClientRect();return {label:n.getAttribute('aria-label')||n.textContent?.trim().slice(0,60)||n.id,width:r.width,height:r.height};}).filter(n => n.width < 44 || n.height < 44),
              jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
              worldResources: document.querySelector('#canvas-host')?.dataset.renderStats,
              resources: performance.getEntriesByType('resource').reduce((sum, r) => ({count:sum.count+1,transferBytes:sum.transferBytes+r.transferSize,decodedBytes:sum.decodedBytes+r.decodedBodySize}),{count:0,transferBytes:0,decodedBytes:0}) });
          }; frame=requestAnimationFrame(step);
        }));
        result.observations.push({ character, ...measurement });
        await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
        await page.screenshot({ path: `${output}/${name}-${character}.png` });
      }
      if (options.isMobile && process.env.RIVER_OAKS_APPLE_MEASURE_VISIBILITY === '1') {
        const sampleDraws = () => page.evaluate(() => new Promise(resolve => {
          const before = window.__applePreviewDraws;
          setTimeout(() => resolve(window.__applePreviewDraws-before),1000);
        }));
        result.visibleDrawsPerSecond = await sampleDraws();
        await studio.locator('.cs-workspace').evaluate(n => n.scrollTop = n.scrollHeight);
        await page.waitForTimeout(200); // Allow intersection notification before the fixed sampling window.
        result.previewOffscreen = await studio.locator('.cs-preview').evaluate(n => n.getBoundingClientRect().bottom <= 0);
        result.hiddenDrawsPerSecond = await sampleDraws();
        await studio.locator('.cs-workspace').evaluate(n => n.scrollTop = 0);
        await page.waitForTimeout(200);
        result.resumedDrawsPerSecond = await sampleDraws();
        if (process.env.RIVER_OAKS_APPLE_ASSERT_VISIBILITY === '1' && (!result.previewOffscreen || result.visibleDrawsPerSecond <= 0 || result.hiddenDrawsPerSecond !== 0 || result.resumedDrawsPerSecond <= 0)) throw new Error('Offscreen preview must stop drawing and resume when visible');
      }
      if (process.env.RIVER_OAKS_APPLE_ASSERT_CONTROLS === '1') {
        result.controlChecks = [];
        const check = (ok, message) => { if (!ok) throw new Error(message); result.controlChecks.push(message); };
        const targets = await studio.locator('select,input[type=range]').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({name:n.name||n.id,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
        check(targets.every(n => n.width >= 44 && n.height >= 44), `Native controls provide 44 px targets: ${JSON.stringify(targets)}`);
        check(await studio.evaluate(n => n.querySelector('.cs-preview').getBoundingClientRect().bottom <= n.querySelector('.cs-view-tools').getBoundingClientRect().top + 1), 'Preview remains clear of the view controls');
        const range = studio.locator('#cs-yaw');
        await range.focus(); const before = Number(await range.inputValue());
        await page.keyboard.press('ArrowRight');
        check(Number(await range.inputValue()) > before, 'Rotation retains native keyboard adjustment');
        if (options.hasTouch) {
          const box = await range.boundingBox();
          await page.touchscreen.tap(box.x + box.width * .75, box.y + box.height / 2);
          check(Number(await range.inputValue()) > before, 'Rotation responds to a touch in its control area');
        }
        await studio.locator('[name=framing]').selectOption('portrait');
        check(await studio.locator('[name=framing]').inputValue() === 'portrait', 'Framing selection remains operable');
        await studio.locator('[name=framing]').selectOption('full');
        for (const viewport of options.isMobile ? [{width:390,height:844},{width:844,height:390},{width:320,height:700}] : [options.viewport]) {
          await page.setViewportSize(viewport);
          check(await studio.evaluate(n => n.scrollWidth <= n.clientWidth && n.getBoundingClientRect().right <= innerWidth + 1), `Studio fits horizontally at ${viewport.width}x${viewport.height}`);
        }
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.character-studio')?.open);
        await page.waitForFunction(() => document.activeElement?.matches('.character-studio-trigger'), null, {timeout:5000});
        check(await page.getByRole('button', {name:'Open character studio',exact:true}).evaluate(n => n === document.activeElement), 'Closing restores entry focus');
      }
      if (process.env.RIVER_OAKS_APPLE_LIFECYCLE === '1') {
        if (await studio.count()) await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.character-studio')?.open);
        result.lifecycle = [];
        await page.evaluate(() => window.__appleLostPreviews = 0);
        for (let cycle = 1; cycle <= 5; cycle++) {
          await page.getByRole('button', {name:'Open character studio',exact:true}).click();
          await page.waitForFunction(() => document.querySelector('.cs-preview')?.dataset.ready === 'true');
          await page.locator('.cs-preview canvas').evaluate(canvas => canvas.addEventListener('webglcontextlost', () => window.__appleLostPreviews++, {once:true}));
          await page.keyboard.press('Escape');
          await page.waitForFunction(expected => window.__appleLostPreviews === expected, cycle, {timeout:5000});
          const remaining = await page.locator('.cs-preview canvas').count();
          if (remaining !== 0) throw new Error('Closed Studio retains its preview canvas');
          result.lifecycle.push({cycle, lostPreviewContexts:cycle, remainingPreviewCanvases:remaining});
        }
      }
      if(result.errors.length)throw new Error(`Browser errors: ${result.errors.join('; ')}`);
      result.status = result.observations.some(o => o.incomplete) ? 'incomplete' : 'observed';
      if (result.status === 'incomplete') process.exitCode = 1;
      console.log(`${name}: ${result.observations.length} characters observed; ready ${result.readyMs} ms`);
    } catch (error) {
      result.status = 'failed'; result.failure = error.message; process.exitCode = 1;
      await page?.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
      console.error(`${name}: ${error.message}`);
    } finally {
      await context?.close().catch(() => {}); await browser?.close().catch(() => {});
      await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally { await fixture?.close(); release(); }
