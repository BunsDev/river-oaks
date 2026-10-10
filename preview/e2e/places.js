async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', e => errors.push(e.message));
  const origin = 'http://127.0.0.1:5173';
  const district = await (await page.request.get(`${origin}/data/district.json`)).json();
  const hudPosition = async () => JSON.parse(await page.locator('#walking-hud').getAttribute('data-position'));
  // HUD positions are [x, y, z] with z = -north; places are [x, north].
  const gap = (hud, place) => Math.hypot(hud[0] - place[0], -hud[2] - place[1]);
  const open = async () => {
    await page.locator('#loading').waitFor({ state: 'hidden' });
    // Loading chrome can leave before the player model and first walking frame.
    // Every position assertion below needs the actual walker, including after reload.
    await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true'
      && Array.isArray(JSON.parse(document.querySelector('#walking-hud')?.dataset.position ?? 'null')));
    const toggle = page.locator('#panel-toggle');
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    await openHudSpace(page, 'explore-section');
  };
  await page.goto(`${origin}/`); await open();
  await page.waitForFunction(() => document.querySelector('#places-here')?.textContent.includes('Arrival'));
  check(true, 'The Places tab says where you are on arrival');
  const rows = page.locator('#places-list li');
  check(await rows.count() === 1 + new Set(district.communityLocations.map(s => s.id).concat(district.stores.map(s => s.id))).size, `Every named place is listed once (${await rows.count()})`);
  const spot = district.communityLocations[3];
  await page.locator(`#places-list li[data-place-id="spot:${spot.id}"] button[aria-label^="Go to"]`).click();
  await page.waitForFunction(name => document.querySelector('#places-status')?.textContent.includes(`You're at ${name}`), spot.name);
  // The HUD writes its position each frame; wait for the frame after the teleport.
  const near = async (place, within) => { await page.waitForFunction(([p, w]) => { const h = JSON.parse(document.querySelector('#walking-hud')?.dataset.position ?? 'null'); return h && Math.hypot(h[0] - p[0], -h[2] - p[1]) < w; }, [place, within], { timeout: 5000 }).catch(() => {}); return gap(await hudPosition(), place); };
  const arrived = await near(spot.position, 5);
  check(arrived < 5, `Go teleports beside the spot (${arrived.toFixed(1)} m from ${spot.name})`);
  await page.waitForFunction(name => document.querySelector('#places-here')?.textContent.includes(name), spot.name);
  check(true, 'The location label follows the teleport');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  const here = await hudPosition();
  await page.locator('#landmark-name').fill('Quiet bench');
  await page.locator('#landmark-add').click();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes('Saved Quiet bench'));
  check(await page.locator('#landmarks-list li').count() === 1 && await page.locator('#landmarks-empty').isHidden(), 'Saving here adds a named landmark');
  await page.locator('#landmark-add').click();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes('Give the landmark a name'));
  check(await page.locator('#landmarks-list li').count() === 1, 'An unnamed landmark is refused');
  await page.goto(`${origin}/`); await open();
  check(await page.locator('#landmarks-list li').count() === 1 && (await page.locator('#landmarks-list li .place-name').textContent()) === 'Quiet bench', 'Landmarks survive a reload');
  await page.locator('#landmarks-list li button[aria-label^="Go to"]').click();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes("You're at Quiet bench"));
  await near([here[0], -here[2]], 1.3);
  const back = await hudPosition();
  check(Math.hypot(back[0] - here[0], back[2] - here[2]) < 1.3, `A landmark returns to the saved spot (${Math.hypot(back[0] - here[0], back[2] - here[2]).toFixed(2)} m)`);
  await page.locator('#landmarks-list li button[aria-label^="Remove"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#landmarks-list li').length===0);
  check(await page.locator('#landmarks-list li').count() === 0 && await page.locator('#landmarks-empty').isVisible(), 'Removing a landmark empties the list');
  const other = district.communityLocations[9];
  await page.goto(`${origin}/?place=spot:${encodeURIComponent(other.id)}`); await open();
  await page.waitForFunction(name => document.querySelector('#places-status')?.textContent.includes(`You're at ${name}`), other.name);
  check(await near(other.position, 5) < 5, `A ?place= link lands beside ${other.name}`);
  await page.goto(`${origin}/?at=${here[0].toFixed(2)},${(-here[2]).toFixed(2)},1.57`); await open();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes("You're at Shared spot"));
  await near([here[0], -here[2]], 1.3);
  const linked = await hudPosition();
  check(Math.hypot(linked[0] - here[0], linked[2] - here[2]) < 1.3, 'An ?at= link restores the exact position');
  await page.goto(`${origin}/?at=0,0`); await open();
  await page.waitForTimeout(600);
  check(Math.hypot(...(await hudPosition()).map((value, i) => value - linked[i])) < 3 && !(await page.locator('#places-status').textContent()).includes('Shared spot'), 'A link outside the district preserves the server position');
  await page.goto(`${origin}/?at=${district.stores[0].position[0].toFixed(2)},${district.stores[0].position[1].toFixed(2)}`); await open();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent==='destination_blocked');
  check(Math.hypot(...(await hudPosition()).map((value, i) => value - linked[i])) < 3, 'A link into a building is refused and preserves the server position');
  await page.screenshot({ path: 'output/playwright/places.png' });
  check(errors.length === 0, `No page errors: ${errors.join('; ')}`);
  return { checks };
}
