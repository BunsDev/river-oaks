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
  // Between the rows, beside recliners 0-1 and 1-1 (the T3 seat), as the screening journeys stand.
  for (const p of [[-1.4,4.8],[-1.4,20.7],[-5.55,20.7],[-5.55,24.7],[-4.85,24.7],[-4.85,29],[-4.85,29.65],[-1.6,29.65]]) await walk(...p);
  const top = await pose(); check(Math.abs(top.ground - plan.floor - 6) < .01, 'Shared player reached the upstairs auditorium');
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
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => !window.__riverCarriage().pose.sitting);
  check(await page.evaluate(() => window.__riverCarriage().camera.view) === 'third-person', 'Standing restores the walking camera');
  checks.push('stood with keyboard interaction; the walking camera returned');
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
