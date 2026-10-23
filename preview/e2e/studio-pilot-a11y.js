async page => {
  // #417 keyboard, focus, reduced-motion and narrow-layout checks for Garden Office.
  // Automated evidence only: it does not replace a human screen-reader or touch review.
  const origin = 'http://127.0.0.1:5173', errors = [], checks = [], layouts = {};
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const open = async name => {
    await page.locator('#studio-templates').click();
    await page.getByRole('button', { name: `Use ${name}`, exact: true }).click();
    await page.getByRole('status').filter({ hasText: `${name} opened` }).waitFor();
  };
  const focused = () => page.evaluate(() => {
    const active = document.activeElement;
    return active ? (active.id || active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 40) || active.tagName) : null;
  });
  const position = async () => {
    await page.waitForFunction(() => /-?[\d.]+ E \/ -?[\d.]+ N/.test(document.querySelector('#studio-position').textContent));
    const [, east, north] = (await page.locator('#studio-position').textContent()).match(/(-?[\d.]+) E \/ (-?[\d.]+) N/);
    return [Number(east), Number(north)];
  };

  // Narrow layouts with the current chrome present.
  for (const [width, height] of [[320, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/studio.html`);await page.waitForSelector('body[data-studio-ready="true"]');
    await open('Garden Office');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const reachable = {};
    for (const [label, locator] of [['Walk through', page.getByRole('button', { name: 'Walk through', exact: true })], ['Undo', page.locator('#studio-undo')],
      ['Redo', page.locator('#studio-redo')], ['Save on device', page.locator('#studio-save')], ['Space templates', page.locator('#studio-templates')]]) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      reachable[label] = Boolean(box && box.width >= 24 && box.height >= 24 && box.x >= 0 && box.x + box.width <= width + 1);
    }
    await page.screenshot({ path: `output/playwright/studio-a11y-${width}.png` });
    layouts[width] = { overflow, reachable };
    check(overflow <= 0, `${width} px: no sideways scroll (overflow ${overflow} px)`);
    for (const [label, ok] of Object.entries(reachable)) check(ok, `${width} px: ${label} is reachable and at least 24 px`);
  }

  // Keyboard only, at the review viewport.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/studio.html`);await page.waitForSelector('body[data-studio-ready="true"]');
  await open('Garden Office');
  // Panels are rebuilt on every edit; the control being used must keep focus.
  const active = () => page.evaluate(() => { const element = document.activeElement;return element?.dataset.item ?? element?.name ?? element?.tagName; });
  await page.locator('[data-item="work-desk-1"]').focus();await page.keyboard.press('Enter');
  check((await page.locator('#studio-selected').textContent()).includes('Work Desk 1'), 'Enter on a scene object selects it');
  check(await active() === 'work-desk-1', `focus stays on the selected scene object (${await active()})`);
  const east = page.getByLabel('East (m)', { exact: true }), before = await east.inputValue();
  await east.focus();await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');await page.keyboard.type('-5.5');await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  check(await east.inputValue() === '-5.5', 'a typed position commits without dragging');
  check(await active() === 'north', `Tab after an edit reaches the next field (${await active()})`);
  await east.focus();await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');await page.keyboard.type('-5');await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');
  check(await east.inputValue() === '-5' && await active() === 'east', `Enter commits an edit and keeps focus in its field (${await active()})`);
  // From a non-text control, so Studio's shortcut handles it rather than the field's own undo.
  await page.locator('[data-item="work-desk-1"]').focus();
  for (let step = 0; step < 2; step++) {await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');await page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');}
  check(await page.getByLabel('East (m)', { exact: true }).inputValue() === before, 'the undo shortcut restores it');
  // Redoing then undoing from the buttons until history runs out hands focus across, not to the page.
  const historyKey = async id => {
    for (let step = 0; step < 4 && await page.locator(id).isEnabled(); step++) {await page.keyboard.press('Enter');await page.waitForFunction(() => document.body.dataset.studioBusy !== 'true');}
    // Studio hands focus on after the event that disabled the button.
    await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body && !document.activeElement.disabled, null, { timeout: 2000 }).catch(() => {});
    return page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  };
  await page.locator('#studio-redo').focus();
  const afterRedo = await historyKey('#studio-redo');
  check(afterRedo === 'studio-undo', `focus moves to Undo when Redo runs out (${afterRedo})`);
  const afterUndo = await historyKey('#studio-undo');
  check(afterUndo === 'studio-redo', `and to Redo when Undo runs out (${afterUndo})`);

  // Every Tab stop shows a focus indicator. Undo ran out past opening the template, so reopen it.
  await open('Garden Office');
  await page.locator('[data-item="work-desk-1"]').focus();
  const stops = [], unmarked = [];
  for (let step = 0; step < 200; step++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;if (!element || element === document.body) return null;
      const style = getComputedStyle(element), parent = element.parentElement && getComputedStyle(element.parentElement);
      const ring = value => value && value.outlineStyle !== 'none' && parseFloat(value.outlineWidth) > 0;
      return { name: `${element.tagName.toLowerCase()}#${element.id || element.dataset.item || element.name || element.getAttribute('aria-label') || element.textContent.trim().slice(0, 30)}`,
        marked: ring(style) || style.boxShadow !== 'none' || Boolean(element.parentElement?.matches('.studio-open, .studio-agent-pill') && ring(parent)) };
    });
    if (!stop || stops.includes(stop.name)) break;
    stops.push(stop.name);if (!stop.marked) unmarked.push(stop.name);
  }
  check(stops.length > 20 && !unmarked.length, `every one of ${stops.length} Tab stops shows focus${unmarked.length ? ` (none on ${unmarked.join(', ')})` : ''}`);

  await page.getByRole('button', { name: 'Walk through', exact: true }).focus();await page.keyboard.press('Enter');
  await page.waitForSelector('body[data-mode="walk"]');
  const start = await position();
  // The right arrow turns right (as in the office walk). Measure only W's step: it heads
  // east after a real turn, but still north if the arrow merely strafed.
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(1000);await page.keyboard.up('ArrowRight');
  const turned = await position();
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  const moved = await position(), eastward = moved[0] - turned[0], northward = moved[1] - turned[1];
  check(Math.abs(eastward) > Math.abs(northward) && eastward > .3, `the keyboard turns the walker (W moved ${eastward.toFixed(1)} E, ${northward.toFixed(1)} N after →; start ${start.join(', ')})`);
  await page.keyboard.press('Escape');await page.waitForSelector('body[data-mode="edit"]');
  const afterWalk = await focused();
  check(Boolean(afterWalk) && afterWalk !== 'BODY', `focus stays on a control after leaving walk mode (${afterWalk})`);

  // Reduced motion: nothing in Studio animates.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#studio-templates').click();await page.getByRole('dialog', { name: 'Choose a space' }).waitFor();
  const animations = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
  await page.keyboard.press('Escape');
  check(animations === 0, `no running animations with reduced motion (${animations})`);
  check(await focused() === 'studio-templates', 'closing the chooser returns focus to its button');
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  return { passed: true, checks, layouts };
}
