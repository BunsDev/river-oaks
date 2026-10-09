async page => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.goto('http://127.0.0.1:5181/');
  await page.waitForFunction(() => document.querySelector('.multiplayer-roster')?.dataset.connected === 'true');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
  await page.locator('#rail-tab-0').click();
  const panel = page.locator('.multiplayer-roster');
  const history = page.locator('.multiplayer-chat-history');
  check(await history.evaluate(el => el.getBoundingClientRect().height) === 0, 'Empty chat must not reserve a blank transcript');
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await panel.screenshot({path: 'output/playwright/compact-social-empty.png'});
  const input = page.getByRole('textbox', {name: 'Message the town', exact: true});
  await input.fill('A little hello from the district');
  await page.locator('.multiplayer-chat-form button').click();
  await history.getByText('A little hello from the district', {exact: false}).waitFor();
  check(await history.evaluate(el => el.getBoundingClientRect().height) > 0, 'Sent messages remain visible');
  await page.locator('.multiplayer-social > button').click();
  await page.locator('.multiplayer-profile').waitFor({state: 'visible'});
  await page.getByRole('button', {name: 'Close profile', exact: true}).click();
  check(await page.locator('.multiplayer-social > button').evaluate(el => el === document.activeElement), 'Closing profile restores focus');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 1000});
      await input.focus();
      check(await input.evaluate(el => el === document.activeElement), 'Chat retains keyboard focus');
      check(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), 'Social controls fit the rail');
      await panel.screenshot({path: `output/playwright/compact-social-${theme}-${width}.png`});
    }
  }
  return {passed: true, emptyHistory: true, sentMessage: true, profile: true, themes: ['dark', 'light'], widths: [1440, 390]};
}
