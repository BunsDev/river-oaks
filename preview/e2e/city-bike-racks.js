// The curbside bike racks (bike-racks.js): six racks around the District with
// four bikes each. At every rack a walker is offered a bike, takes one with G,
// rolls off and steps off again; a second account sees the first bike go and
// come back. One screenshot frames each rack from its walk-up. Local only: not
// in the default suite.
async page => {
  const origin = 'http://127.0.0.1:5173', checks = [];
  const racks = ['amorino-rack', 'cartier-rack', 'harry-winston-rack', 'saint-bernard-rack', 'steak-48-rack', 'diptyque-rack'];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const cycling = p => p.evaluate(() => { const { goNear, face, ...state } = window.__riverCycling(); return state; });
  // A named wait: a timeout reports the step and the cycling state instead of a bare timer.
  const waitOn = async (p, label, fn, arg, timeout) => { try { await p.waitForFunction(fn, arg, { timeout }); } catch (error) { throw new Error(`${label}: ${error.message.split('\n')[0]} · state ${JSON.stringify(await cycling(p))}`); } };
  const frames = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const ready = async p => { await p.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' }); await p.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverCycling?.()?.cityParked && window.__riverMultiplayer?.().connected, null, { timeout: 90000 }); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  const parked = (await cycling(page)).cityParked;
  check(parked.length === racks.length * 4 && parked.every(Boolean), `${parked.length} bikes are parked at the curbside racks`);
  const other = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await other.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const bob = await other.newPage();
    await ready(bob);
    for (const [r, rack] of racks.entries()) {
      const near = `${rack}:1`;
      check((await page.evaluate(id => window.__riverCycling().goNear(id), near)).ok, `Arrived at ${rack}`);
      await waitOn(page, `${rack} prompt`, () => window.__riverCycling().prompt === 'take-bike', null, 30000);
      check(/Take a bike/.test(await page.locator('#walking-interact').textContent()), `${rack} offers Take a bike`);
      check(await page.evaluate(id => window.__riverCycling().face(id), near), `Facing ${rack}`);
      await frames(page);
      await page.screenshot({ path: `output/playwright/city-bike-racks-${rack}.png` });
      await page.locator('#canvas-host').focus();
      await page.keyboard.press('KeyG');
      await waitOn(page, `${rack} mount`, () => window.__riverCycling().riding === true, null, 30000);
      const slot = (await cycling(page)).slotId;
      check(slot?.startsWith(`${rack}:`), `The town handed out ${slot}`);
      await waitOn(page, `${rack} bike out`, id => window.__riverCycling().taken.includes(id) && window.__riverCycling().cityParked.filter(Boolean).length === 23, slot, 10000);
      check(true, `${slot} is drawn out of its rack`);
      if (r === 0) {
        await waitOn(bob, 'bob sees the bike out', id => window.__riverCycling().taken.includes(id) && window.__riverCycling().cityParked.filter(Boolean).length === 23, slot, 10000);
        check(true, 'Bob sees the bike gone from the rack');
      }
      // Roll off the rack onto the footway, then step off.
      await page.keyboard.down('KeyW');
      await waitOn(page, `${rack} roll off`, () => window.__riverCycling().rideMeters > 1.5, null, 30000);
      await page.keyboard.up('KeyW');
      check(true, `Rolled off ${rack}`);
      await page.keyboard.press('KeyG');
      await waitOn(page, `${rack} step off`, () => window.__riverCycling().riding === false, null, 15000);
      await waitOn(page, `${rack} returned`, () => window.__riverCycling().taken.length === 0 && window.__riverCycling().cityParked.every(Boolean), null, 10000);
      check(true, `Stepping off returns the bike to ${rack}`);
      if (r === 0) {
        await waitOn(bob, 'bob sees the bike back', () => window.__riverCycling().cityParked.every(Boolean), null, 10000);
        check(true, 'Bob sees all the bikes parked again');
      }
    }
  } finally { await page.keyboard.up('KeyW'); await other.close(); }
  return { checks };
}
