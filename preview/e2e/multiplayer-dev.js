async page => {
  // `npm run dev` with no WorkOS configuration: two browsers join one town as
  // local development identities and see each other.
  const checks=[];
  const check = (condition, message) => { if (!condition) throw new Error(message);checks.push(message); };
  const errors = [];
  const second = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, second]) { tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 800 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1');
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined', null, { timeout: 60000 });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected, null, { timeout: 60000 });
  };
  try {
  await join(page); await join(second);
  await page.waitForFunction(() => window.__riverMultiplayer().snapshot?.players.length >= 2, null, { timeout: 30000 });
  const state = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(); return { self: m.selfId, players: m.snapshot.players.map(p => p.id), gate: document.querySelector('.multiplayer-gate')?.hidden, form: document.querySelector('#canvas-host').dataset.playerForm, formSelector: Boolean(document.querySelector('#player-form')), invasion: document.querySelector('.invasion-controls')?.hidden, roster: document.querySelector('.multiplayer-roster strong')?.textContent }; });
  const [a, b] = [await state(page), await state(second)];
  check(a.self && b.self && a.self !== b.self, 'each browser is its own development player');
  check(a.players.includes(b.self) && b.players.includes(a.self), 'both players share one town');
  check(a.gate === true && b.gate === true, 'no sign-in gate blocks development');
  check(a.form === 'jevica' && b.form === 'jevica' && !a.formSelector && !b.formSelector, 'Jevica is the sole playable shared character');
  check(a.invasion === true && b.invasion === true, 'shared play hides the local invasion');
  const spacing = await page.evaluate(() => { const [p, q] = window.__riverMultiplayer().snapshot.players; return Math.hypot(p.position[0] - q.position[0], p.position[1] - q.position[1]); });
  check(spacing >= 1.2, `players arrive on separate spots (${spacing.toFixed(2)} m apart)`);
  await page.screenshot({ path: 'output/playwright/multiplayer-dev.png' });
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.querySelector('.visit-tools').open);
  check(await page.locator('.visit-tools').evaluate(node=>!node.open),'Shared mobile play starts with a compact dock');
  await page.locator('.visit-tools-toggle').click();
  check(await page.locator('#player-flight').isVisible(),'Flight remains discoverable in shared mobile play');
  check(!await page.locator('#player-companion').isVisible()&&!await page.locator('.vehicle-garage').isVisible(),'Shared mobile play hides solo companion and vehicle actions');
  check(!await page.locator('.force-controls').isVisible()&&!await page.locator('.auto-controls').isVisible(),'Shared mobile play hides local-only scenarios');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Shared mobile controls stay within the viewport');
  await page.screenshot({path:'output/playwright/multiplayer-dev-mobile.png'});
  check(!errors.length, errors.length ? errors.join('; ') : 'No browser page errors');
  return { checks, a, b, errors };
  } finally { await second.context().close(); }
}
