async page => {
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  const host = page.locator('#canvas-host'), menu = page.locator('.rail-commands'), search = page.locator('#rail-command-search');
  const command = async text => { await host.focus(); await page.keyboard.press('Control+k'); await search.fill(text); await page.keyboard.press('Enter'); };
  await command('town chat');
  check(await page.evaluate(() => document.activeElement.matches('.multiplayer-chat-form input')), 'Chat command opens People and focuses the live town composer');
  check(await page.evaluate(() => Boolean(document.querySelector('#community-meet').compareDocumentPosition(document.querySelector('.multiplayer-roster')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Nearby residents and meeting actions precede town tools');
  check(await page.evaluate(() => Boolean(document.querySelector('.multiplayer-chat').compareDocumentPosition(document.querySelector('.multiplayer-social')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Public town chat precedes private contacts and groups');
  await page.keyboard.press('Control+b');
  check(await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true', 'Typing town chat retains keyboard ownership');
  await page.screenshot({ path: 'output/playwright/rails-town-people.png' });
  await page.keyboard.press('Escape');
  const canBuild = await page.evaluate(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(player => player.id === town.selfId).canBuild; });
  await host.focus(); await page.keyboard.press('Control+k');
  check(await menu.getByRole('button', { name: 'Build & decorate', exact: true }).count() === (canBuild ? 1 : 0), 'Commands reflect the server-confirmed building permission');
  check(await menu.getByRole('button', { name: 'Force & telekinesis', exact: true }).count() === 0, 'Shared-play commands omit retired force controls');
  await page.keyboard.press('Escape');
  await command('character & abilities');
  check(await page.evaluate(() => document.activeElement.matches('input[name=player-character]')
    && document.activeElement.closest('.character-picker') !== null), 'Shared character command focuses a visible choice without retired abilities');
  await page.keyboard.press('Escape');
  if (canBuild) {
    await command('build & decorate');
    check(await page.locator('.visit-tools').getByRole('button', { name: 'Build', exact: true }).isVisible(), 'Build jump appears when the shared permission allows it');
    await page.locator('#build-mode').click();
    await host.focus(); await page.keyboard.press('Control+b'); await page.keyboard.press('Escape');
    check(await page.locator('#build-mode').getAttribute('aria-pressed') === 'true', 'Dismissing the left rail does not cancel the builder');
    await host.focus(); await page.keyboard.press('?');
    check((await menu.locator('.commands-reference p').textContent()).startsWith('Builder:'), 'Keyboard help adapts to the active builder');
    await page.keyboard.press('Escape');
    check(await page.locator('#build-mode').getAttribute('aria-pressed') === 'true', 'Dismissing command help does not cancel the builder');
    await page.locator('.visit-tools-toggle').focus(); await page.keyboard.press('Escape');
    check(await page.locator('#build-mode').getAttribute('aria-pressed') === 'true', 'Dismissing play controls does not cancel the builder');
    await page.keyboard.press('Escape');
    check(await page.locator('#build-mode').getAttribute('aria-pressed') === 'false', 'Escape in the world still leaves builder mode');
    await command('browse shared worlds');
    await page.getByRole('button', { name: 'Design a region', exact: true }).click();
    await page.locator('.region-editor').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Close region editor', exact: true }).focus();
    await page.keyboard.press('Control+b'); await page.keyboard.press('Control+k');
    check(!await menu.isVisible() && await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true', 'The region editor keeps exclusive ownership of keyboard navigation');
    await page.screenshot({ path: 'output/playwright/rails-region-inspector.png' });
    await page.getByRole('button', { name: 'Close region editor', exact: true }).click();
  }
  await command('events & gatherings');
  check(await page.evaluate(() => document.activeElement.matches('.world-events-filters select')), 'Events command focuses a live calendar filter');
  check(!errors.length, `No shared navigation page errors: ${errors.join('; ')}`);
  return { checks, canBuild, errors };
}
