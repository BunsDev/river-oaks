async page => {
  const checks = [], errors = [];
  const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.unroute('**/v1/settings/jev');
  await page.unroute('**/v1/decisions');
  await page.unroute('**/v1/auto');
  // Exercise the real settings bridge without submitting fixture credentials to Jev.
  const offline = route => route.abort();
  await page.route('**/v1/decisions', offline);
  await page.route('**/v1/auto', offline);
  // Two settings panels share the class since the ElevenLabs one was added; this harness is the Jev one.
  const jevPanel = page.locator('.jev-settings').filter({ hasText: 'Jev API key' });
  const openSettings = async () => {
    await page.locator('#jev-key-status').waitFor({ state: 'attached' });
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    if (!await jevPanel.evaluate(node => node.open)) await jevPanel.locator('> summary').click();
    await jevPanel.locator('[type=submit]').waitFor({ state: 'visible' });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5181/');
  await openSettings();
  await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('No key configured.'));
  try {
    const key = jevPanel.getByLabel('Manual API key override', { exact: true });
    check(await key.getAttribute('type') === 'password', 'Key field is masked');
    await key.fill('manual-settings-fixture');
    await jevPanel.getByRole('button', { name: 'Use key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('Manual key configured.'));
    check(await key.inputValue() === '', 'Submitted key is cleared from the field');
    check(await page.evaluate(() => !JSON.stringify([localStorage, sessionStorage]).includes('manual-settings-fixture')), 'Key is not persisted in browser storage');
    await page.reload();
    await openSettings();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('Manual key configured.'));
    check(await key.inputValue() === '', 'Reload reports bridge override without returning the key');
    await key.fill('replacement-settings-fixture');
    await jevPanel.getByRole('button', { name: 'Use key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('Manual key configured.'));
    check(await key.inputValue() === '', 'Replacement key is cleared too');
    await jevPanel.getByRole('button', { name: 'Use server key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('No key configured.'));
    check((await (await page.request.get('http://127.0.0.1:5181/v1/settings/jev')).json()).source === 'none', 'Clearing restores unconfigured server state');
    await page.route('**/v1/settings/jev', async route => {
      if (route.request().method() === 'PUT') { await route.fetch(); await route.abort(); }
      else await route.continue();
    });
    await key.fill('lost-response-settings-fixture');
    await jevPanel.getByRole('button', { name: 'Use key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('Could not reach'));
    check((await (await page.request.get('http://127.0.0.1:5181/v1/settings/jev')).json()).source === 'manual', 'Lost-response fixture really applied the override');
    check(await jevPanel.getByRole('button', { name: 'Use server key', exact: true }).isEnabled(), 'An accepted key can still be cleared after its response is lost');
    await jevPanel.getByRole('button', { name: 'Use server key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('No key configured.'));
    await page.unroute('**/v1/settings/jev');
    await page.route('**/v1/settings/jev', route => route.fulfill({ status: 503, body: '{}' }));
    await key.fill('unavailable-settings-fixture');
    await jevPanel.getByRole('button', { name: 'Use key', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('Could not reach'));
    check(await jevPanel.getByRole('button', { name: 'Use key', exact: true }).isEnabled(), 'Unavailable bridge leaves retry enabled');
    check(await key.inputValue() === '', 'Failed submission does not retain the key');
    await page.unroute('**/v1/settings/jev');
    await page.reload();
    await openSettings();
    await page.waitForFunction(() => document.querySelector('#jev-key-status').textContent.startsWith('No key configured.'));
    await page.screenshot({ path: 'output/playwright/jev-key-settings.png' });
    check(errors.length === 0, 'No uncaught browser errors');
    return { checks, errors };
  } finally {
    await page.request.delete('http://127.0.0.1:5181/v1/settings/jev');
    await page.unroute('**/v1/settings/jev');
    await page.unroute('**/v1/decisions');
    await page.unroute('**/v1/auto');
  }
}
