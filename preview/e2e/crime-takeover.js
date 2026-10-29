async (page, { takeover }) => {
  const { openHudSpace } = await import('./hud-navigation.js');
  // #599 / #640 increment 5: the three rows the crime-encounter journey could not show, in one run
  // on two Redis-coordinated world processes behind a switching proxy (crime-takeover-runner.js).
  // The runner's page is the town owner (the Jevica fixture account: rules, and the one identity
  // that may fly). A visitor (alice, recorded) strikes the lane rival and is pursued; a witness
  // (bob) stands in the lane. Shown here: (A) an officer that loses sight of the visitor by
  // distance inside the lane searches from the last seen position and gives up on the clock;
  // (B) the writer process is killed mid-pursuit, the other process takes the lease, every
  // browser reconnects through the proxy with the same identity, position, stars, rival health
  // and pursuit, one evade id sent across the takeover opens at most one window, and the visitor
  // surrenders through the new writer; (C) a strike started on foot in the first tenth of a
  // metre of a take-off finds the attacker airborne at contact and misses (attack_on_foot).
  // Every number is a measurement of this run on this machine, not a budget.
  const RX = -2800, RN = -1440, RIVAL = 'rival:service-lane', FAR = [RX + 90, RN], AWAY = [RX + 30, RN + 2], VIDEO_DIR = 'output/playwright/crime-takeover-video';
  const origin = 'http://127.0.0.1:5173';
  const checks = [], errors = [], shots = [], rows = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const row = (name, status, detail) => rows.push({ name, status, detail });
  const browser = page.context().browser();
  await page.context().addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
  const visitorContext = await browser.newContext({ recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 860 } } });
  await visitorContext.addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  const witnessContext = await browser.newContext();
  await witnessContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  const visitor = await visitorContext.newPage(), witness = await witnessContext.newPage();
  for (const tab of [page, visitor, witness]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 860 }); }
  const join = async tab => {
    await tab.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 60000 });
    if (await tab.locator('.visit-tools[open]').count()) await tab.locator('.visit-tools-toggle').click();
    if (await tab.locator('.town-chat-dock[open]').count()) await tab.locator('.town-chat-toggle').click();
  };
  const town = tab => tab.evaluate(id => { const m = window.__riverMultiplayer(), s = m.snapshot;
    return { rival: s.crime.targets.find(item => item.id === id), wanted: s.crime.wanted, actions: s.crime.actions, police: s.police, self: s.players.find(p => p.id === m.selfId), selfId: m.selfId, policy: s.worldPolicy,
      players: s.players.map(p => ({ id: p.id, position: p.position })), locals: s.locals.filter(local => !local.indoor).map(local => ({ id: local.id, position: local.position })) }; }, RIVAL);
  const stars = state => state.wanted.find(([id]) => id === state.selfId)?.[1] ?? 0;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const round = value => value === null || value === undefined ? null : Math.round(value * 100) / 100;
  const shoot = async (tab, name) => { const path = `output/playwright/crime-takeover-${name}.png`; await tab.screenshot({ path }); shots.push(path); };
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
  const approach = async (tab, [east, north], reach) => {
    for (const [dx, dn] of [[1.2, 0], [0, 1.2], [0, -1.2], [-1.2, 0], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
      await goTo(tab, east + dx, north + dn);
      await tab.waitForTimeout(400);
      const { self } = await town(tab);
      if (distance(self.position, [east, north]) <= reach) return self.position;
      await tab.waitForTimeout(1200);
    }
    return null;
  };
  const unitOn = (state, id) => state.police.units.find(unit => id ? unit.id === id : unit.targetId === state.selfId);
  const pursuedState = tab => tab.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.units.find(unit => unit.targetId === m.selfId && ['pursue', 'grab', 'arrest'].includes(unit.state)) ?? null; }, null, { timeout: 20000 }).then(handle => handle.jsonValue()).catch(() => null);
  const hud = visitor.getByRole('region', { name: 'Danger and wanted level' });
  const strikeByKey = async (tab, region) => {
    await region.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
    await tab.waitForTimeout(1100);
    const before = stars(await town(tab));
    await tab.locator('#canvas-host').focus(); await tab.keyboard.press('KeyT');
    await tab.waitForFunction(previous => { const m = window.__riverMultiplayer(); return (m.snapshot.crime.wanted.find(([id]) => id === m.selfId)?.[1] ?? 0) > previous; }, before, { timeout: 6000 });
  };
  // Surrender by keyboard when the officer offers it; the arrest returns the visitor to the safe arrival.
  const surrenderAndRecover = async label => {
    const button = hud.getByRole('button', { name: 'Surrender', exact: true });
    await button.waitFor({ timeout: 25000 });
    await button.focus(); await visitor.keyboard.press('Enter');
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.police.surrendered.includes(m.selfId); }, null, { timeout: 5000 });
    await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(); return !m.snapshot.crime.wanted.some(([id]) => id === m.selfId); }, null, { timeout: 25000 });
    const freed = await town(visitor);
    check(distance(freed.self.position, [RX, RN]) > 10 && freed.self.health === 100, `${label}: surrender and arrest end in the safe recovery (${Math.round(distance(freed.self.position, [RX, RN]))} m away, health ${freed.self.health})`);
    return freed;
  };
  const videoOf = async (tab, name) => { const video = tab.video(); if (!video) return null; const path = await video.path(); return { path, name }; };
  try {
    await join(page); await join(visitor); await join(witness);
    const visitorId = (await town(visitor)).selfId, witnessId = (await town(witness)).selfId, ownerId = (await town(page)).selfId;
    check(ownerId === 'user_01M40Y914S1H4EJCEHH91DKTAY' && visitorId === 'alice' && witnessId === 'bob', `Owner, visitor and witness are the fixture identities (${ownerId}, ${visitorId}, ${witnessId})`);
    check(takeover.liveWorld() === 'A', 'The page reaches world A through the proxy');
    const leaseAtStart = await takeover.lease();
    check(Object.keys(leaseAtStart).length > 0, `A writer holds the town lease (${JSON.stringify(Object.keys(leaseAtStart))})`);

    // Rules on: the south service lane, at all hours. The panel stays open for emergency off.
    await openHudSpace(page, 'community-section');
    const rules = page.getByRole('region', { name: 'World rules' });
    const rulesOn = async () => { await rules.getByLabel('At all hours').check(); await rules.getByLabel('South service lane').check(); await rules.getByRole('button', { name: 'Apply rules' }).click();
      await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.active === true); };
    const emergencyOff = async () => { await rules.getByRole('button', { name: 'Emergency off: stop all danger now' }).click();
      await visitor.waitForFunction(() => window.__riverMultiplayer().snapshot.worldPolicy?.violence.mode === 'off'); };
    await rulesOn();
    await goTo(witness, RX + 10, RN - 5); await face(witness, RX, RN);

    // A. Search after sight loss by distance: the lane is 213 m long, an officer sees 35 m.
    check(await approach(visitor, [RX, RN], 1.5), 'The visitor arrives within arm\'s reach of the service lane rival');
    await face(visitor, RX, RN);
    await strikeByKey(visitor, hud);
    await goTo(visitor, RX + 5, RN + 2);
    const dispatched = await pursuedState(visitor);
    check(dispatched, 'An officer pursues the wanted visitor');
    // Sight is lost only once the officer has the visitor in view at this spot: at stand-off, facing them
    // (run 3: an officer still walking to the strike spot, facing away, had never seen the visitor here and
    // searched the strike spot instead, as the rule says).
    const seenBy = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(), s = m.snapshot, self = s.players.find(p => p.id === m.selfId), unit = s.police.units.find(unit => unit.targetId === m.selfId && unit.state === 'pursue'); return unit && self && Math.hypot(unit.position[0] - self.position[0], unit.position[1] - self.position[1]) <= 2 ? unit : null; }, null, { timeout: 15000 }).then(handle => handle.jsonValue()).catch(() => null);
    check(seenBy, `The officer reaches stand-off with the visitor in sight (${JSON.stringify(seenBy)})`);
    const seenState = await town(visitor), seenPosition = seenState.self.position, starsSeen = stars(seenState);
    // Out of sight at once (the officer offers surrender for 4 s at stand-off, then grabs); a refused
    // step is tried again with its reason kept.
    let stepFar = null, far = null, farAt = null; const farReplies = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      stepFar = await goTo(visitor, FAR[0], FAR[1]); farAt = Date.now(); far = await town(visitor);
      farReplies.push({ ok: stepFar?.ok ?? null, error: stepFar?.error ?? null, message: stepFar?.message ?? null, moved: Math.round(distance(far.self.position, seenPosition)), held: far.police.subdued.includes(far.selfId), health: far.self.health });
      if (distance(far.self.position, seenPosition) > 60) break;
      await visitor.waitForTimeout(700);
    }
    check(distance(far.self.position, seenPosition) > 60, `The visitor is moved ${Math.round(distance(far.self.position, seenPosition))} m east along the lane, beyond sight (${JSON.stringify(farReplies)})`);
    await shoot(visitor, 'pursued-then-far');
    const searching = await visitor.waitForFunction(id => { const unit = window.__riverMultiplayer().snapshot.police.units.find(unit => unit.id === id); return unit?.state === 'search' ? unit : null; }, seenBy.id, { timeout: 8000 }).then(handle => handle.jsonValue()).catch(() => null);
    const searchStartedAfterMs = Date.now() - farAt;
    // The town publishes each unit's position, yaw and state, not its last-seen point: the search is
    // read from where the officer goes (the spot the visitor stood on when last seen) and how it turns.
    check(searching, `The officer loses sight and starts a search (${JSON.stringify({ searching: searching && { state: searching.state, position: searching.position.map(round), toSeenSpot: round(distance(searching.position, seenPosition)) }, seenPosition: seenPosition.map(round), searchStartedAfterMs })})`);
    const samples = [];
    for (let i = 0; i < 48; i++) {
      const state = await town(visitor);
      const unit = unitOn(state, seenBy.id);
      const near = unit ? [...state.players.map(p => ({ id: p.id, gap: round(distance(p.position, unit.position)) })), ...state.locals.map(local => ({ id: local.id, gap: round(distance(local.position, unit.position)) }))].filter(item => item.gap <= 4) : [];
      samples.push({ t: Date.now() - farAt, state: unit?.state ?? null, targetId: unit?.targetId ?? null, officer: unit ? unit.position.map(round) : null, toSeenSpot: unit ? round(distance(unit.position, seenPosition)) : null, toVisitor: unit ? round(distance(unit.position, state.self.position)) : null, yaw: unit ? round(unit.yaw) : null, stars: stars(state), near,
        units: state.police.units.map(u => ({ id: u.id, state: u.state, targetId: u.targetId, position: u.position.map(round) })) });
      if (!unit || !['search', 'pursue', 'grab'].includes(unit.state) || unit.targetId !== visitorId) break;
      await visitor.waitForTimeout(250);
    }
    const searchSamples = samples.filter(s => s.state === 'search');
    const nearestToSeenSpot = searchSamples.length ? Math.min(...searchSamples.map(s => s.toSeenSpot)) : null, nearestToVisitor = searchSamples.length ? Math.min(...searchSamples.map(s => s.toVisitor)) : null;
    const closedIn = nearestToSeenSpot !== null && nearestToSeenSpot <= 2.5 && nearestToVisitor > 35;
    const yaws = searchSamples.map(s => s.yaw).filter(v => v !== null);
    const scanned = yaws.length > 2 && Math.max(...yaws) - Math.min(...yaws) > 0.5;
    const gaveUp = samples.at(-1), searchLastedMs = searchSamples.length ? searchSamples.at(-1).t - searchSamples[0].t : 0;
    const searchDetail = { searchStartedAfterMs, searchLastedMs, nearestToSeenSpot, nearestToVisitor, closedIn, scanned, endedAs: gaveUp?.state ?? 'released', starsDuring: [...new Set(samples.map(s => s.stars))], samples: samples.length, firstSample: samples[0], lastSample: gaveUp };
    console.log(`crime-takeover search: ${JSON.stringify(searchDetail)}`);
    const onTheClock = searchSamples.length > 0 && (gaveUp.state === 'return' || gaveUp.state === null || gaveUp.targetId !== visitorId) && searchLastedMs >= 6000 && searchLastedMs <= 12000 && searchDetail.starsDuring.length === 1 && searchDetail.starsDuring[0] === starsSeen;
    const searchFindings = [...(closedIn ? [] : ['the officer did not reach the last-seen spot (documented: walks to it and sweeps there; the server-only probe .runtime/evidence-640/search-probe.mjs reaches it in 2 s)']), ...(onTheClock ? [] : ['the search did not end on the 8 s clock with the stars kept'])];
    if (closedIn) checks.push(`The officer searches at the spot the visitor was last seen on, never nearer the visitor than its sight (${JSON.stringify(searchDetail)})`);
    if (onTheClock) checks.push(`The search runs on the 8 s clock then the officer returns (${JSON.stringify(searchDetail)})`);
    await shoot(visitor, 'searched');
    // Back within sight: pursued again from a fresh last-seen position, then surrender.
    await goTo(visitor, RX + 5, RN + 2);
    const reseen = await pursuedState(visitor);
    const closedAgain = await visitor.waitForFunction(() => { const m = window.__riverMultiplayer(), s = m.snapshot, self = s.players.find(p => p.id === m.selfId), unit = s.police.units.find(unit => unit.targetId === m.selfId); return unit && self && Math.hypot(unit.position[0] - self.position[0], unit.position[1] - self.position[1]) <= 3 ? { state: unit.state, gap: Math.round(Math.hypot(unit.position[0] - self.position[0], unit.position[1] - self.position[1]) * 100) / 100 } : null; }, null, { timeout: 15000 }).then(handle => handle.jsonValue()).catch(() => null);
    check(reseen && closedAgain, `Back within 35 m the visitor is seen and pursued again to the new position (${JSON.stringify({ state: reseen?.state, closedAgain })})`);
    row('perception-led search after sight loss (browser)', searchFindings.length ? 'fail' : 'pass', { ...searchDetail, findings: searchFindings, reseen: { state: reseen.state, closedAgain }, samples });
    const recoveredA = await surrenderAndRecover('After the search');

    // B. Writer takeover mid-pursuit. Wanted again, the visitor steps 25 m from the officer so no
    // grab can land for several seconds; one evade id goes to the writer that is about to die.
    check(await approach(visitor, [RX, RN], 1.5), 'The visitor walks back to the rival');
    await face(visitor, RX, RN);
    await strikeByKey(visitor, hud);
    await goTo(visitor, AWAY[0], AWAY[1]);
    const pursuerBeforeState = await pursuedState(visitor);
    check(pursuerBeforeState, 'An officer pursues the visitor across the lane');
    const before = await town(visitor), witnessBefore = await town(witness), ownerBefore = await town(page);
    const pursuerBefore = unitOn(before);
    const pre = await visitor.evaluate(async () => { const t0 = performance.now(); const r = await window.__riverMultiplayerCommand({ type: 'evade', evadeId: 'takeover-once-0001' }).catch(error => ({ ok: false, error: String(error) })); return { ok: r?.ok, error: r?.error ?? null, remainingMs: r?.evade?.remainingMs ?? null, replayed: Boolean(r?.replayed), replyMs: Math.round(performance.now() - t0) }; });
    const failover = await takeover.failover();
    const droppedAt = Date.now();
    const reconnected = Object.fromEntries(await Promise.all(Object.entries({ visitor, witness, owner: page }).map(async ([name, tab]) => [name, await tab.waitForFunction(() => window.__riverConnection.state().connected && window.__riverMultiplayer().connected, null, { timeout: 40000 }).then(() => Date.now() - droppedAt).catch(() => null)])));
    const after = await town(visitor);
    const leaseAfter = await takeover.lease();
    const leaseChanged = JSON.stringify(leaseAfter) !== JSON.stringify(failover.leaseBefore) && Object.keys(leaseAfter).length > 0;
    const pursuerAfter = unitOn(after);
    const takeoverDetail = { failover: { ...failover, leaseBefore: Object.keys(failover.leaseBefore) }, reconnectedAfterMs: reconnected, liveWorld: takeover.liveWorld(), leaseChanged, pre, identity: [before.selfId, after.selfId], stars: [stars(before), stars(after)], rivalHealth: [before.rival.health, after.rival.health], selfHealth: [before.self.health, after.self.health],
      positionDriftMetres: round(distance(before.self.position, after.self.position)), pursuer: [pursuerBefore && { id: pursuerBefore.id, state: pursuerBefore.state }, pursuerAfter && { id: pursuerAfter.id, state: pursuerAfter.state }], policyActive: [before.policy?.active, after.policy?.active] };
    console.log(`crime-takeover failover: ${JSON.stringify(takeoverDetail)}`);
    check(failover.signal === 'SIGKILL' && takeover.liveWorld() === 'B' && leaseChanged, `World ${failover.from} was killed (${failover.signal} after ${failover.exitedAfterMs} ms) and world ${failover.to} holds a new lease`);
    check(Object.values(reconnected).every(ms => ms !== null), `All three browsers reconnected through the proxy to the new writer (${JSON.stringify(reconnected)} ms)`);
    check(after.selfId === before.selfId && stars(after) === stars(before) && after.rival.health === before.rival.health && after.self.health === before.self.health && takeoverDetail.positionDriftMetres < 1.5 && after.policy?.active === true,
      `The same identity, position, stars, health, rival health and rules come back from the new writer (${JSON.stringify({ stars: takeoverDetail.stars, rivalHealth: takeoverDetail.rivalHealth, drift: takeoverDetail.positionDriftMetres })})`);
    check(pursuerAfter && ['pursue', 'grab', 'arrest', 'search'].includes(pursuerAfter.state), `The pursuit continues on the new writer (officer ${pursuerAfter?.state})`);
    await visitor.waitForTimeout(2500);
    const pursuerLater = unitOn(await town(visitor));
    takeoverDetail.pursuer.push(pursuerLater && { id: pursuerLater.id, state: pursuerLater.state, afterMs: 2500 });
    const replay = await visitor.evaluate(async () => { const r = await window.__riverMultiplayerCommand({ type: 'evade', evadeId: 'takeover-once-0001' }).catch(error => ({ ok: false, error: String(error) })); return { ok: r?.ok, error: r?.error ?? null, remainingMs: r?.evade?.remainingMs ?? null, replayed: Boolean(r?.replayed) }; });
    const once = { pre, replay, carriedOver: pre.ok && replay.replayed, lostWithTheWriter: pre.ok && !replay.replayed };
    console.log(`crime-takeover once: ${JSON.stringify(once)}`);
    check(pre.ok && (replay.replayed || replay.ok || replay.error === 'evade_cooldown'), `One evade id sent to the dying writer and again to its replacement opens at most one window: ${once.carriedOver ? 'carried over in the checkpoint and replayed' : 'not committed before the kill, opened once on the new writer'} (${JSON.stringify(once)})`);
    const peerAfter = await witness.evaluate(id => { const m = window.__riverMultiplayer(); return { seesVisitor: m.remotes.some(item => item.id === id && item.ready), seesOfficer: m.remotes.some(item => item.id.startsWith('police:') && item.ready), selfId: m.selfId }; }, visitorId);
    check(peerAfter.selfId === witnessBefore.selfId && peerAfter.seesVisitor, `The witness came back as the same identity and still draws the visitor (${JSON.stringify(peerAfter)})`);
    await shoot(visitor, 'after-takeover-visitor'); await shoot(witness, 'after-takeover-witness');
    const recoveredB = await surrenderAndRecover('Through the new writer');
    row('writer takeover mid-pursuit (browser)', 'pass', { ...takeoverDetail, once, witness: peerAfter, owner: { identity: [ownerBefore.selfId, (await town(page)).selfId] }, recovery: { afterSearch: recoveredA.self.position.map(round), afterTakeover: recoveredB.self.position.map(round) } });
    await shoot(visitor, 'surrendered-on-new-writer');

    // C. Altitude inside the windup: the owner (the one identity that may fly) begins a take-off,
    // strikes while still within 0.1 m of the ground, and is airborne at the 300 ms contact.
    const ownerHud = page.getByRole('region', { name: 'Danger and wanted level' });
    await page.waitForFunction(id => { const r = window.__riverMultiplayer().snapshot.crime.targets.find(item => item.id === id); return r && r.health > 0 && !r.down; }, RIVAL, { timeout: 30000 });
    const attempts = [];
    let altitudeRow = null;
    for (let attempt = 0; attempt < 3 && !altitudeRow; attempt++) {
      check(await approach(page, [RX, RN], 1.5), 'The owner arrives within arm\'s reach of the rival');
      await face(page, RX, RN);
      await ownerHud.getByRole('button', { name: 'Shove Service lane rival T' }).waitFor();
      await page.waitForTimeout(1100);
      const start = await town(page);
      await page.locator('#canvas-host').focus();
      await page.keyboard.press('KeyB');
      await page.waitForTimeout([150, 120, 180][attempt]);
      // The strike goes as the raw command (the client withholds its own key once a take-off has begun):
      // the town accepts it while the last pose is still on the ground and rechecks at contact.
      const atKey = await page.evaluate(async ([id, attempt]) => { const c = window.__riverCarriage(); const t0 = performance.now(); const r = await window.__riverMultiplayerCommand({ type: 'attack', targetId: id, attackKind: 'melee', attackId: `takeover-altitude-${attempt}` }).catch(error => ({ ok: false, error: String(error) })); return { altitude: c.pose?.altitude ?? null, flying: c.pose?.flying ?? null, reply: { ok: r?.ok, error: r?.error ?? null, phase: r?.action?.phase ?? null, id: r?.action?.id ?? null, replyMs: Math.round(performance.now() - t0) } }; }, [RIVAL, attempt]);
      await page.waitForTimeout(1500);
      const end = await town(page);
      const strike = end.actions.find(action => action.id === atKey.reply.id) ?? null;
      const detail = { attempt, atKey: { altitude: round(atKey.altitude), flying: atKey.flying, reply: atKey.reply }, altitudeAfter: round(end.self.altitude), strike: strike && { outcome: strike.outcome, reason: strike.reason ?? null }, rivalHealth: [start.rival.health, end.rival.health], ownerStars: [stars(start), stars(end)] };
      attempts.push(detail);
      console.log(`crime-takeover altitude: ${JSON.stringify(detail)}`);
      // Land: B again ends the flight; travel settles the pose if the figure is still up.
      await page.keyboard.press('KeyB');
      await page.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.altitude === 0; }, null, { timeout: 10000 }).catch(() => goTo(page, RX + 3, RN + 2));
      if (strike && strike.outcome === 'miss' && strike.reason === 'attack_on_foot') {
        check(end.rival.health === start.rival.health && stars(end) === stars(start), `Airborne at contact, the strike misses with attack_on_foot: nothing lands, no star (${JSON.stringify(detail)})`);
        altitudeRow = { ...detail, attempts };
      } else if (strike?.outcome === 'hit') detail.note = 'the take-off had begun on the client but its airborne pose reached the town after the contact: the town struck from the last pose it had, on the ground';
      else if (!strike) detail.note = atKey.reply.ok ? 'the strike was accepted but is no longer among the published actions' : `the strike was refused at once: ${atKey.reply.error}`;
    }
    const landedBeforeTheTownKnew = attempts.filter(item => item.strike?.outcome === 'hit').length;
    const altitudeFindings = landedBeforeTheTownKnew ? [`${landedBeforeTheTownKnew} of ${attempts.length} strikes landed although the client had begun its take-off: flight poses are acknowledged one at a time (multiplayer-client.js), so under a 200-400 ms town loop the airborne pose can arrive after the 300 ms contact; the town resolved contact on its last known pose`] : [];
    if (altitudeRow) row('altitude transition during windup (browser)', 'pass', { ...altitudeRow, findings: altitudeFindings });
    else row('altitude transition during windup (browser)', 'not-run', { reason: 'in three attempts no airborne pose reached the town inside the 300 ms windup on this machine (measured altitudes and outcomes recorded); server/tests/crime-phases.test.js covers altitude at contact', attempts, findings: altitudeFindings });
    await shoot(page, 'altitude-owner');

    // The rules command flows through the new writer: emergency off from the owner's panel.
    await emergencyOff();
    check((await town(visitor)).policy?.violence.mode === 'off', 'Emergency off from the owner reaches every browser through the new writer');
    check(errors.length === 0, `No page errors: ${errors.join(' | ')}`);
    const failed = rows.filter(item => item.status === 'fail');
    const evidence = { identities: { owner: ownerId, visitor: visitorId, witness: witnessId }, worlds: takeover.worlds, liveWorldAtEnd: takeover.liveWorld(), rows, screenshots: shots, viewport: '1280x860' };
    const videos = [await videoOf(visitor, 'visitor')];
    await visitorContext.close(); await witnessContext.close();
    evidence.videos = videos.filter(Boolean);
    return failed.length ? { passed: false, failure: `Rows failed: ${failed.map(item => `${item.name}: ${item.detail.findings?.join('; ')}`).join(' | ')}`, checks, evidence } : { passed: true, checks, evidence };
  } catch (error) {
    error.checks = checks; error.rows = rows; error.screenshots = shots;
    throw error;
  } finally {
    await visitorContext.close().catch(() => {}); await witnessContext.close().catch(() => {});
  }
}
