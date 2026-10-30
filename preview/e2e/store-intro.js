async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [], errors = [], claims = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => { if (response.url().includes('/api/profile/claim-intro')) { const result = await response.json(); claims.push(result); } });
  await page.context().route('**/v1/**', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  const ready = () => page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  await ready();
  const arrive = async name => {
    await openHudSpace(page, 'explore-section');
    await page.locator('#destination').selectOption({ label: name });
    // The prior store entry may also be less than a second old (e.g. a skipped intro).
    await page.waitForTimeout(1100);
    await page.locator('#visit-destination').click();
    await page.waitForFunction(() => document.querySelector('#walking-hud').dataset.primaryAction === 'enter');
    await page.waitForFunction(name => document.querySelector('#walking-enter').textContent.includes(name), name);
    await page.locator('#panel-toggle').click();
    // Directory travel and doorway travel share the server's one-second cooldown.
    await page.waitForTimeout(1100);
    await page.locator('#walking-enter').click();
  };
  const dialog = page.locator('.store-intro');
  const pose = () => page.evaluate(() => window.__riverCarriage().pose.position);
  const camera = () => page.evaluate(() => window.__riverBirds().camera);
  // The intro's shots follow its own clock, which starts on its first frame: 2.4 s
  // of street, then the room until 6 s. A slow software renderer can start it well
  // after the dialog opens, and the test's own reads can lag it by seconds, so the
  // camera's depth behind the shop's facade is recorded in the page on every frame.
  const facades = await page.evaluate(async names => {
    const { planStoreRooms } = await import('/src/store-rooms.js');
    const rooms = planStoreRooms(await (await fetch('/data/district.json')).json());
    return Object.fromEntries(names.map(name => { const room = rooms.find(room => room.name === name); return [name, { origin: room.facade, inward: room.inward }]; }));
  }, ['Harry Winston', 'Hermès']);
  // Resolves once a street shot is followed by a room shot, or when the intro closes.
  const watchCut = name => page.waitForFunction(({ origin, inward }) => {
    const cut = window.__introCut ??= { depths: [], exterior: false, interior: false, opened: false };
    const open = Boolean(document.querySelector('.store-intro[open]'));
    if (open) {
      const [x,,z] = window.__riverBirds().camera, depth = (x-origin[0])*inward[0] + (-z-origin[1])*inward[1];
      cut.opened = true; cut.depths.push(Number(depth.toFixed(2)));
      if (!cut.exterior && depth < -3) cut.exterior = true;
      else if (cut.exterior && depth > .5) cut.interior = true;
    }
    return (cut.interior || cut.opened && !open) && cut;
  }, facades[name], { polling: 'raf', timeout: 60000 }).then(handle => handle.jsonValue());
  const harryWinston = watchCut('Harry Winston'); harryWinston.catch(() => {});
  await arrive('Harry Winston'); await dialog.waitFor({state:'visible'});
  check(await dialog.locator('h2').textContent() === 'Harry Winston', 'confirmed entry starts Harry Winston intro');
  const start = await pose();
  await page.keyboard.down('w');
  const sequence = await harryWinston;
  await page.keyboard.up('w');
  // Skip while the intro is still playing; the slower checks follow.
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
  check(sequence.exterior && sequence.interior, `sequence cuts from actual exterior to interior${sequence.exterior && sequence.interior ? '' : `; camera depths behind the facade ${JSON.stringify(sequence.depths)}`}`);
  check(Math.hypot(...(await pose()).map((v,i)=>v-start[i])) < .01, 'camera sequence does not move player');
  check(await page.locator('#canvas-host').evaluate(el=>el===document.activeElement), 'Escape restores walking focus');
  // The page reads held keys once per frame, and a CPU-rendered frame can outlast a 180 ms
  // press (a hosted run released S unread and failed this check): hold for two frames at least.
  const frameMs = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(first => requestAnimationFrame(second => resolve(second - first)))));
  await page.keyboard.down('s'); await page.waitForTimeout(Math.max(180, frameMs * 2)); await page.keyboard.up('s');
  check(Math.hypot(...(await pose()).map((v,i)=>v-start[i])) > .01, 'movement works after skip');
  await arrive('Harry Winston'); await page.waitForTimeout(1200);
  check(!await dialog.isVisible(), 'second entry does not replay intro');
  await page.reload(); await ready();
  await arrive('Harry Winston'); await page.waitForTimeout(1200);
  check(!await dialog.isVisible(), 'account marker survives browser reload');
  await page.emulateMedia({reducedMotion:'reduce'});
  await arrive('Vince'); await dialog.waitFor({state:'visible'});
  check((await dialog.locator('button').textContent()).startsWith('Continue'), 'reduced motion offers Continue instead of Skip intro');
  const still = await camera(); await page.waitForTimeout(400);
  check(Math.hypot(...(await camera()).map((v,i)=>v-still[i])) < .01, 'reduced motion keeps the walking camera still');
  // The reduced intro closes itself 2.2 s after its first frame, which a slow renderer
  // can reach before this step: press Continue only if it is still open.
  await page.evaluate(() => document.querySelector('.store-intro[open] button')?.click()); await dialog.waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await arrive('Hermès');await dialog.waitFor({state:'visible'});
  // Reference frames of both shots, taken where no check depends on their timing.
  for (const shot of ['exterior', 'interior']) {
    const seen = await page.waitForFunction(({ origin, inward, shot }) => {
      if (!document.querySelector('.store-intro[open]')) return 'closed';
      const [x,,z] = window.__riverBirds().camera, depth = (x-origin[0])*inward[0] + (-z-origin[1])*inward[1];
      return (shot === 'exterior' ? depth < -3 : depth > .5) && 'seen';
    }, { ...facades['Hermès'], shot }, { polling: 'raf', timeout: 9000 }).then(handle => handle.jsonValue());
    if (seen === 'seen') await page.screenshot({path:`output/playwright/store-intro-${shot}.png`});
  }
  await dialog.waitFor({state:'hidden',timeout:9000});
  check(await page.locator('#canvas-host').evaluate(el=>el===document.activeElement), 'natural completion restores walking focus');
  check(claims.some(result=>result.firstVisit===false), 'real account service suppresses repeat claims');
  check(errors.length===0, 'no browser runtime errors');
  return {passed:true,checks,errors,claims,depths:sequence.depths};
}
