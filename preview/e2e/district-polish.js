async page => {
  await page.unrouteAll({behavior:'ignoreErrors'});
  const checks = [], errors = [];
  const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.multiplayer==='joined');
  if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#panel-toggle').click();
  check(await page.locator('#walking-movement').isHidden(), 'Desktop movement pad starts collapsed');
  check((await page.locator('.walking-console').boundingBox()).height < 160, 'Default console leaves the street visible');
  await page.locator('#walking-controls-toggle').click();
  check(await page.locator('#walking-movement').isVisible(), 'Movement controls remain discoverable');
  await page.locator('#walking-controls-toggle').click();
  await page.screenshot({path:'output/playwright/district-polish-desktop.png'});
  await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  await page.locator('#community-more').evaluate(el=>{el.open=true;});
  await page.locator('#community-local').selectOption('store-osm-node-8172494969-person-2');
  await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  await page.locator('#panel-toggle').click();
  check(await page.locator('#community-about').isVisible(), 'Conversation topics lead the encounter');
  check(!await page.locator('#community-activities').evaluate(el => el.open), 'Support activities start collapsed');
  await page.waitForTimeout(300);
  await page.screenshot({path:'output/playwright/district-polish-conversation.png'});
  await page.locator('#community-activities > summary').focus();
  await page.keyboard.press('Enter');
  check(await page.locator('#community-ask').isVisible(), 'Keyboard opens optional support activities');
  await page.locator('#community-close').press('Escape');
  check(await page.locator('#canvas-host').evaluate(el => el === document.activeElement), 'Escape restores walking focus');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(1100);if(!await page.locator('#walking-meet-nearby').isVisible())await page.locator('.walking-more summary').click();
  await page.locator('#walking-meet-nearby').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  const box = await page.locator('#community-dialogue').boundingBox();
  check(box.height <= 844 * .59 && box.y > 844 * .39, 'Portrait conversation preserves the upper street view');
  check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'No mobile horizontal overflow');
  if (await page.locator('#community-activities').evaluate(el => el.open)) await page.locator('#community-activities > summary').click();
  await page.locator('.community-dialogue-body').evaluate(el => { el.scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.screenshot({path:'output/playwright/district-polish-mobile.png'});
  await page.locator('#community-close').click();
  check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);

  // The desktop checks are done. Stop that page rendering the district so the phone
  // loads alone, as a real phone would; two full scenes at once starve the phone's
  // main thread (its controls were up but Playwright could not poll them).
  await page.goto('about:blank');
  const touchContext = await page.context().browser().newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await touchContext.addCookies(await page.context().cookies());
  const touch = await touchContext.newPage();
  await touch.goto('http://127.0.0.1:5173/');
  await touch.locator('#loading').waitFor({state:'hidden'});
  // The pad appears just after the loading screen hides; wait for it rather than racing it.
  check(await touch.locator('#walking-movement').waitFor({state:'visible',timeout:10000}).then(()=>true,()=>false), 'Touch devices start with movement controls available');
  // Only rendered targets count: the hold-to-sprint key appears in beast form only.
  const touchTargets = await touch.locator('[data-walk-key]').evaluateAll(nodes => { const shown = nodes.filter(node => node.getClientRects().length); return shown.length === 6 && shown.every(node => { const r = node.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth; }); });
  check(touchTargets, 'All six touch movement targets fit the narrow viewport at 44px or larger');
  await touchContext.close();

  // Exercise the real selection UI with a blocked placement callback in isolation.
  const fixture = await page.context().newPage();
  await fixture.route('**/__encounter_fixture', route => route.fulfill({contentType:'text/html',body:'<main id="viewport"><aside id="fixture"></aside></main>'}));
  await fixture.goto('http://127.0.0.1:5173/__encounter_fixture');
  const blocked = await fixture.evaluate(async () => {
    const { createCommunityPanel } = await import('/src/community-ui.js');
    const { createCommunity } = await import('/src/community.js');
    let accessible = false;
    const panel = createCommunityPanel({host:document.querySelector('#fixture'),onFocus:()=>accessible,getMultiplayer:()=>({connected:true,command:async()=>({ok:true})})});
    const world=await (await fetch('/data/district.json')).json();
    const state=createCommunity(world);
    state.locals=state.locals.slice(0,2).map((local,index)=>({...local,id:`store-fixture-person-${index}`,indoor:true}));
    panel.setWorld(world);panel.applyRemote({community:state,locals:state.locals});
    const denied = await panel.selectLocal('store-fixture-person-0') === false && panel.state.selectedId === null && document.querySelector('#community-dialogue').hidden;
    accessible = true; await panel.selectLocal('store-fixture-person-0');
    const previous = document.querySelector('#community-speech').textContent;
    accessible = false;
    const retained = await panel.selectLocal('store-fixture-person-1') === false && panel.state.selectedId === 'store-fixture-person-0' && document.querySelector('#community-speech').textContent === previous;
    return denied && retained && document.querySelector('[role=status]#community-encounter-notice').textContent.includes('clear place');
  });
  await fixture.close();
  check(blocked, 'Blocked placement cannot open or replace a conversation and announces the reason');
  return {checks, browserErrors:errors};
}
