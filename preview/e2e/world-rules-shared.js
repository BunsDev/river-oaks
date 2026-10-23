async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // World rules (#596) in two browsers: the development owner (the runner restarts the town so
  // this page is its first visitor) changes the rules with the panel's controls; a second
  // player sees them, explained, across a reload; the local sun slider changes nothing shared;
  // emergency off from the keyboard reaches both.
  const checks = [], errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const visitor = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, visitor]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
    await openHudSpace(tab, 'community-section');
    await tab.getByRole('region', { name: 'World rules' }).waitFor();
  };
  const rules = tab => tab.evaluate(() => window.__riverMultiplayer().snapshot.worldPolicy);
  try {
    await join(page);await join(visitor);
    const ownerRules = page.getByRole('region', { name: 'World rules' }), visitorRules = visitor.getByRole('region', { name: 'World rules' });
    const emergency = ownerRules.getByRole('button', { name: 'Emergency off: stop all danger now' });
    await emergency.waitFor();
    check(await visitorRules.getByRole('button', { name: /Emergency off/ }).count() === 0 || await visitorRules.getByRole('button', { name: /Emergency off/ }).isHidden(), 'Only the owner is shown the controls');
    check(/peaceful everywhere/.test(await visitorRules.textContent()) && /World time 12:00/.test(await visitorRules.textContent()), 'Players see the shared time and a peaceful town by default');
    check(/Peaceful here|Safe here/.test(await visitorRules.locator('.world-rules-risk').textContent()), 'Players are told the risk where they stand');

    // The owner sets night danger in Westcreek Lane with the form, by label.
    await ownerRules.getByLabel('On a schedule').check();
    await ownerRules.getByLabel('Starts').fill('18:00');await ownerRules.getByLabel('Ends').fill('06:00');
    await ownerRules.getByLabel('Westcreek Lane').check();
    await ownerRules.getByLabel('World time').fill('23:00');
    await ownerRules.getByLabel('Clock speed').selectOption({ label: 'Paused' });
    await ownerRules.getByRole('button', { name: 'Apply rules' }).click();
    await ownerRules.locator('.world-rules-result', { hasText: 'World rules saved.' }).waitFor();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.revision === 1);
    const applied = await rules(visitor);
    check(applied.violence.mode === 'scheduled' && applied.violence.zones.join() === 'westcreek-lane' && applied.minute === 1380 && applied.active === true, 'The owner\'s rules reach the other browser');
    await visitorRules.locator('.world-rules-change', { hasText: 'Jevica changed the world rules.' }).waitFor();
    check(/Danger is on in Westcreek Lane from 18:00 to 06:00/.test(await visitorRules.locator('.world-rules-summary').textContent()), 'The change is explained in plain words');
    check(await visitorRules.locator('.world-rules-change').getAttribute('aria-live') === 'polite', 'Changes are announced politely');

    // The local light is the player's own: it never moves the shared clock or the rules.
    await visitor.evaluate(() => { const input = document.querySelector('#sun-hour'); input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await visitor.waitForTimeout(600);
    const afterLight = await rules(visitor);
    check(afterLight.revision === 1 && afterLight.minute === 1380 && /World time 23:00/.test(await visitorRules.textContent()), 'Moving the sun slider changes nothing shared');

    // A reconnect keeps the rules: they are the town's, not the page's.
    await visitor.reload({ waitUntil: 'commit' });await join(visitor);
    const reloaded = await rules(visitor);
    check(reloaded.revision === 1 && /Westcreek Lane/.test(await visitor.getByRole('region', { name: 'World rules' }).locator('.world-rules-summary').textContent()), 'Rules survive a reload');

    // Emergency off, from the keyboard.
    await emergency.focus();await page.keyboard.press('Enter');
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.lastChange.kind === 'emergency_off');
    const stopped = await rules(visitor);
    check(stopped.violence.mode === 'off' && stopped.violence.pvp === false && stopped.active === false, 'Emergency off reaches the other browser at once');
    await visitor.getByRole('region', { name: 'World rules' }).locator('.world-rules-change', { hasText: 'Jevica turned danger off everywhere.' }).waitFor();
    check(true, 'Players are told danger was turned off');

    // The owner's controls fit a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await emergency.scrollIntoViewIfNeeded();
    const box = await emergency.boundingBox(), overflow = await ownerRules.evaluate(node => node.scrollWidth - node.clientWidth);
    check(box && box.x >= 0 && box.x + box.width <= 390 && box.height >= 44 && overflow <= 1, 'Owner controls fit a phone with a full-size emergency button');
    await page.screenshot({ path: 'output/playwright/world-rules-owner-phone.png' });
    await visitor.screenshot({ path: 'output/playwright/world-rules-visitor.png' });
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    return { passed: true, checks };
  } finally {
    await visitor.context().close();
  }
}
