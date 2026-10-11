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
  await page.locator('#places-open').click();
  check(await page.locator('#places-dialog .world-map-surface').isVisible(), 'The same map expands into the destination dialog');
  check(await page.locator('.world-map').count() === 1, 'Expansion reuses one live map');
  await page.locator('#places-search').fill('Dior');
  await page.getByRole('button', { name: 'Show Dior on map', exact: true }).click();
  check((await page.locator('.world-map-hint').textContent()).includes('Selected: Dior'), 'Search results select their real map destination');
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
      await page.locator('#places-dialog').screenshot({ path: `output/playwright/destination-minimap-${theme}-${width}x${height}.png` });
    }
  }
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
