async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.goto('http://127.0.0.1:5181/');
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  check(!await page.locator('#places-list').isVisible(), 'Destination collection stays out of the everyday rail');
  check(!await page.locator('#landmark-name').isVisible(), 'Landmark management stays out of the everyday rail');
  await page.locator('#control-panel').screenshot({path: 'output/playwright/places-guide-rail.png'});
  await page.locator('#places-open').click();
  const guide = page.locator('#places-dialog');
  await guide.waitFor({state: 'visible'});
  const search = page.locator('#places-search');
  check(await search.evaluate(el => el === document.activeElement), 'Opening the guide focuses search');
  await search.fill('no such destination 9876');
  check(await page.locator('#places-no-results').isVisible(), 'Search has an explicit empty state');
  await search.fill('Herm');
  check(await page.locator('#places-list li:visible').count() > 0, 'Search finds matching destinations');
  check(!await page.locator('#places-list button[aria-label^="Copy"]').first().isVisible(), 'Sharing is secondary');
  await search.fill('');
  const dining = page.locator('.places-filters button[data-category="dining"]');
  check(await dining.count() === 1, 'Store categories become filters');
  const expected = Number(await dining.locator('.places-filter-count').textContent());
  await dining.click();
  check(await dining.getAttribute('aria-pressed') === 'true', 'The chosen filter is announced as pressed');
  const shown = await page.locator('#places-list li:visible').evaluateAll(rows => rows.map(row => row.dataset.category));
  check(shown.length === expected && expected > 0 && shown.every(category => category === 'dining'), 'A category filter shows exactly that category');
  await guide.screenshot({path: 'output/playwright/places-guide-filter.png'});
  await search.fill('no such destination 9876');
  await page.locator('#places-no-results button').click();
  check(await search.inputValue() === '' && await page.locator('#places-list li:visible').count() === await page.locator('#places-list li').count(), 'Show all places clears the search and the filter');
  await page.locator('#places-tab-destinations').focus();
  await page.keyboard.press('ArrowRight');
  check(await page.locator('#places-tab-saved').getAttribute('aria-selected') === 'true', 'Arrow keys switch guide tabs');
  await page.locator('#landmark-name').fill('Guide test spot');
  await page.locator('#landmark-add').click();
  await page.waitForFunction(() => document.querySelector('#places-status').textContent.includes('Saved Guide test spot'));
  check(await page.locator('#landmarks-list .place-name').last().textContent() === 'Guide test spot', 'Saved landmarks remain available');
  await guide.screenshot({path: 'output/playwright/places-guide-saved.png'});
  await page.locator('#landmarks-list .place-more > summary').last().click();
  await page.locator('#landmarks-list button[aria-label^="Remove"]').last().click();
  await page.waitForFunction(() => document.querySelector('#places-status').textContent.includes('Removed Guide test spot'));
  check(await page.locator('#landmark-name').evaluate(el => el === document.activeElement), 'Removal leaves focus on a useful surviving control');
  await page.keyboard.press('Escape');
  check(!await guide.isVisible(), 'Escape closes the guide');
  check(await page.locator('#places-open').evaluate(el => el === document.activeElement), 'Closing restores launcher focus');
  await page.locator('.commands-toggle').click();
  await page.locator('#rail-command-search').fill('Save a landmark');
  await page.keyboard.press('Enter');
  check(await guide.isVisible() && await page.locator('#landmark-name').evaluate(el => el === document.activeElement), 'Save command opens the correct guide tab');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 844});
      await page.locator('#places-tab-destinations').click();
      await search.fill('');
      check(await guide.evaluate(el => el.scrollWidth <= el.clientWidth), 'Guide fits the viewport without horizontal scrolling');
      await guide.screenshot({path: `output/playwright/places-guide-${theme}-${width}.png`});
    }
  }
  return {passed: true, search: true, landmarks: true, commands: true, keyboard: true, responsive: true};
}
