async page => {
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const origin = 'http://127.0.0.1:5173';
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
  const otherContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await otherContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const other = await otherContext.newPage();
    await other.goto(origin);
    await other.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true');
    await page.locator('.town-chat-toggle').click();
    const input = other.getByRole('textbox', { name: 'Message the town', exact: true });
    await input.fill('Meet me by the gardens'); await input.press('Enter');
    await page.locator('.multiplayer-chat-message').filter({ hasText: 'Meet me by the gardens' }).waitFor({ state: 'attached' });
    check(await page.locator('.chat-unread').textContent() === '1 new', 'A peer message increments unread count while chat is collapsed');
    await page.locator('.town-chat-toggle').click();
    await page.locator('.chat-jump').click();
    check(await page.locator('.multiplayer-chat-message').count() === 1, 'The server-confirmed peer message appears exactly once');
    check((await page.locator('.multiplayer-chat-message strong').textContent()).includes('bob'), 'Town chat preserves the authenticated sender name');
    await page.reload();
    await page.locator('.multiplayer-chat-message').filter({ hasText: 'Meet me by the gardens' }).waitFor();
    check(await page.locator('.multiplayer-chat-message').count() === 1 && !(await page.locator('.chat-unread').textContent()), 'Reconnect restores history without duplicate or unread messages');
    return { checks };
  } finally { await otherContext.close(); }
}
