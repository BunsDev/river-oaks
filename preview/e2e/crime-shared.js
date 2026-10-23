async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // The first criminal action (#597) in two browsers. The development owner (the runner restarts
  // the town so this page is its first visitor) turns danger on in Westcreek Lane; a second
  // player walks up to the rival and shoves with T. Both see only the town's numbers: the HUD
  // changes after the reply, never before it. Emergency off then tells them nobody can be harmed.
  const RX = -2908, RN = -1320;
  const checks = [], errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const visitor = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, visitor]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
  };
  const town = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(), crime = m.snapshot.crime;
    return { rival: crime.targets.find(item => item.id === 'rival:westcreek'), wanted: crime.wanted, self: m.snapshot.players.find(p => p.id === m.selfId), selfId: m.selfId }; });
  try {
    await join(page);await join(visitor);
    const before = await town(visitor);
    check(before.rival?.health === 100 && before.wanted.length === 0, 'The town starts with a whole rival and nobody wanted');
    check(await visitor.evaluate(() => window.__riverMultiplayer().remotes.some(item => item.id === 'rival:westcreek')), 'The rival is drawn as a figure');

    // The visitor walks up to the rival while the town is still peaceful.
    const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
    let arrived = null;
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0]]) {
      await visitor.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [RX + dx, RN + dn]);
      await visitor.waitForTimeout(400);
      const { self } = await town(visitor);
      if (Math.hypot(self.position[0] - RX, self.position[1] - RN) <= 1.5) { arrived = self.position; break; }
      await visitor.waitForTimeout(1200);
    }
    check(arrived, 'The visitor arrives within arm\'s reach of the rival');
    await hud.getByText('Westcreek rival', { exact: true }).waitFor();
    check(/Nobody can be harmed/.test(await hud.textContent()) && await hud.getByRole('button', { name: /Shove/ }).count() === 0, 'While peaceful, the HUD says nobody can be harmed and offers no shove');

    // The owner turns danger on with the World rules panel.
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    await rules.getByLabel('At all hours').check();
    await rules.getByLabel('Westcreek Lane').check();
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true);
    const shove = hud.getByRole('button', { name: 'Shove Westcreek rival T' });
    await shove.waitFor();
    const meter = hud.getByRole('progressbar', { name: 'Westcreek rival health' });
    check(await meter.getAttribute('aria-valuenow') === '100', 'Health is a labelled progress bar');

    // T shoves. Watch the HUD from the moment of the key press: it may change only after the reply.
    await visitor.evaluate(() => {
      window.__crimeTrace = [];
      const meterNode = document.querySelector('.crime-health');
      const seen = () => window.__crimeTrace.push({ meter: meterNode.getAttribute('aria-valuenow'), town: window.__riverMultiplayer().snapshot.crime.targets.find(item => item.id === 'rival:westcreek').health });
      new MutationObserver(seen).observe(meterNode, { attributes: true, attributeFilter: ['aria-valuenow'] });
    });
    await visitor.locator('#canvas-host').focus();await visitor.keyboard.press('KeyT');
    await hud.locator('.crime-result', { hasText: 'Hit landed.' }).waitFor();
    const trace = await visitor.evaluate(() => window.__crimeTrace);
    check(trace.length > 0 && trace.every(item => Number(item.meter) === item.town), 'Every health change on screen matched the town\'s state at that moment');
    const after = await town(visitor);
    check(after.rival.health === 75 && after.wanted.some(([id, stars]) => id === after.selfId && stars === 1), 'One hit: 25 damage and one star');
    check(/Westcreek rival has 75 health left\. Wanted level 1 of 5\./.test(await hud.locator('.crime-result').textContent()), 'The hit is confirmed in plain words');
    check(await hud.locator('.crime-wanted').getAttribute('aria-label') === 'Wanted level: 1 of 5 stars', 'Wanted stars have a spoken label');
    await page.waitForFunction(id => { const crime = window.__riverMultiplayer().snapshot.crime;
      return crime.targets.find(item => item.id === 'rival:westcreek').health === 75 && crime.wanted.some(([who, stars]) => who === id && stars === 1); }, after.selfId);
    check(true, 'The owner\'s browser sees the same hit and star');
    await page.waitForFunction(id => window.__riverMultiplayer().remotes.some(item => item.id === id && item.gesture === 'shove'), after.selfId).catch(() => {});

    // Emergency off: the next shove is not offered, and the town is unchanged.
    await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off');
    await hud.getByText(/Nobody can be harmed/).waitFor();
    check(await hud.getByRole('button', { name: /Shove/ }).count() === 0, 'After emergency off there is no shove to offer');
    await visitor.waitForTimeout(1000);
    await visitor.locator('#canvas-host').focus();await visitor.keyboard.press('KeyT');
    await visitor.waitForTimeout(600);
    check((await town(visitor)).rival.health === 75, 'Pressing T in a peaceful town changes nothing');

    await visitor.setViewportSize({ width: 390, height: 844 });
    const box = await hud.boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= 390, 'The crime HUD fits a phone');
    await visitor.screenshot({ path: 'output/playwright/crime-hud-phone.png' });
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    return { passed: true, checks };
  } finally {
    await visitor.context().close();
  }
}
