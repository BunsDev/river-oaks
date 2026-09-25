async page => {
  // `npm run dev` with no WorkOS configuration: two browsers join one town as
  // local development identities and see each other.
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const second = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, second]) { tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 800 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1');
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined', null, { timeout: 60000 });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected, null, { timeout: 60000 });
  };
  await join(page); await join(second);
  await page.waitForFunction(() => window.__riverMultiplayer().snapshot?.players.length >= 2, null, { timeout: 30000 });
  const state = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(); return { self: m.selfId, players: m.snapshot.players.map(p => p.id), remotes: m.remotes, gate: document.querySelector('.multiplayer-gate')?.hidden, form: document.querySelector('#player-form')?.disabled, invasion: document.querySelector('.invasion-controls')?.hidden, roster: document.querySelector('.multiplayer-roster strong')?.textContent }; });
  const [a, b] = [await state(page), await state(second)];
  check(a.self && b.self && a.self !== b.self, 'each browser is its own development player');
  check(a.players.includes(b.self) && b.players.includes(a.self), 'both players share one town');
  check(a.gate === true && b.gate === true, 'no sign-in gate blocks development');
  check(a.form === true && a.invasion === true, 'shared play locks the character and hides the local invasion');
  await page.screenshot({ path: 'output/playwright/multiplayer-dev.png' });
  check(!errors.length, errors.join('; '));
  await second.context().close();
  return { a, b, errors };
}
