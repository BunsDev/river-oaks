async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
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
  const atDoor = await hud();
  check(/Step outside/.test(atDoor.exit ?? ''), `Step outside is offered in reception: ${JSON.stringify(atDoor)}`);
  // Between the rows, beside recliners 0-1 and 1-1 (the T3 seat), as the screening journeys stand.
  for (const p of [[-1.4,4.8],[-1.4,20.7],[-5.55,20.7],[-5.55,24.7],[-4.85,24.7],[-4.85,29],[-4.85,29.65],[-1.6,29.65]]) await walk(...p);
  const top = await pose(); check(Math.abs(top.ground - plan.floor - 6) < .01, 'Shared player reached the upstairs auditorium');
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
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
  const phoneReach = await standReach();
  check(phoneReach.visible && phoneReach.onScreen && phoneReach.topmost && phoneReach.panel && phoneReach.overlap === 0, `Seated on a 390 px phone, Stand up is reachable and clear of the film panel: ${JSON.stringify(phoneReach)}`);
  checks.push('seated: Stand up is visible, topmost and clear of the film panel at 1280 and 390 px');
  // A phone has no Z: tap Stand up. Z standing is covered by the office and plaza journeys.
  await page.locator('#walking-interact').click();
  await page.waitForFunction(() => !window.__riverCarriage().pose.sitting);
  await page.setViewportSize(desktopViewport); await page.waitForTimeout(400);
  check(await page.evaluate(() => window.__riverCarriage().camera.view) === 'third-person', 'Standing restores the walking camera');
  // The HUD repaints on its next pass (every 150 ms); a slow software frame is allowed 10 s.
  await page.waitForFunction(() => !document.body.classList.contains('theater-seated'), null, { timeout: 10000 }).catch(() => {});
  const stoodHud = await hud();
  check(!stoodHud.theater && stoodHud.dock && stoodHud.chat, `Standing brings the HUD back: ${JSON.stringify(stoodHud)}`);
  checks.push('stood with a tap on Stand up at 390 px; the walking camera returned');
  // Arms and back box each cushion in, so leave forward past its footrest; the front row then
  // goes round by the left aisle, since the gaps between its seats are narrower than a body.
  const [row, column] = recliner.slice(-3).split('-').map(Number), a = [-2.6, -.6, 1.4, 3.4][column], d = [28, 31][row];
  for (const p of [[a, d + .9], ...(row ? [[-4.85, d + .9]] : []), [-4.85, 29.65]]) await walk(...p);
  for (const p of [[-4.85,29.65],[-4.85,24.7],[-5.55,24.7],[-5.55,20.7],[-1.4,20.7],[-1.4,4.8],[0,1],[0,-1.8]]) await walk(...p);
  check(!(await pose()).roomId, 'Walked back onto the street');
  checks.push('walked downstairs and exited onto street');
  check(!errors.length, errors.join('; '));
  return { checks, errors, upperGround: top.ground, recliner, rendering: 'Software fixture; material review is the separate IPIC model review' };
}
