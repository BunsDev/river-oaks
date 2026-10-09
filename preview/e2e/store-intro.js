async page => {
  const checks = [], errors = [], claims = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => { if (response.url().includes('/api/profile/claim-intro')) { const result = await response.json(); claims.push(result); } });
  await page.context().route('**/v1/**', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  const ready = () => page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  await ready();
  const arrive = async name => {
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await page.locator('[data-section=explore-section]').click();
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
  await arrive('Harry Winston'); await dialog.waitFor({state:'visible'});
  check(await dialog.locator('h2').textContent() === 'Harry Winston', 'confirmed entry starts Harry Winston intro');
  const start = await pose(), exterior = await camera();
  await page.keyboard.down('w');
  await page.screenshot({path:'output/playwright/store-intro-exterior.png'});
  await page.waitForTimeout(3100); await page.keyboard.up('w');
  const interior = await camera();
  check(Math.hypot(...interior.map((v,i)=>v-exterior[i])) > 3, 'sequence cuts from actual exterior to interior');
  check(Math.hypot(...(await pose()).map((v,i)=>v-start[i])) < .01, 'camera sequence does not move player');
  await page.screenshot({path:'output/playwright/store-intro-interior.png'});
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
  check(await page.locator('#canvas-host').evaluate(el=>el===document.activeElement), 'Escape restores walking focus');
  await page.keyboard.down('s'); await page.waitForTimeout(180); await page.keyboard.up('s');
  check(Math.hypot(...(await pose()).map((v,i)=>v-start[i])) > .01, 'movement works after skip');
  await arrive('Harry Winston'); await page.waitForTimeout(1200);
  check(!await dialog.isVisible(), 'second entry does not replay intro');
  await page.reload(); await ready();
  await arrive('Harry Winston'); await page.waitForTimeout(1200);
  check(!await dialog.isVisible(), 'account marker survives browser reload');
  await page.emulateMedia({reducedMotion:'reduce'});
  await arrive('Vince'); await dialog.waitFor({state:'visible'});
  const still = await camera(); await page.waitForTimeout(400);
  check(Math.hypot(...(await camera()).map((v,i)=>v-still[i])) < .01, 'reduced motion keeps the walking camera still');
  await dialog.getByRole('button',{name:/Continue/}).click();await dialog.waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await arrive('Hermès');await dialog.waitFor({state:'visible'});await dialog.waitFor({state:'hidden',timeout:9000});
  check(await page.locator('#canvas-host').evaluate(el=>el===document.activeElement), 'natural completion restores walking focus');
  check(claims.some(result=>result.firstVisit===false), 'real account service suppresses repeat claims');
  check(errors.length===0, 'no browser runtime errors');
  return {passed:true,checks,errors,claims};
}
