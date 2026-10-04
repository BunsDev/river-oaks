async page => {
  const origin='http://127.0.0.1:5173',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/?world=garden-2&motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  const surface=page.locator('.world-map-surface');
  await surface.waitFor({state:'visible'});
  check(await page.locator('.world-map-road').count()>0&&await page.locator('.world-map-building').count()>0,
    'The map draws the active world roads and buildings');
  check(await page.locator('.world-map-place').count()>0&&await page.locator('.world-map-self:not([hidden])').count()===1,
    'Named destinations and the live player position appear on the map');
  const marker=page.locator('.world-map-place').nth(5),name=await marker.locator('title').textContent();
  const before=await page.evaluate(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(player=>player.id===m.selfId).position;});
  await marker.click();
  check((await page.locator('.world-map-hint').textContent())===`Selected: ${name}`&&await page.locator('.world-map-actions button',{hasText:'Go here'}).isEnabled(),
    'Selecting a map marker previews it before travel');
  await page.locator('.world-map').screenshot({path:'output/playwright/world-map.png'});
  await page.locator('.world-map-actions button',{hasText:'Go here'}).click();
  await page.waitForFunction(name=>document.querySelector('.world-map-status')?.textContent.includes(`You're at ${name}`),name,{timeout:15000});
  const after=await page.evaluate(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(player=>player.id===m.selfId).position;});
  check(Math.hypot(after[0]-before[0],after[1]-before[1])>10,'Go here uses the shared server travel path');
  await page.locator('#landmark-name').fill('Map vantage');
  await page.locator('#landmark-add').click();
  await page.waitForFunction(()=>document.querySelector('.world-map-landmark'));
  check(await page.locator('.world-map-landmark').count()===1,'A saved landmark appears in its world map');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__mapLink=text;}}}));
  await surface.focus();
  await surface.press('ArrowRight');
  check((await page.locator('.world-map-hint').textContent()).includes('Map point'),'Keyboard arrows choose an arbitrary destination');
  await page.locator('.world-map-actions button',{hasText:'Copy link'}).click();
  const shared=new URL(await page.evaluate(()=>window.__mapLink));
  check(shared.searchParams.get('world')==='garden-2'&&shared.searchParams.has('at')&&shared.searchParams.get('play')==='multiplayer',
    'A selected map point shares its world and position');
  await page.waitForTimeout(1100);
  const world=await (await page.request.get(`${origin}/data/district.json`)).json();
  const building=world.buildings.find(item=>item.size?.[0]>50&&item.size?.[1]>25);
  check(Boolean(building),'The active world contains a broad blocked building footprint');
  const [west,south,east,north]=world.bounds_m,scale=928/Math.max(east-west,north-south);
  const x=500+(building.center[0]-(west+east)/2)*scale,y=500-(building.center[1]-(south+north)/2)*scale;
  const box=await surface.boundingBox();
  await surface.click({position:{x:x/1000*box.width,y:y/1000*box.height}});
  check((await page.locator('.world-map-hint').textContent()).includes('Map point'),'A building click remains an arbitrary point, not a storefront shortcut');
  const held=await page.evaluate(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(player=>player.id===m.selfId).position;});
  await page.locator('.world-map-actions button',{hasText:'Go here'}).click();
  await page.waitForFunction(()=>document.querySelector('.world-map-status')?.textContent.includes('Choose a nearby path or open space'),null,{timeout:15000});
  const refused=await page.evaluate(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(player=>player.id===m.selfId).position;});
  check(Math.hypot(refused[0]-held[0],refused[1]-held[1])<.1,'The server refuses an indoor map destination');
  await page.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('.world-map-surface').waitFor({state:'visible'});
  check(await page.locator('.world-map-landmark').count()===0,'Another world omits map landmarks saved in the configured alternate world');
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks,errors};
}
