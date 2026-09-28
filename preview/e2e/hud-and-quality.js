async page => {
  const checks=[];
  const check = (condition, message) => { if (!condition) throw new Error(message);checks.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const host = () => page.evaluate(() => { const d = document.querySelector('#canvas-host').dataset; return { quality: JSON.parse(d.quality || 'null'), pipeline: JSON.parse(d.pipeline || 'null'), canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height] }; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { try { localStorage.removeItem('river-oaks-graphics'); } catch {} });
  await page.reload();

  // Streaming progress: the pill counts files, then reports the district ready and steps aside.
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport').dataset.assetProgress || '{}').done === true, null, { timeout: 120000 });
  const progress = await page.evaluate(() => JSON.parse(document.querySelector('#viewport').dataset.assetProgress));
  check(progress.loaded === progress.total && progress.total > 20, `every streamed file is counted (${progress.loaded}/${progress.total})`);
  check(progress.failed === 0, 'no visual asset failed to load');
  await page.waitForFunction(() => document.querySelector('.asset-progress').hidden, null, { timeout: 10000 });

  // Graphics quality: Auto by default; Smoothest and Sharpest change the scene buffers, never the canvas.
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.quality);
  const auto = await host();
  check(auto.quality.mode === 'auto', 'Auto is the default graphics mode');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('[data-section=settings-section]').click();
  await page.locator('[data-quality=smooth]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('#canvas-host').dataset.quality).mode === 'smooth');
  await page.waitForTimeout(1200);
  const smooth = await host();
  check(smooth.pipeline.renderScale === 0.75 && smooth.pipeline.ao === false, 'Smoothest renders at 75% without AO');
  check(smooth.canvas[0] === auto.canvas[0] && smooth.canvas[1] === auto.canvas[1], 'the canvas keeps native size');
  check(/^75% · (…|\d+ fps)$/.test(await page.locator('#quality-readout').textContent()), 'the readout names the scene resolution');
  await page.locator('[data-quality=sharp]').click();
  await page.waitForTimeout(1200);
  const sharp = await host();
  check(sharp.pipeline.renderScale === 1 && sharp.pipeline.ao === true, 'Sharpest restores native resolution and AO');
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  check(await page.locator('[data-quality=sharp]').getAttribute('aria-pressed') === 'true', 'the graphics choice persists');
  await page.evaluate(() => { try { localStorage.removeItem('river-oaks-graphics'); } catch {} });

  // Clear view: H hides the visit cards, the chip brings them back.
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  await page.waitForFunction(() => document.body.classList.contains('walking') && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('h');
  check(await page.evaluate(() => document.body.classList.contains('clear-view')), 'H toggles clear view');
  // Visibility follows a short fade, which a long frame can delay.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.visit-tools')).visibility === 'hidden', null, { timeout: 5000 });
  const cleared = await page.evaluate(() => ({ cards: getComputedStyle(document.querySelector('.visit-tools')).visibility, console: getComputedStyle(document.querySelector('.walking-console')).visibility, chip: getComputedStyle(document.querySelector('.clear-view-toggle')).visibility }));
  check(cleared.cards === 'hidden' && cleared.console === 'hidden', 'H clears the visit cards');
  check(cleared.chip === 'visible', 'the way back stays visible');
  await page.screenshot({ path: 'output/playwright/hud-clear-view.png' });
  await page.locator('.clear-view-toggle').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.visit-tools')).visibility === 'visible', null, { timeout: 5000 });
  await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('#store-search').fill('h');
  check(!(await page.evaluate(() => document.body.classList.contains('clear-view'))), 'typing H in a field does not clear the view');
  check(!errors.length, errors.length ? errors.join('; ') : 'No browser page errors');
  return { checks, progress, auto: auto.quality, smooth: smooth.pipeline, sharp: sharp.pipeline, cleared, errors };
}
