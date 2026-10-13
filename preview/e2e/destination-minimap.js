async page => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const requests = [], errors = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/events')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5181/');
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#panel-toggle').click();
  check(await page.locator('#places .world-map-surface').isVisible(), 'A compact minimap is available without enabling shared-world publishing');
  check(await page.locator('.world-events').count() === 0 && requests.length === 0, 'Events is absent and does not fetch its unused service');
  check(!await page.locator('#district-directory').isVisible(), 'The compact map replaces the separate destination browser');
  // A glass sheet that scrolls itself dropped its scrollbar for single frames in Chrome while
  // the map moved under it. The sheets are frames now, and the map card fits instead of scrolling.
  check(await page.locator('.hud-space').evaluateAll(sheets => sheets.length === 2 && sheets.every(sheet => !/(auto|scroll)/.test(getComputedStyle(sheet).overflowY))), 'HUD sheets are frames, never scroll containers');
  for (const [width, height] of [[1440, 1000], [1440, 900], [1440, 700], [1024, 600], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const fit = await page.locator('#places .world-map-surface').evaluate(map => {
      const sheet = map.closest('.hud-space'), scrollers = [];
      for (let node = map.parentElement; node && node !== document.body; node = node.parentElement)
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) scrollers.push(node.id || node.className);
      const bottom = Math.max(...[...sheet.querySelectorAll('.hud-space-body *')].filter(node => node.checkVisibility()).map(node => node.getBoundingClientRect().bottom));
      return { scrollers, fits: bottom <= sheet.getBoundingClientRect().bottom + 0.5, size: map.clientWidth, square: map.clientWidth === map.clientHeight };
    });
    check(fit.scrollers.length === 0, `The compact map does not scroll at ${width}x${height} (${fit.scrollers.join(', ')})`);
    check(fit.fits && fit.size >= 150 && fit.square, `The map card shows the whole map and its controls at ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#places-open').click();
  check(await page.locator('#places-dialog .world-map-surface').isVisible(), 'The same map expands into the destination dialog');
  check(await page.locator('.world-map').count() === 1, 'Expansion reuses one live map');
  await page.locator('#places-search').fill('Dior');
  await page.getByRole('button', { name: 'Show Dior on map', exact: true }).click();
  check((await page.locator('.world-map-hint').textContent()).includes('Selected: Dior'), 'Search results select their real map destination');
  check(await page.locator('.world-map-selection-label').textContent() === 'Dior', 'Selection has a readable destination badge');
  check(await page.locator('.world-map-road-label').count() > 0, 'Real street names orient the map');
  check(await page.locator('.world-map-legend li').count() >= 3, 'Map symbols have distinct legend entries');
  check(await page.locator('.world-map-actions button').first().isEnabled(), 'Selected destinations retain the authoritative travel action');
  await page.locator('#places-search').fill('no matching destination');
  check(await page.locator('#places-no-results').isVisible(), 'Search provides an empty state');
  await page.locator('#places-search').fill('');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const [width, height] of [[1440, 844], [390, 844], [320, 844], [844, 390], [1024, 600]]) {
      await page.setViewportSize({ width, height });
      check(await page.locator('#places-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), 'Expanded map fits without horizontal overflow');
      check(await page.locator('.world-map-surface').evaluate(el => el.clientWidth >= 200 && el.clientHeight >= 200), 'The map remains usable in portrait and landscape');
      check(await page.locator('.world-map-selection-label').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 12 && el.getBoundingClientRect().left >= el.parentElement.getBoundingClientRect().left && el.getBoundingClientRect().right <= el.parentElement.getBoundingClientRect().right), 'Selection stays readable and contained at every map size');
      await page.locator('#places-dialog').screenshot({ path: `output/playwright/destination-minimap-${theme}-${width}x${height}.png` });
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  const mapSurface=page.locator('.world-map-surface'),mapBox=await mapSurface.boundingBox();
  await mapSurface.click({position:{x:mapBox.width*.5,y:mapBox.height*.83}});
  check(await page.locator('.world-map-selection-label').evaluate(el=>{
    const badge=el.getBoundingClientRect(),map=el.parentElement.getBoundingClientRect();
    return badge.top>=map.top&&badge.bottom<=map.bottom&&badge.left>=map.left&&badge.right<=map.right;
  }), 'An edge selection keeps the whole badge inside a narrow map');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Escape');
  await page.locator('#places .world-map-surface').waitFor({ state: 'visible' });
  check(await page.locator('#places .world-map-surface').isVisible(), 'Closing restores the live compact map');
  check(await page.locator('#places-open').evaluate(el => el === document.activeElement), 'Closing restores focus to the expand control');
  await page.locator('#places .world-map-surface').focus();
  await page.keyboard.press('Enter');
  check(await page.locator('#places-dialog').isVisible(), 'The compact map expands from the keyboard');
  await page.keyboard.press('Escape');
  await page.locator('#places .world-map-surface').waitFor({ state: 'visible' });
  check(await page.locator('#places .world-map-surface').evaluate(el => el === document.activeElement), 'Keyboard expansion restores focus to the compact map');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#explore-section').screenshot({ path: 'output/playwright/destination-minimap-compact.png' });
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('Control+k');
  await page.locator('#rail-command-search').fill('events');
  check((await page.locator('.commands-count').textContent()).startsWith('No matching'), 'Events is removed from Commands');
  await page.locator('#rail-command-search').fill('world map');
  await page.keyboard.press('Enter');
  check(await page.locator('#places-dialog').isVisible() && await page.locator('.world-map-surface').evaluate(el => el === document.activeElement), 'Map command expands and focuses the map');
  check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
  return { passed: true, compact: true, expanded: true, search: true, responsive: true, keyboard: true, eventsRemoved: true };
}
