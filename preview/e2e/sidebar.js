async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const read = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const viewport = document.querySelector('#viewport').getBoundingClientRect();
    return {
      expanded: document.querySelector('#panel-toggle').getAttribute('aria-expanded'),
      inert: document.querySelector('#explore-section').inert,
      viewport: [Math.round(viewport.width), Math.round(viewport.height)],
      buffer: [canvas.width, canvas.height],
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      walking: !document.querySelector('#walking-hud').hidden,
    };
  });
  const settle = () => page.waitForTimeout(400);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('http://127.0.0.1:5181/');
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden);
  const trigger = page.locator('#panel-toggle');
  if (await trigger.getAttribute('aria-expanded') === 'false') await trigger.click();
  await settle();
  const open = await read();
  check(open.viewport[0] === 3840 && !open.inert, 'Floating panel must stay interactive above the full-width street');

  await page.locator('#panel-toggle').click();
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

  await page.locator('#panel-toggle').click();
  await settle();
  await trigger.click();
  check((await read()).walking, 'Panel transitions retain walking');
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const mobile = await read();
  check(mobile.viewport[0] === 390 && mobile.viewport[1] === 844 && !mobile.overflow, 'Collapsed mobile view must fill the screen');
  await page.locator('#panel-toggle').click();
  await settle();
  check((await read()).expanded === 'true' && !(await read()).inert, 'Mobile trigger must restore controls');
  await page.locator('#panel-toggle').click();
  await settle();
  await page.screenshot({ path: 'output/playwright/sidebar-mobile.png' });
  await page.setViewportSize({ width: 3840, height: 2160 });
  check(!errors.length, `Unexpected browser errors: ${errors.join('; ')}`);
  return { open, collapsed, persisted: true, keyboard: true, walking: true, mobile, browserErrors: errors };
}
