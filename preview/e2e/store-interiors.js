async page => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.charactersReady === '24');
  await page.waitForFunction(() => { const d = document.querySelector('#canvas-host').dataset; return d.storePeopleTotal && d.storePeopleReady === d.storePeopleTotal; }, null, { timeout: 90000 });
  const host = () => page.locator('#canvas-host').evaluate(element => ({ ...element.dataset }));
  const toggle = page.locator('#panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('[data-section=explore-section]').click(); // Places tab: the rail shows one section at a time.
  // Every destination advertises a walk-in interior in the directory.
  const summaries = await page.evaluate(() => {
    const select = document.querySelector('#destination'), out = [];
    for (const option of select.options) { select.value = option.value; select.dispatchEvent(new Event('change')); out.push([option.textContent, document.querySelector('#store-inside').textContent]); }
    return out;
  });
  check(summaries.length === 30 && summaries.every(([, text]) => /walk-in floor/.test(text) && /associate/.test(text)), 'Each destination must describe its walk-in interior');
  await page.locator('#destination').selectOption({ label: 'Cartier' });
  await page.locator('#visit-destination').click(); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'output/playwright/store-interiors-cartier-street.png' });
  await page.locator('#enter-destination').click(); await page.waitForTimeout(1500);
  check(await page.locator('#walking-hud').getAttribute('data-inside'), 'Step inside must place the visitor in a room');
  check((await page.locator('#walking-place').textContent()).startsWith('Inside Cartier'), 'The HUD must name the room');
  await page.screenshot({ path: 'output/playwright/store-interiors-cartier.png' });
  // Walking is bounded by the room: a long walk forward stops at the fixtures and walls.
  await page.locator('#canvas-host').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
  const inside = await page.locator('#walking-hud').evaluate(hud => ({ inside: hud.dataset.inside, distance: Number(hud.dataset.distance) }));
  check(inside.inside && inside.distance > 0.5 && inside.distance < 6, `Walking inside must be bounded by the room: ${JSON.stringify(inside)}`);
  // F steps back onto the pavement and F again re-enters.
  await page.keyboard.press('KeyF'); await page.waitForTimeout(700);
  check(!(await page.locator('#walking-hud').getAttribute('data-inside')), 'F must step outside');
  await page.keyboard.press('KeyF'); await page.waitForTimeout(700);
  check(await page.locator('#walking-hud').getAttribute('data-inside'), 'F at the door must step back inside');
  const rooms = {};
  for (const label of ['Dior', 'Le Colonial', 'Bella Rinova', 'Laura Rathe Fine Art']) {
    await page.locator('#destination').selectOption({ label }); await page.locator('#enter-destination').click(); await page.waitForTimeout(1500);
    await page.screenshot({ path: `output/playwright/store-interiors-${label.split(' ')[0].toLowerCase()}.png` });
    rooms[label] = await page.locator('#walking-place').textContent();
  }
  const stats = await host();
  const frames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous;
    const sample = now => { if (previous !== undefined) samples.push(now - previous); previous = now; if (samples.length < 120) requestAnimationFrame(sample); else { samples.sort((a, b) => a - b); resolve({ samples: 120, median_ms: samples[60], p95_ms: samples[114] }); } };
    requestAnimationFrame(sample);
  }));
  await page.setViewportSize({ width: 3840, height: 2160 }); await toggle.click(); await page.waitForTimeout(1500);
  const buffer = await page.locator('#canvas-host canvas').evaluate(canvas => [canvas.width, canvas.height]);
  check(buffer[0] === 3840 && buffer[1] === 2160, 'The interior sample must use a native UHD drawing buffer');
  await page.screenshot({ path: 'output/playwright/store-interiors-4k.png' });
  check(await page.locator('#canvas-host canvas').evaluate(canvas => canvas.getContext('webgl2').getError()) === 0, 'WebGL must have no pending errors');
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { destinations: summaries.length, people: [Number(stats.storePeopleReady), Number(stats.storePeopleTotal)], rooms, walk: inside, renderStats: JSON.parse(stats.renderStats), frame_sample: frames, frame_sample_scope: 'Local Chrome walking inside boutiques on this Mac; not a target-GPU or UE benchmark', buffer, errors };
}
