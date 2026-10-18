async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const { ipicFloor } = await import('../src/ipic-plan.js');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'osm-node-8172494964');
  await page.locator('#panel-toggle').click();
  const plan = await page.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const world = await fetch('/data/district.json').then(r => r.json());
    const r = storeRoomsFor(world).find(r => r.interior);
    return { facade: r.facade, right: r.right, inward: r.inward, floor: r.floor };
  });
  const pose = () => page.evaluate(() => window.__riverCarriage().pose);
  async function walk(a, d) {
    const target = [plan.facade[0] + plan.right[0] * a + plan.inward[0] * d, plan.facade[1] + plan.right[1] * a + plan.inward[1] * d];
    await page.locator('#canvas-host').focus();
    let distance = Infinity;
    const deadline = Date.now() + 90000;
    while (distance > .16 && Date.now() < deadline) {
      const p = await pose(); distance = Math.hypot(p.position[0] - target[0], -p.position[2] - target[1]);
      if (distance <= .16) break;
      await page.evaluate(([x,n]) => window.__riverSeatAndWater().face(x,n), target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(120, Math.max(20, distance * 100)));
      await page.keyboard.up('KeyW');
    }
    await page.keyboard.up('KeyW');
    check(distance <= .16, `Walking could not reach ${a}, ${d}: ${JSON.stringify(await pose())}`);
  }
  // Step outside is offered by the street door, not from deep inside the venue (Val, 2026-10-15).
  const hud = () => page.evaluate(() => { const shown = selector => { const el = document.querySelector(selector); return Boolean(el) && !el.hidden && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0; };
    return { theater: document.body.classList.contains('theater-seated'), exit: shown('#walking-enter') ? document.querySelector('#walking-enter').textContent : null, dock: shown('.visit-tools'), chat: shown('.town-chat-dock'), stand: shown('#walking-interact') ? document.querySelector('#walking-interact').textContent : null, inside: document.querySelector('#walking-hud')?.dataset.inside ?? '' }; });
  // A first visit opens the store intro, which hides the HUD for up to 6 s (2.2 s with reduced motion), and it can open
  // after the arrival; skip it as a visitor would, then read the door's prompt.
  await page.waitForFunction(() => { document.querySelector('dialog.store-intro[open] button')?.click(); const enter = document.querySelector('#walking-enter');
    return !document.body.classList.contains('store-introducing') && enter && !enter.hidden; }, null, { timeout: 15000 }).catch(() => {});
  const atDoor = await hud();
  check(/Step outside/.test(atDoor.exit ?? ''), `Step outside is offered in reception: ${JSON.stringify(atDoor)}`);
  // Between the rows, beside recliners 0-1 and 1-1 (the T3 seat), as the screening journeys stand.
  for (const p of [[-1.4,4.8],[-1.4,20.7],[-1.4,24.5],[-4.85,24.5],[-4.85,29],[-4.85,29.65],[-1.6,29.65]]) await walk(...p);
  // The walk ends on the back row's riser (P15), 0.4 m over the front row's floor.
  const top = await pose(); check(Math.abs(top.ground - plan.floor - ipicFloor(29.65)) < .01, `Shared player reached the back row's riser in the upstairs auditorium: ${top.ground - plan.floor}`);
  const deep = await hud();
  check(deep.exit === null && deep.inside, `No Step outside in the auditorium: ${JSON.stringify(deep)}`);
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF'); await page.waitForTimeout(1500);
  check((await hud()).inside === deep.inside, 'F does not step outside from the auditorium');
  checks.push('Step outside shows by the door; in the auditorium neither the prompt nor F leaves');
  checks.push('walked from reception up both escalator runs into auditorium');
  // Townspeople visiting IPIC rest in its seats too (#364), so take the first recliner the server grants,
  // starting with front-row 1-1, where the seat back hid the screen in the T3 review.
  const ORDER = ['1-1', '1-0', '0-1', '0-0'];
  // A seat the page already shows as held is disabled; only enabled ones can be chosen.
  const recliners = (await page.locator('#nearby-seat option').evaluateAll(options => options.filter(option => !option.disabled).map(option => option.value)))
    .filter(value => ORDER.some(key => value === `bench:ipic-recliner-${key}:0`)).sort((a, b) => ORDER.indexOf(a.slice(20, 23)) - ORDER.indexOf(b.slice(20, 23)));
  let recliner = null;
  for (const value of recliners) {
    await page.locator('#nearby-seat').selectOption(value); await page.locator('#seat-sit').click();
    const buildId = value.replace(/:\d+$/, '');
    if (await page.waitForFunction(id => window.__riverCarriage().pose.sitting?.buildId === id, buildId, { timeout: 10000 }).then(() => true, () => false)) { recliner = buildId; break; }
  }
  check(recliner, `No recliner was free among ${recliners.join(', ')}`);
  check(await page.evaluate(id => { const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId).sitting?.buildId === id; }, recliner), 'Server confirmed the chosen recliner');
  await page.screenshot({ path: 'output/playwright/ipic/production-seated.png' });
  checks.push('selected recliner through UI and received authoritative seated pose');
  // A recliner's back rises above the seated eye, so a camera behind it saw only leather (#368).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('river-oaks:debug', { detail: { open: false } })));
  await page.waitForFunction(() => window.__riverDebug?.());
  const seatedView = await page.evaluate(() => { const c = window.__riverCarriage(); return { view: c.camera.view, offset: Math.hypot(...c.camera.position.map((v, i) => v - c.pose.position[i])), centre: window.__riverDebug().pickAt(innerWidth / 2, innerHeight / 2)?.materials ?? null }; });
  check(seatedView.view === 'eye' && seatedView.offset < .01 && seatedView.centre?.includes('ipic-cinema-screen'), `Seated viewer sees the screen from the seated eye: ${JSON.stringify(seatedView)}`);
  checks.push('seated viewer faces the screen from the seated eye');
  // Seated in a recliner, the HUD steps back for the film: dock and chat aside, Stand up kept.
  await page.waitForFunction(() => document.body.classList.contains('theater-seated'));
  const seatedHud = await hud();
  check(seatedHud.theater && !seatedHud.dock && !seatedHud.chat && /Stand up/.test(seatedHud.stand ?? ''), `Seated theater mode: ${JSON.stringify(seatedHud)}`);
  checks.push('seated: the dock and town chat step aside, Stand up stays');
  // Stand up must be visible, topmost at its centre and clear of the film panel, on desktop and on a
  // phone, where the open town chat hides the walking card unless seated mode brings it back.
  const standReach = () => page.evaluate(() => {
    const stand = document.querySelector('#walking-interact'), card = document.querySelector('#walking-hud .walking-console'), panel = document.querySelector('#ipic-screening');
    const r = stand.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const a = panel && !panel.hidden ? panel.getBoundingClientRect() : null, b = card.getBoundingClientRect();
    const overlap = a ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * (Math.min(a.right, b.right) > Math.max(a.left, b.left) ? 1 : 0) : 0;
    return { visible: getComputedStyle(stand).visibility === 'visible' && r.height > 0, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      topmost: Boolean(top) && (top === stand || stand.contains(top)), coveredBy: top && top !== stand && !stand.contains(top) ? top.closest('[id]')?.id ?? null : null, panel: Boolean(a), overlap: Math.round(overlap), viewport: [innerWidth, innerHeight] };
  });
  // Start the film from the seat (the runner grants this resident IPIC hosting), so its panel is up.
  await page.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  await page.locator('#ipic-screening [data-control="host-start"]').click();
  await page.waitForFunction(() => window.__riverScreening?.()?.state === 'playing');
  await page.waitForTimeout(600);
  const desktopReach = await standReach();
  check(desktopReach.visible && desktopReach.onScreen && desktopReach.topmost && desktopReach.panel && desktopReach.overlap === 0, `Seated, Stand up is reachable and clear of the film panel: ${JSON.stringify(desktopReach)}`);
  // Screen-focused viewing (#500): a local camera that frames the whole film from this row. The seat, the
  // avatar and the way out stay as they were; looking around (the button, a drag) or standing ends it.
  const seatOf = () => page.evaluate(() => { const m = window.__riverMultiplayer(); return JSON.stringify(m.snapshot.players.find(p => p.id === m.selfId).sitting); });
  const seatBefore = await seatOf(), eyeBefore = (await pose()).position;
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Focus frames the film's own rectangle once a frame of it is on the screen (the software profile binds it at
  // its next once-a-second draw); before that it frames the whole screen.
  await page.waitForFunction(() => window.__riverScreening().attached, null, { timeout: 30000 });
  await page.locator('#ipic-screening [data-control="focus"]').click();
  if (reduced) check(await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(window.__riverScreening().focus.blend))))) === 1, 'reduced motion: focus is immediate');
  await page.waitForFunction(() => { const f = window.__riverScreening().focus; return f.on && f.blend === 1 && f.ndc && f.film; }, null, { timeout: 20000 });
  const framed = await page.evaluate(() => {
    const s = window.__riverScreening(), f = s.focus, toPx = ([x, y]) => [(x + 1) / 2 * innerWidth, (1 - y) / 2 * innerHeight];
    // The film's centre and points just inside its four corners: each must meet the screen, nothing in front.
    const c = [0, 1].map(i => f.ndc.reduce((sum, p) => sum + p[i], 0) / f.ndc.length), points = [c, ...f.ndc.map(p => p.map((v, i) => c[i] + (v - c[i]) * 0.92))];
    const hits = points.map(p => window.__riverDebug().pickAt(...toPx(p))?.materials ?? null);
    const button = document.querySelector('#ipic-screening [data-control="focus"]');
    return { fits: f.fits, fov: f.fov, wanted: f.wanted, distance: f.distance, film: f.film, aspect: f.aspect, eye: f.eye, bound: s.screen?.fit?.repeat ?? null, state: s.state,
      inView: f.ndc.every(([x, y]) => Math.abs(x) <= 1 && Math.abs(y) <= 1), hits,
      // The panel stays on screen: the film's lowest corner must sit above its top edge (in device coordinates).
      filmBottom: Math.min(...f.ndc.map(([, y]) => y)), panelTop: 1 - 2 * document.querySelector('#ipic-screening').getBoundingClientRect().top / innerHeight, band: f.band, row: f.row, camera: window.__riverCarriage().camera.position, position: f.position, label: button.textContent, pressed: button.getAttribute('aria-pressed') };
  });
  check(framed.fits && framed.inView && framed.hits.every(list => list?.includes('ipic-cinema-screen')) && framed.label === 'Look around' && framed.pressed === 'true', `focus frames the whole film, unobstructed: ${JSON.stringify(framed)}`);
  check(framed.filmBottom > framed.panelTop, `the panel leaves the whole focused film in view: ${JSON.stringify(framed)}`);
  check(framed.camera.every((v, i) => Math.abs(v - framed.position[i]) < 0.01), `the camera is at the focus point: ${JSON.stringify([framed.camera, framed.position])}`);
  check(await seatOf() === seatBefore && (await pose()).position.every((v, i) => Math.abs(v - eyeBefore[i]) < 1e-6), 'focusing moves neither the seat nor the avatar');
  const focusReach = await standReach();
  check(focusReach.visible && focusReach.onScreen && focusReach.topmost, `focused, Stand up stays reachable: ${JSON.stringify(focusReach)}`);
  // Keys pressed on the focused button do not reach the world: no walking, no push-to-talk, still seated.
  await page.locator('#ipic-screening [data-control="focus"]').focus();
  for (const key of ['KeyW', 'KeyM', 'Space']) { await page.keyboard.down(key); await page.waitForTimeout(300); await page.keyboard.up(key); }
  check((await pose()).sitting && (await pose()).position.every((v, i) => Math.abs(v - eyeBefore[i]) < 1e-6) && await seatOf() === seatBefore, 'keys on the focused button leave the avatar seated and in place');
  // Space on a focused button clicks it (Look around): that is the button working, so focus again if it did.
  if (!(await page.evaluate(() => window.__riverScreening().focus.on))) await page.locator('#ipic-screening [data-control="focus"]').click();
  await page.waitForFunction(() => window.__riverScreening().focus.on);
  // Look around (the button, by keyboard) returns the walking camera to the seated eye.
  await page.locator('#ipic-screening [data-control="focus"]').press('Enter');
  await page.waitForFunction(() => { const f = window.__riverScreening().focus; return !f.on && f.blend === 0; }, null, { timeout: 10000 });
  const back = await page.evaluate(() => { const c = window.__riverCarriage(); return { view: c.camera.view, offset: Math.hypot(...c.camera.position.map((v, i) => v - c.pose.position[i])), focused: document.activeElement?.dataset?.control }; });
  check(back.view === 'eye' && back.offset < .01 && back.focused === 'focus', `Look around returns the seated view and keeps keyboard focus: ${JSON.stringify(back)}`);
  // A drag on the world looks around too.
  await page.locator('#ipic-screening [data-control="focus"]').click();
  await page.waitForFunction(() => window.__riverScreening().focus.on);
  await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(700, 300); await page.mouse.up();
  await page.waitForFunction(() => !window.__riverScreening().focus.on, null, { timeout: 5000 });
  checks.push(`focus framed the whole film unobstructed and above the panel at ${framed.fov.toFixed(1)}° from ${framed.distance.toFixed(2)} m (row ${framed.row.toFixed(2)} m)${reduced ? ' (reduced motion: immediate)' : ''}; seat, avatar and Stand up unchanged; keys stayed out of the world; Look around and a drag returned the seated view`);
  // Stop watching is local and reversible: the film and its decoder go, Join screening returns to the room's film.
  const room = await page.evaluate(() => window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic'));
  await page.locator('#ipic-screening [data-control="stop-watching"]').click();
  const stopped = await page.evaluate(() => ({ video: Boolean(document.querySelector('#ipic-screening video')), join: !document.querySelector('#ipic-screening [data-control="join"]')?.hidden, s: window.__riverScreening() }));
  check(!stopped.video && stopped.join && stopped.s.stopped, `Stop watching released the film and offers Join screening: ${JSON.stringify(stopped)}`);
  await page.waitForTimeout(1500);
  await page.locator('#ipic-screening [data-control="join"]').click();
  await page.waitForFunction(() => window.__riverScreening()?.state === 'playing', null, { timeout: 30000 });
  const rejoined = await page.evaluate(() => { const s = window.__riverScreening(), v = window.__riverMultiplayer().snapshot.screenings.find(item => item.venueId === 'ipic');
    return { revision: s.revision, room: v.revision, currentTime: s.currentTime, target: (v.positionMs + (s.serverNow - v.anchorServerTimeMs)) / 1000 }; });
  check(rejoined.revision === room.revision && rejoined.room === room.revision && Math.abs(rejoined.currentTime - rejoined.target) < 1.5, `Join screening returned to the room's timeline without a command: ${JSON.stringify({ rejoined, room: room.revision })}`);
  checks.push('Stop watching released the film; Join screening returned to the running film at the room’s time, sending nothing');
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
  const phoneReach = await standReach();
  check(phoneReach.visible && phoneReach.onScreen && phoneReach.topmost && phoneReach.panel && phoneReach.overlap === 0, `Seated on a 390 px phone, Stand up is reachable and clear of the film panel: ${JSON.stringify(phoneReach)}`);
  checks.push('seated: Stand up is visible, topmost and clear of the film panel at 1280 and 390 px');
  // Focused on a 390 px phone, Stand up stays reachable; standing ends focus (#500).
  await page.locator('#ipic-screening [data-control="focus"]').click();
  await page.waitForFunction(() => window.__riverScreening().focus.on);
  const phoneFocusReach = await standReach();
  check(phoneFocusReach.visible && phoneFocusReach.onScreen && phoneFocusReach.topmost, `focused at 390 px, Stand up is reachable: ${JSON.stringify(phoneFocusReach)}`);
  // A phone has no Z: tap Stand up. Z standing is covered by the office and plaza journeys.
  await page.locator('#walking-interact').click();
  await page.waitForFunction(() => !window.__riverCarriage().pose.sitting);
  await page.waitForFunction(() => !window.__riverScreening().focus.on && window.__riverScreening().focus.blend === 0, null, { timeout: 10000 });
  checks.push('focused at 390 px, Stand up was reachable; standing ended focus');
  await page.setViewportSize(desktopViewport); await page.waitForTimeout(400);
  check(await page.evaluate(() => window.__riverCarriage().camera.view) === 'third-person', 'Standing restores the walking camera');
  // The HUD repaints on its next pass (every 150 ms); a slow software frame is allowed 10 s.
  await page.waitForFunction(() => !document.body.classList.contains('theater-seated'), null, { timeout: 10000 }).catch(() => {});
  const stoodHud = await hud();
  check(!stoodHud.theater && stoodHud.dock && stoodHud.chat, `Standing brings the HUD back: ${JSON.stringify(stoodHud)}`);
  checks.push('stood with a tap on Stand up at 390 px; the walking camera returned');
  // Back, arms, base and footrest box each cushion in, so standing puts the sitter in the aisle in
  // front of the footrest (d + 1.4); the front row then goes round by the left aisle, since the gaps
  // between its seats are narrower than a body.
  const [row, column] = recliner.slice(-3).split('-').map(Number), a = [-2.6, -.6, 1.4, 3.4][column], d = [28, 31][row];
  for (const p of [[a, d + 1.4], ...(row ? [[-4.85, d + 1.4]] : []), [-4.85, 29.65]]) await walk(...p);
  for (const p of [[-4.85,29.65],[-4.85,24.5],[-1.4,24.5],[-1.4,20.7],[-1.4,4.8],[0,1],[0,-1.8]]) await walk(...p);
  check(!(await pose()).roomId, 'Walked back onto the street');
  checks.push('walked downstairs and exited onto street');
  check(!errors.length, errors.join('; '));
  return { checks, errors, upperGround: top.ground, recliner, rendering: 'Software fixture; material review is the separate IPIC model review' };
}
