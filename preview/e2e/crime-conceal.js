async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // #599 escape by concealment, in two browsers. The development owner turns danger on in the
  // south service lane; a second player strikes the lane rival with T, leads the officer east
  // along the service yard's crates (lane-cover.js), steps in at the yard mouth, walks by key
  // into the crate partition (the browser's own walking stops there), and slips into the
  // inner bay. The officer searches where it last saw them, cannot see the bay, and gives up;
  // the player keeps their star. Positions are [east, north]; the yard is fixed content.
  const RX = -2800, RN = -1440, MOUTH = [-2763.2, -1455.0], HIDE = [-2773.2, -1456.6];
  const checks = [], errors = [], rows = [];
  const check = (condition, message) => { if (!condition) { const error = new Error(message); error.checks = checks; error.rows = rows; throw error; } checks.push(message); };
  const visitor = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, visitor]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
    if (await tab.locator('.visit-tools[open]').count()) await tab.locator('.visit-tools-toggle').click();
    if (await tab.locator('.town-chat-dock[open]').count()) await tab.locator('.town-chat-toggle').click();
  };
  const town = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(), s = m.snapshot;
    return { wanted: s.crime.wanted, police: s.police, self: s.players.find(p => p.id === m.selfId), selfId: m.selfId, policy: s.worldPolicy }; });
  const stars = state => state.wanted.find(([id]) => id === state.selfId)?.[1] ?? 0;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const round = value => Math.round(value * 100) / 100;
  const goTo = async (tab, east, north) => {
    let reply = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      reply = await tab.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [east, north]);
      if (reply?.error !== 'travel_cooldown') return reply;
      await tab.waitForTimeout(300);
    }
    return reply;
  };
  const face = (tab, east, north) => tab.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), [east, north]);
  const officerOf = state => state.police.units.find(unit => unit.targetId === state.selfId) ?? null;
  // The officer pursuing the visitor, within `range` metres, as the visitor's own snapshot shows it.
  const officerNear = (range, ms) => visitor.waitForFunction(range => { const m = window.__riverMultiplayer(), me = m.snapshot.players.find(p => p.id === m.selfId);
    const unit = m.snapshot.police.units.find(item => item.targetId === m.selfId);
    return unit && unit.state === 'pursue' && Math.hypot(unit.position[0] - me.position[0], unit.position[1] - me.position[1]) <= range && unit; }, range, { timeout: ms }).then(handle => handle.jsonValue()).catch(() => null);
  try {
    await join(page); await join(visitor);
    const yard = await visitor.evaluate(() => window.__riverLaneCover?.());
    check(yard?.inScene && yard.pieces === 3 && yard.meshes.length === 3, `The service yard is drawn in the lane: ${JSON.stringify(yard)}`);

    // The owner turns danger on in the south service lane at all hours.
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    await rules.getByLabel('At all hours').check(); await rules.getByLabel('South service lane').check();
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true);

    // The visitor walks up to the rival and strikes with T: one star, and an officer pursues.
    const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
    let arrived = null;
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0]]) {
      await goTo(visitor, RX + dx, RN + dn); await visitor.waitForTimeout(400);
      const { self } = await town(visitor);
      if (distance(self.position, [RX, RN]) <= 1.5) { arrived = self.position; break; }
      await visitor.waitForTimeout(1200);
    }
    check(arrived, 'The visitor arrives within arm\'s reach of the lane rival');
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    await visitor.waitForTimeout(1100);
    await visitor.locator('#canvas-host').focus(); await visitor.keyboard.press('KeyT');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return (m.snapshot.crime.wanted.find(([id]) => id === m.selfId)?.[1] ?? 0) >= 1; }, null, { timeout: 6000 });
    const pursued = await officerNear(12, 20000);
    check(pursued, 'An officer pursues the wanted visitor');
    rows.push({ step: 'struck', officer: pursued.id, at: pursued.position.map(round) });

    // Lead the officer east along the crates in short hops, each once it has closed in (it sees
    // the visitor the whole way: sight range is 35 m), then to the yard mouth.
    for (const hop of [[-2790, -1446], [-2780, -1449.5], [-2770, -1449.5], [-2762.5, -1449.5], MOUTH]) {
      const reply = await goTo(visitor, hop[0], hop[1]);
      check(reply?.ok, `The visitor steps to ${hop.join(', ')} (${JSON.stringify(reply)})`);
      const near = await officerNear(9, 15000);
      check(near, `The officer follows the visitor to ${hop.join(', ')}, still pursuing`);
      rows.push({ step: `hop ${hop.join(',')}`, officer: near.position.map(round), state: near.state });
    }
    await visitor.screenshot({ path: 'output/playwright/crime-conceal-mouth.png' });

    // By key: face the hide spot and walk briskly (Shift+W) into the partition between. The
    // browser's own walking stops at the crates. Brisk, because an officer in contact for 4 s grabs.
    await face(visitor, HIDE[0], HIDE[1]);
    await visitor.locator('#canvas-host').focus();
    await visitor.keyboard.down('ShiftLeft'); await visitor.keyboard.down('KeyW'); await visitor.waitForTimeout(2600);
    await visitor.keyboard.up('KeyW'); await visitor.keyboard.up('ShiftLeft');
    await visitor.waitForTimeout(400);
    const walked = (await town(visitor)).self.position;
    rows.push({ step: 'walk west by key', position: walked.map(round) });
    check(walked[0] < MOUTH[0] - 2, `The visitor walks into the outer bay by key (${walked.map(round)})`);
    check(walked[0] > -2769.5, `and stops at the crate partition, not through it (${round(walked[0])} east of -2769.5)`);
    const seenInBay = await officerNear(12, 4000);
    check(seenInBay, 'The officer still sees the visitor in the outer bay');
    rows.push({ step: 'outer bay', officer: seenInBay.position.map(round) });

    // Slip behind the partition into the inner bay: one short authoritative step, the same
    // travel the hops above use (a wanted player in contact for 4 s is grabbed).
    const reply = await goTo(visitor, HIDE[0], HIDE[1]);
    check(reply?.ok, `The visitor steps into the inner bay (${JSON.stringify(reply)})`);
    await visitor.waitForTimeout(250);
    const hiddenAt = (await town(visitor)).self.position;
    check(distance(hiddenAt, HIDE) < 0.6, `The visitor stands in the inner bay (${hiddenAt.map(round)})`);

    // The officer searches, cannot see the bay, and returns to its post; nobody grabs the visitor.
    const sequence = [];
    const started = Date.now();
    let last = null;
    while (Date.now() - started < 25000) {
      const state = await town(visitor), unit = officerOf(state) ?? state.police.units.find(item => item.id === pursued.id);
      const now = unit ? (unit.targetId === state.selfId ? unit.state : `${unit.state} (released)`) : 'gone';
      if (now !== last) { sequence.push({ atS: round((Date.now() - started) / 1000), state: now, officer: unit?.position.map(round) ?? null, toVisitor: unit ? round(distance(unit.position, state.self.position)) : null }); last = now; }
      if (['grab', 'arrest'].includes(unit?.state) && unit.targetId === state.selfId) break;
      if (!unit || unit.targetId !== state.selfId) break;
      await visitor.waitForTimeout(200);
    }
    rows.push({ step: 'hidden', sequence });
    check(sequence.some(item => item.state === 'search'), `The officer loses sight and searches: ${JSON.stringify(sequence)}`);
    check(!sequence.some(item => ['grab', 'arrest'].includes(item.state)), 'The officer never reaches the hidden visitor');
    check(sequence.at(-1).state !== 'search' && sequence.at(-1).state !== 'pursue', `The search ends and the officer stands down: ${sequence.at(-1).state}`);
    const after = await town(visitor);
    check(stars(after) === 1 && distance(after.self.position, HIDE) < 0.6, `The visitor keeps their one star, still in the bay (${stars(after)})`);
    await visitor.screenshot({ path: 'output/playwright/crime-conceal-hidden.png' });
    await page.screenshot({ path: 'output/playwright/crime-conceal-owner.png' });

    await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off');
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    return { passed: true, checks, rows };
  } finally {
    await visitor.context().close();
  }
}
