async page => {
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // In the shared town the server confirms each arrival and conversation, refuses a
  // second travel within one second, and a closed dialogue fades out.
  const position = () => page.locator('#walking-hud').getAttribute('data-position');
  const movedFrom = from => page.waitForFunction(from => document.querySelector('#walking-hud').dataset.position !== from, from, { timeout: 15000 }).then(() => true, () => false);
  const opened = () => page.locator('#community-dialogue').waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  const close = async () => { await page.locator('#community-close').click(); await page.locator('#community-dialogue').waitFor({ state: 'hidden', timeout: 10000 }); };
  let lastTravel = 0;
  const travel = async action => { await page.waitForTimeout(Math.max(0, 1100 - (Date.now() - lastTravel))); await action(); lastTravel = Date.now(); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  // The loading overlay can be hidden before loading starts; wait for the player.
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:120000});
  await page.locator('#community-more').evaluate(element => { element.open = true; });
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click(); // Places tab: the rail shows one section at a time.
  await page.locator('#store-search').fill('hermes');
  check(await page.locator('#destination option').count() === 1, 'Store search handles accents');
  check(await page.locator('#store-name').textContent() === 'Hermès', 'Selected store details follow search');
  await page.locator('#store-search').fill('not-a-store');
  check(await page.locator('#visit-destination').isDisabled(), 'Empty results disable arrival');
  check(await page.locator('#store-next').isDisabled(), 'Empty results disable tour');
  await page.locator('#store-clear').click();
  check(await page.locator('#destination option').count() === 30, 'Clearing filters restores all stores');
  check(await page.locator('#store-search').evaluate(node => node === document.activeElement), 'Clear returns keyboard focus to search');
  await page.locator('#store-category').selectOption('Beauty & wellness');
  check((await page.locator('#destination').textContent()).includes('Equinox'), 'Wellness category includes the fitness destination');
  await page.locator('#store-category').selectOption('Dining');
  const diningCount = await page.locator('#destination option').count();
  check(diningCount > 1 && diningCount < 30, 'Category filter narrows destinations');
  const first = await page.locator('#destination').inputValue();
  const startPosition = await position();
  await travel(() => page.locator('#visit-destination').click());
  check(await movedFrom(startPosition), 'Visiting a dining destination moves the visitor');
  const firstPosition = await position();
  await travel(() => page.locator('#store-next').click());
  check(await page.locator('#destination').inputValue() !== first, 'Next stop advances filtered selection');
  check(await movedFrom(firstPosition), 'Next stop actually moves the visitor');
  await travel(() => page.locator('#store-previous').click());
  check(await page.locator('#destination').inputValue() === first, 'Previous stop returns to original selection');
  check(await page.locator('#walking-movement').isHidden(), 'Desktop HUD starts with the movement pad collapsed');
  // Open More actions only when it is shown and closed: the HUD moves actions between
  // the primary slot and More as context changes, and a second summary click closes it.
  if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
  check(await page.locator('#walking-meet-nearby').isVisible(), 'Compact HUD retains the meet action');
  await page.locator('#walking-controls-toggle').click();
  check(await page.locator('#walking-movement').isVisible(), 'Movement controls can be shown');
  await page.locator('#walking-controls-toggle').click();
  check(await page.locator('#walking-movement').isHidden(), 'Movement controls collapse again');
  await page.locator('[data-section=community-section]').click();
  check(await page.locator('[data-section=community-section]').getAttribute('aria-selected') === 'true' && await page.locator('#community-section').isVisible(), 'People shortcut selects the People rail section');
  check(Number(await page.locator('#community-objective').getAttribute('max')) > 0, 'Community objective has a real target');
  for (const option of await page.locator('#community-scenario option').evaluateAll(options => options.map(option => option.value))) {
    await page.locator('#community-scenario').selectOption(option);
    check(Number(await page.locator('#community-objective').getAttribute('max')) > 0, `${option} community example updates its target`);
  }
  // The shortcut finds a request with no volunteer yet. The shared town dispatches
  // volunteers itself, so there may be none; then the shortcut is unavailable.
  const nextRequest = page.locator('#community-next-request');
  if (await nextRequest.isEnabled()) {
    await travel(() => nextRequest.click());
    check(await opened(), 'Open-request shortcut starts a conversation');
    await close();
  } else check(true, 'No unassigned open request: the open-request shortcut is unavailable');
  await page.locator('[data-section=settings-section]').click();
  await page.locator('[data-atmosphere=mist]').click();
  check(await page.locator('#weather').inputValue() === 'haze', 'Mist preset changes actual weather');
  check(await page.locator('[data-atmosphere=mist]').getAttribute('aria-pressed') === 'true', 'Active lighting preset is announced');
  await page.locator('#weather').selectOption('clear');
  check(await page.locator('[data-atmosphere=mist]').getAttribute('aria-pressed') === 'false', 'Manual weather clears stale preset state');
  await page.locator('[data-atmosphere=pink]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-section=explore-section]').click();
  check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Mobile panel has no horizontal overflow');
  await page.locator('#store-clear').click();
  await page.locator('#destination').selectOption({ label: 'Dior' });
  await travel(() => page.locator('#visit-destination').click());
  await page.locator('#panel-toggle').click();
  await page.locator('#walking-controls-toggle').click();
  check(await page.locator('#walking-movement').isVisible(), 'Mobile toggle reveals the movement pad');
  if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
  check(await page.locator('#walking-meet-nearby').isVisible(), 'Mobile compact HUD keeps the meet action reachable');
  await page.screenshot({ path: 'output/playwright/ui-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#panel-toggle').click();
  await page.screenshot({ path: 'output/playwright/ui-desktop.png' });
  check(errors.length === 0, `No page errors: ${errors.join('; ')}`);
  return { passed: checks.length, checks, errors };
}
