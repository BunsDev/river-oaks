async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // "Report a problem": the dialog opens from the account tools, the Commands
  // palette and the F3 debug panel; the report captures the game's state and
  // recent failures, redacts private details, and copies, downloads and sends.
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const readDownload = async download => { let text = ''; for await (const chunk of await download.createReadStream()) text += chunk; return JSON.parse(text); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  // Failures the report must capture, carrying private details it must not.
  await page.evaluate(async () => {
    console.error('Report probe failure for probe@example.com with token=PROBEVALUE and user_01M40Y914S1H4EJCEHH91DKTAY');
    await fetch('/api/waitlist/probe-missing?invite=INVITEPROBE').catch(() => {});
    setTimeout(() => { throw new Error('Report probe page error'); });
  });
  await page.waitForTimeout(300);

  await openHudSpace(page, 'settings-section', 'Account');
  await page.locator('#access-report').click();
  const dialog = page.locator('#report-dialog');
  await dialog.waitFor();
  check(await page.evaluate(() => document.activeElement?.id === 'report-description'), 'focus starts in the description');
  check(await page.locator('#report-send').isVisible(), 'a signed-in player can send the report');
  await page.locator('#report-description').fill('Probe: the scene stutters after entering Dior.');

  await page.locator('.report-details summary').click();
  await page.waitForFunction(() => document.querySelector('.report-preview').textContent.length > 2000);
  const preview = JSON.parse(await page.locator('.report-preview').textContent());
  check(preview.schema === 'river-oaks.debug-report' && preview.version === 1, 'the report names its schema and version');
  check(preview.app.commit && preview.app.commit !== 'unknown' && preview.app.version, `the build is identified (${preview.app.version} ${String(preview.app.commit).slice(0, 8)})`);
  check(preview.renderer?.gpu && preview.renderer.webgl >= 1 && preview.renderer.lastFrame.calls > 0, `GPU and draw work are recorded (${preview.renderer?.gpu}, ${preview.renderer?.lastFrame?.calls} calls)`);
  check(preview.performance.frames.count > 30 && preview.performance.frames.p99Ms > 0, `frame timing is sampled (${preview.performance.frames.count} frames)`);
  check(preview.scene.meshes > 50 && preview.scene.instancedMeshes > 0, 'the scene census is included');
  check(preview.game.loaded && Array.isArray(preview.game.camera), 'the game state is included');
  check(preview.environment.viewport[0] === 1440 && preview.environment.devicePixelRatio > 0, 'the display is described');
  check(preview.access?.signedIn === true, 'the sign-in state is included without the account');
  check(preview.console.some(entry => entry.message.includes('Report probe failure')), 'console errors are captured');
  check(preview.network.some(entry => entry.url.startsWith('/api/waitlist/probe-missing') && entry.status === 404), 'failed requests are captured');
  check(preview.errors.some(entry => entry.message.includes('Report probe page error') && entry.stack), 'page errors are captured with a stack');
  check(preview.breadcrumbs.some(entry => entry.message === 'Report a problem'), 'the click that opened the report is in the breadcrumbs');
  const serialised = JSON.stringify(preview);
  for (const secret of ['probe@example.com', 'user_01M40Y914S1H4EJCEHH91DKTAY', 'INVITEPROBE', 'PROBEVALUE', 'test-csrf']) check(!serialised.includes(secret), `"${secret}" is redacted`);

  await page.locator('#report-screenshot').check();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#report-download').click()]);
  const saved = await readDownload(download);
  check(saved.description === 'Probe: the scene stutters after entering Dior.', 'the download carries the description');
  check(saved.screenshot?.startsWith('data:image/jpeg;base64,') && saved.screenshot.length <= 140000, `the picture is attached under the size limit (${saved.screenshot?.length} chars)`);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await page.locator('#report-copy').click();
  await page.waitForFunction(() => /^Copied/.test(document.querySelector('#report-dialog .report-status').textContent));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check(copied.startsWith('# TypeSafe Place problem report') && copied.includes('```json') && !copied.includes('base64,'), 'Copy gives a readable summary and the report, without the picture');

  const [response] = await Promise.all([
    page.waitForResponse(item => new URL(item.url()).pathname === '/api/debug-reports' && item.request().method() === 'POST'),
    page.locator('#report-send').click(),
  ]);
  check(response.status() === 200, 'the report is accepted by the server');
  const sent = JSON.parse(response.request().postData());
  check(sent.screenshot?.startsWith('data:image/jpeg') && sent.description.startsWith('Probe:'), 'the sent report carries the description and picture');
  await page.waitForFunction(() => /^Sent\. Thank you/.test(document.querySelector('#report-dialog .report-status').textContent));
  check((await page.request.get(`${new URL(page.url()).origin}/api/debug-reports`)).status() === 403, 'a player cannot list other reports');

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  check(await page.evaluate(() => document.activeElement?.id === 'access-report'), 'closing returns focus to the button that opened it');

  await page.getByRole('button', { name: 'Close settings', exact: true }).click();

  // The same dialog from the Commands palette and the F3 debug panel.
  await page.locator('.commands-toggle').click();
  await page.keyboard.type('report a problem');
  await page.keyboard.press('Enter');
  await dialog.waitFor();
  check(true, 'the Commands palette opens the report');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#viewport canvas').click({ position: { x: 700, y: 400 } });
  await page.keyboard.press('F3');
  await page.locator('[data-debug-report]').click();
  await dialog.waitFor();
  check(true, 'the F3 debug panel opens the report');
  await page.keyboard.press('Escape');
  check(await page.locator('.loading-report').count() === 1, 'the loading-error panel has a report button ready');
  return { checks };
}
