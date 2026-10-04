async page=>{
  const origin='http://127.0.0.1:5173',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('.world-portal-form').waitFor({state:'visible'});
  await page.locator('.world-portal-form input[name=title]').fill('Moon Garden');
  await page.locator('.world-portal-form input[name=id]').fill('moon-garden');
  await page.locator('.world-portal-form textarea[name=description]').fill('A quiet place to meet.');
  await page.locator('.world-portal-design').click();
  await page.locator('.region-editor').waitFor({state:'visible'});
  const map=page.locator('.region-editor-map');
  const clickMap=async(x,y)=>{const box=await map.boundingBox();await map.click({position:{x:box.width*x,y:box.height*y}});};
  await page.locator('.region-editor-tools button[data-tool=building]').click();
  await clickMap(.225,.225);
  await page.locator('.region-editor-fields label').filter({hasText:'Kind'}).locator('select').selectOption('retail');
  await page.locator('.region-editor-tools button[data-tool=tree]').click();
  await page.locator('.region-editor [data-coordinate=east]').fill('44.8');
  await page.locator('.region-editor [data-coordinate=north]').fill('-32');
  await page.locator('.region-editor [data-action=place-coordinate]').click();
  await page.locator('.region-editor-tools button[data-tool=place]').click();
  await clickMap(.25,.733);
  await page.locator('.region-editor-chooser').selectOption('places:place-1');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').fill('Moon Arch');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').press('Tab');
  await page.locator('.region-editor-tools button[data-tool=terrain]').click();
  await clickMap(.392,.35);
  await page.locator('.region-editor-fields label').filter({hasText:'Height (m)'}).locator('input').fill('2');
  await page.locator('.region-editor-fields label').filter({hasText:'Height (m)'}).locator('input').press('Tab');
  await page.locator('.region-editor-tools button[data-tool=road]').click();
  await clickMap(.183,.533);
  await clickMap(.317,.533);
  await page.screenshot({path:'output/playwright/region-editor.png'});
  await page.locator('.region-editor [data-action=done]').click();
  check((await page.locator('.world-portal-region-source').textContent()).includes('ready to publish'),'The editor provides a publishable region draft');
  check((await page.evaluate(()=>JSON.parse(localStorage.getItem('river-oaks-creator-region-draft-v1')))).buildings.length===1,'The region draft survives in local storage');
  await page.locator('.world-portal-form button[type=submit]').click();
  await page.locator('.world-portal-list a').filter({hasText:'Moon Garden'}).waitFor({state:'visible',timeout:15000}).catch(async()=>{
    throw new Error(`Publish result: ${await page.locator('.world-portal-status').textContent()}; links: ${await page.locator('.world-portal-list a').allTextContents()}`);
  });
  check((await page.locator('.world-portal-status').textContent()).includes('published'),'Jevica publishes from the world directory');
  await page.screenshot({path:'output/playwright/shared-world-publish.png'});
  const visitUrl=new URL(await page.locator('.world-portal-list a').filter({hasText:'Moon Garden'}).getAttribute('href'),page.url());
  check(visitUrl.searchParams.get('world')==='moon-garden','The directory gives the new world a shareable URL');
  visitUrl.searchParams.set('motion-debug','1');
  await page.goto(visitUrl.href,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer?.().snapshot?.worldId==='moon-garden');
  await page.waitForFunction(()=>document.querySelector('#view-name')?.textContent==='Moon Garden');
  await page.waitForFunction(()=>document.querySelector('#terrain-state')?.textContent==='Creator-authored terrain');
  await page.waitForFunction(()=>document.querySelector('.walking-title span')?.textContent==='Moon Garden');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('.world-portal-design').waitFor({state:'visible'});
  check((await page.locator('.world-portal-design').textContent())==='Edit region draft','The saved draft is available after navigating to the published world');
  const authored=await (await page.request.get(`${origin}/api/world-data?world=moon-garden`)).json();
  check(authored.world.buildings.length===1&&authored.world.trees.length===1&&authored.world.communityLocations.some(place=>place.name==='Moon Arch')&&authored.world.roads.length===2&&authored.world.terrain.heights_m.includes(2),'The editor submits terrain, roads, buildings, trees, and places to the shared world');
  check((await page.locator('#stores-count').textContent())==='0','The published world renders its own layout without River Oaks stores');
  check((await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===window.__riverMultiplayer().selfId)?.canBuild))===true,'Jevica can build in her new world');
  check(new URL(page.url()).searchParams.get('world')==='moon-garden','The published world has a shareable URL');
  const otherContext=await page.context().browser().newContext();
  try {
    let directoryRequests=0;
    await otherContext.route('**/api/worlds',route=>++directoryRequests===1
      ? route.fulfill({status:503,json:{error:'temporarily_unavailable'}})
      : route.continue());
    const guest=await otherContext.newPage();guest.on('pageerror',error=>errors.push(error.message));
    await guest.goto(`${origin}/?world=moon-garden&play=multiplayer&motion-debug=1`,{waitUntil:'commit'});
    await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:30000}).catch(async()=>{
      throw new Error(`Guest join: ${JSON.stringify(await guest.evaluate(()=>({url:location.href,multiplayer:document.querySelector('#canvas-host')?.dataset.multiplayer,ready:document.querySelector('#canvas-host')?.dataset.playerReady,connected:window.__riverMultiplayer?.().connected,status:document.querySelector('#multiplayer-status')?.textContent,assets:document.querySelector('#viewport')?.dataset.assetProgress,session:document.querySelector('.multiplayer-gate')?.textContent.slice(0,300)})))}`);
    });
    await guest.waitForFunction(()=>document.querySelector('#view-name')?.textContent==='Moon Garden',null,{timeout:60000}).catch(async()=>{
      throw new Error(`Guest world directory: ${await guest.locator('.world-portal-status').textContent()}`);
    });
    await guest.waitForFunction(()=>document.querySelector('.world-portal-status')?.textContent==='2 worlds to visit',null,{timeout:60000});
    check(directoryRequests>=2,'The directory recovers after a temporary failure');
    await guest.waitForFunction(()=>document.querySelector('#terrain-state')?.textContent==='Creator-authored terrain');
    check(await guest.locator('.world-portal-form').evaluate(node=>node.hidden),'A guest has no publishing form');
    check((await guest.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===window.__riverMultiplayer().selfId)?.canBuild))===false,'A guest can visit but cannot build');
    await guest.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.length===2);
    check(true,'The new world has shared presence');
  } finally {await otherContext.close();}
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks,errors};
}
