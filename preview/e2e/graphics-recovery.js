async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [], samples = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); console.log(message); };
  page.on('pageerror', error => errors.push(error.message));
  // Read-only instrumentation is injected in the fixture response, never shipped
  // in production. Count actual Three disposal listeners as well as DOM listeners.
  await page.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `\nwindow.__graphicsProbe = () => {
      const resources = new Set();
      for (const texture of [scene.background, scene.environment]) if (texture?.isTexture) resources.add(texture);
      scene.traverse(object => {
        if (object.geometry) resources.add(object.geometry);
        if (object.isInstancedMesh) resources.add(object);
        for (const resource of [object.morphTexture, object.skeleton?.boneTexture, object.shadow?.map, object.shadow?.mapPass]) if (resource) resources.add(resource);
        for (const material of [].concat(object.material ?? [])) {
          resources.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
          for (const uniform of Object.values(material.uniforms ?? {})) if (uniform.value?.isTexture) resources.add(uniform.value);
        }
      });
      let listeners = 0;
      for (const resource of resources) for (const list of Object.values(resource._listeners ?? {})) listeners += list.length;
      const self = multiplayer?.snapshot?.players.find(player => player.id === multiplayer.identity?.id);
      let avatarMeshes = 0;
      playerAvatar?.object.traverseVisible(object => { if (object.isMesh && object.material?.visible !== false) avatarMeshes++; });
      return { memory: {...renderer.info.memory}, listeners, resources: resources.size, frames: renderedFrames,
        camera: {position: camera.position.toArray(), quaternion: camera.quaternion.toArray()}, ready: host.dataset.playerReady, avatar: Boolean(playerAvatar?.object.visible && avatarMeshes), position: self?.position,
        identity: multiplayer?.identity?.id, connected: multiplayer?.connected, recovered: recoveredGraphicsPage,
        localPosition: walking?.getPose()?.position, reflections: {...storefrontReflections?.stats}, quality: quality.stats, cycles: graphicsCycles.cycles };
    };` });
  });
  const cdp = await page.context().newCDPSession(page);
  const domListeners = async () => {
    let count = 0;
    for (const expression of ['window', 'document', 'document.querySelector("#viewport canvas")']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      count += listeners.length;
      await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
    }
    return count;
  };
  const probe = () => page.evaluate(() => window.__graphicsProbe());
  const ready = async () => {
    await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
    await page.locator('#loading').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport').dataset.assetProgress || '{}').done, null, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.renderStats);
  };
  const lose = () => page.evaluate(() => new Promise(resolve => {
    const canvas = document.querySelector('#viewport canvas');
    const extension = window.__nativeGraphicsExtension?.(canvas) ?? canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context unavailable');
    window.graphicsTestExtension = extension;
    canvas.addEventListener('webglcontextlost', () => queueMicrotask(resolve), { once: true });
    extension.loseContext();
  }));
  const restore = async () => {
    const before = (await probe()).frames;
    await page.evaluate(() => window.graphicsTestExtension.restoreContext());
    await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.graphicsState === 'ok');
    await page.waitForFunction(before => JSON.parse(document.querySelector('#canvas-host').dataset.renderStats).frames > before, before);
  };
  await page.setViewportSize({ width: 1000, height: 750 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1'); await ready();
  await openHudSpace(page, 'settings-section', 'Graphics');
  const before = await probe();
  await lose();
  check(await page.getByRole('status').filter({ hasText: 'Restoring graphics…' }).isVisible(), 'a: polite restoration status is visible inside the open settings dialog');
  const paused = (await probe()).frames;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  check((await probe()).frames === paused, 'a: frames stop while graphics are lost');
  await page.locator('#settings-dialog').getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('status').filter({ hasText: 'Restoring graphics…' }).waitFor({ state: 'visible' });
  await openHudSpace(page, 'settings-section', 'Graphics');
  check(await page.locator('#settings-dialog #graphics-recovery').isVisible(), 'a: the status follows closing and reopening a modal during loss');
  await restore();
  const after = await probe();
  await page.screenshot({ path: 'output/playwright/graphics-recovery-restored.png' });
  check(after.ready === 'true' && after.avatar && after.frames > before.frames, 'a: restored frames advance and the avatar remains visible');
  check(after.identity === before.identity && after.connected, 'a: the same signed-in player remains connected');
  check(JSON.stringify(after.position) === JSON.stringify(before.position), 'a: authoritative position survives in-place recovery');
  check(await page.locator('#settings-dialog').evaluate(dialog => dialog.open), 'a: the open settings dialog survives recovery');
  await page.locator('#settings-dialog').getByRole('button', { name: 'Close settings' }).click();
  await page.screenshot({ path: 'output/playwright/graphics-recovery-restored-world.png' });
  await page.locator('#canvas-host').focus(); await page.keyboard.down('KeyW');
  try { await page.waitForFunction(position => {
    const current = window.__graphicsProbe().position;
    return Math.hypot(current[0] - position[0], current[1] - position[1]) > 0.15;
  }, after.position); } finally { await page.keyboard.up('KeyW'); }
  check(true, 'a: walking still reaches an authoritative changed position');

  // The third distinct loss in two minutes trips the crash-loop limit.
  await lose(); await restore(); await lose();
  const retry = page.getByRole('button', { name: 'Reload graphics', exact: true });
  await retry.waitFor({ state: 'visible' });
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('river-oaks-graphics')).recoveryTier === 'smooth'), 'b: the crash loop persists one step from Auto to Smoothest');
  await retry.focus();
  await retry.evaluate(button => button.addEventListener('click', () => { window.graphicsRetryKeptFocus = button === document.activeElement; }, { once: true }));
  await retry.click();
  check(await page.evaluate(() => window.graphicsRetryKeptFocus), 'b: retry keeps keyboard focus while restoring');
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.graphicsState === 'ok');
  check((await probe()).identity === before.identity, 'b: retry restores graphics without signing out');
  await page.reload(); await ready();
  check(await page.evaluate(() => JSON.parse(document.querySelector('#canvas-host').dataset.quality).mode === 'smooth'), 'b: recovery quality survives a page reload');

  await lose();
  await retry.waitFor({ state: 'visible', timeout: 20000 });
  check((await probe()).cycles.at(-1).outcome === 'timeout', 'c: absent restore reaches the bounded timeout and retry');
  await retry.click(); await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.graphicsState === 'ok');

  // Each iteration is a real context loss/restore. Deliberate user retries reset
  // the loop limit where needed; no timers or acceptance thresholds are bypassed.
  for (let cycle = 0; cycle < 5; cycle++) {
    const beforeCycle = await probe(), beforeFrames = beforeCycle.frames;
    await lose();
    const capturesAtLoss = (await probe()).reflections.captures;
    if (await retry.isVisible()) {
      await retry.click(); await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.graphicsState === 'ok');
    } else await restore();
    await page.waitForFunction(before => JSON.parse(document.querySelector('#canvas-host').dataset.renderStats).frames > before, beforeFrames);
    // A restored main frame precedes the six incremental reflection faces.
    // Compare complete rebuilds, not whichever partial cube happened to render
    // before the once-per-second render-stats publication.
    await page.waitForFunction(captures => window.__graphicsProbe().reflections.captures > captures, capturesAtLoss);
    const result = await probe();
    samples.push({ memory: result.memory, listeners: result.listeners, resources: result.resources, frames: result.frames, reflections: result.reflections, capturesBefore: beforeCycle.reflections?.captures, capturesAtLoss, quality: result.quality, domListeners: await domListeners() });
  }
  console.log('Five-cycle samples:', JSON.stringify(samples));
  const first = samples[0];
  check(samples.every(sample => sample.reflections.captures > sample.capturesAtLoss && !sample.reflections.failed), 'd: each resource sample follows a completed reflection rebuild');
  check(samples.every(sample => sample.domListeners === first.domListeners), 'd: five cycles keep DOM listener counts fixed');
  check(samples.every(sample => sample.listeners <= first.listeners), 'd: five cycles keep GPU-resource listener counts bounded');
  check(samples.every(sample => sample.memory.geometries <= first.memory.geometries && sample.memory.textures <= first.memory.textures), 'd: five cycles keep renderer geometry and texture counts bounded');
  await page.screenshot({ path: 'output/playwright/graphics-recovery-five-cycles.png' });

  // Model a browser that does not expose the restore extension to the app. The
  // journey retains the native method solely to cause a real context loss.
  await page.addInitScript(() => {
    const native = WebGL2RenderingContext.prototype.getExtension;
    window.__nativeGraphicsExtension = canvas => native.call(canvas.getContext('webgl2'), 'WEBGL_lose_context');
    WebGL2RenderingContext.prototype.getExtension = function(name) { return name === 'WEBGL_lose_context' ? null : native.call(this, name); };
  });
  const destination = (await probe()).position;
  await page.goto(`http://127.0.0.1:5173/?motion-debug=1&at=${destination[0]},${destination[1]},0`); await ready();
  await page.locator('#canvas-host').focus(); await page.keyboard.down('KeyW');
  try { await page.waitForFunction(position => {
    const current = window.__graphicsProbe().position;
    return Math.hypot(current[0] - position[0], current[1] - position[1]) > .2;
  }, destination); } finally { await page.keyboard.up('KeyW'); }
  await page.locator('.multiplayer-chat-form input').fill('Unsent recovery draft');
  await openHudSpace(page, 'settings-section', 'Graphics');
  await lose(); await retry.waitFor({ state: 'visible', timeout: 20000 });
  // Measure the reload boundary after the last movement acknowledgement arrives.
  // A pre-loss snapshot can still precede the final locally rendered walking pose.
  const fallbackBefore = await probe();
  check(await page.evaluate(() => sessionStorage.getItem('river-oaks-graphics-reload') === null), 'fallback: timeout never reloads or stores a handoff without a user retry');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), retry.click()]); await ready();
  await page.locator('#settings-dialog').waitFor({ state: 'visible' });
  const fallbackAfter = await probe();
  console.log('Fallback before/after:', JSON.stringify({ before: fallbackBefore, after: fallbackAfter }));
  check(fallbackAfter.identity === fallbackBefore.identity && JSON.stringify(fallbackAfter.position) === JSON.stringify(fallbackBefore.position), 'fallback: deliberate reload preserves identity and authoritative position without replaying the shared link');
  check(fallbackAfter.localPosition[0] === fallbackBefore.position[0] && fallbackAfter.localPosition[2] === -fallbackBefore.position[1], 'fallback: local walking resumes at the unchanged authoritative position');
  check(await page.locator('.multiplayer-chat-form input').inputValue() === 'Unsent recovery draft', 'fallback: settings and the unsent chat draft survive reload');
  await page.locator('#settings-dialog').getByRole('button', { name: 'Close settings' }).click();
  await page.locator('.commands-toggle').click();
  await page.locator('.rail-commands').getByRole('button', { name: /Photo mode/ }).click();
  await page.locator('#photo-yaw').evaluate(input => { input.value = '18'; input.dispatchEvent(new Event('input')); });
  await page.locator('.photo-mode').getByRole('button', { name: 'Take photo', exact: true }).click();
  await page.locator('.photo-result').waitFor({ state: 'visible' });
  const retained = await page.locator('.photo-result img').getAttribute('src');
  const photoBefore = (await probe()).camera;
  await lose(); await retry.waitFor({ state: 'visible', timeout: 20000 });
  const navigationBefore = page.url();
  await retry.click();
  await page.locator('#graphics-recovery [role=status]').filter({ hasText: 'Your photo and framing are still here.' }).waitFor();
  check(page.url() === navigationBefore && await page.locator('.photo-result img').getAttribute('src') === retained, 'fallback: retained photo remains downloadable without a reload');
  check(JSON.stringify((await probe()).camera) === JSON.stringify(photoBefore), 'fallback: the actual photo camera transform remains unchanged');
  console.log('Photo download hit target:', await page.locator('.photo-download').evaluate(link => {
    const rect = link.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { target: hit?.closest('#graphics-recovery') ? 'graphics-recovery' : hit?.className, bounds: rect.toJSON() };
  }));
  for (const viewport of [{ width: 1000, height: 750 }, { width: 390, height: 740 }]) {
    await page.setViewportSize(viewport);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.photo-download').click()]);
    check(!await download.failure(), `fallback: the retained photo downloads after loss at ${viewport.width}px`);
    await page.screenshot({ path: `output/playwright/graphics-recovery-photo-${viewport.width}.png` });
  }
  await page.locator('.photo-discard').click();
  await page.locator('.photo-close').click();
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), retry.click()]); await ready();
  check((await probe()).identity === fallbackBefore.identity && (await probe()).connected, 'fallback: discarding and closing Photo mode permits a deliberate reload without signing out');
  check(errors.length === 0, `no uncaught browser errors (${errors.length})`);
  await cdp.detach();
  return { checks, samples, errors };
}
