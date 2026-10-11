async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep real GPU drawing; only substitute driver metadata at the browser API
  // boundary so this startup regression does not depend on a host's GPU setting.
  await page.addInitScript(() => {
    const mode = new URLSearchParams(location.search).get('test-renderer');
    if (mode === 'unavailable') {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return /^webgl/.test(type) ? null : getContext.call(this, type, ...args);
      };
      return;
    }
    const proto = WebGL2RenderingContext.prototype;
    const getExtension = proto.getExtension, getParameter = proto.getParameter;
    proto.getExtension = function(name) {
      if (name === 'WEBGL_debug_renderer_info') return mode === 'unknown' ? null : { UNMASKED_RENDERER_WEBGL: 0x9246 };
      return getExtension.call(this, name);
    };
    proto.getParameter = function(key) {
      if (key === 0x9246) return mode === 'software' ? 'ANGLE (Google, SwiftShader Device (Subzero))' : 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3)';
      if (key === this.RENDERER && mode === 'unknown') return 'WebKit WebGL';
      return getParameter.call(this, key);
    };
  });
  const visit = mode => page.goto(`http://127.0.0.1:5173/?test-renderer=${mode}`);
  const notice = page.locator('.hardware-acceleration-warning');
  await visit('software');
  await notice.waitFor({ state: 'visible' });
  check((await notice.innerText()).includes('restart your browser'), 'warning explains how to enable acceleration and restart');
  check(await notice.getByRole('status').count() === 1, 'warning has a polite status announcement');
  check(await page.evaluate(() => !document.querySelector('.hardware-acceleration-warning').contains(document.activeElement)), 'arrival does not steal focus');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  check(await notice.isVisible(), 'software rendering warns without blocking world startup');
  await page.screenshot({ path: 'output/playwright/hardware-acceleration-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await notice.boundingBox();
  check(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'warning fits a narrow viewport');
  await page.screenshot({ path: 'output/playwright/hardware-acceleration-mobile.png' });
  // A warning must not block the controls beneath its noninteractive message.
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  check(await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true', 'mobile navigation remains usable while the warning is visible');
  await page.locator('#panel-toggle').click();
  const dismiss = notice.getByRole('button', { name: 'Dismiss graphics performance warning' });
  await dismiss.focus();
  await page.keyboard.press('Enter');
  check(await notice.count() === 0, 'keyboard dismissal removes the warning');
  check(await page.evaluate(() => document.activeElement.id === 'canvas-host'), 'dismissal returns keyboard focus to the world');
  await page.reload();
  await notice.waitFor({ state: 'visible' });
  check(true, 'a new visit checks acceleration again');
  for (const mode of ['gpu', 'unknown']) {
    await visit(mode);
    await page.locator('#loading').waitFor({ state: 'hidden' });
    check(await notice.count() === 0, `${mode} metadata does not produce a false warning`);
  }
  await visit('unavailable');
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('error'));
  check((await page.locator('#loading').innerText()).includes('Check that hardware or graphics acceleration is enabled'), 'unavailable WebGL provides actionable guidance without asserting its cause');
  check(errors.length === 0, `no uncaught page errors: ${errors.join('; ')}`);
  return { passed: true, checks };
}
