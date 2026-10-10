async page => {
  const checks = [], errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true', null, { timeout: 120000 });
  const open = async () => {
    if (page.viewportSize().width <= 900 && await page.locator('.visit-tools').evaluate(node => node.open)) await page.locator('.visit-tools-toggle').click();
    await page.locator('.commands-toggle').click();
    await page.locator('.rail-commands').getByRole('button', { name: /Photo mode/ }).click();
    await page.locator('.photo-mode').waitFor({ state: 'visible' });
  };
  // The dialog hides as soon as it closes, but photo mode restores the canvas look,
  // HUD and focus in its queued close event. Wait for that before checking or
  // reopening, or a late close handler can act on the next session.
  const closed = async () => {
    await page.locator('.photo-mode').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !document.body.classList.contains('photographing'), null, { timeout: 5000 }).catch(() => {});
  };
  const hudSelectors = ['.visit-tools', '.visit-tools-toggle', '.walking-title'];
  const visibleHud = () => page.evaluate(selectors => selectors.map(selector => document.querySelector(selector).checkVisibility({ opacityProperty: true, visibilityProperty: true })), hudSelectors);
  const initialHud = await visibleHud();
  await open();
  check((await visibleHud()).every(visible => !visible), 'photo mode visually hides the play dock, trigger and walking title');
  const dialog = page.locator('.photo-mode');
  check(await dialog.getByRole('button', { name: 'Take photo', exact: true }).evaluate(element => element === document.activeElement), 'photo mode focuses its shutter');
  check(await dialog.locator('output[for=photo-yaw]').textContent() === '0°', 'pan exposes its numeric degrees');
  check(await dialog.locator('output[for=photo-dolly]').textContent() === '0.0 m', 'lens movement exposes meters');
  check((await dialog.locator('.photo-quality').textContent()).includes('Scene resolution'), 'photo UI explains current graphics resolution');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback) { HTMLCanvasElement.prototype.toBlob = original; queueMicrotask(() => callback(null)); };
  });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.photo-status').textContent.includes('Could not take'));
  check(await dialog.getByRole('button', { name: 'Take photo', exact: true }).isEnabled(), 'failed canvas encoding leaves the shutter usable');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type) {
      HTMLCanvasElement.prototype.toBlob = original;
      window.__finishPhoto = () => new Promise(resolve => original.call(this, blob => { callback(blob); resolve(); }, type));
    };
  });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await page.waitForFunction(() => typeof window.__finishPhoto === 'function');
  await page.keyboard.press('Escape');
  await closed();
  await open();
  await page.evaluate(() => window.__finishPhoto());
  check(await dialog.locator('.photo-result').isHidden(), 'late capture cannot replace a newly opened camera session');
  check(await dialog.getByRole('button', { name: 'Take photo', exact: true }).isEnabled(), 'reopening after an unfinished capture leaves the shutter usable');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => data.files?.[0]?.type === 'image/png' });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled by fixture', 'AbortError'); } });
  });
  await dialog.locator('[name=format]').selectOption('0.8');
  await dialog.locator('[name=look]').selectOption('warm');
  await dialog.locator('[name=yaw]').fill('12');
  await dialog.locator('[name=roll]').fill('-8');
  await dialog.locator('[name=fov]').fill('55');
  check(await dialog.locator('output[for=photo-yaw]').textContent() === '12°', 'pan value follows framing changes');
  const prospective = await dialog.locator('.photo-output').textContent();
  await page.screenshot({ path: 'output/playwright/photo-ux-composition.png' });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog.locator('.photo-result').waitFor({ state: 'visible' });
  const image = await dialog.locator('img').evaluate(async img => {
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
    // Exclude the credit band: prove the actual scene has rendered.
    for (let y = 0; y < canvas.height * .8; y += 13) for (let x = 0; x < canvas.width; x += 13) {
      const i = (y * canvas.width + x) * 4; colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    }
    return { width: img.naturalWidth, height: img.naturalHeight, colors: colors.size };
  });
  check(Math.abs(image.width / image.height - .8) < .002, 'portrait PNG uses the selected aspect ratio');
  check(image.colors > 100, `PNG contains a rendered scene (${image.colors} sampled colors)`);
  check(prospective.includes(`${image.width} × ${image.height}`), 'prospective dimensions match encoded PNG');
  check(image.width <= 2048 && image.height <= 2048, 'photo output is bounded');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.photo-download').click()]);
  check(/^river-oaks-.*\.png$/.test(download.suggestedFilename()), 'download has a shareable PNG filename');
  check(!(await download.failure()), 'PNG download succeeds');
  await dialog.getByRole('button', { name: 'Share photo' }).click();
  await page.waitForFunction(() => document.querySelector('.photo-status').textContent.includes('Sharing cancelled'));
  check(await dialog.locator('.photo-download').isVisible(), 'cancelled OS sharing preserves the downloadable photo');
  await page.screenshot({ path: 'output/playwright/photo-mode-preview.png' });
  const retainedUrl = await dialog.locator('img').getAttribute('src');
  await dialog.getByRole('button', { name: 'Back to camera' }).click();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback) { HTMLCanvasElement.prototype.toBlob = original; queueMicrotask(() => callback(null)); };
  });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.photo-status').textContent.includes('Could not take'));
  await dialog.getByRole('button', { name: 'View last photo' }).click();
  check(await dialog.locator('img').getAttribute('src') === retainedUrl, 'failed replacement preserves the retained photo');
  await page.keyboard.press('Escape');
  await closed();
  await open();
  check(await dialog.locator('.photo-result').isVisible(), 'reopening offers the retained preview');
  check(await dialog.locator('.photo-download').getAttribute('href') === retainedUrl, 'reopening keeps the retained download');
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: () => new Promise(resolve => { window.__finishShare = resolve; }) }));
  await dialog.getByRole('button', { name: 'Share photo' }).click();
  await page.keyboard.press('Escape');
  await closed();
  await open();
  // A second navigator.share() while the first sheet is open rejects with
  // InvalidStateError, so Share stays unavailable until that sheet settles.
  check(await dialog.getByRole('button', { name: 'Share photo' }).isDisabled(), 'reopening keeps Share unavailable while a share sheet is open');
  const reopenedStatus = await dialog.locator('.photo-status').textContent();
  await page.evaluate(() => window.__finishShare());
  await page.waitForFunction(() => !document.querySelector('.photo-share').disabled);
  check(await dialog.locator('.photo-status').textContent() === reopenedStatus, 'late share cannot rewrite the new session status, and Share returns');
  await dialog.getByRole('button', { name: 'Back to camera' }).click();
  await dialog.getByRole('button', { name: 'Reset framing' }).click();
  check(await dialog.locator('[name=yaw]').inputValue() === '0', 'framing reset returns pan to zero');
  await page.keyboard.press('Escape');
  await closed();
  check(await page.locator('#canvas-host canvas').evaluate(canvas => canvas.style.filter === ''), 'closing restores the live canvas look');
  check(!(await page.evaluate(() => document.body.classList.contains('photographing'))), 'closing restores the game HUD');
  // The HUD fades back in through its own opacity transition, which a CPU-bound
  // runner can still be playing when the dialog has closed.
  await page.waitForFunction(([selectors, expected]) => JSON.stringify(selectors.map(selector => document.querySelector(selector).checkVisibility({ opacityProperty: true, visibilityProperty: true }))) === expected,
    [hudSelectors, JSON.stringify(initialHud)], { timeout: 5000 }).catch(() => {});
  check(JSON.stringify(await visibleHud()) === JSON.stringify(initialHud), 'closing restores the actual HUD visibility');
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await dialog.getByRole('button', { name: 'Back to camera' }).click();
  await dialog.locator('[name=format]').selectOption('0.5625');
  check((await visibleHud()).every(visible => !visible), 'narrow photo mode also hides underlying HUD subtrees');
  await dialog.locator('.photo-controls').evaluate(element => { element.scrollTop = 0; });
  const metadataVisible = await dialog.locator('.photo-controls').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return ['.photo-output', '.photo-quality'].every(selector => {
      const text = element.querySelector(selector).getBoundingClientRect();
      return text.top >= bounds.top && text.bottom <= bounds.bottom;
    });
  });
  check(metadataVisible, 'narrow composition shows dimensions and quality without scrolling');
  const grid = await dialog.locator('.photo-grid-label').boundingBox();
  check(grid.x + grid.width < 390, 'mobile grid control stays inside the panel');
  await page.screenshot({ path: 'output/playwright/photo-ux-mobile-composition.png' });
  await dialog.getByRole('button', { name: 'Hide controls' }).click();
  check(await dialog.locator('[name=fov]').isHidden(), 'composition controls collapse for a clear view');
  await page.screenshot({ path: 'output/playwright/photo-mode-mobile.png' });
  const bounds = await dialog.locator('.photo-controls').boundingBox();
  check(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'mobile controls fit the viewport');
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog.locator('.photo-result').waitFor({ state: 'visible' });
  const story = await dialog.locator('img').evaluate(async img => { await img.decode(); return img.naturalWidth / img.naturalHeight; });
  check(Math.abs(story - 9/16) < .003, 'mobile story photo uses 9:16 framing');
  check(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, retainedUrl), 'successful replacement releases the previous URL');
  const discardedUrl = await dialog.locator('img').getAttribute('src');
  await dialog.getByRole('button', { name: 'Discard photo', exact: true }).click();
  check(await dialog.locator('.photo-result').isHidden(), 'explicit discard returns to composition');
  check(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, discardedUrl), 'explicit discard releases the captured URL');
  await dialog.getByRole('button', { name: 'Close photo mode' }).click();
  check(!errors.length, `no page errors: ${errors.join('; ')}`);
  return { checks, image, story };
}
