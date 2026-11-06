async page => {
  const checks = [], measurements = [], failures = [];
  const check = (ok, label) => { if (!ok) failures.push(label); else checks.push(label); };
  const measure = (node, standalone = false) => {
    const parse = value => {
      const parts = value.match(/[\d.]+/g).map(Number);
      return [...parts.slice(0, 3), parts[3] ?? 1];
    };
    const blend = (front, back) => front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3]));
    const luminance = color => color.map(value => value / 255).reduce((sum, value, i) =>
      sum + [.2126, .7152, .0722][i] * (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4), 0);
    const style = getComputedStyle(node), sheet = getComputedStyle(node.closest('.walking-console'));
    // Bound the glass against both backdrop extremes. Button wrappers are
    // transparent; floating notices sit outside the sheet and blend directly.
    const ratios = [0, 255].map(level => {
      const background = blend(parse(style.backgroundColor), standalone ? [level, level, level] : blend(parse(sheet.backgroundColor), [level, level, level]));
      const foreground = blend(parse(style.color), background);
      const light = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
      return (light[1] + .05) / (light[0] + .05);
    });
    return { name: node.getAttribute('aria-label') ?? node.id, ratios, held: node.classList.contains('held'),
      focusVisible: node.matches(':focus-visible'), outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
      color: style.color, background: style.backgroundColor };
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
    && JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress ?? '{}').done);
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  if (await page.locator('.visit-tools').evaluate(node => node.open)) await page.locator('.visit-tools-toggle').click();
  if (await page.locator('.town-chat-dock').evaluate(node => node.open)) await page.locator('.town-chat-dock > summary').click();
  if (await page.locator('#walking-movement').isHidden()) await page.locator('#walking-controls-toggle').click();
  // Capture the settled HUD after the real completion badge steps aside.
  await page.locator('.asset-progress').waitFor({ state: 'hidden' });
  const buttons = page.locator('.walking-pad button');
  check(await buttons.count() === 6, 'All six movement controls are present');
  // The opt-in Pink Jet-Age HUD skin (pink-jet-age-hud.css, #746) is token-only, so the
  // finish switches live; classic is measured first under its own unprefixed labels.
  for (const finish of ['classic', 'pink-jet-age']) for (const shade of ['light', 'dark']) {
    const theme = finish === 'classic' ? shade : `${finish}-${shade}`;
    await page.evaluate(([shade, finish]) => {
      document.documentElement.dataset.theme = shade;
      document.documentElement.dataset.finish = finish;
    }, [shade, finish]);
    // Expose the actual notice surface with fixture text. This checks its CSS,
    // not the interaction or announcement path that produced the message.
    const notice = page.locator('#walking-notice');
    const previousNotice = await notice.evaluate(node => ({ hidden: node.hidden, text: node.textContent }));
    await notice.evaluate(node => { node.textContent = 'Tower lantern lit · 1 of 5'; node.hidden = false; });
    const noticeMeasurement = await notice.evaluate(measure, true);
    measurements.push({ theme, state: 'floating-notice', controls: [noticeMeasurement] });
    await page.screenshot({ path: `output/playwright/walking-notice-${theme}.png` });
    check(Math.min(...noticeMeasurement.ratios) >= 4.5, `${theme}/notice: foreground contrast at least 4.5 (${noticeMeasurement.ratios.map(n => n.toFixed(2)).join(', ')})`);
    await notice.evaluate((node, previous) => { node.hidden = previous.hidden; node.textContent = previous.text; }, previousNotice);

    for (const state of ['normal', 'hover', 'held', 'focus']) {
      const rows = [];
      for (const button of await buttons.all()) {
        await page.mouse.move(0, 0);
        await button.evaluate(node => node.blur());
        if (state === 'hover' || state === 'held') await button.hover();
        if (state === 'held') await page.mouse.down();
        if (state === 'focus') { await page.keyboard.press('Tab'); await button.focus(); }
        try {
          rows.push(await button.evaluate(measure));
          if (state === 'held' && rows.length === 6) await page.screenshot({ path: `output/playwright/walking-controls-${theme}-${state}.png` });
        } finally { if (state === 'held') await page.mouse.up(); }
      }
      measurements.push({ theme, state, controls: rows });
      if (state !== 'held') await page.screenshot({ path: `output/playwright/walking-controls-${theme}-${state}.png` });
      for (const row of rows) {
        check(Math.min(...row.ratios) >= 4.5, `${theme}/${state}/${row.name}: foreground contrast at least 4.5 (${row.ratios.map(n => n.toFixed(2)).join(', ')})`);
        if (state === 'held') check(row.held, `${theme}/${row.name}: pointer hold activates movement feedback`);
        if (state === 'focus') check(row.focusVisible && row.outline !== 'none' && row.outlineWidth >= 2, `${theme}/${row.name}: keyboard focus has a visible outline`);
      }
    }
  }
  check(await buttons.evaluateAll(nodes => nodes.every(node => !node.classList.contains('held'))), 'Pointer release clears every held control');
  if (failures.length) throw new Error(failures.join('\n'));
  return { checks, measurements, scope: 'Loaded walking HUD CSS, fixture notice text and real pointer/focus states; glass contrast bounded over black/white backgrounds. No human or physical-device acceptance.' };
}
