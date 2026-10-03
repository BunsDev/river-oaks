async page => {
  // `npm run dev` with no WorkOS configuration: two browsers join one town as
  // local development identities and see each other.
  const checks=[];
  const check = (condition, message) => { if (!condition) throw new Error(message);checks.push(message); };
  const errors = [];
  const second = await (await page.context().browser().newContext()).newPage();
  for (const tab of [page, second]) { tab.setDefaultNavigationTimeout(60000); tab.on('pageerror', error => errors.push(error.message)); await tab.setViewportSize({ width: 1280, height: 800 }); }
  const join = async tab => {
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.multiplayer === 'joined', null, { timeout: 60000 });
    await tab.waitForFunction(() => window.__riverMultiplayer?.().connected, null, { timeout: 60000 });
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
      && document.querySelector('.character-picker')?.checkVisibility(), null, { timeout: 60000 });
  };
  try {
  await join(page); await join(second);
  await page.waitForFunction(() => window.__riverMultiplayer().snapshot?.players.length >= 2, null, { timeout: 30000 });
  const state = tab => tab.evaluate(() => { const m = window.__riverMultiplayer(); return { self: m.selfId, players: m.snapshot.players.map(p => p.id), gate: document.querySelector('.multiplayer-gate')?.hidden, appearance: m.snapshot.players.find(p=>p.id===m.selfId)?.appearance, appearancePicker: Boolean(document.querySelector('.character-picker')?.checkVisibility()), invasion: document.querySelector('.invasion-controls')?.hidden, roster: document.querySelector('.multiplayer-roster strong')?.textContent }; });
  const [a, b] = [await state(page), await state(second)];
  check(a.self && b.self && a.self !== b.self, 'each browser is its own development player');
  check(a.players.includes(b.self) && b.players.includes(a.self), 'both players share one town');
  check(a.gate === true && b.gate === true, 'no sign-in gate blocks development');
  check(a.appearance === 'jevica' && b.appearance === 'jevica' && a.appearancePicker && b.appearancePicker, 'Players start with an appearance picker and a default look');
  await page.locator('input[name=player-character][value=sable]').check();
  await page.locator('input[name=player-form][value=beast]').check();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='woman-casual'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
  await second.waitForFunction(id=>window.__riverMultiplayer().snapshot?.players.find(p=>p.id===id)?.appearance==='woman-casual',a.self);
  await second.waitForFunction(id=>window.__riverMultiplayer().remotes?.some(p=>p.id===id&&p.ready&&p.appearance==='woman-casual'),a.self);
  check(true,'Sable selection reaches the other browser and its rendered remote avatar');
  check(await page.locator('.multiplayer-chat-history').getAttribute('aria-live')==='polite','New town chat rows are announced after initial history loads');
  const openPeople = async tab => {
    const control=tab.locator('#panel-toggle');
    if (await control.getAttribute('aria-expanded') === 'false') await control.click();
    await tab.locator('[data-section=community-section]').click();
  };
  await openPeople(page);
  await page.locator('.multiplayer-chat-form input').fill('Hello from the town');
  await page.locator('.multiplayer-chat-form button').click();
  await second.locator('.multiplayer-chat-message').filter({hasText:'Hello from the town'}).waitFor({state:'attached'});
  check(await page.locator('.multiplayer-chat-message').filter({hasText:'Hello from the town'}).count()===1,'A sent town message appears once for both players');
  await page.reload();
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected);
  check(await page.locator('.multiplayer-chat-message').filter({hasText:'Hello from the town'}).count()===1,'Chat history returns once after reconnect');
  await openPeople(second);
  await second.locator('.multiplayer-chat-form input').fill('Hello back');
  await second.locator('.multiplayer-chat-form button').click();
  await page.locator('.multiplayer-chat-message').filter({hasText:'Hello back'}).waitFor({state:'attached'});
  check(await page.locator('.multiplayer-chat-message').count()===2,'A reply reaches the reconnected player through the live chat UI');
  check(await page.locator('.shared-build-controls').isVisible(),'Shared play exposes player-owned building');
  check(a.invasion === true && b.invasion === true, 'shared play hides the local invasion');
  const spacing = await page.evaluate(() => { const [p, q] = window.__riverMultiplayer().snapshot.players; return Math.hypot(p.position[0] - q.position[0], p.position[1] - q.position[1]); });
  check(spacing >= 1.2, `players arrive on separate spots (${spacing.toFixed(2)} m apart)`);
  await page.screenshot({ path: 'output/playwright/multiplayer-dev.png' });
  // Places in shared play: the town decides every teleport, and the other
  // browser sees the result in its snapshot.
  const district = await (await page.request.get('http://127.0.0.1:5173/data/district.json')).json();
  const spot = district.communityLocations[5];
  const toggle = page.locator('#panel-toggle'); if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator(`#places-list li[data-place-id="spot:${spot.id}"] button[aria-label^="Go to"]`).click();
  await page.waitForFunction(name => document.querySelector('#places-status')?.textContent.includes(`You're at ${name}`), spot.name, { timeout: 15000 });
  const seen = async (tab, id) => tab.waitForFunction(([id, p]) => { const me = window.__riverMultiplayer().snapshot?.players.find(x => x.id === id); return me && Math.hypot(me.position[0] - p[0], me.position[1] - p[1]) < 4.5; }, [id, spot.position], { timeout: 15000 }).then(() => true, () => false);
  check(await seen(page, a.self) && await seen(second, a.self), `a shared teleport lands beside ${spot.name} in both browsers' snapshots`);
  await page.waitForTimeout(1100);
  await page.locator('#landmark-name').fill('Town bench'); await page.locator('#landmark-add').click();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes('Saved Town bench'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  await page.waitForTimeout(1100);
  await page.locator('#landmarks-list li button[aria-label^="Go to"]').click();
  await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes("You're at Town bench"), null, { timeout: 15000 });
  const atBench = await second.waitForFunction(([id, p]) => { const me = window.__riverMultiplayer().snapshot?.players.find(x => x.id === id); return me && Math.hypot(me.position[0] - p[0], me.position[1] - p[1]) < 1.5; }, [a.self, await page.evaluate(() => { const h = JSON.parse(document.querySelector('#walking-hud').dataset.position); return [h[0], -h[2]]; })], { timeout: 15000 }).then(() => true, () => false);
  check(atBench, 'a landmark teleport is a server-checked position travel the other browser sees');
  if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  // Builder mode: a live preview shows where a creation will land and
  // whether the town accepts it there; clicking the ground places it.
  const builder = () => page.evaluate(() => window.__riverMultiplayer().builder);
  const dockOpen = await page.locator('.visit-tools').evaluate(node => node.open);
  if (!dockOpen) await page.locator('.visit-tools-toggle').click();
  await page.locator('#build-mode').click();
  check((await page.locator('#build-mode').getAttribute('aria-pressed')) === 'true', 'Builder mode can be switched on');
  const canvas = await page.locator('#canvas-host').boundingBox();
  const aimAt = async (fx, fy) => { await page.mouse.move(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy); await page.waitForTimeout(250); return builder(); };
  let aim = null, acceptedAim = null;
  for (const [fx, fy] of [[.5, .72], [.42, .74], [.58, .74], [.5, .8], [.35, .7], [.65, .7]]) { aim = await aimAt(fx, fy); if (aim?.valid === 'true') { acceptedAim = [fx, fy]; break; } }
  check(aim?.ghost?.visible, 'The preview appears where the pointer meets the ground');
  check(aim.valid === 'true' && /Ready/.test(aim.hint), `An open spot is marked ready (${aim.hint})`);
  await page.screenshot({ path: 'output/playwright/builder-mode.png' });
  const before = (await page.evaluate(() => window.__riverMultiplayer().snapshot.builds.length));
  const aimed = aim.ghost.position;
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(n => window.__riverMultiplayer().snapshot.builds.length > n, before, { timeout: 15000 });
  const placed = await page.evaluate(() => window.__riverMultiplayer().snapshot.builds.at(-1));
  check(Math.hypot(placed.position[0] - aimed[0], placed.position[1] + aimed[2]) < .11, 'A click places the creation exactly where the preview stood');
  await page.locator('#build-list button', {hasText:'Save design'}).click();
  await page.waitForFunction(() => document.querySelector('#design-count')?.textContent === '1/48');
  check((await second.locator('#design-count').textContent()) === '0/48', 'A saved design stays in its owner’s inventory');
  await page.locator('#build-list button', {hasText:'Remove'}).click();
  await page.waitForFunction(() => window.__riverMultiplayer().snapshot.builds.length === 0);
  await page.locator('#design-list button', {hasText:'Place a copy'}).click();
  await aimAt(...acceptedAim);
  await page.waitForFunction(() => document.querySelector('#build-hint')?.dataset.valid === 'true');
  await page.locator('#build-place').click();
  await page.waitForFunction(() => window.__riverMultiplayer().snapshot.builds.length === 1);
  const copy = await page.evaluate(() => window.__riverMultiplayer().snapshot.builds[0]);
  check(copy.id !== placed.id && copy.kind === placed.kind && copy.finish === placed.finish, 'The owner places a fresh copy from a saved design');
  await page.locator('#design-list button', {hasText:'Delete design'}).click();
  await page.waitForFunction(() => document.querySelector('#design-count')?.textContent === '0/48');
  check((await page.evaluate(() => window.__riverMultiplayer().snapshot.builds[0]?.id)) === copy.id, 'Deleting a saved design leaves its placed copy intact');
  await page.waitForFunction(() => /creation|standing/.test(document.querySelector('#build-hint')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  const blocked = await builder();
  check(blocked.valid === 'false', `The preview turns red on the spot just taken (${blocked.hint})`);
  const yaw = (await builder()).yaw; await page.keyboard.press('KeyR');
  check(Math.abs((await builder()).yaw - yaw - Math.PI / 12) < 1e-6, 'R turns the preview');
  await page.keyboard.press('Escape');
  check(!(await builder()).active && !(await builder()).ghost, 'Escape leaves builder mode and removes the preview');
  check(await page.locator('.visit-tools').evaluate(node => node.open), 'Escape in builder mode leaves the dock open');
  await page.locator('.visit-tools-toggle').click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.querySelector('.visit-tools').open);
  check(await page.locator('.visit-tools').evaluate(node=>!node.open),'Shared mobile play starts with a compact dock');
  await page.locator('.visit-tools-toggle').click();
  check(await page.locator('#player-flight').isVisible(),'Flight remains discoverable in shared mobile play');
  check(!await page.locator('#player-companion').isVisible()&&!await page.locator('.vehicle-garage').isVisible(),'Shared mobile play hides solo companion and vehicle actions');
  check(!await page.locator('.force-controls').isVisible()&&!await page.locator('.auto-controls').isVisible(),'Shared mobile play hides local-only scenarios');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Shared mobile controls stay within the viewport');
  await page.screenshot({path:'output/playwright/multiplayer-dev-mobile.png'});
  check(!errors.length, errors.length ? errors.join('; ') : 'No browser page errors');
  return { checks, a, b, errors };
  } finally { await second.context().close(); }
}
