async page => {
  const requests = [], checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/events')) requests.push(request.url()); });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  check(await page.locator('.world-events').count() === 0, 'Unreleased Events has no browsing or hosting surface');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.locator('.commands-toggle').click();
  await page.locator('#rail-command-search').fill('events');
  check((await page.locator('.commands-count').textContent()).startsWith('No matching'), 'Commands does not advertise Events');
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host').dataset.playerReady === 'true');
  check(requests.length === 0, 'Neither initial load nor reconnect requests the Events service');
  return { checks };
}
