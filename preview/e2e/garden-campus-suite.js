async page => {
 // A leased suite in use (#510 on #508's floors and #509's leases), three fixture accounts on
 // the campus revision. The resident (owner fixture) asks for T1-201 and accepts the operator's
 // offer; rides T1's lift to Floor 2, walks through the suite's door to its desk, sits and writes
 // private work at "Use this desk". A stranger on the same floor cannot pass that door. The
 // operator revokes the lease: the resident is walked out to the gallery side of the door and
 // the desk is gone. Targets come from #506's contract; arrivals and refusals are the server's.
 const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
 const { campusLevels, campusToSource, campusUnitInventory, sourceToCampus } = await import('../../shared/garden-campus-layout.js');
 const { campusUnitSeats } = await import('../../shared/garden-campus-fitout.js');
 const UNIT = 'T1-F2-W-S', door = campusUnitInventory().find(unit => unit.id === UNIT).door, L1 = 'garden-campus/l1';
 const desk = campusUnitSeats(UNIT).find(seat => seat.kind === 'desk' && seat.workstation);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 const ready = tab => tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 180000 });
 const { createCampusStartupReadiness, waitForCampusLift } = await import('./garden-campus-readiness.js');
 const startup = createCampusStartupReadiness();startup.track(page);
 const liftPosition = campusToSource(campusLevels()[0].portals.find(portal => portal.id === 'T1-F1/lift-up').position);
 const joined = tab => startup.joined(tab);
 const self = tab => tab.evaluate(() => { const m = window.__riverMultiplayer();return m.snapshot?.players.find(p => p.id === m.selfId) ?? null; });
 const hud = tab => tab.locator('#walking-hud').evaluate(n => JSON.parse(n.dataset.position));
 const where = async tab => { const [x, , z] = await hud(tab);return sourceToCampus([x, -z]); };
 const click = async (tab, selector, text) => { const target = text ? tab.locator(selector, { hasText: text }).first() : tab.locator(selector).first();await target.waitFor({ state: 'attached' });await target.evaluate(n => n.click()); };
 // Turn by dragging the view above the HUD (walking-ui: yaw -= dx * 0.003), then walk with W.
 const turnTo = async (tab, heading) => {
  const me = await self(tab), box = await tab.locator('#canvas-host').boundingBox();
  let delta = Math.atan2(Math.sin(heading + me.yaw), Math.cos(heading + me.yaw));
  while (Math.abs(delta) > 0.03) {
   const limit = box.width * 0.4, px = Math.max(-limit, Math.min(limit, delta / 0.003)), x = box.x + box.width / 2, y = box.y + box.height * 0.35;
   await tab.mouse.move(x, y);await tab.mouse.down();await tab.mouse.move(x + px, y, { steps: 6 });await tab.mouse.up();delta -= px * 0.003;
  }
  await tab.waitForTimeout(250);
 };
 const walkTo = async (tab, [u, v], label, { reach = 0.4, strides = 160 } = {}) => {
  const [east, north] = campusToSource([u, v]);
  for (let stride = 0; stride < strides; stride++) {
   const [x, , z] = await hud(tab), de = east - x, dn = north + z, distance = Math.hypot(de, dn);
   if (distance < reach) return true;
   await turnTo(tab, Math.atan2(de, dn));await tab.locator('#canvas-host').focus();
   const fast = distance > 3;if (fast) await tab.keyboard.down('ShiftLeft');
   await tab.keyboard.down('KeyW');await tab.waitForTimeout(Math.min(450, Math.max(80, distance * (fast ? 130 : 260))));await tab.keyboard.up('KeyW');
   if (fast) await tab.keyboard.up('ShiftLeft');await tab.waitForTimeout(120);
  }
  if (label) throw new Error(`could not walk to ${label}: ${JSON.stringify(await self(tab))}`);
  return false;
 };
 const walk = async (tab, points, label) => { for (const point of points) await walkTo(tab, point, label); };
 // T1's hall by the campus panel and its door, then the lift to Floor 2.
 // Which step a page stalled on, with its own screenshot (the runner's covers only the first page).
 const step = async (tab, label, fn) => { try { return await fn(); } catch (error) {
  await tab.screenshot({ path: `output/playwright/garden-campus-suite-${label.replace(/\W+/g, '-')}-failure.png` }).catch(() => {});
  throw new Error(`${label}: ${error.message.split('\n')[0]} ${JSON.stringify(await self(tab).catch(() => null))}`); } };
 const toFloor2 = async (tab, who) => {
  await step(tab, `${who} join`, () => joined(tab));
  await click(tab, '#campus-panel button', 'Go to the Grove Offices hall');
  await step(tab, `${who} to the hall door`, () => tab.waitForFunction(() => /Grove Offices hall/.test(document.querySelector('#campus-panel [role=status]')?.textContent ?? ''), null, { timeout: 30000 }));
  await step(tab, `${who} into the hall`, async () => { for (let attempt = 0; ; attempt++) {
   await tab.waitForFunction(() => { const n = document.querySelector('#walking-enter');return n && !n.hidden && /Step inside Grove Offices/.test(n.textContent); }, null, { timeout: 30000 });
   await tab.locator('#walking-enter').evaluate(n => n.click());
   try { await tab.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'campus:T1-F1-hall', null, { timeout: 10000 });return; } catch (error) { if (attempt === 2) throw error; }
  } });
  await walk(tab, [[18, 57.5], [12.4, 56.3]], `${who} to the T1 lift`);
  await step(tab, `${who} lift prompt`, () => waitForCampusLift(tab, liftPosition));
  await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyF');
  await step(tab, `${who} lift to Floor 2`, () => tab.waitForFunction(level => { const m = window.__riverMultiplayer();return m.snapshot?.players.find(p => p.id === m.selfId)?.levelId === level; }, L1, { timeout: 30000 }));
  await step(tab, `${who} Floor 2 HUD`, () => tab.waitForFunction(level => document.querySelector('#walking-hud')?.dataset.inside === `campus-level:${level}`, L1, { timeout: 15000 }));
 };

 await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });await ready(page);
 const origin = new URL(page.url()).origin, browser = page.context().browser();
 // The lease: asked for in the dialog, offered by the operator (bob), accepted by the resident.
 await joined(page);
 await click(page, '#campus-panel button', 'Suites and leases');
 await page.locator('#campus-dialog .campus-units li', { hasText: 'T1-201' }).getByRole('button', { name: 'Ask for this suite' }).click();
 await page.waitForFunction(() => /Asked for suite T1-201/.test(document.querySelector('#campus-dialog .campus-status')?.textContent ?? ''));
 const operatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });await operatorContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
 const operator = await operatorContext.newPage();operator.setDefaultTimeout(60000);startup.track(operator);
 await operator.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' });await ready(operator);await joined(operator);
 await click(operator, '#campus-panel button', 'Suites and leases');
 await operator.locator('#campus-dialog .campus-row', { hasText: 'T1-201' }).getByRole('button', { name: 'Offer these dates' }).click();
 await operator.waitForFunction(() => /Offer sent/.test(document.querySelector('#campus-dialog .campus-status')?.textContent ?? ''));
 await operator.keyboard.press('Escape');
 await click(page, '#campus-panel button', 'Suites and leases');
 await page.locator('#campus-dialog .campus-row', { hasText: 'T1-201' }).getByRole('button', { name: 'Accept' }).click();
 await page.waitForFunction(() => /Lease accepted/.test(document.querySelector('#campus-dialog .campus-status')?.textContent ?? ''));
 // The directory refreshes after the accept; read the chip once it has.
 await page.locator('#campus-dialog .campus-units li', { hasText: 'T1-201' }).locator('.campus-chip', { hasText: 'Your suite' }).waitFor({ timeout: 15000 }).catch(() => {});
 check(await page.locator('#campus-dialog .campus-units li', { hasText: 'T1-201' }).locator('.campus-chip').textContent() === 'Your suite', 'T1-201 is the resident’s suite');
 await page.keyboard.press('Escape');await page.waitForFunction(() => !document.querySelector('#campus-dialog').open);

 // Up to Floor 2, along the spine, through T1-201's door to its desk.
 await toFloor2(page, 'resident');
 check((await self(page)).levelId === L1, 'The lift takes the resident to Floor 2');
 await walk(page, [[12.4, 57.5], [16, 57.5], [16, door[1]], [13.2, door[1]], desk.stand], 'T1-201’s desk');
 const inside = await where(page);
 check(inside[0] < 14.4, `The suite door lets its tenant in (at [${inside.map(n => n.toFixed(2))}])`);
 await page.locator('#nearby-seat').waitFor({ state: 'visible', timeout: 30000 });
 const offered = await page.evaluate(() => [...document.querySelectorAll('#nearby-seat option')].map(o => o.value));
 check(offered.length > 0 && offered.every(value => value.startsWith('campus-suite:T1-F2-W-S/')), 'Only this suite’s seats are offered inside it');
 await page.locator('#nearby-seat').selectOption(`campus-suite:${desk.id}:0`);
 await page.locator('#seat-sit').evaluate(n => n.click());
 await page.waitForFunction(() => document.querySelector('.walking-title strong')?.textContent === 'Seated', null, { timeout: 30000 });
 await page.waitForFunction(() => /Use this desk/.test(document.querySelector('#walking-play')?.textContent ?? '') && !document.querySelector('#walking-play').hidden, null, { timeout: 30000 });
 check(true, 'Seated at the suite desk, the resident is offered their desk');
 await page.locator('#walking-play').evaluate(n => n.click());
 await page.locator('#office-desk').waitFor({ state: 'visible' });await page.locator('#desk-loading').waitFor({ state: 'hidden' });
 await page.locator('#desk-start').click();await page.locator('#desk-title').fill('Suite planning');
 await page.locator('#desk-notes').fill('Private: the T1-201 fit-out list.');
 await page.waitForFunction(() => document.querySelector('#desk-save-status')?.textContent === 'All changes saved', null, { timeout: 30000 });
 check(true, 'Private work saves at the suite desk with the server’s acknowledgement');
 await page.screenshot({ path: 'output/playwright/garden-campus-suite-desk.png' });

 // A stranger on Floor 2 cannot pass the same door.
 const strangerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });await strangerContext.addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
 const stranger = await strangerContext.newPage();stranger.setDefaultTimeout(60000);startup.track(stranger);
 await stranger.goto(`${origin}/?motion-debug=1`, { waitUntil: 'commit' });await ready(stranger);
 await toFloor2(stranger, 'stranger');
 await walk(stranger, [[12.4, 57.5], [16, 57.5], [16, door[1]]], 'T1-201’s door (stranger)');
 await walkTo(stranger, [12.6, door[1]], null, { strides: 12 });
 // The town decides, so read its position for the stranger once it stops changing. The HUD can
 // still show a predicted step the town is refusing: a 3 fps software page read u = 14.38 while
 // the town held the stranger at the door line (its last accepted u is 14.50).
 let held = null;
 for (let read = 0; read < 20; read++) {
  const position = (await self(stranger))?.position;
  if (held && position && Math.hypot(position[0] - held[0], position[1] - held[1]) < 1e-6) break;
  held = position;await stranger.waitForTimeout(500);
 }
 const kept = sourceToCampus([held[0], held[1]]);
 check(kept[0] > 14.4, `The suite door keeps the stranger in the gallery (at [${kept.map(n => n.toFixed(2))}])`);
 check(await stranger.evaluate(() => !document.body.textContent.includes('T1-201 fit-out')), 'The tenant’s private work never reaches the stranger’s page');
 await strangerContext.close();

 // The operator revokes: the resident is walked out of the suite and the desk is gone.
 await click(operator, '#campus-panel button', 'Suites and leases');
 await operator.locator('#campus-dialog .campus-row', { hasText: 'T1-201' }).getByRole('button', { name: /Revoke|End/ }).first().click();
 await page.waitForFunction(() => { const m = window.__riverMultiplayer(), p = m.snapshot?.players.find(q => q.id === m.selfId);return p && !p.sitting && !p.campusWorkstation; }, null, { timeout: 30000 });
 await page.waitForFunction(() => !document.querySelector('#office-desk') || getComputedStyle(document.querySelector('#office-desk')).display === 'none' || document.querySelector('#office-desk').hidden || !document.querySelector('#office-desk').open, null, { timeout: 30000 }).catch(() => {});
 const out = await self(page), [u, v] = sourceToCampus([out.position[0], out.position[1]]);
 check(out.levelId === L1 && u > 14.5 && Math.abs(v - door[1]) < 0.6, `Losing the lease walks the resident out to the gallery side of the door (at [${u.toFixed(2)}, ${v.toFixed(2)}])`);
 check(await page.locator('#walking-play').evaluate(n => n.hidden || !/Use this desk/.test(n.textContent)), 'The desk action is gone with the lease');
 // #510: the resident is told why, wherever the page announces it (the dialog when open, the campus panel and notice otherwise).
 const told = await page.waitForFunction(() => [...document.querySelectorAll('#campus-dialog .campus-status, #campus-panel [role=status]')].map(n => n.textContent)
   .find(text => /Suite T1-201: The lease ended on \d{4}-\d\d-\d\d: the campus operator ended it\./.test(text)) ?? false, null, { timeout: 15000 }).then(handle => handle.jsonValue()).catch(() => null);
 check(Boolean(told), `The resident is told the operator ended the lease (${told ?? 'nothing said'})`);
 await page.screenshot({ path: 'output/playwright/garden-campus-suite-revoked.png' });
 await operatorContext.close();
 return { checks, limits: ['One suite on Floor 2; the other 42 suites share the code path and the server tests.'] };
}
