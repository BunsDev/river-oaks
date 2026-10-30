async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // #640 increment 3 in two browsers: the street responds. The development owner turns danger on
  // in the south service lane; a second player shoves the lane rival (one wanted star), then walks
  // up to the nearest outdoor resident. The town, not the page, decides that the resident startles
  // and then runs; both browsers draw the resident as a figure with that reaction, and the owner's
  // snapshot agrees. The resident count never changes.
  const RX = -2800, RN = -1440;
  const checks = [], errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const visitor = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, visitor]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
  };
  const town = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(), s = m.snapshot;
    return { rival: s.crime.targets.find(item => item.id === 'rival:service-lane'), wanted: s.crime.wanted, self: s.players.find(p => p.id === m.selfId), selfId: m.selfId,
      locals: s.locals.map(local => ({ id: local.id, name: local.name, indoor: local.indoor, position: local.position, life: local.life && { reaction: local.life.reaction, status: local.life.status, speed: local.life.speed, heading: local.life.heading } })) }; });
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // Travel to within reach of a point, trying the four sides.
  const approach = async (tab, [east, north], reach) => {
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
      await tab.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [east + dx, north + dn]);
      await tab.waitForTimeout(400);
      const { self } = await town(tab);
      if (distance(self.position, [east, north]) <= reach) return self.position;
      await tab.waitForTimeout(1200);
    }
    return null;
  };
  try {
    await join(page);await join(visitor);
    if (await visitor.locator('.visit-tools[open]').count()) await visitor.locator('.visit-tools-toggle').click();
    if (await visitor.locator('.town-chat-dock[open]').count()) await visitor.locator('.town-chat-toggle').click();
    const before = await town(visitor);
    const population = before.locals.length, outdoor = before.locals.filter(local => !local.indoor && local.life);
    check(outdoor.length >= 8 && outdoor.every(local => local.life.reaction === null), 'The town starts with outdoor residents and no reaction under way');
    check(await visitor.evaluate(() => window.__riverMultiplayer().remotes.some(item => item.id === 'rival:service-lane')), 'The lane rival is drawn as a figure');

    check(await approach(visitor, [RX, RN], 1.5), 'The visitor arrives within arm\'s reach of the service lane rival');
    const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
    await hud.getByText('Service lane rival', { exact: true }).waitFor();
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    await rules.getByLabel('At all hours').check();
    await rules.getByLabel('South service lane').check();
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true);
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    await visitor.locator('#canvas-host').focus();await visitor.keyboard.press('KeyT');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.crime.wanted.some(([id, stars]) => id === m.selfId && stars === 1); });
    check(true, 'One landed shove: the visitor is wanted');
    // Step out of the rival's reach at once, toward the nearest outdoor resident who is not already
    // reacting, and stop at arm's length from them.
    const state = await town(visitor);
    const candidates = state.locals.filter(local => !local.indoor && local.life && local.life.reaction === null && ['walking', 'resting', 'turning'].includes(local.life.status))
      .sort((a, b) => distance(a.position, state.self.position) - distance(b.position, state.self.position)).slice(0, 3);
    check(candidates.length, 'There is an outdoor resident to walk up to');
    // The rule may skip a resident (held by a visitor, or no sight line past a planter): then the next one.
    let nearest = null, stood = null, startled = null;
    for (const candidate of candidates) {
      // The figure must already be drawn: the startle lasts one second, a figure can take longer to load.
      const figure = await visitor.waitForFunction(id => window.__riverMultiplayer().remotes.some(item => item.id === `resident:${id}` && item.ready), candidate.id, { timeout: 20000 }).then(() => true).catch(() => false);
      if (!figure) continue;
      const where = await approach(visitor, candidate.position, 4);
      if (!where) continue;
      startled = await visitor.waitForFunction(id => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id);
        return local?.life?.reaction === 'startle' && local.life.status === 'startled' && local; }, candidate.id, { timeout: 8000 }).then(handle => handle.jsonValue()).catch(() => null);
      if (startled) { nearest = candidate; stood = where; break; }
    }
    check(nearest, `A resident startles at a wanted player at arm's length (town state): ${nearest?.name}`);
    // What the visitor's screen draws while the town says startle (review of #708: the earlier check
    // accepted any resting figure).
    const drawnStartle = await visitor.waitForFunction(id => { const figure = window.__riverMultiplayer().remotes.find(item => item.id === `resident:${id}`);
      return figure?.gesture === 'startle' && figure; }, nearest.id, { timeout: 900 }).then(handle => handle.jsonValue()).catch(() => null);
    check(drawnStartle, `The resident is drawn startled on the visitor's screen (gesture ${drawnStartle?.gesture ?? 'none within the startle'})`);
    await visitor.waitForTimeout(300);
    const still = await visitor.evaluate(id => window.__riverMultiplayer().snapshot.locals.find(item => item.id === id), nearest.id);
    check(still.life.reaction !== 'startle' || distance(still.position, startled.position) < .05, 'Startled, they stand still');
    // Cornering, a blocked step or the route search can hold one sample below a run: wait for the run itself.
    const running = await visitor.waitForFunction(id => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id);
      return local?.life?.reaction === 'flee' && local.life.status === 'fleeing' && local.life.speed > 1.4 && local; }, nearest.id, { timeout: 12000 }).then(handle => handle.jsonValue()).catch(() => null);
    check(running, `${nearest.name} then runs (town state): ${running?.life.speed.toFixed(2)} m/s`);
    const fled = await visitor.waitForFunction(([id, from]) => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id);
      return local?.life?.reaction === 'flee' && Math.hypot(local.position[0] - from[0], local.position[1] - from[1]) > 3 && local; }, [nearest.id, startled.position], { timeout: 8000 }).then(handle => handle.jsonValue()).catch(() => null);
    check(fled, `${nearest.name} gets away from where they stood`);
    check(distance(fled.position, stood) > distance(startled.position, stood), 'away from the wanted player, not toward them');
    const peerView = await page.evaluate(id => { const local = window.__riverMultiplayer().snapshot.locals.find(item => item.id === id); return local?.life?.reaction; }, nearest.id);
    check(['startle', 'flee'].includes(peerView), 'The owner\'s browser receives the same reaction from the town (town state, not its drawn figure)');
    const during = await town(visitor);
    check(during.locals.length === population && during.rival, 'No resident was added or removed; the rival is still the town\'s');
    await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot.locals.find(item => item.id === id)?.life?.reaction === null, nearest.id, { timeout: 15000 });
    check(true, 'The reaction ends and the resident goes back to the routine');
    const after = await town(visitor);
    check(after.locals.length === population, 'The population is unchanged after the reaction');
    check(!after.locals.some(local => local.indoor && local.life?.reaction), 'Indoor residents never react to the street');
    // Emergency off: nothing lingers.
    await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off');
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    return { passed: true, checks };
  } finally {
    await visitor.context().close();
  }
}
