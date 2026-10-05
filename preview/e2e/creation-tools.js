async (page, { creationToolsEnabled = false } = {}) => {
  const checks = [], errors = [], groupRequests = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/groups/')) groupRequests.push(request.url()); });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  const ready = () => page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  await ready();
  check(await page.evaluate(() => { const town = window.__riverMultiplayer(); return town.snapshot.players.find(player => player.id === town.selfId).canBuild; }), 'The owner fixture has building permission independent of the creation flag');
  const expected = creationToolsEnabled ? 1 : 0;
  for (const [selector, label] of [
    ['.multiplayer-groups', 'Groups'],
    ['.world-events-studio', 'Event hosting'],
    ['.shared-build-controls', 'Building and saved designs'],
    ['.world-portal-form', 'World publishing'],
    ['.world-portal-revision', 'World revision editing'],
  ]) check(await page.locator(selector).count() === expected, `${label} respects the creation flag`);
  check(await page.locator('.world-portal').count() === 1, 'World browsing remains independently enabled');
  check(await page.locator('.world-events-filters').count() === 1, 'Event browsing remains available');
  check(await page.locator('.multiplayer-chat-form').count() === 1 && await page.locator('.multiplayer-social').count() === 1, 'Chat and contacts remain available');
  check((await page.locator('.visit-tools-toggle span').textContent()).includes('build') === creationToolsEnabled, 'The play rail advertises building only when enabled');
  await page.locator('#canvas-host').focus(); await page.keyboard.press('Control+k');
  check(await page.locator('.rail-commands').getByRole('button', { name: 'Build & decorate', exact: true }).count() === expected, 'Commands offers building only when enabled and permitted');
  await page.keyboard.press('Escape');
  if (creationToolsEnabled) {
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await page.locator('[data-section=community-section]').click();
    await page.locator('.multiplayer-groups-create input[name=name]').fill('Creation flag friends');
    await page.locator('.multiplayer-groups-create button').click();
    await page.locator('.multiplayer-group-row').filter({ hasText: 'Creation flag friends' }).waitFor({ state: 'visible' });
    check(true, 'Enabled Groups can create a persistent group');
  } else check(groupRequests.length === 0, 'Disabled Groups makes no group service requests');
  await page.reload({ waitUntil: 'commit' }); await ready();
  check(await page.locator('.multiplayer-groups').count() === expected && await page.locator('.shared-build-controls').count() === expected, 'Reconnect preserves creation visibility');
  check(errors.length === 0, `No browser errors (${errors.join('; ')})`);
  return { checks };
}
