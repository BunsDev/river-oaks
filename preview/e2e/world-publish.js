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
  await page.locator('.world-portal-form button').click();
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
  check((await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===window.__riverMultiplayer().selfId)?.canBuild))===true,'Jevica can build in her new world');
  check(new URL(page.url()).searchParams.get('world')==='moon-garden','The published world has a shareable URL');
  const otherContext=await page.context().browser().newContext();
  try {
    const guest=await otherContext.newPage();guest.on('pageerror',error=>errors.push(error.message));
    await guest.goto(`${origin}/?world=moon-garden&play=multiplayer&motion-debug=1`,{waitUntil:'commit'});
    await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:30000}).catch(async()=>{
      throw new Error(`Guest join: ${JSON.stringify(await guest.evaluate(()=>({url:location.href,multiplayer:document.querySelector('#canvas-host')?.dataset.multiplayer,ready:document.querySelector('#canvas-host')?.dataset.playerReady,connected:window.__riverMultiplayer?.().connected,status:document.querySelector('#multiplayer-status')?.textContent,assets:document.querySelector('#viewport')?.dataset.assetProgress,session:document.querySelector('.multiplayer-gate')?.textContent.slice(0,300)})))}`);
    });
    await guest.waitForFunction(()=>document.querySelector('#view-name')?.textContent==='Moon Garden');
    check(await guest.locator('.world-portal-form').evaluate(node=>node.hidden),'A guest has no publishing form');
    check((await guest.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===window.__riverMultiplayer().selfId)?.canBuild))===false,'A guest can visit but cannot build');
    await guest.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.length===2);
    check(true,'The new world has shared presence');
  } finally {await otherContext.close();}
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks,errors};
}
