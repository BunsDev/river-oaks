async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  check(await page.locator('#walking-hud').isVisible(), 'District should start on foot');
  const toggle = page.locator('#panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  check(await page.locator('#destination option').count() === 30, 'Expected current mapped directory destinations');
  await page.locator('[data-theme-preference=dark]').click();
  check(await page.locator('html').getAttribute('data-theme') === 'dark', 'Dark appearance must apply');
  await page.locator('#panel-toggle').click();
  await page.waitForTimeout(400);
  check(await page.locator('#canvas-host').evaluate(el => el === document.activeElement), 'Walking focus must recover after collapse');
  const start = JSON.parse(await page.locator('#walking-hud').getAttribute('data-position'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  const moved = JSON.parse(await page.locator('#walking-hud').getAttribute('data-position'));
  check(Math.hypot(moved[0]-start[0], moved[2]-start[2]) > 0.7, 'W must move the camera through the district');
  const uhd = await page.locator('canvas').evaluate(el => [el.width, el.height]);
  check(uhd[0] === 3840 && uhd[1] === 2160, 'Collapsed buffer must be native UHD');
  await page.screenshot({ path: 'output/playwright/district-walking-4k.png' });
  await toggle.click();
  await page.locator('#destination').selectOption({ label: 'Hermès' });
  await page.locator('#visit-destination').click();
  check(await page.locator('#walking-hud').isVisible(), 'Store arrival must preserve walking');
  await page.locator('#community-meet').click();
  await page.locator('#community-about').click();
  await page.waitForFunction(() => !document.querySelector('#community-attribution').textContent.includes('checking'));
  check((await page.locator('#community-speech').textContent()).length > 40, 'Conversation must respond');
  check((await page.locator('#community-attribution').textContent()).includes('Authored dialogue'), 'Authored conversation must be attributed honestly');
  await page.locator('#community-close').click();
  await page.keyboard.press('KeyE');
  check(await page.locator('#community-dialogue').isVisible(), 'E must reopen a nearby local encounter');
  await page.locator('#community-close').click();

  await page.locator('#community-reset').click();
  const targets = await page.locator('#community-local option').evaluateAll(options => options.filter(option => option.textContent.includes('request open')).map(option => option.value));
  check(targets.length === 8, 'Community scenario needs eight priority neighbors');
  await page.locator('#community-run').click();
  for (const id of targets.slice(0, 6)) {
    await page.locator('#community-local').selectOption(id);
    await page.locator('#community-meet').click();
    await page.locator('#community-ask').click();
    await page.locator(targets.indexOf(id) < 4 ? '#community-dispatch' : '#community-supply').click();
  }
  await page.waitForTimeout(2300);
  for (const id of targets.slice(4, 6)) {
    await page.locator('#community-local').selectOption(id);
    await page.locator('#community-meet').click();
    await page.locator('#community-supply').click();
  }
  await page.waitForFunction(() => document.querySelector('#community-outcome').dataset.state === 'success', null, { timeout: 20000 });
  const result = await page.locator('#community-outcome').textContent();
  const resources = await page.locator('#community-resources').textContent();
  check(result.includes('6 neighbors supported'), 'Interventions must actually complete the objective');
  await toggle.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playwright/district-community-4k.png' });
  await page.locator('#community-close').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Mobile must not overflow horizontally');
  check(await page.locator('#walking-hud').isVisible(), 'Mobile must retain walking');
  await page.screenshot({ path: 'output/playwright/district-mobile.png' });
  await toggle.click();
  await page.locator('#scene-select').selectOption('neighborhood');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  check(await page.locator('#district-directory').isHidden(), 'Neighborhood source map remains accessible');
  await page.locator('#scene-select').selectOption('district');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  check(await page.locator('#walking-hud').isVisible(), 'Returning to district resumes walking');
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { uhd, movedMeters: Math.hypot(moved[0]-start[0], moved[2]-start[2]), destinations:30, nearbyConversation:true, mission:result, resources, mobileNoOverflow:true, sceneSwitch:true, browserErrors:errors };
}
