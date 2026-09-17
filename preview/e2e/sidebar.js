async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const read = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const viewport = document.querySelector('#viewport').getBoundingClientRect();
    return {
      expanded: document.querySelector('#panel-toggle').getAttribute('aria-expanded'),
      inert: document.querySelector('#control-panel').inert,
      viewport: [Math.round(viewport.width), Math.round(viewport.height)],
      buffer: [canvas.width, canvas.height],
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      flight: !document.querySelector('#flight-hud').hidden,
    };
  });
  const settle = () => page.waitForTimeout(400);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden);
  const trigger = page.locator('#panel-toggle');
  if (await trigger.getAttribute('aria-expanded') === 'false') await trigger.click();
  await settle();
  const open = await read();
  check(open.viewport[0] < 3840 && !open.inert, 'Expanded panel must occupy width and be interactive');

  await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
  await settle();
  const collapsed = await read();
  check(collapsed.viewport[0] === 3840 && collapsed.viewport[1] === 2160, 'Collapsed view must fill native UHD');
  check(collapsed.buffer[0] === 3840 && collapsed.buffer[1] === 2160, 'Render buffer must resize to native UHD');
  check(collapsed.inert && !collapsed.overflow, 'Hidden panel must be inert without horizontal overflow');
  await page.screenshot({ path: 'output/playwright/sidebar-collapsed-4k.png' });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await settle();
  check((await read()).expanded === 'true', 'Keyboard must reopen controls');
  await page.keyboard.press('Space');
  await settle();
  check((await read()).expanded === 'false', 'Keyboard must collapse controls');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden);
  await settle();
  check((await read()).inert, 'Collapsed preference must survive reload');

  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  await settle();
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Hover moped A new way to explore' }).click();
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
  await settle();
  check((await read()).flight, 'Collapsing the panel must retain the active ride');
  check(await page.locator('#canvas-host').evaluate((element) => element === document.activeElement), 'Pointer collapse must return focus to active flight');
  await page.getByRole('button', { name: 'Street level F', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('#flight-altitude').textContent) <= 4, { timeout: 30000 });
  const streetAltitude = await page.locator('#flight-altitude').textContent();
  await page.screenshot({ path: 'output/playwright/street-hover-4k.png' });
  await page.getByRole('button', { name: 'Above the roofs R', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('#flight-altitude').textContent) >= 18, { timeout: 20000 });
  await page.getByRole('button', { name: 'Hover / pause', exact: true }).click();
  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  await settle();
  await page.getByRole('button', { name: 'Pause scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
  await settle();
  const ride = await read();
  check(ride.flight && ride.inert, 'Ride must survive repeated panel transitions');

  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const mobile = await read();
  check(mobile.viewport[0] === 390 && mobile.viewport[1] === 844 && !mobile.overflow, 'Collapsed mobile view must fill the screen');
  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  await settle();
  check((await read()).expanded === 'true' && !(await read()).inert, 'Mobile trigger must restore controls');
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
  await settle();
  await page.screenshot({ path: 'output/playwright/sidebar-mobile.png' });
  await page.setViewportSize({ width: 3840, height: 2160 });
  check(!errors.length, `Unexpected browser errors: ${errors.join('; ')}`);
  return { open, collapsed, persisted: true, keyboard: true, ride, streetAltitude, mobile, browserErrors: errors };
}
