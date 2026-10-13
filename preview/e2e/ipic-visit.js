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
  for (const p of [[-1.4,4.8],[-1.4,20.7],[-5.55,20.7],[-5.55,24.7],[-4.85,24.7],[-4.85,29]]) await walk(...p);
  const top = await pose(); check(Math.abs(top.ground - plan.floor - 6) < .01, 'Shared player reached the upstairs auditorium');
  checks.push('walked from reception up both escalator runs into auditorium');
  await page.locator('#nearby-seat').selectOption('bench:ipic-recliner-0-0:0');
  await page.locator('#seat-sit').click();
  await page.waitForFunction(() => window.__riverCarriage().pose.sitting?.buildId === 'bench:ipic-recliner-0-0');
  check(await page.evaluate(() => { const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId).sitting?.buildId === 'bench:ipic-recliner-0-0'; }), 'Server confirmed the chosen recliner');
  await page.screenshot({ path: 'output/playwright/ipic/production-seated.png' });
  checks.push('selected recliner through UI and received authoritative seated pose');
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverCarriage().pose.sitting);
  checks.push('stood with keyboard interaction');
  for (const p of [[-4.85,29.65],[-4.85,24.7],[-5.55,24.7],[-5.55,20.7],[-1.4,20.7],[-1.4,4.8],[0,1],[0,-1.8]]) await walk(...p);
  check(!(await pose()).roomId, 'Walked back onto the street');
  checks.push('walked downstairs and exited onto street');
  check(!errors.length, errors.join('; '));
  return { checks, errors, upperGround: top.ground, rendering: 'Software fixture; material review is the separate IPIC model review' };
}
