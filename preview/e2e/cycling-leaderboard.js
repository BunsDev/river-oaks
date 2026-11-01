// The cycling leaderboard: one account rides a bike from the plaza rack and
// steps off; the other opens Cycling in the Play dock and sees the rider ranked
// with real miles from the town's leaderboard route. The rider's own rack
// prompt then carries their lifetime miles.
async page => {
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const cycling = p => p.evaluate(() => { const { goNear, ...state } = window.__riverCycling(); return state; });
  const board = p => p.evaluate(() => { const { open, refresh, ...state } = window.__riverCyclingBoard(); return state; });
  const waitOn = async (p, label, fn, arg, timeout) => { try { await p.waitForFunction(fn, arg, { timeout }); } catch (error) { throw new Error(`${label}: ${error.message.split('\n')[0]} · cycling ${JSON.stringify(await cycling(p))} · board ${JSON.stringify(await board(p))}`); } };
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
  const ready = async p => { await p.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' }); await p.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverCycling?.() && window.__riverCyclingBoard?.() && window.__riverMultiplayer?.().connected, null, { timeout: 90000 }); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  const other = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await other.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const bob = await other.newPage();
    await ready(bob);
    // Bob opens the board before anyone has ridden: the empty state.
    await bob.evaluate(() => window.__riverCyclingBoard().open(true));
    await waitOn(bob, 'empty board', () => { const b = window.__riverCyclingBoard(); return b.open && b.rows.length === 0 && b.status === null; }, null, 15000);
    await bob.locator('#play-tab-cycling').click();
    check(await bob.locator('.cycling-board-empty').isVisible(), 'An empty board says to take a bike from any rack');
    // The rider takes a bike, rides west past the bench, and steps off.
    check((await page.evaluate(id => window.__riverCycling().goNear(id), 'plaza-salon-rack:2')).ok, 'The rider arrived at the rack');
    await waitOn(page, 'rack prompt', () => window.__riverCycling().prompt === 'take-bike', null, 30000);
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyG');
    await waitOn(page, 'mount', () => window.__riverCycling().riding === true, null, 30000);
    await page.keyboard.down('KeyW');
    await waitOn(page, 'set off', () => window.__riverCycling().rideMeters > 1, null, 30000);
    // West-northwest past the backgammon table, then due west (simulated clear from every slot).
    await holdHeading(page, -0.45, -0.35, state => state.rideMeters > 12);
    await holdHeading(page, -0.05, 0.05, state => state.rideMeters > 14);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyG');
    await waitOn(page, 'step off', () => window.__riverCycling().riding === false && window.__riverCycling().lastRideMeters > 14, null, 15000);
    const ridden = (await cycling(page)).lastRideMeters;
    check(ridden > 14, `Rode ${ridden.toFixed(1)} m`);
    // The fixture flushes within a second and the route caches its top for ten seconds, so
    // keep re-reading until the rider appears: this is what the sheet's own refresh does.
    const ranked = async (p, label) => {
      for (let attempt = 0; attempt < 15; attempt++) {
        await p.evaluate(() => window.__riverCyclingBoard().refresh());
        await p.waitForTimeout(2000);
        const rows = (await board(p)).rows;
        if (rows.length === 1 && /#1/.test(rows[0]) && /mi/.test(rows[0])) return rows[0];
      }
      throw new Error(`${label}: the rider never appeared · board ${JSON.stringify(await board(p))}`);
    };
    const row = await ranked(bob, 'rider on the board');
    check(/Jevica|owner/i.test(row) || row.length > 5, `Bob sees the rider ranked first: ${row}`);
    check((await board(bob)).me === null && (await board(bob)).footer === null, 'Bob, who has not ridden, has no row of his own');
    await bob.screenshot({ path: 'output/playwright/cycling-leaderboard.png' });
    // The rider's own board shows their rank, and the rack prompt carries their lifetime miles.
    await page.evaluate(() => window.__riverCyclingBoard().open(true));
    await waitOn(page, 'own rank', () => window.__riverCyclingBoard().me?.rank === 1, null, 20000);
    await ranked(page, 'own board');
    check(await page.locator('.cycling-board-row-mine').count() === 1, 'The rider\'s own row is highlighted');
    check((await page.evaluate(id => window.__riverCycling().goNear(id), 'plaza-salon-rack:2')).ok, 'Back at the rack');
    await waitOn(page, 'prompt with miles', () => /Take a bike · [\d.]+ mi so far/.test(document.querySelector('#walking-interact')?.textContent ?? ''), null, 15000);
    check(true, 'The rack prompt shows lifetime miles');
    await page.screenshot({ path: 'output/playwright/cycling-leaderboard-rider.png' });
    // The other boards (2026-11-01): both accounts have been in town and moving, so Hours played
    // lists them, the rider's own row highlighted; Walking opens with its own label.
    await page.evaluate(() => window.__riverCyclingBoard().show('played'));
    for (let attempt = 0; attempt < 15; attempt++) {
      await page.evaluate(() => window.__riverCyclingBoard().refresh());
      await page.waitForTimeout(2000);
      const state = await board(page);
      if (state.board === 'played' && state.rows.length >= 1 && state.rows.every(row => / h$/.test(row))) break;
    }
    const hours = await board(page);
    check(hours.board === 'played' && hours.rows.length >= 1 && hours.me?.rank >= 1, `Hours played ranks the rider: ${JSON.stringify(hours.rows)}`);
    check(await page.locator('.cycling-board-row-mine').count() === 1, 'The rider\'s own hours row is highlighted');
    await page.screenshot({ path: 'output/playwright/leaderboard-hours.png' });
    await page.evaluate(() => window.__riverCyclingBoard().show('walking'));
    await waitOn(page, 'walking board', () => window.__riverCyclingBoard().board === 'walking' && /On foot/.test(document.querySelector('.cycling-board-eyebrow')?.textContent ?? ''), null, 15000);
    check(true, 'The board picker switches to Walking');
    await page.screenshot({ path: 'output/playwright/leaderboard-walking.png' });
  } finally { for (const key of ['ShiftLeft', 'ArrowRight', 'KeyW']) await page.keyboard.up(key); await other.close(); }
  return { checks };
}
