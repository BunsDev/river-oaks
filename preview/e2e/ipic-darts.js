async (alice, bob) => {
  // Shared darts in the IPIC Tuck Room (Val, 2026-10-15): two real browsers on one
  // loopback town. alice invites bob at the line, throws through the real meter, and
  // bob sees the same darts on the cabinet's board before taking his turn. Software
  // rendering; not a visual or device acceptance.
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [], errors = [];
  for (const page of [alice, bob]) page.on('pageerror', error => errors.push(error.message));
  const darts = page => page.evaluate(() => window.__riverIpicDarts?.() ?? null);
  async function load(page) {
    await page.goto('http://127.0.0.1:5173/?motion-debug=1', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 90000 });
  }
  async function enter(page) {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
    await page.locator('#enter-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud')?.dataset.inside === 'osm-node-8172494964');
    await page.locator('#panel-toggle').click();
  }
  const plan = page => page.evaluate(async () => {
    const { storeRoomsFor } = await import('/src/store-rooms.js');
    const r = storeRoomsFor(await fetch('/data/district.json').then(x => x.json())).find(x => x.interior === 'ipic-photo-v1');
    return { facade: r.facade, right: r.right, inward: r.inward };
  });
  // The same keyboard walk as preview/e2e/ipic-visit.js.
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
  // One dart: hold the hand still on the release that carries it to a point, and throw;
  // the town flies it with the hand's own error.
  async function throwAt(page, point) {
    const before = (await darts(page)).line?.points.length ?? 0;
    await page.evaluate(target => window.__riverIpicDarts().steadyOn(target), point);
    await page.locator('.darts-panel[open] [data-darts-action="throw"]').click();
    await page.waitForFunction(n => (window.__riverIpicDarts().line?.points.length ?? 0) > n && !window.__riverIpicDarts().flying, before);
  }

  await Promise.all([load(alice), load(bob)]);
  await Promise.all([enter(alice), enter(bob)]);
  const room = await plan(alice);
  await Promise.all([walk(alice, room, [[1.4, 4.8], [1.4, 20.7], [.1, 22.8]]), walk(bob, room, [[1.4, 4.8], [1.4, 20.6], [.9, 22.5]])]);
  checks.push('both walked up the right escalator lane to the Tuck Room throwing line');

  await alice.locator('#canvas-host').focus(); await alice.keyboard.press('KeyX');
  await alice.waitForFunction(() => window.__riverIpicDarts()?.open && window.__riverIpicDarts().buttons.some(label => label.startsWith('Invite')));
  check((await darts(alice)).buttons.includes('Practise against the regular'), 'a lone player can practise');
  await alice.locator('.darts-panel[open] [data-darts-shared="invite"]').first().click();
  await bob.locator('#canvas-host').focus(); await bob.keyboard.press('KeyX');
  await bob.waitForFunction(() => window.__riverIpicDarts()?.buttons.some(label => label.startsWith('Accept')));
  await bob.locator('.darts-panel[open] [data-darts-shared="accept"]').click();
  await alice.waitForFunction(() => window.__riverIpicDarts().line?.players?.length === 2 && !window.__riverIpicDarts().line.result);
  checks.push('alice invited bob through the panel and bob accepted');

  for (let i = 0; i < 3; i++) await throwAt(alice, [0, 103]);
  const seen = await darts(bob);
  check(seen.line.points.length === 3 && seen.line.turn === 1, `bob sees alice's three darts and his turn: ${JSON.stringify(seen.line)}`);
  await bob.waitForFunction(() => window.__riverIpicDarts().board === 3);
  check(seen.line.scores[0] < 501, 'alice scored');
  checks.push(`alice released three darts at the treble 20; bob's board shows where the town landed them (${seen.line.scores[0]} left)`);
  const refused = await alice.evaluate(() => window.__riverMultiplayerCommand?.({ type: 'darts', lineId: 'ipic-tuck-room', action: 'throw', release: [0, 50] }) ?? null);
  if (refused) { check(refused.error === 'not_your_turn', `out of turn refused: ${JSON.stringify(refused)}`); checks.push('a direct out-of-turn throw is refused by the town'); }

  await throwAt(bob, [0, 0]);
  check((await darts(alice)).line.points.length === 4, 'alice sees bob\'s dart');
  checks.push('bob threw; alice sees it');

  await walk(alice, room, [[1.4, 21]]);
  await bob.waitForFunction(() => window.__riverIpicDarts().line?.result?.reason === 'left the line', null, { timeout: 15000 });
  check((await darts(bob)).status.includes('left the line'), 'bob is told alice left');
  checks.push('alice walked off; the match ended for bob');
  check(!errors.length, errors.join('; '));
  return { checks, errors, final: (await darts(bob)).line };
}
