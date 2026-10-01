async page => {
  const checks = [], errors = [], puts = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  // Stand in for the bridge: remember the selected voice and report it back.
  let voiceId = 's3TPKV1kjDlVtZbl4Ksh';
  const settings = () => ({ configured: true, source: 'server', voice_id: voiceId });
  await page.route('**/v1/settings/elevenlabs/voice', async route => { const body = JSON.parse(route.request().postData()); puts.push(body.voice_id); voiceId = body.voice_id; await route.fulfill({ json: settings() }); });
  await page.route('**/v1/settings/elevenlabs', route => route.fulfill({ json: settings() }));
  await page.route('**/v1/settings/jev', route => route.fulfill({ json: { source: 'none' } }));
  await page.route('**/v1/decisions', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('[data-section=settings-section]').click();
  const disclosure = page.locator('.jev-settings').filter({ hasText: 'ElevenLabs API key' });
  await disclosure.locator('summary').click();
  const select = page.locator('#elevenlabs-voice');
  await page.waitForFunction(() => document.querySelector('#elevenlabs-voice-status')?.textContent.includes('Adam'));
  check(await select.inputValue() === 's3TPKV1kjDlVtZbl4Ksh', 'The picker shows the bridge’s active voice (Adam)');
  check(await page.locator('.jev-voice-custom').isHidden(), 'A named voice keeps the custom ID field hidden');
  const labels = await select.locator('option').evaluateAll(options => options.map(option => option.textContent));
  check(labels.length >= 4 && labels.some(label => label.startsWith('Custom voice')), `Several named voices plus a custom entry are offered (${labels.length})`);
  check(await select.locator('option[value="OQkHNgFcqzRY82loyxsc"]').count() === 1, 'OQkHNgFcqzRY82loyxsc is one of the options');
  await select.selectOption('OQkHNgFcqzRY82loyxsc');
  await page.waitForFunction(() => document.querySelector('#elevenlabs-voice-status')?.textContent.includes('New voice'));
  check(puts.at(-1) === 'OQkHNgFcqzRY82loyxsc', 'Choosing it sends that voice ID to the bridge');
  check(await page.locator('.jev-voice-custom').isHidden(), 'Choosing a named voice does not open the ID field');
  await page.screenshot({ path: 'output/playwright/jev-voice-picker.png' });
  // The PUT reply is the confirmation; a failing follow-up GET must not undo it.
  await page.route('**/v1/settings/elevenlabs', route => route.abort());
  await select.selectOption('GVERRoGD1VgvkBmxamFb');
  await page.waitForFunction(() => document.querySelector('#elevenlabs-voice-status')?.textContent.includes('Original Jev'));
  check(puts.at(-1) === 'GVERRoGD1VgvkBmxamFb' && !(await page.locator('#elevenlabs-voice-status').textContent()).includes('Could not'), 'A voice change is confirmed from the PUT reply even if the settings GET fails');
  await page.unroute('**/v1/settings/elevenlabs');
  await page.route('**/v1/settings/elevenlabs', route => route.fulfill({ json: settings() }));
  // Any library voice by ID.
  await select.selectOption('custom');
  check(await page.locator('.jev-voice-custom').isVisible(), 'Custom voice ID reveals an ID field');
  await page.locator('#elevenlabs-voice-id').fill('myLibraryVoice42');
  await page.locator('.jev-voice-custom button').click();
  await page.waitForFunction(() => document.querySelector('#elevenlabs-voice-status')?.textContent.includes('myLibraryVoice42'));
  check(puts.at(-1) === 'myLibraryVoice42', 'A custom ID is sent to the bridge');
  await page.locator('#elevenlabs-voice-id').fill('bad id!');
  await page.locator('.jev-voice-custom button').click();
  check(puts.at(-1) === 'myLibraryVoice42' && !await page.locator('#elevenlabs-voice-id').evaluate(input => input.validity.valid), 'An invalid ID is rejected before reaching the bridge');
  // After a reload the picker reflects what the bridge reports.
  await page.reload();
  await page.locator('#loading').waitFor({ state: 'hidden' });
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('[data-section=settings-section]').click();
  await page.locator('.jev-settings').filter({ hasText: 'ElevenLabs API key' }).locator('summary').click();
  await page.waitForFunction(() => document.querySelector('#elevenlabs-voice-status')?.textContent.includes('myLibraryVoice42'));
  check(await page.locator('#elevenlabs-voice').inputValue() === 'custom' && await page.locator('#elevenlabs-voice-id').inputValue() === 'myLibraryVoice42', 'A reload shows the custom voice the bridge is using');
  check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
  return { checks, puts };
}
