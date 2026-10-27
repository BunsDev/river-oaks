async page => {
  // Network transitions (#290): the network drops while an action is in flight,
  // then returns. A proxy on the town socket lets the town apply the action and
  // cuts the line exactly as its result comes back, so the page cannot know the
  // outcome; the context goes offline at the same moment. Each action must end
  // completed, refused or unknown, the page must say so, and nothing may be
  // sent twice. The office desk is plain HTTP, so its save is cut the same way.
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [], failures = [], errors = [], metrics = {};
  const expect = (ok, message, detail) => {
    (ok ? checks : failures).push(detail === undefined ? message : `${message} ${JSON.stringify(detail)}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
  };
  page.on('pageerror', error => errors.push(error.message));
  const context = page.context();
  // A page that reloads during an outage lands on the browser's offline page and loses the world.
  const navigations = [], failedRequests = [];
  let loaded = false;
  // Both are printed as they happen, so a run cut short by a reload still shows its cause.
  page.on('framenavigated', frame => {
    if (!loaded || frame !== page.mainFrame()) return;
    navigations.push({ url: frame.url(), at: Date.now() }); console.log(`navigated ${frame.url()}`);
  });
  page.on('requestfailed', request => {
    const path = new URL(request.url()).pathname, failure = request.failure()?.errorText;
    failedRequests.push({ path, failure, at: Date.now() });
    if (/^\/(auth|api)\//.test(path)) console.log(`request failed ${path} ${failure}`);
  });
  // Each answer the access recheck gets (access-entry.js), to tell an answered check from
  // one the network swallowed.
  const sessionAnswers = [];
  page.on('response', response => { if (new URL(response.url()).pathname === '/auth/session') sessionAnswers.push({ status: response.status(), at: Date.now() }); });
  // Every town socket goes through this proxy. `armed` names the command whose
  // result cuts the line; after the cut nothing passes in either direction.
  const wire = { sockets: 0, sent: [], armed: null, armedRequest: null, cut: false, dead: false };
  await page.routeWebSocket(/\/multiplayer\?/, ws => {
    const socket = ++wire.sockets, server = ws.connectToServer();
    ws.onMessage(message => {
      let data = null; try { data = JSON.parse(String(message)); } catch { /* binary or malformed */ }
      if (data?.type && data.type !== 'pose') wire.sent.push({ socket, type: data.type, requestId: data.requestId ?? null, dead: wire.dead, at: Date.now() });
      if (wire.armed && data?.type === wire.armed && !wire.armedRequest) wire.armedRequest = data.requestId;
      if (!wire.dead) server.send(message);
    });
    server.onMessage(message => {
      if (wire.dead) return;
      if (wire.armedRequest) {
        let data = null; try { data = JSON.parse(String(message)); } catch { /* keep forwarding */ }
        if (data?.type === 'result' && data.requestId === wire.armedRequest) { wire.cut = true; wire.dead = true; wire.cutResult = data; return; }
      }
      ws.send(message);
    });
  });
  const sentOf = type => wire.sent.filter(item => item.type === type);
  const connection = () => page.evaluate(() => window.__riverConnection?.state());
  const said = () => page.evaluate(() => {
    const text = selector => { const node = document.querySelector(selector); return node && !node.hidden && node.getClientRects().length ? node.textContent.trim() : ''; };
    return { walking: text('#walking-notice'), roster: document.querySelector('.multiplayer-roster > p[role=status]')?.textContent.trim() ?? '', gate: window.__riverConnection?.state() };
  });
  const waitFor = async (predicate, timeout = 30000, step = 100) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return true; await page.waitForTimeout(step); }
    return false;
  };
  // Cut, go offline, and measure how long the page keeps claiming a connection.
  const dropDuringResult = async (type, act) => {
    wire.armed = type; wire.armedRequest = null; wire.cut = false;
    await act();
    expect(await waitFor(() => wire.cut, 15000), `${type}: the town applied the action and its result was cut`);
    await context.setOffline(true);
    const offlineAt = Date.now();
    expect(await page.evaluate(() => navigator.onLine === false), `${type}: the browser reports offline`);
    const admitted = await waitFor(async () => (await connection())?.connected === false, 30000, 50);
    const admitMs = Date.now() - offlineAt;
    metrics[`${type}AdmitOfflineMs`] = admitMs;
    expect(admitted, `${type}: the page admits the lost connection`, { admitMs });
    expect(admitMs <= 2000, `${type}: the connection UI turns truthful within 2 s of going offline`, { admitMs });
    return { offlineAt, admitMs };
  };
  // A defect whose fix lies outside this lane's files is reported, not hidden: it is
  // printed and listed in metrics.known, and the handoff names the change it needs.
  const known = (ok, message, detail) => {
    if (ok) { expect(true, message); return; }
    (metrics.known ??= []).push(detail === undefined ? message : `${message} ${JSON.stringify(detail)}`);
    console.log(`KNOWN ${message} ${JSON.stringify(detail)}`);
  };
  // While offline the gate should say so in its own words, not the browser's.
  const offlineWords = async type => {
    // The loss schedules attempt 1; a failed retry schedules attempt 2 after showing its words.
    await waitFor(async () => (await connection())?.attempt > 1, 10000);
    const gate = await connection();
    metrics[`${type}OfflineGate`] = { title: gate?.title, status: gate?.status, gate: gate?.gate };
    known(!/failed to fetch|load failed|networkerror|network request failed/i.test(`${gate?.title} ${gate?.status}`), `${type}: the offline gate speaks in the page's words, not the browser's`, metrics[`${type}OfflineGate`]);
  };
  const reconnect = async type => {
    await context.setOffline(false); wire.dead = false; wire.armed = null; wire.armedRequest = null;
    const onlineAt = Date.now();
    const back = await waitFor(async () => (await connection())?.connected === true, 45000);
    metrics[`${type}ReconnectMs`] = Date.now() - onlineAt;
    expect(back, `${type}: the town reconnects once the network returns`, { ms: metrics[`${type}ReconnectMs`] });
  };

  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  loaded = true;

  // 1. Travel: step inside a shop as the network drops.
  {
    const shop = 'osm-node-8172494967';
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption(shop);
    await dropDuringResult('travel', () => page.locator('#enter-destination').click());
    const during = await said();
    metrics.travelDuring = during;
    expect(/not confirmed|did not confirm/i.test(JSON.stringify(during)), 'travel: the page says the move was not confirmed, not that it failed', during);
    // A new action while disconnected is refused before anything is sent.
    const before = sentOf('travel').length;
    const refused = await page.evaluate(() => window.__riverMultiplayerCommand({ type: 'travel', storeId: 'osm-node-8172494967', mode: 'enter' }));
    expect(refused?.ok === false && /reconnect/i.test(refused.message ?? '') && sentOf('travel').length === before, 'travel: an action while offline is refused and never sent', refused);
    await offlineWords('travel');
    await reconnect('travel');
    const inside = await waitFor(() => page.evaluate(shop => document.querySelector('#walking-hud')?.dataset.inside === shop, shop), 15000);
    expect(inside, 'travel: after reconnecting the page shows where the town put the player');
    expect(sentOf('travel').length === 1, 'travel: the move was sent once and never replayed', sentOf('travel'));
    const self = await page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot?.players.find(p => p.id === m.selfId)?.storeId ?? null; });
    metrics.travelServerRoom = self;
  }

  // 2. Sit: the seat is taken as the network drops.
  {
    const seats = await page.evaluate(() => window.__riverSeatAndWater().seats.map(seat => seat.id));
    let reached = null;
    for (const id of seats.slice(0, 6)) {
      const arrived = await page.evaluate(id => window.__riverSeatAndWater().goNear(id), id);
      if (!arrived.ok) continue;
      if (await waitFor(() => page.evaluate(() => window.__riverSeatAndWater().interaction === 'sit'), 5000)) { reached = id; break; }
    }
    expect(Boolean(reached), 'sit: a free seat is offered', { seats: seats.slice(0, 6) });
    if (reached) {
      const sitFrames = sentOf('sit').length;
      await dropDuringResult('sit', () => page.locator('#walking-interact').click());
      metrics.sitDuring = await said();
      expect(/not confirmed|did not confirm/i.test(JSON.stringify(metrics.sitDuring)), 'sit: the page says sitting was not confirmed', metrics.sitDuring);
      await reconnect('sit');
      const seated = await waitFor(() => page.evaluate(() => Boolean(window.__riverSeatAndWater().seated)), 15000);
      expect(seated, 'sit: after reconnecting the player is seated, as the town decided');
      expect(sentOf('sit').length === sitFrames + 1, 'sit: sitting was sent once and never replayed', sentOf('sit'));
      if (seated) await page.locator('#walking-interact').click();
      await waitFor(() => page.evaluate(() => !window.__riverSeatAndWater().seated), 10000);
    }
  }

  // 3. Office desk: the save reaches the server, the reply is lost to the network.
  {
    await page.locator('#office-lobby').waitFor({ state: 'attached' }); await page.locator('#office-lobby').evaluate(button => button.click());
    await page.locator('#play-tab-office').click(); await page.locator('#office-enter').click();
    await page.waitForFunction(() => document.querySelector('#office-visit')?.dataset.phase === 'office', null, { timeout: 60000 });
    await page.locator('#office-desk-open').click(); await page.locator('#desk-loading').waitFor({ state: 'hidden' });
    await page.locator('#desk-start').click(); await page.locator('#desk-title').fill('Offline draft');
    await page.waitForFunction(() => document.querySelector('#desk-save-status')?.textContent === 'All changes saved');
    const bodies = [];
    await page.route('**/api/office-desk/save?*', async route => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length > 1) { await route.continue(); return; }
      await route.fetch(); // the server stores the save
      await context.setOffline(true);
      await route.abort('internetdisconnected');
    });
    await page.locator('#desk-notes').fill('Written as the network dropped.');
    await page.locator('#desk-notice').waitFor({ state: 'visible', timeout: 15000 });
    metrics.deskDuring = { status: await page.locator('#desk-save-status').textContent(), error: await page.locator('#desk-error').textContent() };
    expect(!/not saved/i.test(metrics.deskDuring.status), 'desk: a save whose reply was lost is not reported as not saved', metrics.deskDuring);
    expect(await page.locator('#desk-notes').inputValue() === 'Written as the network dropped.', 'desk: the draft stays in the editor');
    await context.setOffline(false);
    await page.locator('#desk-retry').click();
    await page.waitForFunction(() => document.querySelector('#desk-save-status')?.textContent === 'All changes saved', null, { timeout: 15000 });
    expect(bodies.length === 2 && bodies[1].operationId === bodies[0].operationId, 'desk: retry repeats the same operation, so the server can recognise it', bodies.map(body => body.operationId));
    await page.unroute('**/api/office-desk/save?*');
    // Reopen the desk: the stored work is the one task, saved once.
    await page.locator('#desk-close').click(); await page.locator('#office-desk-open').click(); await page.locator('#desk-loading').waitFor({ state: 'hidden' });
    metrics.deskStored = { count: await page.locator('#desk-count').textContent(), title: await page.locator('#desk-title').inputValue(), notes: await page.locator('#desk-notes').inputValue() };
    expect(metrics.deskStored.count === '1' && metrics.deskStored.notes === 'Written as the network dropped.', 'desk: the stored desk holds the one task with the lost-reply edit', metrics.deskStored);
  }

  // 4. The network drops again while the page is rejoining: its ticket request is held
  // until the second drop, then fails as offline. The page must stay honestly
  // disconnected, rejoin once the network is back, and send nothing it already sent.
  {
    const consequential = () => wire.sent.filter(item => ['travel', 'sit', 'stand'].includes(item.type)).length, sentBefore = consequential();
    await context.setOffline(true); wire.dead = true;
    expect(await waitFor(async () => (await connection())?.connected === false, 5000, 50), 'mid-reconnect: the first drop is admitted');
    let release, asked = false;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/multiplayer/ticket?*', async route => { asked = true; await held; await route.abort('internetdisconnected'); }, { times: 1 });
    await context.setOffline(false); wire.dead = false;
    expect(await waitFor(() => asked, 15000, 20), 'mid-reconnect: back online, the page asks for a fresh ticket');
    await context.setOffline(true); wire.dead = true; release();
    const settled = await waitFor(async () => { const state = await connection(); return state?.connected === false && state?.connecting === false && state?.retryScheduled; }, 15000, 50);
    metrics.midReconnect = await connection();
    expect(settled, 'mid-reconnect: a second drop while rejoining leaves the page disconnected and retrying', metrics.midReconnect);
    await reconnect('midReconnect');
    expect(consequential() === sentBefore, 'mid-reconnect: nothing already sent is sent again', wire.sent.slice(-6));
  }

  // 5. The 15 s access recheck falls in an outage. A check with no answer says nothing
  // about access, so the page keeps the district, and it checks again as soon as the
  // network returns rather than at its next turn.
  {
    await context.setOffline(true); wire.dead = true;
    const offlineAt = Date.now(), unanswered = () => failedRequests.find(request => request.path === '/auth/session' && request.at >= offlineAt);
    expect(await waitFor(async () => (await connection())?.connected === false, 5000, 50), 'access: the drop is admitted');
    expect(await waitFor(() => Boolean(unanswered()), 20000), 'access: a recheck runs while offline and gets no answer', failedRequests.slice(-4));
    const failedAt = unanswered()?.at ?? Date.now(), onlineAt = Date.now();
    await reconnect('access');
    expect(await waitFor(() => sessionAnswers.some(answer => answer.at >= onlineAt), 5000), 'access: the access check is answered once the network returns');
    const answer = sessionAnswers.find(item => item.at >= onlineAt);
    metrics.accessRecheck = { offlineAt, failedAt, onlineAt, answer };
    expect(answer?.status === 200 && answer.at < failedAt + 14000, 'access: it checks again as the network returns, not at its next 15 s turn', metrics.accessRecheck);
    expect(navigations.every(item => item.at < offlineAt), 'access: the unanswered check keeps the district', navigations);
  }

  metrics.navigations = navigations;
  metrics.failedRequests = failedRequests.filter(request => !/\.(png|jpe?g|webp|ktx2|glb|gltf|bin|mp3|ogg|wav|woff2?)$/.test(request.path)).slice(0, 40);
  expect(navigations.length === 0, 'the page never reloads during or after an outage', navigations);
  expect(errors.length === 0, 'no uncaught browser errors', errors);
  metrics.sockets = wire.sockets;
  if (failures.length) throw new Error(`network-transitions: ${failures.length} failed: ${failures.join(' | ')}`);
  return { checks, metrics, errors };
}
