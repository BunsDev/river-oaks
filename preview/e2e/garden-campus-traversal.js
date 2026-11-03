async page => {
 // The Gardens' public traversal in the browser (#508 slice b), two residents on the campus
 // revision. The resident (owner fixture, keyboard, reduced motion) rides T1's lift to Floor 4
 // and waits on the landing; a second resident (alice, phone, touch) rides up beside them,
 // never onto them, and back down, then walks the street under B12 while the first crosses
 // it overhead. The first goes on through T2's terrace, up T2's lift to its roof garden and
 // back, across B23 into T3, and down T3's stairs to the street. Every target comes from
 // #506's contract; every arrival is the server's, checked by level, height and eye height.
 const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
 const { GARDEN_CAMPUS_LAYOUT: CAMPUS, campusLevels, campusToSource } = await import('../../shared/garden-campus-layout.js');
 const { waitForCampusLift } = await import('./garden-campus-readiness.js');
 const BASE = CAMPUS.frame.baseAltitude, L = index => `garden-campus/l${index}`, levels = campusLevels();
 const portal = id => levels.flatMap(level => level.portals).find(item => item.id === id).position;
 const spurV = tower => { const [, v0, , v1] = levels[3].surfaces.find(s => s.id === `${tower}-F4-core-spur`).rect;return (v0 + v1) / 2; };
 await page.emulateMedia({ reducedMotion: 'reduce' });
 const ready = tab => tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 180000 });
 const self = tab => tab.evaluate(() => { const m = window.__riverMultiplayer();return m.snapshot?.players.find(p => p.id === m.selfId) ?? null; });
 const other = (tab, id) => tab.evaluate(id => window.__riverMultiplayer().snapshot?.players.find(p => p.id === id) ?? null, id);
 const hud = tab => tab.locator('#walking-hud').evaluate(n => ({ position: JSON.parse(n.dataset.position), eye: Number(n.dataset.eyeHeight) }));

 // Turn by dragging the view (walking-ui: yaw -= dx * 0.003; forward heads atan2(-sin yaw, cos yaw)).
 const turnTo = async (tab, heading) => {
  const me = await self(tab), box = await tab.locator('#canvas-host').boundingBox();
  let delta = Math.atan2(Math.sin(heading + me.yaw), Math.cos(heading + me.yaw));
  while (Math.abs(delta) > 0.03) {
   // Drag in the open sky above the HUD console, never further than the screen is wide (a phone is 390 px).
   const limit = box.width * 0.4, px = Math.max(-limit, Math.min(limit, delta / 0.003)), x = box.x + box.width / 2, y = box.y + box.height * 0.35;
   await tab.mouse.move(x, y);await tab.mouse.down();await tab.mouse.move(x + px, y, { steps: 6 });await tab.mouse.up();
   delta -= px * 0.003;
  }
  await tab.waitForTimeout(250);
 };
 // Walk with W (and Shift) toward campus [u, v] until within reach, re-aiming every stride.
 const walkTo = async (tab, [u, v], label, reach = 0.45) => {
  const [east, north] = campusToSource([u, v]);
  for (let stride = 0; stride < 160; stride++) {
   const { position: [x, , z] } = await hud(tab), de = east - x, dn = north + z, distance = Math.hypot(de, dn);
   if (distance < reach) return;
   await turnTo(tab, Math.atan2(de, dn));
   await tab.locator('#canvas-host').focus();
   const fast = distance > 3;if (fast) await tab.keyboard.down('ShiftLeft');
   await tab.keyboard.down('KeyW');await tab.waitForTimeout(Math.min(450, Math.max(80, distance * (fast ? 130 : 260))));await tab.keyboard.up('KeyW');
   if (fast) await tab.keyboard.up('ShiftLeft');
   await tab.waitForTimeout(120);
  }
  throw new Error(`could not walk to ${label}: ${JSON.stringify(await self(tab))}`);
 };
 // walkTo stops on the page's own pose; the checks read the server's snapshot. A hosted run compared
 // two residents before the last stride reached the server ("One resident on B12 stands over the
 // other" failed with both on the spot). A walk ends when the server holds where the page stopped.
 const settled = (tab, label) => tab.waitForFunction(() => {
  const m = window.__riverMultiplayer(), me = m.snapshot?.players.find(p => p.id === m.selfId), hud = document.querySelector('#walking-hud')?.dataset.position;
  if (!me || !hud || window.__riverCarriage().pose.speed > 0.01) return false;
  const [x, , z] = JSON.parse(hud);
  return Math.hypot(me.position[0] - x, me.position[1] + z) < 0.05;
 }, null, { timeout: 15000 }).catch(async () => { throw new Error(`${label}: the server never held the walk's end ${JSON.stringify({ page: (await hud(tab)).position, server: (await self(tab))?.position })}`); });
 const walk = async (tab, points, label) => { const started = Date.now();for (const point of points) await walkTo(tab, point, label);await settled(tab, label);console.log(`  walked ${label} in ${((Date.now() - started) / 1000).toFixed(1)} s`); };
 // A lift or stair portal through the HUD: F (or Shift+F down) on the keyboard, a tap on a phone.
 // Down uses the second prompt where a core goes both ways, the main one where it only goes down (a roof).
 const take = async (tab, { down = false, touch = false, label, to }) => {
  // Read prompts only once the HUD has repainted for the floor the server says this is (its room marker).
  const here = (await self(tab)).levelId ?? null;
  await tab.waitForFunction(level => { const inside = document.querySelector('#walking-hud')?.dataset.inside ?? '';
   return level ? inside === `campus-level:${level}` : !inside.startsWith('campus-level:'); }, here, { timeout: 15000 });
  const button = await tab.waitForFunction(down => {
   const shown = n => n && !n.hidden && !n.disabled && /lift|level|ground floor/i.test(n.textContent), enter = document.querySelector('#walking-enter'), descend = document.querySelector('#walking-descend');
   if (!down) return shown(enter) && !/down|ground floor/i.test(enter.textContent) ? '#walking-enter' : null;
   return shown(descend) ? '#walking-descend' : shown(enter) && /down|ground floor/i.test(enter.textContent) ? '#walking-enter' : null;
  }, down, { timeout: 30000 }).then(handle => handle.jsonValue())
   .catch(async () => { throw new Error(`${label}: no portal prompt ${JSON.stringify(await self(tab))}`); });
  if (touch) {
   // On a phone the panel and visit tools sit over the HUD; close them as a resident would (contextual-first-visit).
   if (await tab.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await tab.locator('#panel-toggle').tap();
   if (await tab.locator('.visit-tools').evaluate(node => node.open).catch(() => false)) await tab.locator('.visit-tools-toggle').tap();
   // An open town chat dock takes the phone's console space (game-hud.css); fold it away.
   if (await tab.locator('.town-chat-dock').evaluate(node => node.open).catch(() => false)) await tab.locator('.town-chat-dock > summary').tap();
   // A second action (down, beside up) lives under the HUD's More disclosure until it is opened.
   if (await tab.locator(`.walking-more ${button}`).count() && !await tab.locator('.walking-more').evaluate(node => node.open)) await tab.locator('.walking-more > summary').tap();
   await tab.locator(button).waitFor({ state: 'visible', timeout: 30000 }).catch(async error => {
    await tab.screenshot({ path: 'output/playwright/garden-campus-traversal-phone-failure.png' });
    const why = await tab.locator(button).evaluate(node => { const out = [];for (let n = node; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n), r = n.getBoundingClientRect();
     if (c.display === 'none' || c.visibility !== 'visible' || r.width === 0 || r.height === 0 || Number(c.opacity) === 0) out.push(`${n.tagName}#${n.id}.${n.className} display=${c.display} visibility=${c.visibility} ${r.width}x${r.height} hidden=${n.hidden}`); }
     return { body: document.body.className, primary: document.querySelector('#walking-hud')?.dataset.primaryAction, chain: out }; });
    throw new Error(`${label}: ${button} not visible ${JSON.stringify(why)}`);
   });
   await tab.locator(button).tap();
   if (await tab.locator('.walking-more').evaluate(node => node.open).catch(() => false)) await tab.locator('.walking-more > summary').tap();
  }
  else { await tab.locator('#canvas-host').focus();await tab.keyboard.press(button === '#walking-descend' ? 'Shift+KeyF' : 'KeyF'); }
  // The arrival is the server's: wait for exactly the level this portal leads to.
  await tab.waitForFunction(to => { const m = window.__riverMultiplayer(), p = m.snapshot?.players.find(q => q.id === m.selfId);return p && (p.levelId ?? null) === to; }, to ?? null, { timeout: 30000 })
   .catch(async () => { throw new Error(`${label}: expected ${to ?? 'the street'}, the server says ${JSON.stringify((await self(tab))?.levelId ?? null)}`); });
 };
 const onLevel = async (tab, index, label) => {
  const me = await self(tab), floor = BASE + levels[index].z;
  check(me.levelId === (index ? L(index) : null), `${label}: the server puts the resident on ${index ? `Floor ${index + 1}` : 'the street'}`);
  check(Math.abs(me.position[2] - floor) < 1e-6, `${label}: standing at ${floor.toFixed(2)} m, the floor's own height`);
  // The HUD repaints on its own beat; give it a moment to show the arrival before reading the page's eye.
  await tab.waitForFunction(floor => { const n = document.querySelector('#walking-hud'), y = JSON.parse(n.dataset.position)[1], eye = Number(n.dataset.eyeHeight);
   return Math.abs(y - eye - floor) < 0.05 && Math.abs(eye - 1.68) < 0.05; }, floor, { timeout: 5000 }).catch(() => {});
  const view = await hud(tab);
  check(Math.abs(view.position[1] - view.eye - floor) < 0.05 && Math.abs(view.eye - 1.68) < 0.05, `${label}: the page's eye is 1.68 m above that floor (eye ${view.eye}, feet ${(view.position[1] - view.eye).toFixed(2)})`);
 };
 // The Map's Step inside, once the page has joined the town (player ready comes before the join); asked again if it did not land.
 const enterHall = async (tab, hall) => {
  await tab.waitForFunction(() => { const m = window.__riverMultiplayer?.();return m?.connected && m.snapshot?.players?.some(p => p.id === m.selfId); }, null, { timeout: 120000 });
  for (let attempt = 0; ; attempt++) {
   await tab.evaluate(id => { const select = document.querySelector('#destination');select.value = id;select.dispatchEvent(new Event('change'));document.querySelector('#enter-destination').click(); }, hall);
   try { await tab.waitForFunction(id => document.querySelector('#walking-hud')?.dataset.inside === id, hall, { timeout: 20000 });return; }
   catch (error) { if (attempt === 2) throw new Error(`could not enter ${hall}: ${JSON.stringify({ notice: await tab.locator('#walking-notice').textContent().catch(() => null), self: await self(tab) })}`); }
  }
 };

 await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });await ready(page);
 const origin = new URL(page.url()).origin, browser = page.context().browser();
 // Up T1's lift to Floor 4, one floor per press.
 await enterHall(page, 'campus:T1-F1-hall');
 await walk(page, [[18, spurV('T1')], [12.4, portal('T1-F1/lift-up')[1]]], 'T1 lift');
 await waitForCampusLift(page, campusToSource(portal('T1-F1/lift-up')));
 for (const index of [1, 2, 3]) { await take(page, { label: `T1 lift to Floor ${index + 1}`, to: L(index) });await onLevel(page, index, `T1 lift, Floor ${index + 1}`); }
 const landing = (await self(page)).position;

 // A phone resident rides up while the first stands on the landing: beside them, never onto them.
 const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
 await phone.addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
 const guest = await phone.newPage();guest.setDefaultTimeout(60000);
 await guest.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' });await ready(guest);
 await enterHall(guest, 'campus:T1-F1-hall');
 await walk(guest, [[18, spurV('T1')], [12.4, portal('T1-F1/lift-up')[1]]], 'T1 lift (phone)');
 await waitForCampusLift(guest, campusToSource(portal('T1-F1/lift-up')));
 for (const index of [1, 2, 3]) await take(guest, { touch: true, label: `phone lift to Floor ${index + 1}`, to: L(index) });
 await onLevel(guest, 3, 'phone on Floor 4');
 const beside = (await self(guest)).position;
 check(Math.hypot(beside[0] - landing[0], beside[1] - landing[1]) >= 0.7, 'The occupied landing sets the phone resident beside the one standing there');
 for (const index of [2, 1, 0]) await take(guest, { touch: true, down: true, label: `phone lift down to ${index ? `Floor ${index + 1}` : 'the street'}`, to: index ? L(index) : null });
 await onLevel(guest, 0, 'phone back on the street');
 check(await guest.locator('#walking-hud').evaluate(n => n.dataset.inside) === 'campus:T1-F1-hall', 'The lift down returns the phone resident to T1’s hall');

 // The phone resident walks out under B12; the first crosses it overhead.
 await walk(guest, [[20, 58], [26.5, 58], [26.5, 76.8], [16, 76.8]], 'under B12');
 await walk(page, [[12.4, spurV('T1')], [16, spurV('T1')], [16, 70], [16, 76.8]], 'onto B12');
 const [below, above] = [await self(guest), await self(page)];
 check(Math.hypot(below.position[0] - above.position[0], below.position[1] - above.position[1]) < 1.2, 'One resident on B12 stands over the other on the street');
 check(below.levelId === null && Math.abs(below.position[2] - BASE) < 1e-6 && above.levelId === L(3) && Math.abs(above.position[2] - BASE - 13) < 1e-6, 'Each is at their own level and height, 13 m apart');
 for (const [tab, id, level, height] of [[page, below.id, null, BASE], [guest, above.id, L(3), BASE + 13]]) {
  const seen = await other(tab, id);
  check(seen && seen.levelId === level && Math.abs(seen.position[2] - height) < 1e-6, `Each page sees the other resident ${level ? 'on Floor 4' : 'on the street'}`);
 }
 await page.screenshot({ path: 'output/playwright/garden-campus-traversal-b12.png' });
 await guest.screenshot({ path: 'output/playwright/garden-campus-traversal-under-b12.png' });
 await phone.close();

 // On through T2's terrace and gallery, up T2's lift to the roof garden, and back down.
 await walk(page, [[16, 91.5], [16, spurV('T2')], [12.4, spurV('T2')], [12.4, portal('T2-F4/lift-up')[1]]], 'T2 lift');
 for (const index of [4, 5, 6, 7]) await take(page, { label: `T2 lift to ${index === 7 ? 'the roof' : `Floor ${index + 1}`}`, to: L(index) });
 await onLevel(page, 7, 'T2 roof garden');
 await page.screenshot({ path: 'output/playwright/garden-campus-traversal-t2-roof.png' });
 for (const index of [6, 5, 4, 3]) await take(page, { down: true, label: `T2 lift down to Floor ${index + 1}`, to: L(index) });
 await onLevel(page, 3, 'back on Floor 4 in T2');
 // Across B23 into T3, and down T3's stairs to the street.
 await walk(page, [[12.4, spurV('T2')], [16, spurV('T2')], [16, 123], [16, spurV('T3')], [12.4, spurV('T3')], [12.4, portal('T3-F4/stairs-down')[1]]], 'T3 stairs');
 for (const index of [2, 1, 0]) await take(page, { down: true, label: `T3 stairs down to ${index ? `Floor ${index + 1}` : 'the street'}`, to: index ? L(index) : null });
 await onLevel(page, 0, 'T3 stairs to the street');
 check(await page.locator('#walking-hud').evaluate(n => n.dataset.inside) === 'campus:T3-F1-hall', 'T3’s stairs end in T3’s hall: a return to the street through another core');
 return { checks, limits: ['Touch is emulated (Playwright hasTouch); physical phones are unproven.', 'Suite entry is #510’s journey; this one stays on public floors.'] };
}
