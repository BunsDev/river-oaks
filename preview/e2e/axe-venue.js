async (alice, bob) => {
  // The unbranded axe-and-darts venue (Val, 2026-10-15): two real browsers on one loopback
  // town pick it from the destination list, step inside, share a lane and throw through
  // the real meter; each sees the other's axe stick in the target. Software rendering;
  // not a visual or device acceptance.
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [], errors = [];
  for (const page of [alice, bob]) page.on('pageerror', error => errors.push(error.message));
  const axes = page => page.evaluate(() => window.__riverAxes?.() ?? null);
  async function load(page) {
    await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
  }
  async function enter(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'Axe & Darts' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'venue:axe-and-darts');
    await page.locator('#panel-toggle').click();
  }
  const plan = page => page.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.storeId === 'venue:axe-and-darts');
    return { facade: r.facade, right: r.right, inward: r.inward };
  });
  async function walk(page, room, path) {
    for (const [a, d] of path) {
      const target = [room.facade[0] + room.right[0] * a + room.inward[0] * d, room.facade[1] + room.right[1] * a + room.inward[1] * d], deadline = Date.now() + 90000;
      await page.locator('#canvas-host').focus();
      let distance = Infinity;
      while (Date.now() < deadline) {
        const p = await page.evaluate(() => window.__riverCarriage().pose);
        distance = Math.hypot(p.position[0] - target[0], -p.position[2] - target[1]);
        if (distance <= .16) break;
        await page.evaluate(([x, n]) => window.__riverSeatAndWater().face(x, n), target);
        await page.keyboard.down('KeyW'); await page.waitForTimeout(Math.min(120, Math.max(20, distance * 100))); await page.keyboard.up('KeyW');
      }
      check(distance <= .16, `could not reach ${a}, ${d}`);
    }
  }
  // One axe: hold the hand still on the release that carries it to a point from where the
  // thrower stands, throw, and wait for the town's landing to finish its flight.
  async function throwAt(page, point) {
    const before = (await axes(page)).lane?.throws.length ?? 0;
    await page.evaluate(target => window.__riverAxes().steadyOn(target), point);
    await page.locator('#axe-panel [data-axe-action="throw"]').click();
    await page.waitForFunction(n => (window.__riverAxes().lane?.throws.length ?? 0) > n && !window.__riverAxes().flying, before);
  }

  await Promise.all([load(alice), load(bob)]);
  await Promise.all([enter(alice), enter(bob)]);
  checks.push('both picked Axe & Darts from the destination list and stepped inside');
  const room = await plan(alice);
  await Promise.all([walk(alice, room, [[2.35, 3.6], [2.35, 5.0]]), walk(bob, room, [[2.75, 3.6], [2.75, 5.2]])]);
  checks.push('both walked into lane 1 behind the throwing line');

  await alice.locator('#canvas-host').focus(); await alice.keyboard.press('KeyX');
  await alice.waitForFunction(() => window.__riverAxes()?.open && window.__riverAxes().buttons.some(label => label.startsWith('Invite')));
  await alice.locator('#axe-panel [data-axe-shared="invite"]').first().click();
  await bob.locator('#canvas-host').focus(); await bob.keyboard.press('KeyX');
  await bob.waitForFunction(() => window.__riverAxes()?.buttons.some(label => label.startsWith('Accept')));
  await bob.locator('#axe-panel [data-axe-shared="accept"]').click();
  await alice.waitForFunction(() => window.__riverAxes().lane?.players?.length === 2 && !window.__riverAxes().lane.result);
  checks.push('alice invited bob in the lane and bob accepted');

  await throwAt(alice, [0, 0]);
  await throwAt(bob, [0, 0]);
  const seen = await axes(alice);
  check(seen.lane.throws.length === 2, `both throws recorded: ${JSON.stringify(seen.lane)}`);
  const stuck = seen.lane.throws.filter(item => item.stuck).length;
  await bob.waitForFunction(n => window.__riverAxes().stuck['axe-lane-1'] === n, stuck);
  checks.push(`alice and bob each threw; ${stuck} of 2 stuck and bob's target shows them (scores ${seen.lane.scores.join('–')})`);
  const refused = await alice.evaluate(() => window.__riverMultiplayerCommand?.({ type: 'axes', laneId: 'axe-lane-1', action: 'throw', aim: [0, 0], stuck: true }) ?? null);
  if (refused) { check(refused.error === 'invalid_axes', `a client cannot claim a stuck axe: ${JSON.stringify(refused)}`); checks.push('a direct throw that claims its own outcome is refused by the town'); }

  // Darts at the venue's own board.
  await alice.keyboard.press('KeyX');
  await walk(alice, room, [[2.35, 3.8], [-1.2, 4.0], [-2.6, 6.9]]);
  await alice.locator('#canvas-host').focus(); await alice.keyboard.press('KeyX');
  await alice.waitForFunction(() => window.__riverVenueDarts()?.open);
  await alice.locator('#darts-panel-axe-and-darts-board [data-darts-shared="practice"]').click();
  await alice.waitForFunction(() => window.__riverVenueDarts().line?.players?.[1] === 'regular');
  checks.push('alice started darts against the regular at the venue board');
  await bob.waitForFunction(() => window.__riverAxes().lane?.result?.reason === 'left the lane', null, { timeout: 15000 });
  checks.push('alice walking off ended the lane match for bob');

  await alice.keyboard.press('KeyX');
  const left = await alice.evaluate(() => window.__riverMultiplayerCommand?.({ type: 'travel', storeId: 'venue:axe-and-darts', mode: 'leave' }) ?? null);
  if (left) { check(left.ok, `travel out: ${JSON.stringify(left)}`); checks.push('alice travelled back out to the street by the venue id'); }
  check(!errors.length, errors.join('; '));
  return { checks, errors };
}
