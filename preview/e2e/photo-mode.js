async page => {
  const checks = [], errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true', null, { timeout: 120000 });
  const open = async () => {
    await page.locator('.commands-toggle').click();
    await page.locator('.rail-commands').getByRole('button', { name: /Photo mode/ }).click();
    await page.locator('.photo-mode').waitFor({ state: 'visible' });
  };
  await open();
  const dialog = page.locator('.photo-mode');
  check(await dialog.getByRole('button', { name: 'Take photo', exact: true }).evaluate(element => element === document.activeElement), 'photo mode focuses its shutter');
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
  await dialog.waitFor({ state: 'hidden' });
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
  check(image.width <= 2048 && image.height <= 2048, 'photo output is bounded');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.photo-download').click()]);
  check(/^river-oaks-.*\.png$/.test(download.suggestedFilename()), 'download has a shareable PNG filename');
  check(!(await download.failure()), 'PNG download succeeds');
  await dialog.getByRole('button', { name: 'Share photo' }).click();
  await page.waitForFunction(() => document.querySelector('.photo-status').textContent.includes('Sharing cancelled'));
  check(await dialog.locator('.photo-download').isVisible(), 'cancelled OS sharing preserves the downloadable photo');
  await page.screenshot({ path: 'output/playwright/photo-mode-preview.png' });
  await dialog.getByRole('button', { name: 'Back to camera' }).click();
  await dialog.getByRole('button', { name: 'Reset framing' }).click();
  check(await dialog.locator('[name=yaw]').inputValue() === '0', 'framing reset returns pan to zero');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  check(await page.locator('#canvas-host canvas').evaluate(canvas => canvas.style.filter === ''), 'closing restores the live canvas look');
  check(!(await page.evaluate(() => document.body.classList.contains('photographing'))), 'closing restores the game HUD');
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await dialog.locator('[name=format]').selectOption('0.5625');
  const grid = await dialog.locator('.photo-grid-label').boundingBox();
  check(grid.x + grid.width < 390, 'mobile grid control stays inside the panel');
  await dialog.getByRole('button', { name: 'Hide controls' }).click();
  check(await dialog.locator('[name=fov]').isHidden(), 'composition controls collapse for a clear view');
  await page.screenshot({ path: 'output/playwright/photo-mode-mobile.png' });
  const bounds = await dialog.locator('.photo-controls').boundingBox();
  check(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'mobile controls fit the viewport');
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog.locator('.photo-result').waitFor({ state: 'visible' });
  const story = await dialog.locator('img').evaluate(async img => { await img.decode(); return img.naturalWidth / img.naturalHeight; });
  check(Math.abs(story - 9/16) < .003, 'mobile story photo uses 9:16 framing');
  await dialog.getByRole('button', { name: 'Close photo mode' }).click();
  check(!errors.length, `no page errors: ${errors.join('; ')}`);
  return { checks, image, story };
}
