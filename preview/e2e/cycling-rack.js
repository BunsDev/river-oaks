// The plaza bike rack: walk up, take a bike with G, pedal across the plaza,
// sprint with Shift, step off with G. The town hands out the slot, a second
// account sees the parked bike vanish and return and the rider on a bike, and
// the ride's metres are counted by the server (the leaderboard is PR 2).
async page => {
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const cycling = p => p.evaluate(() => { const { goNear, ...state } = window.__riverCycling(); return state; });
  // A named wait: a timeout reports the step and the cycling state instead of a bare timer.
  const waitOn = async (p, label, fn, arg, timeout) => { try { await p.waitForFunction(fn, arg, { timeout }); } catch (error) { throw new Error(`${label}: ${error.message.split('\n')[0]} · state ${JSON.stringify(await cycling(p))}`); } };
  // Hold a heading band while pedalling: the steering relaxes slowly after a key is released,
  // so a fixed turn overshoots; this nudges left or right every few frames until `until` holds.
  // The budget is generous: ride distance per wall-clock second halves on a machine under swap.
  const holdHeading = async (p, low, high, until) => {
    let left = false, right = false;
    const set = async (l, r) => { if (l !== left) { left = l; await p.keyboard[l ? 'down' : 'up']('ArrowLeft'); } if (r !== right) { right = r; await p.keyboard[r ? 'down' : 'up']('ArrowRight'); } };
    const start = Date.now();
    try {
      while (Date.now() - start < 90000) {
        const state = await cycling(p);
        if (until(state)) return state;
        if (state.yaw > high) await set(false, true); else if (state.yaw < low) await set(true, false); else await set(false, false);
        await p.waitForTimeout(80);
      }
      throw new Error(`heading hold timed out · state ${JSON.stringify(await cycling(p))}`);
    } finally { await set(false, false); }
  };
  const ready = async p => { await p.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' }); await p.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverCycling?.() && window.__riverMultiplayer?.().connected, null, { timeout: 90000 }); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  check((await cycling(page)).parked.every(Boolean), 'Four bikes are parked at the rack');
  check((await page.evaluate(id => window.__riverCycling().goNear(id), 'plaza-salon-rack:1')).ok, 'Arrived at the rack');
  await waitOn(page, 'rack prompt', () => window.__riverCycling().prompt === 'take-bike', null, 30000);
  await waitOn(page, 'interact button', () => /Take a bike/.test(document.querySelector('#walking-interact')?.textContent ?? ''), null, 5000);
  check(await page.locator('#walking-interact').evaluate(button => button.getAttribute('aria-keyshortcuts') === 'G'), 'The console offers Take a bike (G)');
  const other = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await other.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const bob = await other.newPage();
    await ready(bob);
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyG');
    await waitOn(page, 'mount after G', () => window.__riverCycling().riding === true, null, 30000);
    const slot = (await cycling(page)).slotId;
    await waitOn(page, 'slot in snapshot', id => window.__riverCycling().taken.includes(id), slot, 10000);
    check(slot !== null, `The town handed out ${slot}`);
    await waitOn(bob, 'bob sees the slot out', id => window.__riverCycling().taken.includes(id) && window.__riverCycling().parked.filter(Boolean).length === 3, slot, 10000);
    check(true, 'Bob sees three parked bikes while the slot is out');
    await waitOn(bob, 'bob sees a rider', () => window.__riverMultiplayer().remotes?.some(remote => remote.vehicle === 'bicycle'), null, 10000);
    check(true, 'Bob sees a rider on a bicycle');
    check(/Cycling/.test(await page.locator('.walking-title strong').textContent()), 'The console title reads Cycling');
    // Set off south (the curved bench sits straight ahead of the rack), then steer by heading bands.
    await page.locator('#canvas-host').focus();
    await page.keyboard.down('KeyW');
    await waitOn(page, 'set off', () => window.__riverCycling().rideMeters > 1, null, 30000);
    // West-northwest past the backgammon table, then due west along the plaza (simulated clear from every slot).
    await holdHeading(page, -0.45, -0.35, state => state.rideMeters > 8);
    await page.keyboard.down('ShiftLeft');
    await holdHeading(page, -0.45, -0.35, state => state.rideMeters > 12);
    await holdHeading(page, -0.05, 0.05, state => state.rideMeters > 20);
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    const ridden = (await cycling(page)).rideMeters;
    check(ridden > 20, `Pedalled ${ridden.toFixed(1)} m across the plaza`);
    check(/mi cycled this ride/.test(await page.locator('#walking-place').textContent()), 'The console shows the ride in miles');
    await page.screenshot({ path: 'output/playwright/cycling-rack-ride.png' });
    await page.keyboard.press('KeyG');
    await waitOn(page, 'step off', () => window.__riverCycling().riding === false && window.__riverCycling().lastRideMeters > 20, null, 15000);
    await waitOn(page, 'slot returned', () => window.__riverCycling().taken.length === 0 && window.__riverCycling().parked.every(Boolean), null, 10000);
    check(true, 'Stepping off returns the bike to the rack');
    await waitOn(bob, 'bob sees all parked', () => window.__riverCycling().parked.every(Boolean), null, 10000);
    check(true, 'Bob sees all four bikes parked again');
    const self = await page.evaluate(() => window.__riverMultiplayer().snapshot.players.find(p => p.id === window.__riverMultiplayer().selfId));
    check(self.vehicle === null, 'The town shows the rider on foot');
  } finally { for (const key of ['ShiftLeft', 'ArrowRight', 'KeyW']) await page.keyboard.up(key); await other.close(); }
  await page.screenshot({ path: 'output/playwright/cycling-rack.png' });
  return { checks };
}
