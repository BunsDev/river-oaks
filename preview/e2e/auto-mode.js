async page => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], packets = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/v1/decisions', async route => {
    const packet = route.request().postDataJSON();
    await route.fulfill({ json: { schema_version: 1, tick: packet.tick, latency_ms: 0,
      decisions: packet.agents.map(a => ({ id: a.id, action: 'continue', source: 'local_rules' })) } });
  });
  let mode = 'walk', release, delayed;
  await page.route('**/v1/auto', async route => {
    const packet = route.request().postDataJSON(); packets.push(packet);
    if (mode === 'delayed') await new Promise(resolve => { release = resolve; delayed = true; });
    const candidate = mode === 'support'
      ? packet.candidates.find(c => c.action === 'ask' && c.target_id === 'local-00')
        ?? packet.candidates.find(c => c.action === 'supply' && c.target_id === 'local-00')
        ?? packet.candidates.find(c => c.action === 'visit' && c.target_id === 'local-00')
        ?? packet.candidates.at(-1)
      : packet.candidates.filter(c => c.action === 'visit').sort((a,b) => a.distance_m-b.distance_m)[0] ?? packet.candidates.at(-1);
    await route.fulfill({json:{schema_version:1,tick:packet.tick,generation:packet.generation,
      source: mode === 'unavailable' ? 'unavailable' : 'jev', reason: mode === 'unavailable' ? 'not_configured' : 'accepted',
      candidate_id: candidate.id, confidence: 0.99 }}).catch(() => {});
  });
  const read = () => page.locator('.auto-controls').evaluate(el => JSON.parse(el.dataset.state));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5186/');
  await page.locator('#loading').waitFor({state:'hidden'});
  const toggle = page.locator('#panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  for (const name of ['People','Places','Settings']) {
    await page.getByRole('tab',{name,exact:true}).click();
    check(await page.getByRole('tabpanel').count() === 1, 'Exactly one rail section must be exposed');
    check(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected') === 'true', 'Current tab must be explicit');
  }
  await page.getByRole('tab',{name:'Settings',exact:true}).focus();
  await page.keyboard.press('Home');
  check(await page.getByRole('tab',{name:'People',exact:true}).getAttribute('aria-selected') === 'true','Home selects first tab');
  await page.keyboard.press('ArrowRight');
  check(await page.getByRole('tab',{name:'Places',exact:true}).getAttribute('aria-selected') === 'true','Arrow navigation changes rail tab');
  await page.screenshot({path:'output/playwright/auto-rail-places.png'});
  await page.getByRole('tab',{name:'Settings',exact:true}).click();
  await page.locator('button[data-theme-preference="dark"]').click();
  await page.screenshot({path:'output/playwright/auto-rail-dark.png'});
  await page.locator('button[data-theme-preference="light"]').click();

  await page.locator('#auto-toggle').click();
  await page.waitForFunction(() => Number(document.querySelector('#walking-hud').dataset.distance) > 2, null, {timeout:15000});
  check((await read()).decisions > 0, 'Visitor decisions must come from the bridge');
  await page.getByRole('tab',{name:'People',exact:true}).click();
  check((await read()).enabled, 'Reading the rail must not stop auto');
  await page.locator('#canvas-host').focus();
  await page.keyboard.press('KeyW');
  check(!(await read()).enabled, 'Manual walking must cancel auto immediately');
  const before = Number(await page.locator('#walking-hud').getAttribute('data-distance'));
  await page.waitForTimeout(600);
  check(Number(await page.locator('#walking-hud').getAttribute('data-distance')) - before < 0.5, 'Cancelled auto must stop walking');

  mode = 'delayed'; delayed = false;
  await page.locator('#auto-toggle').click();
  for (let i=0; i<30 && !delayed; i++) await page.waitForTimeout(50);
  check(delayed, 'Delayed inference fixture must be running');
  await page.locator('#auto-toggle').click(); release(); await page.waitForTimeout(250);
  check(!(await read()).enabled, 'Late answer must not restart auto');

  mode = 'unavailable'; await page.locator('#auto-toggle').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('.auto-controls').dataset.state).reason === 'not_configured');
  check((await read()).source === 'unavailable','Offline mode cannot claim Jev decisions');
  await page.locator('#auto-toggle').click();

  // Physical support at a real resident, through the production community rules.
  mode = 'support';
  await page.locator('#community-more').evaluate(el => {el.open = true;});
  await page.locator('#community-reset').click();
  await page.locator('#community-run').click();
  await page.locator('#community-local').selectOption('local-00');
  await page.locator('#community-meet').click();
  await page.locator('#community-close').click();
  const count = (await read()).interactions;
  await page.locator('#auto-toggle').click();
  // The neighbour is still walking her route until she is asked, so reaching her
  // takes 4-26 s depending on where she heads; this step checks proximity, not speed.
  await page.waitForFunction(n => JSON.parse(document.querySelector('.auto-controls').dataset.state).interactions >= n + 2, count, {timeout:45000});
  const support = await read();
  check(packets.some(p => p.candidates.some(c => c.action === 'supply' && c.distance_m <= 2.8)), 'Support requires current physical proximity');
  await page.locator('#auto-toggle').click();
  const resources = await page.locator('#community-resources').textContent();
  check(!resources.includes('12 kits'),'Support must spend actual scenario supplies');

  mode = 'walk';
  await page.locator('#auto-toggle').click();
  // The CLI browser keeps every tab document visible. Exercise the platform
  // event explicitly; this is event integration, not native tab lifecycle proof.
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  check(!(await read()).enabled,'Visibility change must stop auto and require deliberate restart');
  await page.locator('#auto-toggle').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check(!(await read()).enabled,'Window blur must stop auto');
  await page.locator('#auto-toggle').click();
  await page.locator('#reload').click();await page.locator('#loading').waitFor({state:'hidden'});
  check(!(await read()).enabled,'World replacement must cancel auto');

  await page.getByRole('tab',{name:'Settings',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Mobile must not overflow');
  await page.screenshot({path:'output/playwright/auto-rail-mobile.png'});
  await toggle.click();
  await page.locator('.visit-tools-toggle').click();
  check(await page.locator('#auto-toggle').isVisible(),'Auto control stays accessible in the mobile play dock');
  await page.setViewportSize({width:1440,height:1000});
  check(!errors.length,`Browser errors: ${errors.join('; ')}`);
  await page.unroute('**/v1/auto'); await page.unroute('**/v1/decisions');
  return {mode:'mocked_jev_integration',railTabs:true,keyboard:true,mobile:true,darkTheme:true,
    movement:true,manualTakeover:true,staleCancellation:true,visibilityEvent:true,blurEvent:true,
    nativeTabLifecycle:'not_verified_cli_keeps_tabs_visible',worldReload:true,
    unavailable:true,support,resources,browserErrors:errors};
}
