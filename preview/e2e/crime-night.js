async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // #640 increment 5 evidence: one fight in the south service lane at the latest authored hour
  // (19:00; the time-of-day control ends there, so "night" is dusk until a night sky is authored),
  // seen from two browsers. The visitor strikes with T and evades the rival's counter with U; the
  // owner watches. Each page stamps, on its own clock (epoch ms, comparable inside one browser),
  // when the key went down, when its figure took up the pose, when the town's hit arrived and when
  // the other figure's contact and flinch showed. The numbers are measurements of this run on this
  // machine, reported in the receipt, not budgets; the checks only ask that each event was shown.
  const RX = -2800, RN = -1440, RIVAL = 'rival:service-lane';
  const checks = [], errors = [], shots = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const visitor = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, visitor]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
  };
  const town = tab => tab.evaluate(id => { const m = window.__riverMultiplayer(), crime = m.snapshot.crime;
    return { rival: crime.targets.find(item => item.id === id), wanted: crime.wanted, self: m.snapshot.players.find(p => p.id === m.selfId), selfId: m.selfId }; }, RIVAL);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const shoot = async (tab, name) => { const path = `output/playwright/crime-night-${name}.png`; await tab.screenshot({ path }); shots.push(path); };
  const dusk = tab => tab.evaluate(() => { const input = document.querySelector('#sun-hour'); input.value = input.max; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#weather').value = 'clear'; document.querySelector('#weather').dispatchEvent(new Event('change', { bubbles: true })); return { hour: Number(input.value), max: Number(input.max), shown: document.querySelector('#sun-time')?.textContent }; });
  try {
    await join(page); await join(visitor);
    for (const tab of [visitor, page]) { if (await tab.locator('.visit-tools[open]').count()) await tab.locator('.visit-tools-toggle').click(); if (await tab.locator('.town-chat-dock[open]').count()) await tab.locator('.town-chat-toggle').click(); }
    const hours = [await dusk(visitor), await dusk(page)];
    check(hours.every(item => item.hour === item.max), `Both browsers show the latest authored hour (${hours[0].shown}; the control ends at ${hours[0].max}:00)`);
    let arrived = null;
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
      await visitor.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [RX + dx, RN + dn]);
      await visitor.waitForTimeout(400);
      const { self } = await town(visitor);
      if (distance(self.position, [RX, RN]) <= 1.5) { arrived = self.position; break; }
      await visitor.waitForTimeout(1200);
    }
    check(arrived, 'The visitor arrives within arm\'s reach of the service lane rival');
    // The owner stands where both figures are in view, a few metres east. Never wanted or engaged,
    // so the lane is safe for them; the travel reply says whether the spot was walkable.
    const ownerTravel = await page.evaluate(([x, n]) => window.__riverSeatAndWater().goTo(x, n), [RX + 2.5, RN + 1.5]);
    await page.waitForTimeout(1500);
    const ownerAt = (await town(page)).self.position;
    check(ownerTravel?.ok !== false && distance(ownerAt, [RX, RN]) < 6, `The owner stands within view of the fight (${distance(ownerAt, [RX, RN]).toFixed(1)} m from the rival)`);
    const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
    await hud.getByText('Service lane rival', { exact: true }).waitFor();
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    await rules.getByLabel('At all hours').check();
    await rules.getByLabel('South service lane').check();
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true);
    await hud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    // The World rules panel stays open on the owner's page (Emergency off needs it below).
    await shoot(visitor, 'lane-visitor'); await shoot(page, 'lane-owner');

    // Observers. Epoch stamps: performance.timeOrigin + performance.now(), the same clock in both pages.
    await visitor.evaluate(() => {
      const at = () => performance.timeOrigin + performance.now();
      const night = window.__night = { keyAt: null, poseAt: null, strikePublishedAt: null, townContactAt: null, hitAt: null, telegraphAt: null, evadeKeyAt: null, evadePoseAt: null, evadeAttempt: null, counterOutcome: null, frames: 0, framesFrom: at(), lines: [] };
      const host = document.querySelector('#canvas-host'), hud = document.querySelector('.crime-hud'), line = document.querySelector('.crime-result');
      new MutationObserver(() => { const body = host.dataset.combat; if (body === 'strike' && night.poseAt === null) night.poseAt = at(); if (body === 'evade' && night.evadePoseAt === null) night.evadePoseAt = at(); }).observe(host, { attributes: true, attributeFilter: ['data-combat'] });
      new MutationObserver(() => night.lines.push([at(), line.textContent])).observe(line, { childList: true, characterData: true, subtree: true });
      const tick = () => { night.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      window.__nightPoll = setInterval(() => {
        const m = window.__riverMultiplayer(), actions = m.snapshot?.crime?.actions ?? [];
        const state = hud?.dataset.combatState ? JSON.parse(hud.dataset.combatState) : null;
        if (state?.kind === 'strike' && night.strikePublishedAt === null) night.strikePublishedAt = at();
        // The town's contact instant, by this page's clock: the windup's remaining time when the strike first arrives.
        const mine = actions.find(action => action.kind === 'strike' && action.actorId === m.selfId);
        if (mine && night.townContactAt === null) night.townContactAt = at() + (mine.phase === 'windup' ? mine.remainingMs : 0);
        if (night.hitAt === null && mine?.outcome === 'hit') night.hitAt = at();
        if (hud?.dataset.telegraph === 'counter' && night.telegraphAt === null) night.telegraphAt = at();
      }, 16);
    });
    const visitorId = (await town(visitor)).selfId;
    await page.evaluate(([visitorId, rivalId]) => {
      const at = () => performance.timeOrigin + performance.now();
      const night = window.__night = { strikeAt: null, contactAt: null, strikeProgressAtFirst: null, townContactAt: null, hitAt: null, flinchAt: null, counterAt: null, evadeAt: null, frames: 0, framesFrom: at(), done: false };
      // Figure states only change per rendered frame, and reading the renderer's stats walks every
      // figure, so sample once per frame from the same loop that counts frames.
      const tick = () => {
        night.frames++;
        if (!night.done) {
          const m = window.__riverMultiplayer(), remotes = m.remotes ?? [], actions = m.snapshot?.crime?.actions ?? [];
          const visitor = remotes.find(item => item.id === visitorId), rival = remotes.find(item => item.id === rivalId);
          if (visitor?.combat === 'strike') { if (night.strikeAt === null) { night.strikeAt = at(); night.strikeProgressAtFirst = visitor.combatProgress; } if (night.contactAt === null && visitor.combatProgress >= 300 / 900) night.contactAt = at(); }
          if (visitor?.combat === 'evade' && night.evadeAt === null) night.evadeAt = at();
          const theirs = actions.find(action => action.kind === 'strike' && action.actorId === visitorId);
          if (theirs && night.townContactAt === null) night.townContactAt = at() + (theirs.phase === 'windup' ? theirs.remainingMs : 0);
          if (night.hitAt === null && theirs?.outcome === 'hit') night.hitAt = at();
          if (rival?.combat === 'flinch' && night.flinchAt === null) night.flinchAt = at();
          if (rival?.combat === 'counter' && night.counterAt === null) night.counterAt = at();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, [visitorId, RIVAL]);

    // T. The key stamp is taken in the page just before the press; the press itself costs the driver a few ms.
    await visitor.locator('#canvas-host').focus();
    await visitor.evaluate(() => { window.__night.keyAt = performance.timeOrigin + performance.now(); });
    await visitor.keyboard.press('KeyT');
    // Screenshots cost a frame or more each under load: the visitor's is taken at once ("after T"),
    // the owner's once their page shows the strike, so each frames what its name says as far as the driver allows.
    await shoot(visitor, 'after-t-visitor');
    await page.waitForFunction(() => window.__night.strikeAt !== null, null, { timeout: 1500 }).catch(() => {});
    await shoot(page, 'strike-owner');
    await visitor.waitForFunction(() => window.__night.lines.some(([, text]) => text.startsWith('Hit landed.')));
    await visitor.waitForFunction(() => window.__night.poseAt !== null, null, { timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => window.__night.strikeAt !== null && window.__night.hitAt !== null, null, { timeout: 3000 }).catch(() => {});
    const after = await town(visitor);
    check(after.rival.health === 75 && after.wanted.some(([id, stars]) => id === after.selfId && stars === 1), 'One landed shove: 25 damage and one star, from the town');

    // The rival's telegraphed counter: the cue on the striker's HUD and the raised pose on the other screen; then U.
    await visitor.waitForFunction(() => window.__night.lines.some(([, text]) => /winding up to strike back/.test(text)), null, { timeout: 15000 });
    await shoot(visitor, 'telegraph-visitor'); await shoot(page, 'telegraph-owner');
    const lead = 340, attempts = [];
    let evaded = null;
    for (let attempt = 0; attempt < 3 && !evaded; attempt++) {
      const counter = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(), counter = m.snapshot?.crime?.actions?.find(item => item.kind === 'counter' && item.targetId === m.selfId && item.outcome === null && item.phase === 'windup');
        return counter && { id: counter.id, remainingMs: counter.remainingMs, contactAt: performance.now() + counter.remainingMs }; }, null, { polling: 16, timeout: 10000 }).then(handle => handle.jsonValue()).catch(() => null);
      if (!counter) { attempts.push({ attempt, seen: null }); continue; }
      if (counter.remainingMs < lead + 30) { attempts.push({ attempt, remainingMs: counter.remainingMs, late: true }); await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot?.crime?.actions?.find(item => item.id === id && item.outcome !== null), counter.id); continue; }
      await visitor.locator('#canvas-host').focus();
      await visitor.waitForFunction(at => performance.now() >= at, counter.contactAt - lead, { polling: 16 });
      await visitor.evaluate(attempt => { window.__night.evadeKeyAt = performance.timeOrigin + performance.now(); window.__night.evadePoseAt = null; window.__night.evadeAttempt = attempt; }, attempt);
      await page.evaluate(() => { window.__night.evadeAt = null; });
      await visitor.keyboard.press('KeyU');
      await shoot(visitor, 'evade-visitor'); await shoot(page, 'evade-owner');
      const outcome = await visitor.waitForFunction(id => window.__riverMultiplayer().snapshot?.crime?.actions?.find(item => item.id === id && item.outcome !== null)?.outcome, counter.id).then(handle => handle.jsonValue());
      attempts.push({ attempt, remainingMs: counter.remainingMs, outcome });
      if (outcome === 'evaded') evaded = { attempt, remainingMs: counter.remainingMs };
    }
    await visitor.evaluate(attempts => { window.__night.counterOutcome = attempts; }, attempts);
    // The header promises an evade of the rival's counter with U (review of #732: it was only recorded).
    check(evaded, `The visitor evades the rival's counter with U within three attempts: ${JSON.stringify(attempts)}`);

    // Emergency off, then the stamps.
    await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
    await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off');
    const [v, o] = await Promise.all([visitor, page].map(tab => tab.evaluate(() => { clearInterval(window.__nightPoll); const n = window.__night; n.done = true; return { ...n, fps: Math.round(n.frames / ((performance.timeOrigin + performance.now() - n.framesFrom) / 1000)) }; })));
    const ms = (a, b) => a !== null && b !== null ? Math.round(a - b) : null;
    // "town contact" is each page's own estimate (remaining windup when the strike first arrived), so
    // a shown contact can read a few ms early; "hit snapshot" is the first snapshot carrying the outcome.
    const evidence = {
      hour: hours[0].shown, viewport: '1280x860', positions: { visitor: arrived.map(value => Math.round(value * 10) / 10), owner: ownerAt.map(value => Math.round(value * 10) / 10), rival: [RX, RN] },
      animationFramesPerSecond: { visitor: v.fps, owner: o.fps, window: 'from the observers\' install to the end of the fight, screenshots included' },
      visitor: { inputToPublishedMs: ms(v.strikePublishedAt, v.keyAt), inputToPoseMs: ms(v.poseAt, v.keyAt), inputToHitSnapshotMs: ms(v.hitAt, v.keyAt), hitSnapshotAfterTownContactMs: ms(v.hitAt, v.townContactAt), telegraphAfterHitSnapshotMs: ms(v.telegraphAt, v.hitAt), evadeKeyToPoseMs: ms(v.evadePoseAt, v.evadeKeyAt), evadeAttempt: v.evadeAttempt, counter: attempts, evaded },
      owner: { inputToStrikeShownMs: ms(o.strikeAt, v.keyAt), strikeProgressWhenFirstShown: o.strikeProgressAtFirst, contactShownAfterTownContactMs: ms(o.contactAt, o.townContactAt), contactShownAfterVisitorHitSnapshotMs: ms(o.contactAt, v.hitAt), flinchAfterTownContactMs: ms(o.flinchAt, o.townContactAt), flinchAfterOwnHitSnapshotMs: ms(o.flinchAt, o.hitAt), counterShownAfterVisitorTelegraphMs: ms(o.counterAt, v.telegraphAt), evadeShownAfterVisitorKeyMs: ms(o.evadeAt, v.evadeKeyAt) },
      screenshots: shots,
    };
    check(v.poseAt !== null && v.strikePublishedAt !== null, `The striker's figure took up the strike (${evidence.visitor.inputToPoseMs} ms after the key)`);
    check(o.strikeAt !== null && o.contactAt !== null, `The other browser showed the strike (${evidence.owner.inputToStrikeShownMs} ms after the key) and its contact (${evidence.owner.contactShownAfterTownContactMs} ms against the town's contact)`);
    check(o.flinchAt !== null, `The other browser showed the rival's flinch (${evidence.owner.flinchAfterTownContactMs} ms after the town's contact)`);
    check(v.telegraphAt !== null && o.counterAt !== null, 'Both browsers showed the rival\'s telegraphed counter');
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    return { passed: true, checks, evidence };
  } finally {
    await visitor.context().close();
  }
}
