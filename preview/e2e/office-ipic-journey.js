async (owner, resident) => {
  // #359 integrated journey (#368), fixture-backed: Jevica's owner account (A, with a separate
  // explicit IPIC host grant) and an approved resident (B, bob) on one loopback town with the
  // penthouse layout. B is denied, requests and is accepted; both arrive (A skips the film, B
  // with reduced motion); A writes a three-line scene idea in My tasks that B cannot read through
  // the UI, the public snapshot or a direct request; two real clients race for one chair; both
  // use the floors, library and terrace; then they meet at IPIC, A starts the 30 s fixture, B
  // joins late, and both return to the street with nothing left behind. Graybox and fixture
  // media: not the approved art or short, and software rendering, not visual or device proof.
  const { openHudSpace } = await import('./hud-navigation.js');
  const LAYOUT = 'office-penthouse-1', OFFICE = 'jevica-office', IPIC = 'osm-node-8172494964';
  const SCENE = { title: 'Scene idea', notes: 'Two friends step out onto the terrace.\nThe city lights come on below them.\nThey decide to catch a film at IPIC.' };
  const checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  for (const page of [owner, resident]) page.on('pageerror', error => errors.push(error.message));
  const visit = page => page.evaluate(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office ?? null; });
  const peerVisit = (page, id) => page.evaluate(peer => window.__riverMultiplayer().snapshot.players.find(p => p.id === peer)?.office ?? null, id);
  const selfId = page => page.evaluate(() => window.__riverMultiplayer().selfId);
  const command = (page, message) => page.evaluate(m => window.__riverMultiplayerCommand(m), message);
  const inOffice = page => page.waitForFunction(() => document.querySelector('#office-visit')?.open && document.querySelector('#office-visit').dataset.phase === 'office', null, { timeout: 90000 });

  // Setup, not a journey assertion: the district data has a 20 s fetch deadline, which a loaded
  // machine can miss. The page's own Reload world data is used once, and every use is recorded.
  const reloads = [];
  async function load(page, name) {
    await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    for (let attempt = 0; ; attempt++) {
      const state = await page.waitForFunction(() => {
        if (document.querySelector('#loading')?.classList.contains('error')) return 'error';
        return window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
          && document.querySelectorAll('#destination option').length > 1 && 'ready';
      }, null, { timeout: 300000 }).then(handle => handle.jsonValue()); // a loaded machine can take minutes
      if (state === 'ready') return;
      const detail = await page.locator('#loading').textContent();
      if (attempt > 0) throw new Error(`${name}: the district failed to load twice: ${detail}`);
      reloads.push({ page: name, detail: detail.trim().slice(0, 160) });
      await page.locator('#reload').evaluate(button => button.click());
    }
  }
  // Steer by pointer drag (0.004 rad a pixel) and walk with W, as office-penthouse.js does.
  const walkers = new Map();
  async function walkTo(page, target, label) {
    const dialog = page.locator('#office-visit'), box = await dialog.boundingBox();
    const state = walkers.get(page) ?? { heading: (await visit(page)).yaw }; walkers.set(page, state);
    const position = () => dialog.evaluate(d => JSON.parse(d.dataset.position));
    const drag = async px => { const x = box.x + box.width / 2, y = box.y + box.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + px, y, { steps: 4 }); await page.mouse.up(); };
    let at = await position();
    for (let step = 0; step < 60; step++) {
      const want = Math.atan2(target[0] - at[0], target[1] - at[1]);
      if (Math.abs(want - state.heading) > 0.03) { await drag((want - state.heading) / 0.004); state.heading = want; }
      if (Math.hypot(target[0] - at[0], target[1] - at[1]) < 0.6) break;
      await dialog.focus(); await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(400, Math.max(60, Math.hypot(target[0] - at[0], target[1] - at[1]) * 300)));
      await page.keyboard.up('KeyW'); await page.waitForTimeout(150);
      const next = await position();
      if (Math.hypot(next[0] - at[0], next[1] - at[1]) > 0.05) state.heading = Math.atan2(next[0] - at[0], next[1] - at[1]);
      at = next;
    }
    await page.waitForTimeout(450); // the last move reaches the server
    const server = await visit(page);
    check(Math.hypot(target[0] - server.position[0], target[1] - server.position[1]) < 1.2, `${label}: ${JSON.stringify(server.position)}`);
  }

  await load(owner, 'owner'); await load(resident, 'resident');
  const ownerId = await selfId(owner), residentId = await selfId(resident);
  await resident.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Permission: B is refused and asks; A accepts from the Offices panel in the play dock.
  await resident.locator('#office-lobby').evaluate(button => button.click());
  await resident.locator('#office-nearby').waitFor({ state: 'visible' });
  await resident.locator('#canvas-host').focus(); await resident.keyboard.press('KeyF');
  await resident.locator('#office-request-dialog[open]').waitFor();
  check(await resident.locator('#office-enter').isDisabled(), 'the resident cannot board Jevica\'s office without access');
  const refused = await command(resident, { type: 'office', action: 'enter', officeId: OFFICE });
  check(refused.error === 'office_permission_required', `a direct entry command is refused: ${JSON.stringify(refused)}`);
  await resident.locator('#office-request-send').click();
  await owner.locator('#office-lobby').evaluate(button => button.click());
  if (!await owner.locator('.visit-tools').evaluate(dock => dock.open)) await owner.locator('.visit-tools-toggle').click();
  const accept = owner.locator('#office-management button').filter({ hasText: 'Accept' });
  await accept.waitFor({ timeout: 20000 }); await accept.click();
  await resident.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false, null, { timeout: 20000 });
  check(true, 'Jevica accepted the resident\'s request through the normal controls');

  // 2. Arrival: A rides and skips the film; B arrives with reduced motion.
  await resident.locator('#office-request-dialog').evaluate(dialog => dialog.open && dialog.close());
  await resident.locator('#office-enter').click();
  await owner.locator('#canvas-host').focus(); await owner.keyboard.press('KeyF');
  await owner.locator('#office-visit[open]').waitFor();
  await owner.locator('#office-skip').click().catch(() => {});
  await Promise.all([inOffice(owner), inOffice(resident)]);
  const [a0, b0] = [await visit(owner), await visit(resident)];
  check(a0.layout === LAYOUT && b0.layout === LAYOUT && a0.levelId === 'jevica-office/l0' && b0.levelId === 'jevica-office/l0', 'both arrived on the penthouse main floor');

  // 3. Private work: A saves a three-line scene idea; B's desk, snapshot and direct requests never show it.
  await owner.locator('#office-desk-open').click(); await owner.locator('#desk-loading').waitFor({ state: 'hidden' });
  check(await owner.locator('#desk-scope-label').textContent() === 'Private to you' || !await owner.locator('#desk-scope-shared').isVisible(), 'Jevica\'s office desk is My tasks, private to the account');
  await owner.locator('#desk-scene').click();
  check(await owner.locator('#desk-title').inputValue() === SCENE.title && /Three lines/.test(await owner.locator('#desk-notes').getAttribute('placeholder')),
    'the optional prompt starts a private Scene idea with a three-line hint');
  await owner.locator('#desk-notes').fill(SCENE.notes);
  await owner.waitForFunction(() => document.querySelector('#desk-save-status')?.textContent === 'All changes saved');
  check(true, 'Jevica wrote and saved a three-line scene idea in My tasks');
  await owner.locator('#desk-close').click();
  await resident.locator('#office-desk-open').click(); await resident.locator('#desk-loading').waitFor({ state: 'hidden' });
  check(await resident.locator('#desk-start').isVisible() && !(await resident.locator('#office-desk').evaluate(desk => [...desk.querySelectorAll('textarea')].some(field => field.value.includes('city lights')))), 'the resident\'s own desk opens empty');
  await resident.locator('#desk-close').click();
  for (const page of [owner, resident]) {
    const snapshot = await page.evaluate(() => JSON.stringify(window.__riverMultiplayer().snapshot));
    check(!snapshot.includes('terrace at dusk') && !snapshot.includes('city lights'), 'the scene idea is not in any public snapshot');
  }
  const probe = await resident.evaluate(async owner => {
    const session = await (await fetch('/auth/session', { credentials: 'same-origin' })).json();
    const post = body => fetch('/api/office-desk/read?world=river-oaks', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, text: await r.text() }));
    return { own: await post({}), forged: await post({ userId: owner }) };
  }, ownerId);
  check(probe.forged.status === 400 && !probe.own.text.includes('terrace at dusk'), `a direct desk read cannot name another account and returns only the resident's own desk: ${JSON.stringify({ forged: probe.forged.status, own: probe.own.status })}`);

  // 4. Chairs: both stand clear of creative desk 01's seated envelope; their claims race on two real sockets.
  const chair = { id: 'desk-a1-chair', position: [3.65, 5.6], stand: [3.65, 3.55] };
  await walkTo(owner, [chair.stand[0] + 1, chair.stand[1] - 0.5], 'Jevica beside creative desk 01');
  await walkTo(resident, [chair.stand[0] - 1, chair.stand[1] - 0.5], 'the resident beside creative desk 01');
  const claim = { type: 'office', action: 'sit', officeId: OFFICE, seatId: chair.id, layout: LAYOUT };
  const claims = await Promise.all([command(owner, claim), command(resident, claim)]);
  check(claims.filter(result => result.ok).length === 1 && claims.some(result => result.error === 'office_seat_occupied'), `one winner for one chair: ${JSON.stringify(claims.map(result => result.ok || result.error))}`);
  const [winner, loser] = claims[0].ok ? [owner, resident] : [resident, owner], winnerId = claims[0].ok ? ownerId : residentId;
  await loser.waitForFunction(([peer, seat]) => window.__riverMultiplayer().snapshot.players.find(p => p.id === peer)?.office?.seat?.id === seat, [winnerId, chair.id]);
  check(true, 'the other client sees the winner seated on that chair');
  const blocked = await command(loser, { type: 'office', action: 'move', officeId: OFFICE, position: chair.stand, yaw: 0, layout: LAYOUT });
  check(blocked.error === 'office_blocked', `nobody walks into an occupied seat's envelope: ${JSON.stringify(blocked)}`);
  await winner.locator('#office-visit').focus(); await winner.keyboard.press('KeyZ');
  await winner.waitForFunction(() => { const m = window.__riverMultiplayer(); const o = m.snapshot.players.find(p => p.id === m.selfId)?.office; return o && !o.seat; });
  check(true, 'the winner stood up with Z');
  walkers.delete(winner); // sitting turned the view to the desk

  // 5. Floors: A takes the stairs to the library and sits in a reading chair; B goes out to the terrace.
  await walkTo(owner, [9.5, 3.2], 'Jevica past the creative desks');
  await walkTo(owner, [11.8, 4.5], 'Jevica at the stair foot');
  await owner.waitForFunction(() => !document.querySelector('#office-level')?.hidden); await owner.locator('#office-level').click();
  await owner.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office?.levelId === 'jevica-office/l1'; });
  await walkTo(owner, [-4.5, 15.3], 'Jevica along the gallery');
  await walkTo(owner, [-4.5, 16.45], 'Jevica at reading chair b');
  await owner.waitForFunction(() => !document.querySelector('#office-seat')?.hidden);
  await owner.locator('#office-visit').focus(); await owner.keyboard.press('KeyZ');
  await owner.waitForFunction(() => { const m = window.__riverMultiplayer(); return m.snapshot.players.find(p => p.id === m.selfId)?.office?.seat?.id === 'reading-chair-b'; });
  await walkTo(resident, [-14, 5], 'the resident at the south terrace opening');
  await walkTo(resident, [-18, 8], 'the resident on the terrace');
  const [upstairs, terrace] = [await peerVisit(resident, ownerId), await visit(resident)];
  check(upstairs.levelId === 'jevica-office/l1' && upstairs.elevation === 3.8 && upstairs.seat?.id === 'reading-chair-b' && terrace.levelId === 'jevica-office/l0',
    'the resident on the terrace sees Jevica seated in the library on the mezzanine');
  await owner.screenshot({ path: 'output/playwright/office-ipic-library.png' }); await resident.screenshot({ path: 'output/playwright/office-ipic-terrace.png' });

  // 6. Both return to the street; leaving releases the reading chair.
  await Promise.all([owner, resident].map(async page => { await page.locator('#office-exit').click(); await page.waitForFunction(() => !document.querySelector('#office-visit').open); }));
  check(!(await visit(owner)) && !(await visit(resident)), 'both left the office; the seat went with the visit');

  // 7. IPIC: A starts the fixture as host; B arrives late and converges.
  async function enterIpic(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside === id, IPIC);
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
    await page.waitForFunction(() => window.__riverScreening?.()?.active === true);
  }
  await enterIpic(owner);
  await owner.waitForFunction(() => !document.querySelector('#ipic-screening [data-control="host-start"]')?.hidden);
  await owner.locator('#ipic-screening [data-control="host-start"]').click();
  await owner.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > 0.3, null, { timeout: 30000 });
  await owner.waitForTimeout(2000);
  await enterIpic(resident);
  await resident.waitForFunction(() => window.__riverScreening().state === 'playing', null, { timeout: 30000 });
  const joined = Date.now(), late = await resident.evaluate(() => window.__riverScreening());
  check(late.currentTime > 1.5 && !late.canHost, `the resident joined the running film without host controls (${late.currentTime.toFixed(2)} s)`);
  const sample = async () => { const [x, y] = await Promise.all([owner, resident].map(page => page.evaluate(() => ({ at: performance.timeOrigin + performance.now(), ...window.__riverScreening() })))); const project = s => s.currentTime * 1000 + (s.paused ? 0 : Date.now() - s.at); return Math.abs(project(x) - project(y)); };
  let converged = null;
  while (Date.now() - joined < 5000 && converged === null) { if (await sample() < 500) converged = Date.now() - joined; else await resident.waitForTimeout(250); }
  check(converged !== null, `the two viewers came within 500 ms in ${converged} ms`);
  await owner.screenshot({ path: 'output/playwright/office-ipic-screening.png' });

  // 8. Both return to the street; no film, no office visit, nothing left playing.
  for (const page of [resident, owner]) {
    await openHudSpace(page, 'explore-section');
    const other = await page.evaluate(() => [...document.querySelectorAll('#destination option')].map(o => o.textContent).find(label => label && label !== 'IPIC Theaters'));
    await page.locator('#destination').selectOption({ label: other }); await page.locator('#enter-destination').click();
    await page.waitForFunction(id => { const at = document.querySelector('#walking-hud')?.dataset.inside; return at !== undefined && at !== id; }, IPIC);
    await page.waitForFunction(() => window.__riverScreening()?.active === false && !document.querySelector('#ipic-screening video') && [...document.querySelectorAll('video')].every(v => v.paused));
  }
  check(!(await visit(owner)) && !(await visit(resident)), 'both are back in town with no office visit and no film playing');
  check(!errors.length, `no page errors: ${errors.join('; ')}`);
  return { checks, errors, reloads, convergedAfterMs: converged, lateJoinS: late.currentTime, rendering: 'Software fixture; penthouse graybox and the 30 s synthetic screening fixture, not final art or the approved short' };
}
