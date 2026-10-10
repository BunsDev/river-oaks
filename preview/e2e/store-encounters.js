async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => { const d = document.querySelector('#canvas-host').dataset; return (document.querySelector('#canvas-host')?.dataset.multiplayer==='joined') && d.storePeopleTotal === d.storePeopleReady; });
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'explore-section');
  const destinations = await page.locator('#destination option').evaluateAll(options => options.map(option => ({ value: option.value, name: option.textContent })));
  const visits = [];
  for (const destination of destinations) {
    await page.locator('#destination').selectOption(destination.value);
    await page.locator('#enter-destination').click();
    await page.waitForFunction(id => document.querySelector('#walking-hud').dataset.inside === id, destination.value);
    await page.locator('#canvas-host').focus();
    // Gallery guests can be beyond conversational range at the doorway.
    if (await page.locator('#walking-talk').isDisabled()) {
      await page.keyboard.down('KeyD'); await page.waitForTimeout(900); await page.keyboard.up('KeyD');
    }
    await page.keyboard.press('KeyE');
    await page.locator('#community-dialogue').waitFor({ state: 'visible', timeout: 2000 });
    const encounter = await page.locator('#community-local').inputValue();
    check(encounter.startsWith(`store-${destination.value}-person-`), `E must address someone in ${destination.name}: ${encounter}`);
    check((await page.locator('.community-role').textContent()).includes(destination.name), 'Conversation must retain the workplace');
    visits.push({ store: destination.name, encounter });
    await page.locator('#community-close').click();
  }
  const counts = await page.locator('#community-local option').evaluateAll(options => ({ all: options.length, indoor: options.filter(option => option.value.startsWith('store-')).length }));
  check(counts.all > 24 && counts.indoor > 30, 'All indoor guests and staff must join the encounter directory');
  check(errors.length === 0, errors.join('; '));
  await page.screenshot({ path: 'output/playwright/store-encounters.png' });
  return { counts, visits, errors };
}
